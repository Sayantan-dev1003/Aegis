"""
Tests for Processor.process() error-routing logic.

All external dependencies (Kafka, Redis, OpenTelemetry, model pipeline) are mocked.

Design note: app.monitoring.tracing imports opentelemetry-exporter-otlp which may
not be installed in every environment (it's a large optional package). We stub the
entire tracing module in sys.modules BEFORE importing anything from app.consumer so
that the import chain succeeds cleanly. This is the standard approach for stubbing
heavy infrastructure dependencies in unit tests.
"""
from __future__ import annotations

import sys
from typing import Any
from unittest.mock import MagicMock, patch
import pytest

# ──────────────────────────────────────────────────────────────────────────────
# Stub app.monitoring.tracing before any processor import.
# This prevents the module-level `from opentelemetry.exporter.otlp...` import
# from failing when the exporter package isn't installed.
# ──────────────────────────────────────────────────────────────────────────────
_tracing_stub = MagicMock()
_tracing_stub.extract_trace_context = MagicMock(return_value=None)
_tracing_stub.inject_trace_context = MagicMock(return_value={})
_tracing_stub.setup_tracing = MagicMock()
_tracing_stub.get_tracer = MagicMock()
sys.modules.setdefault("app.monitoring.tracing", _tracing_stub)

# Now it is safe to import processor — tracing is already resolved from sys.modules.
import app.consumer.processor  # noqa: F401  — must be registered before patch() runs

from app.exceptions import (
    FeatureEngineeringError,
    SchemaValidationError,
    SHAPError,
)

# ──────────────────────────────────────────────────────────────────────────────
# Patch targets
# ──────────────────────────────────────────────────────────────────────────────

_CONTAINER_PATCH = "app.consumer.processor.container"
_TRACE_PATCH     = "app.consumer.processor.extract_trace_context"
_INJECT_PATCH    = "app.consumer.processor.inject_trace_context"
_VELOCITY_PATCH  = "app.features.velocity_features.compute_redis_features"


def _make_message(tx_id: str = "tx-test-001") -> dict[str, Any]:
    return {
        "TransactionID": tx_id,
        "AccountID":     "ACCT-1234",
        "Amount":        500.0,
        "MerchantID":    "M_TEST",
        "Timestamp":     "2024-01-15T10:00:00Z",
        "DeviceID":      "DEV_MOCK",
        "CountryCode":   "IN",
    }


_SAMPLE_HEADERS = {"traceparent": "00-abc-def-01"}
_SAMPLE_KEY     = "test-tx-key"


# ──────────────────────────────────────────────────────────────────────────────
# Container readiness guard
# ──────────────────────────────────────────────────────────────────────────────


class TestProcessorContainerReady:
    def test_container_not_ready_raises_runtime_error(self):
        """If container.is_ready == False, process() must raise RuntimeError."""
        from app.consumer.processor import Processor
        from app.runtime.container import RuntimeContainer

        not_ready = RuntimeContainer()   # all health_state flags = False
        assert not not_ready.is_ready

        with patch(_CONTAINER_PATCH, not_ready), \
             patch(_TRACE_PATCH), \
             patch(_VELOCITY_PATCH, return_value={}):
            with pytest.raises(RuntimeError, match="[Nn]ot ready|[Nn]ot initialised"):
                Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)

    def test_container_missing_components_raises_runtime_error(self, mock_container):
        """Ready container but feature_pipeline=None → RuntimeError."""
        from app.consumer.processor import Processor

        mock_container.feature_pipeline = None

        with patch(_CONTAINER_PATCH, mock_container), \
             patch(_TRACE_PATCH), \
             patch(_VELOCITY_PATCH, return_value={}):
            with pytest.raises(RuntimeError, match="[Nn]ot initialised|[Nn]ot ready"):
                Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)


# ──────────────────────────────────────────────────────────────────────────────
# Permanent errors → DLQ immediately, no retry
# ──────────────────────────────────────────────────────────────────────────────


class TestProcessorPermanentErrors:
    def _run_with_pipeline_error(self, mock_container, exc: Exception) -> None:
        from app.consumer.processor import Processor
        mock_container.feature_pipeline.run.side_effect = exc
        with patch(_CONTAINER_PATCH, mock_container), \
             patch(_TRACE_PATCH), \
             patch(_VELOCITY_PATCH, return_value={}):
            Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)
        mock_container.kafka_producer.publish_dlq.assert_called_once()

    def test_schema_validation_error_routes_to_dlq(self, mock_container):
        self._run_with_pipeline_error(mock_container, SchemaValidationError("column mismatch"))

    def test_feature_engineering_error_routes_to_dlq(self, mock_container):
        self._run_with_pipeline_error(mock_container, FeatureEngineeringError("NaN imputation"))

    def test_value_error_routes_to_dlq_immediately(self, mock_container):
        self._run_with_pipeline_error(mock_container, ValueError("bad literal"))

    def test_key_error_routes_to_dlq_immediately(self, mock_container):
        self._run_with_pipeline_error(mock_container, KeyError("missing_key"))

    def test_shap_error_routes_to_dlq(self, mock_container):
        """SHAP errors are permanent — they must route to DLQ."""
        import pandas as pd
        import numpy as np
        from app.consumer.processor import Processor
        from app.inference.predictor import RawPrediction, PredictionResult

        mock_container.feature_pipeline.run.return_value = pd.DataFrame(
            {"f1": [0.5], "f2": [0.5], "f3": [0.5]}, dtype=np.float64
        )
        mock_container.inference_engine.predict.return_value = RawPrediction(
            raw_probability=0.3, calibrated_probability=0.4
        )
        mock_container.decision_engine.decide.return_value = PredictionResult(
            probability=0.4, raw_probability=0.3, threshold=0.5, is_fraud=False,
            confidence_level="HIGH", model_version="v1", pipeline_version="p1",
            latency_ms=5.0,
        )
        mock_container.shap_explainer.explain.side_effect = SHAPError("shape mismatch")

        with patch(_CONTAINER_PATCH, mock_container), \
             patch(_TRACE_PATCH), \
             patch(_INJECT_PATCH, return_value={}), \
             patch(_VELOCITY_PATCH, return_value={}):
            Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)

        mock_container.kafka_producer.publish_dlq.assert_called_once()

    def test_permanent_error_does_not_retry(self, mock_container):
        """SchemaValidationError → feature_pipeline.run called exactly once (no retry)."""
        from app.consumer.processor import Processor
        mock_container.feature_pipeline.run.side_effect = SchemaValidationError("bad schema")
        with patch(_CONTAINER_PATCH, mock_container), \
             patch(_TRACE_PATCH), \
             patch(_VELOCITY_PATCH, return_value={}):
            Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)
        mock_container.feature_pipeline.run.assert_called_once()


# ──────────────────────────────────────────────────────────────────────────────
# Happy path — all pipeline stages called, scored published
# ──────────────────────────────────────────────────────────────────────────────


class TestProcessorHappyPath:
    def _run_happy(self, mock_container) -> None:
        from app.consumer.processor import Processor
        with patch(_CONTAINER_PATCH, mock_container), \
             patch(_TRACE_PATCH), \
             patch(_INJECT_PATCH, return_value={}), \
             patch(_VELOCITY_PATCH, return_value={}):
            Processor.process(_make_message(), _SAMPLE_HEADERS, _SAMPLE_KEY)

    def test_successful_processing_publishes_scored(self, mock_container):
        self._run_happy(mock_container)
        mock_container.kafka_producer.publish_scored.assert_called_once()
        mock_container.kafka_producer.publish_dlq.assert_not_called()

    def test_successful_processing_calls_feature_pipeline(self, mock_container):
        self._run_happy(mock_container)
        mock_container.feature_pipeline.run.assert_called_once()

    def test_successful_processing_calls_inference_engine(self, mock_container):
        self._run_happy(mock_container)
        mock_container.inference_engine.predict.assert_called_once()

    def test_successful_processing_calls_decision_engine(self, mock_container):
        self._run_happy(mock_container)
        mock_container.decision_engine.decide.assert_called_once()

    def test_successful_processing_calls_shap_explainer(self, mock_container):
        self._run_happy(mock_container)
        mock_container.shap_explainer.explain.assert_called_once()
