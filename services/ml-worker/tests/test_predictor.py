"""
Tests for InferenceEngine and DecisionEngine.

All tests use mock artifacts from conftest.py — no model files on disk required.
"""
from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from app.inference.predictor import (
    DecisionEngine,
    InferenceEngine,
    PredictionResult,
    RawPrediction,
    get_dynamic_fraud_threshold,
)

# Feature names must match conftest.FEATURE_NAMES
FEATURE_NAMES = ["f1", "f2", "f3"]


# ──────────────────────────────────────────────────────────────────────────────
# InferenceEngine
# ──────────────────────────────────────────────────────────────────────────────


class TestInferenceEngine:
    """Tests for InferenceEngine.predict()."""

    def test_returns_raw_prediction_dataclass(self, mock_artifacts):
        engine = InferenceEngine(mock_artifacts)
        df = pd.DataFrame({n: [0.5] for n in FEATURE_NAMES}, dtype=np.float64)
        result = engine.predict(df)
        assert isinstance(result, RawPrediction)

    def test_raw_probability_in_range(self, mock_artifacts):
        engine = InferenceEngine(mock_artifacts)
        df = pd.DataFrame({n: [1.0] for n in FEATURE_NAMES}, dtype=np.float64)
        result = engine.predict(df)
        assert 0.0 <= result.raw_probability <= 1.0

    def test_calibrated_probability_in_range(self, mock_artifacts):
        engine = InferenceEngine(mock_artifacts)
        df = pd.DataFrame({n: [1.0] for n in FEATURE_NAMES}, dtype=np.float64)
        result = engine.predict(df)
        assert 0.0 <= result.calibrated_probability <= 1.0

    def test_probabilities_are_floats(self, mock_artifacts):
        engine = InferenceEngine(mock_artifacts)
        df = pd.DataFrame({n: [0.5] for n in FEATURE_NAMES}, dtype=np.float64)
        result = engine.predict(df)
        assert isinstance(result.raw_probability, float)
        assert isinstance(result.calibrated_probability, float)

    def test_model_and_calibrator_produce_different_probabilities(self, mock_artifacts):
        """Model and calibrator should have different probabilities (test stubs set 0.2 vs 0.25)."""
        engine = InferenceEngine(mock_artifacts)
        df = pd.DataFrame({n: [0.5] for n in FEATURE_NAMES}, dtype=np.float64)
        result = engine.predict(df)
        # The fixture sets model_proba=0.2, calibrator_proba=0.25
        assert abs(result.raw_probability - result.calibrated_probability) < 0.5  # sanity


# ──────────────────────────────────────────────────────────────────────────────
# DecisionEngine
# ──────────────────────────────────────────────────────────────────────────────


class TestDecisionEngine:
    """Tests for DecisionEngine.decide()."""

    def _make_engine(self, mock_artifacts, threshold_override: float | None = None):
        """Helper to create a DecisionEngine. Env vars are injected by conftest.py."""
        return DecisionEngine(mock_artifacts)


    def test_returns_prediction_result_dataclass(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.2, calibrated_probability=0.3)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert isinstance(result, PredictionResult)

    def test_fraud_when_above_threshold(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.9, calibrated_probability=0.9)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.is_fraud is True

    def test_not_fraud_when_below_threshold(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.2, calibrated_probability=0.2)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.is_fraud is False

    def test_fraud_exactly_at_threshold(self, mock_artifacts):
        """At exact threshold value, should be classified as fraud (>= comparison)."""
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.5, calibrated_probability=0.5)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.is_fraud is True

    def test_threshold_override_respected(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.6, calibrated_probability=0.6)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result_default = engine.decide(pred)
        assert result_default.is_fraud is True

        # Override to 0.8 — same probability (0.6) should now NOT be fraud
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result_override = engine.decide(pred, threshold_override=0.8)
        assert result_override.is_fraud is False
        assert result_override.threshold == 0.8

    def test_model_version_propagated(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.1, calibrated_probability=0.1)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.model_version == "test-v1.0"

    def test_pipeline_version_propagated(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.1, calibrated_probability=0.1)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.pipeline_version == "test-pipeline-v1.0"

    def test_latency_ms_positive_when_start_time_given(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.1, calibrated_probability=0.1)
        start = time.time() - 0.05   # 50ms ago
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred, start_time=start)
        assert result.latency_ms > 0.0

    def test_latency_ms_zero_when_no_start_time(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.1, calibrated_probability=0.1)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred, start_time=None)
        assert result.latency_ms == 0.0

    def test_confidence_high(self, mock_artifacts):
        """Far from threshold → HIGH confidence."""
        engine = self._make_engine(mock_artifacts)
        # prob=0.99, threshold=0.5, dist=0.49 > high_threshold(0.3)
        pred = RawPrediction(raw_probability=0.99, calibrated_probability=0.99)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.confidence_level == "HIGH"

    def test_confidence_low(self, mock_artifacts):
        """Near threshold → LOW confidence."""
        engine = self._make_engine(mock_artifacts)
        # prob=0.51, threshold=0.5, dist=0.01 — very close
        pred = RawPrediction(raw_probability=0.51, calibrated_probability=0.51)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.confidence_level == "LOW"

    def test_probability_is_calibrated_probability(self, mock_artifacts):
        """The result.probability field should be the calibrated probability."""
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.3, calibrated_probability=0.45)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.probability == pytest.approx(0.45)

    def test_raw_probability_preserved(self, mock_artifacts):
        engine = self._make_engine(mock_artifacts)
        pred = RawPrediction(raw_probability=0.3, calibrated_probability=0.45)
        with patch("app.inference.predictor.get_dynamic_fraud_threshold", return_value=0.5):
            result = engine.decide(pred)
        assert result.raw_probability == pytest.approx(0.3)
