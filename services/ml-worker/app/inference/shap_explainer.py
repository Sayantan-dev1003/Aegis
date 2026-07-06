from __future__ import annotations

from dataclasses import dataclass
import time
import shap
import pandas as pd

from app.monitoring.metrics import ml_shap_duration_seconds
from app.config.constants import SHAP_MAX_FEATURES
from app.inference.artifact_loader import RuntimeArtifacts


@dataclass
class SHAPResult:
    top_features: list[dict[str, float | str]]
    expected_value: float
    base_value: float
    prediction_probability: float
    execution_time_ms: float


class SHAPExplainer:
    def __init__(self, artifacts: RuntimeArtifacts) -> None:
        self.explainer = shap.TreeExplainer(artifacts.model)

    def explain(self, df: pd.DataFrame, prediction_probability: float = 0.0) -> SHAPResult:
        """
        Args:
            df: The post-pipeline feature DataFrame (single row).
            prediction_probability: The calibrated probability from DecisionEngine.
                Pass this in so SHAPResult correctly reports it instead of 0.0.
        """
        start_time = time.time()
        with ml_shap_duration_seconds.time():
            shap_values = self.explainer(df)

            row_shap_values = shap_values.values[0]
            feature_names = df.columns
            feature_values = df.iloc[0].values

            features_data = [
                {
                    "feature": str(name),
                    "value": float(val) if pd.notna(val) else 0.0,
                    "shap_value": float(shap_val),
                }
                for name, val, shap_val in zip(feature_names, feature_values, row_shap_values)
            ]

            features_data.sort(key=lambda x: abs(float(x["shap_value"])), reverse=True)
            top_features = features_data[:SHAP_MAX_FEATURES]

            expected_value = (
                float(self.explainer.expected_value)
                if not isinstance(self.explainer.expected_value, list)
                else float(self.explainer.expected_value[1])
            )
            base_value = float(shap_values.base_values[0])

            exec_time = (time.time() - start_time) * 1000.0

            return SHAPResult(
                top_features=top_features,
                expected_value=expected_value,
                base_value=base_value,
                prediction_probability=prediction_probability,
                execution_time_ms=exec_time,
            )
