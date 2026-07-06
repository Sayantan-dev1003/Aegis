from __future__ import annotations

import time
from dataclasses import dataclass

import pandas as pd

from app.inference.artifact_loader import RuntimeArtifacts
from app.config.config import get_config


@dataclass
class RawPrediction:
    raw_probability: float
    calibrated_probability: float


@dataclass
class PredictionResult:
    probability: float
    raw_probability: float
    threshold: float
    is_fraud: bool
    confidence_level: str
    model_version: str
    pipeline_version: str
    latency_ms: float


class InferenceEngine:
    def __init__(self, artifacts: RuntimeArtifacts) -> None:
        self.model = artifacts.model
        self.calibrator = artifacts.calibrator

    def predict(self, df: pd.DataFrame) -> RawPrediction:
        raw_prob = self.model.predict_proba(df)[0][1]
        calibrated_prob = self.calibrator.predict_proba(df)[0][1]

        return RawPrediction(
            raw_probability=float(raw_prob),
            calibrated_probability=float(calibrated_prob),
        )


class DecisionEngine:
    def __init__(self, artifacts: RuntimeArtifacts) -> None:
        self.default_threshold = artifacts.threshold
        self.model_version = artifacts.model_version
        self.pipeline_version = artifacts.pipeline_version

        config = get_config()
        self._high_threshold = config.settings.CONFIDENCE_HIGH_THRESHOLD
        self._medium_threshold = config.settings.CONFIDENCE_MEDIUM_THRESHOLD

    def decide(
        self,
        prediction: RawPrediction,
        start_time: float | None = None,
        threshold_override: float | None = None,
    ) -> PredictionResult:
        """
        Args:
            prediction: Output from InferenceEngine.predict().
            start_time: time.time() captured at the start of the full inference
                pipeline.  If provided, latency_ms is computed from it.
            threshold_override: Optional per-request threshold override.
        """
        thresh = threshold_override if threshold_override is not None else self.default_threshold
        is_fraud = prediction.calibrated_probability >= thresh

        dist = abs(prediction.calibrated_probability - thresh)
        if dist > self._high_threshold:
            confidence = "HIGH"
        elif dist > self._medium_threshold:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"

        # Measure end-to-end inference latency
        latency_ms = (time.time() - start_time) * 1000.0 if start_time is not None else 0.0

        return PredictionResult(
            probability=prediction.calibrated_probability,
            raw_probability=prediction.raw_probability,
            threshold=thresh,
            is_fraud=is_fraud,
            confidence_level=confidence,
            model_version=self.model_version,
            pipeline_version=self.pipeline_version,
            latency_ms=latency_ms,
        )
