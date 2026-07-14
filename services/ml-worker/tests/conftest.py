"""
Shared pytest fixtures for Aegis ML Worker tests.

All fixtures use pure in-memory mocks — no Kafka, no Redis, no real model files.

IMPORTANT: env-var injection at module level (before any app import) is the key
design decision here.  pydantic-settings reads env vars at Settings() construction
time, so the vars must exist before any app.* module is first imported.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from types import MappingProxyType
from typing import Any
from unittest.mock import MagicMock
import numpy as np
import pandas as pd
import pytest

# ──────────────────────────────────────────────────────────────────────────────
# Env-var injection — runs at conftest import time, before test collection
# ──────────────────────────────────────────────────────────────────────────────

_TEST_ENV_VARS: dict[str, str] = {
    "KAFKA_BROKERS":                "localhost:9092",
    "KAFKA_TOPIC_RAW":              "transactions.raw",
    "KAFKA_TOPIC_SCORED":           "transactions.scored",
    "KAFKA_TOPIC_DLQ":              "transactions.dlq",
    "KAFKA_CONSUMER_GROUP":         "test-consumer-group",
    "DEPLOYMENT_DIR":               "/tmp/aegis-test/deployment",
    "ARTIFACTS_DIR":                "/tmp/aegis-test/artifacts",
    "REDIS_URL":                    "redis://localhost:6379",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4317",
    "OTEL_SERVICE_NAME_ML":         "aegis-ml-worker-test",
    "PROMETHEUS_PORT":              "8000",
    "FRAUD_THRESHOLD":              "0.5",
    "AUTO_BLOCK_THRESHOLD":         "0.85",
    "CONFIDENCE_HIGH_THRESHOLD":    "0.2",
    "CONFIDENCE_MEDIUM_THRESHOLD":  "0.1",
    "SHAP_MAX_FEATURES":            "10",
    "ML_MAX_RETRIES":               "3",
}

for _k, _v in _TEST_ENV_VARS.items():
    os.environ.setdefault(_k, _v)


# ──────────────────────────────────────────────────────────────────────────────
# Tiny in-memory model stubs
# ──────────────────────────────────────────────────────────────────────────────

class _TinyModel:
    """Mimics sklearn / XGBoost predict_proba interface."""

    def __init__(self, proba: float = 0.3) -> None:
        self._proba = proba

    def predict_proba(self, X: pd.DataFrame):  # noqa: N803
        n = len(X)
        return np.array([[1 - self._proba, self._proba]] * n)


class _TinyCalibrator(_TinyModel):
    """Same interface, slightly different probability."""

    def __init__(self, proba: float = 0.35) -> None:
        super().__init__(proba)


class _TinyFeatureSelector:
    """Mimics sklearn feature selector."""

    def __init__(self, feature_names: list[str]) -> None:
        self._names = feature_names

    def get_feature_names_out(self) -> list[str]:
        return self._names

    def transform(self, X: pd.DataFrame) -> pd.DataFrame:  # noqa: N803
        return X[self._names]


FEATURE_NAMES = ["f1", "f2", "f3"]


# ──────────────────────────────────────────────────────────────────────────────
# RuntimeArtifacts fixture
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def mock_artifacts():
    """RuntimeArtifacts populated with tiny in-memory stubs. No files on disk."""
    from app.inference.artifact_loader import RuntimeArtifacts

    return RuntimeArtifacts(
        model=_TinyModel(proba=0.2),
        calibrator=_TinyCalibrator(proba=0.25),
        imputer=MagicMock(),
        encoder=MagicMock(),
        feature_selector=_TinyFeatureSelector(FEATURE_NAMES),
        preprocessing=MappingProxyType(
            {
                "aggregation_mappings": {},
                "frequency_mappings": {},
                "percentile_mapping": list(range(100)),
            }
        ),
        deployment_config={"validation": {"deployment_ready": True}, "checksums": {}},
        feature_order=list(FEATURE_NAMES),
        threshold=0.5,
        model_version="test-v1.0",
        pipeline_version="test-pipeline-v1.0",
        deployment_version="test-deploy-v1.0",
        deployment_id="test-deploy-id",
        calibration_method="isotonic",
        loaded_at=datetime.now(timezone.utc),
    )


# ──────────────────────────────────────────────────────────────────────────────
# RuntimeContainer fixture
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def mock_container(mock_artifacts):
    """RuntimeContainer pre-wired with all mocks. is_ready == True."""
    from app.runtime.container import RuntimeContainer
    from app.inference.predictor import RawPrediction, PredictionResult

    c = RuntimeContainer()
    c.artifacts = mock_artifacts
    for key in c.health_state:
        c.health_state[key] = True

    fp = MagicMock()
    fp.run.return_value = pd.DataFrame(
        {name: [0.5] for name in FEATURE_NAMES}, dtype=np.float64
    )
    c.feature_pipeline = fp

    ie = MagicMock()
    ie.predict.return_value = RawPrediction(
        raw_probability=0.2, calibrated_probability=0.25
    )
    c.inference_engine = ie

    de = MagicMock()
    de.decide.return_value = PredictionResult(
        probability=0.25,
        raw_probability=0.2,
        threshold=0.5,
        is_fraud=False,
        confidence_level="HIGH",
        model_version="test-v1.0",
        pipeline_version="test-pipeline-v1.0",
        latency_ms=5.0,
    )
    c.decision_engine = de

    # SHAP explainer mock — explain() must return an object with .top_features
    # and .prediction_probability attributes (as accessed in processor.py line 150-151)
    shap_exp = MagicMock()
    _shap_result = MagicMock()
    _shap_result.top_features = {"f1": 0.1, "f2": -0.05, "f3": 0.02}
    _shap_result.prediction_probability = 0.25
    shap_exp.explain.return_value = _shap_result
    c.shap_explainer = shap_exp


    kp = MagicMock()
    kp.publish_scored.return_value = None
    kp.publish_dlq.return_value = None
    c.kafka_producer = kp

    return c


# ──────────────────────────────────────────────────────────────────────────────
# Minimal feature DataFrame fixture (2 rows so single-NaN tests work correctly)
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def valid_feature_df() -> pd.DataFrame:
    """Valid 2-row DataFrame matching FEATURE_NAMES, all float64."""
    return pd.DataFrame(
        {name: [float(i + 1), float(i + 2)] for i, name in enumerate(FEATURE_NAMES)},
        dtype=np.float64,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Minimal raw Kafka message fixture
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def raw_transaction_message() -> dict[str, Any]:
    """Minimal raw transaction dict as would arrive from Kafka."""
    return {
        "TransactionID": "test-tx-001",
        "AccountID":     "ACCT-9999",
        "Amount":        1500.0,
        "MerchantID":    "M_TEST",
        "MerchantName":  "Test Merchant",
        "MerchantCategory": "retail",
        "CountryCode":   "IN",
        "TransactionType": "purchase",
        "Channel":       "online",
        "Timestamp":     "2024-01-15T10:30:00Z",
        "DeviceID":      "DEV_TEST_001",
    }
