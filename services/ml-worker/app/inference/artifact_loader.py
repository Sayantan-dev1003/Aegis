from __future__ import annotations

import json
import hashlib
from types import MappingProxyType
from typing import Any
from dataclasses import dataclass
from datetime import datetime

import joblib
import sklearn
import sklearn.utils.validation
import xgboost

from app.config.config import get_config
from app.exceptions import ArtifactVersionError, ArtifactLoadError
from app.monitoring.logger import get_logger

logger = get_logger(__name__)


def _deep_freeze(obj: Any) -> Any:
    """Recursively wraps dicts in MappingProxyType and lists in tuples for full immutability."""
    if isinstance(obj, dict):
        return MappingProxyType({k: _deep_freeze(v) for k, v in obj.items()})
    if isinstance(obj, list):
        return tuple(_deep_freeze(v) for v in obj)
    return obj


@dataclass(frozen=True)
class RuntimeArtifacts:
    model: Any
    calibrator: Any
    imputer: Any
    encoder: Any
    feature_selector: Any
    preprocessing: MappingProxyType[str, Any]
    deployment_config: dict[str, Any]
    feature_order: list[str]
    threshold: float
    model_version: str
    pipeline_version: str
    deployment_version: str
    deployment_id: str
    calibration_method: str
    loaded_at: datetime


class ArtifactLoader:
    def __init__(self) -> None:
        self.config = get_config()

    def _hash_file(self, filepath: str) -> str:
        sha256 = hashlib.sha256()
        with open(filepath, "rb") as f:
            for block in iter(lambda: f.read(4096), b""):
                sha256.update(block)
        return sha256.hexdigest()

    def load(self) -> RuntimeArtifacts:
        try:
            with open(self.config.deployment_config_path, "r") as f:
                deployment_config = json.load(f)

            # deployment_ready is nested under "validation"
            validation_block = deployment_config.get("validation", deployment_config)
            if not validation_block.get("deployment_ready"):
                raise ArtifactLoadError("Deployment config not marked as deployment_ready=True")

            # ── Checksums ─────────────────────────────────────────────────────
            # Keys in deployment_config are filenames (e.g. "xgboost_model.joblib"),
            # not type-names.  Use the filename keys directly.
            model_hash = self._hash_file(str(self.config.model_path))
            calibrator_hash = self._hash_file(str(self.config.calibrator_path))

            checksums = deployment_config.get("checksums", {})
            expected_model_hash = checksums.get("xgboost_model.joblib")
            expected_calibrator_hash = checksums.get("probability_calibrator.joblib")

            if expected_model_hash and model_hash != expected_model_hash:
                raise ArtifactLoadError(
                    f"Model checksum mismatch: {model_hash} != {expected_model_hash}"
                )
            if expected_calibrator_hash and calibrator_hash != expected_calibrator_hash:
                raise ArtifactLoadError(
                    f"Calibrator checksum mismatch: {calibrator_hash} != {expected_calibrator_hash}"
                )

            # ── Version checks ────────────────────────────────────────────────
            runtime = deployment_config.get("runtime", {})
            if runtime.get("sklearn_version") and not sklearn.__version__.startswith(
                runtime["sklearn_version"].split(".")[0]
            ):
                logger.warning(
                    "minor_version_mismatch_sklearn",
                    expected=runtime["sklearn_version"],
                    got=sklearn.__version__,
                )

            if runtime.get("xgboost_version") and not xgboost.__version__.startswith(
                runtime["xgboost_version"].split(".")[0]
            ):
                logger.warning(
                    "minor_version_mismatch_xgboost",
                    expected=runtime["xgboost_version"],
                    got=xgboost.__version__,
                )

            # ── Load models ───────────────────────────────────────────────────
            model = joblib.load(self.config.model_path)
            calibrator = joblib.load(self.config.calibrator_path)

            # ── Load training artifacts ───────────────────────────────────────
            imputer = joblib.load(self.config.imputer_path)
            encoder = joblib.load(self.config.encoder_path)
            feature_selector = joblib.load(self.config.feature_selector_path)

            try:
                sklearn.utils.validation.check_is_fitted(imputer)
                sklearn.utils.validation.check_is_fitted(encoder)
                sklearn.utils.validation.check_is_fitted(feature_selector)
            except sklearn.exceptions.NotFittedError as e:
                raise ArtifactLoadError(f"Transformer not fitted: {e}")

            # ── Feature selector validation (Critical Issue 5 fix) ─────────────
            # get_support() returns a boolean mask over the *encoder output* columns.
            # The number of SELECTED features is mask.sum(), not mask.__len__().
            feature_order = deployment_config.get("features", {}).get(
                "feature_order", deployment_config.get("feature_order", [])
            )
            n_selected = int(feature_selector.get_support().sum())
            if n_selected != len(feature_order):
                raise ArtifactLoadError(
                    f"Feature selector selects {n_selected} features but deployment_config "
                    f"feature_order has {len(feature_order)} entries."
                )

            # ── Load runtime preprocessing ────────────────────────────────────
            runtime_preprocessing = joblib.load(self.config.runtime_preprocessing_path)

            required_keys = [
                "schema_version",
                "artifact_version",
                "feature_engineering_version",
                "pipeline_version",
                "aggregation_mappings",
                "frequency_mappings",
                "percentile_mapping",
                "metadata",
            ]
            for key in required_keys:
                if key not in runtime_preprocessing:
                    raise ArtifactLoadError(
                        f"Missing required key '{key}' in runtime_preprocessing.joblib"
                    )

            if not runtime_preprocessing["aggregation_mappings"]:
                raise ArtifactLoadError("aggregation_mappings is empty")
            if not runtime_preprocessing["frequency_mappings"]:
                raise ArtifactLoadError("frequency_mappings is empty")

            if runtime_preprocessing["schema_version"] != deployment_config.get("runtime_preprocessing", {}).get("schema_version"):
                raise ArtifactLoadError("Schema version mismatch")
            if runtime_preprocessing["pipeline_version"] != deployment_config.get("pipeline_version"):
                raise ArtifactLoadError("Pipeline version mismatch")
            if runtime_preprocessing["feature_engineering_version"] != deployment_config.get(
                "feature_engineering_version",
                deployment_config.get("runtime_preprocessing", {}).get("feature_engineering_version"),
            ):
                raise ArtifactLoadError("Feature engineering version mismatch")

            # ── Recursive deep-freeze (Critical Issue 4 fix) ──────────────────
            immutable_preprocessing = _deep_freeze(runtime_preprocessing)

            # ── Extract metadata for RuntimeArtifacts ─────────────────────────
            threshold_block = deployment_config.get("threshold", {})
            threshold_value = (
                threshold_block.get("value", 0.38)
                if isinstance(threshold_block, dict)
                else float(threshold_block)
            )
            calibration_method = deployment_config.get("calibration", {}).get("method", "unknown")
            deployment_version = deployment_config.get("deployment_version", "unknown")
            deployment_id = deployment_config.get("deployment_id", "unknown")

            logger.info("artifacts_loaded_successfully")

            return RuntimeArtifacts(
                model=model,
                calibrator=calibrator,
                imputer=imputer,
                encoder=encoder,
                feature_selector=feature_selector,
                preprocessing=immutable_preprocessing,
                deployment_config=deployment_config,
                feature_order=feature_order,
                threshold=threshold_value,
                model_version=deployment_config.get("model_version", "unknown"),
                pipeline_version=deployment_config.get("pipeline_version", "unknown"),
                deployment_version=deployment_version,
                deployment_id=deployment_id,
                calibration_method=calibration_method,
                loaded_at=datetime.utcnow(),
            )
        except Exception as e:
            logger.critical("artifact_loading_failed", error=str(e))
            raise ArtifactLoadError(f"Failed to load artifacts: {e}")
