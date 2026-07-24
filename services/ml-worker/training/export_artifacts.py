"""
Aegis - Real-Time Fraud Detection System
Module: Export Artifacts

This module is the final offline training stage. It validates, packages,
and prepares deployment artifacts for the Kafka-based inference service.
"""

import os
import io
import json
import hashlib
import time
import logging
import datetime
import platform
import shutil
from typing import Dict, Any, List

try:
    import psutil
except ImportError:
    psutil = None

import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
import sklearn
import scipy
from sklearn.utils.validation import check_is_fitted
from sklearn.exceptions import NotFittedError


class ExportArtifactsError(Exception):
    """Custom exception for errors during the artifact export process."""
    def __init__(self, artifact_name: str, operation: str, reason: str, resolution_hint: str):
        self.artifact_name = artifact_name
        self.operation = operation
        self.reason = reason
        self.resolution_hint = resolution_hint
        super().__init__(f"[{artifact_name}] {operation} failed: {reason}. Hint: {resolution_hint}")


class ArtifactExporter:
    """Production-grade Artifact Exporter for Aegis Pipeline."""
    
    def __init__(
        self,
        artifacts_dir: str = "artifacts",
        reports_dir: str = "reports",
        deployment_dir: str = "deployment"
    ):
        self.artifacts_dir = artifacts_dir
        self.reports_dir = reports_dir
        self.deployment_dir = deployment_dir
        
        self.start_time = time.time()
        self.memory_usage: Dict[str, float] = {}
        
        os.makedirs(self.deployment_dir, exist_ok=True)
        self.logger = self._setup_logger()
        
        # State
        self.checksums: Dict[str, str] = {
            "xgboost_model.joblib": "",
            "probability_calibrator.joblib": "",
            "runtime_preprocessing.joblib": ""
        }
        self.checksum_verified: bool = True
        self.validation_status: str = "SUCCESS"
        self.validated_files: List[str] = []
        self.missing_files: List[str] = []
        self.warnings: List[str] = []
        self.errors: List[str] = []
        
        self.model_metadata: Dict[str, Any] = {}
        self.feature_metadata: Dict[str, Any] = {}
        self.calibration_metadata: Dict[str, Any] = {}
        self.threshold: Dict[str, Any] = {}
        self.shap_metadata: Dict[str, Any] = {}
        self.encoder_metadata: Dict[str, Any] = {}
        self.runtime_preprocessing_metadata: Dict[str, Any] = {}
        self.deployment_id = f"Aegis-{datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')}"
        
        self.copied_artifacts: List[str] = []
        
    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("ArtifactExporter")
        logger.setLevel(logging.INFO)
        logger.propagate = False
        if not logger.handlers:
            os.makedirs("logs", exist_ok=True)
            fh = logging.FileHandler(f"logs/export_artifacts.log")
            ch = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            fh.setFormatter(formatter)
            ch.setFormatter(formatter)
            logger.addHandler(fh)
            logger.addHandler(ch)
        return logger

    def _record_memory(self, stage: str):
        if psutil:
            process = psutil.Process(os.getpid())
            mem_mb = process.memory_info().rss / (1024 * 1024)
            self.memory_usage[stage] = mem_mb
            self.logger.info(f"Memory usage at {stage}: {mem_mb:.2f} MB")
            if mem_mb > 2000:
                self.logger.warning(f"Memory threshold (2GB) exceeded at {stage}: {mem_mb:.2f} MB")

    def _load_json(self, path: str, artifact_name: str) -> Dict[str, Any]:
        self.logger.info(f"Loading {artifact_name}...")
        if not os.path.exists(path):
            self.missing_files.append(artifact_name)
            raise ExportArtifactsError(artifact_name, "load", "File not found", "Ensure upstream stage ran successfully")
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            self.validated_files.append(artifact_name)
            return data
        except json.JSONDecodeError as e:
            self.errors.append(f"{artifact_name}: JSONDecodeError")
            raise ExportArtifactsError(artifact_name, "load", f"Invalid JSON: {e}", "Check upstream stage output")

    def _load_joblib(self, path: str, artifact_name: str) -> Any:
        self.logger.info(f"Loading {artifact_name}...")
        if not os.path.exists(path):
            self.missing_files.append(artifact_name)
            raise ExportArtifactsError(artifact_name, "load", "File not found", "Ensure upstream stage ran successfully")
        try:
            model = joblib.load(path)
            self.validated_files.append(artifact_name)
            return model
        except Exception as e:
            self.errors.append(f"{artifact_name}: Load Error")
            raise ExportArtifactsError(artifact_name, "load", f"Load Error: {e}", "Ensure joblib version matches")

    def _compute_sha256(self, path: str) -> str:
        self.logger.info(f"Generating SHA256 for {os.path.basename(path)}...")
        sha256_hash = hashlib.sha256()
        with open(path, "rb") as f:
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    def run(self):
        try:
            self.logger.info(f"Starting Artifact Export process. Deployment ID: {self.deployment_id}")
            self._record_memory("start")
            
            # Load metadata
            self.model_metadata = self._load_json(os.path.join(self.artifacts_dir, "model_metadata.json"), "model_metadata.json")
            self.feature_metadata = self._load_json(os.path.join(self.artifacts_dir, "feature_selector_metadata.json"), "feature_selector_metadata.json")
            self.calibration_metadata = self._load_json(os.path.join(self.artifacts_dir, "calibration_metadata.json"), "calibration_metadata.json")
            self.threshold = self._load_json(os.path.join(self.artifacts_dir, "deployment_threshold.json"), "deployment_threshold.json")
            self.shap_metadata = self._load_json(os.path.join(self.artifacts_dir, "shap_metadata.json"), "shap_metadata.json")
            self.encoder_metadata = self._load_json(os.path.join(self.artifacts_dir, "encoder_metadata.json"), "encoder_metadata.json")
            
            # Validate JSON metadata components
            self.logger.info("Validating JSON schemas and schemas...")
            self._validate_feature_metadata()
            self._validate_model_metadata()
            self._validate_threshold()
            self._validate_shap_metadata()
            
            # Load and validate reports
            self._validate_reports()
            
            # Cross-validate consistency
            self.logger.info("Validating consistency across artifacts...")
            self._validate_consistency()
            
            # Load and validate models
            xgb_model = self._load_joblib(os.path.join(self.artifacts_dir, "xgboost_model.joblib"), "xgboost_model.joblib")
            self._validate_model(xgb_model)
            
            calibrator = self._load_joblib(os.path.join(self.artifacts_dir, "probability_calibrator.joblib"), "probability_calibrator.joblib")
            self._validate_probability_calibrator(calibrator, xgb_model)
            
            # Load and validate runtime preprocessing artifact
            self._validate_runtime_preprocessing()
            
            # Copy joblib models to deployment directory and verify checksums
            self.logger.info("Copying models to deployment directory and verifying integrity...")
            for file_name in ["xgboost_model.joblib", "probability_calibrator.joblib", "runtime_preprocessing.joblib"]:
                src = os.path.join(self.artifacts_dir, file_name)
                dst = os.path.join(self.deployment_dir, file_name)
                if os.path.exists(src):
                    original_sha = self._compute_sha256(src)
                    shutil.copyfile(src, dst)
                    copied_sha = self._compute_sha256(dst)
                    if copied_sha != original_sha:
                        self.checksum_verified = False
                        raise ExportArtifactsError(file_name, "verify_copy", "Checksum mismatch", "File corrupted during copy")
                    self.checksums[file_name] = copied_sha
                    self.copied_artifacts.append(file_name)
                else:
                    self.missing_files.append(file_name)
                    raise ExportArtifactsError(file_name, "copy", "File not found", "Ensure upstream stage ran successfully")
                        
            # Deep verification of copied joblib models
            self.logger.info("Performing deep verification of copied models...")
            try:
                joblib.load(os.path.join(self.deployment_dir, "xgboost_model.joblib"))
                joblib.load(os.path.join(self.deployment_dir, "probability_calibrator.joblib"))
            except Exception as e:
                raise ExportArtifactsError("deep_verification", "load_copied", f"Failed to load copied model: {e}", "Ensure disk integrity")
            
            # Deep verification of copied runtime preprocessing artifact
            self.logger.info("Performing deep verification of copied runtime preprocessing artifact...")
            try:
                rp_reloaded = joblib.load(os.path.join(self.deployment_dir, "runtime_preprocessing.joblib"))
            except Exception as e:
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "deep_verify_copied",
                    f"Failed to load copied artifact: {e}",
                    "Ensure disk integrity"
                )
            if "aggregation_mappings" not in rp_reloaded:
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "deep_verify_copied",
                    "aggregation_mappings key missing in copied artifact",
                    "Re-run feature engineering stage"
                )
            if "frequency_mappings" not in rp_reloaded:
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "deep_verify_copied",
                    "frequency_mappings key missing in copied artifact",
                    "Re-run feature engineering stage"
                )
            # NaN-safe byte-stream comparison: aggregation statistics can contain
            # NaN (from .std() on single-element groups); NaN != NaN in Python so
            # plain dict equality would always report a false mismatch.
            buf_copied_agg = io.BytesIO()
            joblib.dump(rp_reloaded["aggregation_mappings"], buf_copied_agg)
            if buf_copied_agg.getvalue() != self.runtime_preprocessing_metadata.get("_bytes_aggregation_mappings"):
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "deep_verify_copied",
                    "aggregation_mappings byte-stream mismatch between source and copied artifact",
                    "Ensure no concurrent writes to the artifacts directory"
                )
            buf_copied_freq = io.BytesIO()
            joblib.dump(rp_reloaded["frequency_mappings"], buf_copied_freq)
            if buf_copied_freq.getvalue() != self.runtime_preprocessing_metadata.get("_bytes_frequency_mappings"):
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "deep_verify_copied",
                    "frequency_mappings byte-stream mismatch between source and copied artifact",
                    "Ensure no concurrent writes to the artifacts directory"
                )
            self.logger.info("Deep verification of runtime_preprocessing.joblib passed.")
            
            self._generate_outputs()
            
            self._record_memory("end")
            exec_time = time.time() - self.start_time
            self.logger.info(f"Artifact Export completed successfully in {exec_time:.2f}s")
            
        except ExportArtifactsError as e:
            self.validation_status = "FAILED"
            self.logger.error(str(e))
            self._generate_error_report()
            raise e
        except Exception as e:
            self.validation_status = "FAILED"
            self.errors.append(str(e))
            self.logger.error(f"Unexpected error: {e}")
            self._generate_error_report()
            raise ExportArtifactsError("System", "execute", str(e), "Check logs for stacktrace")

    def _validate_feature_metadata(self):
        feature_count = self.feature_metadata.get(
            "feature_count",
            self.feature_metadata.get("selected_feature_count")
        )
        if feature_count is None:
            raise ExportArtifactsError("feature_selector_metadata.json", "validate", "Missing feature_count", "Ensure feature selection stage writes feature_count or selected_feature_count")
        self.feature_metadata["feature_count"] = feature_count

        creation_time = self.feature_metadata.get(
            "creation_time",
            self.feature_metadata.get("created_at_utc")
        )
        if creation_time is None:
            raise ExportArtifactsError("feature_selector_metadata.json", "validate", "Missing creation_time", "Ensure feature selection stage writes creation_time or created_at_utc")
        self.feature_metadata["creation_time"] = creation_time

        pv = self.model_metadata.get("pipeline_version", self.calibration_metadata.get("pipeline_version"))
        if pv is not None:
            self.feature_metadata["pipeline_version"] = pv

        rs = self.model_metadata.get("random_seed", self.model_metadata.get("random_state"))
        if rs is not None:
            self.feature_metadata["random_seed"] = rs

        t = self.feature_metadata.get("target", "isFraud")
        self.feature_metadata["target"] = t

        req_keys = ["selected_features", "selector_type", "estimator", "importance_metric", "threshold"]
        for k in req_keys:
            if k not in self.feature_metadata:
                raise ExportArtifactsError("feature_selector_metadata.json", "validate", f"Missing key: {k}", "Ensure feature selection stage writes all keys")
        
        feats = self.feature_metadata["selected_features"]
        if self.feature_metadata["feature_count"] != len(feats):
            raise ExportArtifactsError("feature_selector_metadata.json", "validate", "Feature count mismatch", "Check feature selection logic")
        if len(set(feats)) != len(feats):
            raise ExportArtifactsError("feature_selector_metadata.json", "validate", "Duplicate features found", "Ensure deterministic unique features")

    def _validate_model_metadata(self):
        req_keys = ["model_version", "pipeline_version", "training_timestamp", "feature_count", "random_seed", "xgboost_version"]
        for k in req_keys:
            if k not in self.model_metadata:
                raise ExportArtifactsError("model_metadata.json", "validate", f"Missing key: {k}", "Ensure model training writes all keys")

    def _validate_threshold(self):
        t = self.threshold.get("threshold", self.threshold.get("recommended_threshold"))
        if t is None:
            raise ExportArtifactsError("deployment_threshold.json", "validate", "Missing threshold key", "Ensure threshold optimization writes threshold")
        
        if not (0 <= t <= 1):
            raise ExportArtifactsError("deployment_threshold.json", "validate", "Threshold out of bounds", "Threshold must be between 0 and 1")

    def _validate_shap_metadata(self):
        req_keys = ["feature_count", "expected_value", "explained_samples", "background_samples", "pipeline_version", "model_version"]
        for k in req_keys:
            if k not in self.shap_metadata:
                raise ExportArtifactsError("shap_metadata.json", "validate", f"Missing key: {k}", "Ensure SHAP explains writes all keys")

    def _validate_reports(self):
        self.logger.info("Loading and validating reports...")
        eval_report = self._load_json(os.path.join(self.reports_dir, "model_evaluation_report.json"), "model_evaluation_report.json")
        threshold_report = self._load_json(os.path.join(self.reports_dir, "threshold_optimization_report.json"), "threshold_optimization_report.json")
        shap_report = self._load_json(os.path.join(self.reports_dir, "shap_explainability_report.json"), "shap_explainability_report.json")
        
        for r_name, r in [("model_evaluation_report.json", eval_report), 
                          ("threshold_optimization_report.json", threshold_report), 
                          ("shap_explainability_report.json", shap_report)]:
            if r.get("status") != "SUCCESS":
                self.warnings.append(f"{r_name} status is not SUCCESS")

    def _validate_consistency(self):
        # Feature count
        fc = self.model_metadata["feature_count"]
        if self.feature_metadata.get("feature_count") != fc or self.shap_metadata.get("feature_count") != fc:
            raise ExportArtifactsError("consistency", "validate", "Feature count mismatch across metadata", "Re-run full pipeline")

        # Pipeline version
        pv = self.model_metadata["pipeline_version"]
        if self.shap_metadata.get("pipeline_version") != pv or (
            self.feature_metadata.get("pipeline_version") and self.feature_metadata["pipeline_version"] != pv):
            raise ExportArtifactsError("consistency", "validate", "Pipeline version mismatch", "Re-run full pipeline")

        # Model version
        mv = self.model_metadata["model_version"]
        if self.shap_metadata.get("model_version") != mv:
            raise ExportArtifactsError("consistency", "validate", "Model version mismatch", "Re-run full pipeline")

        # Feature ordering
        fo = self.model_metadata.get("feature_order", self.model_metadata.get("features", []))
        if fo:
            if fo != self.feature_metadata.get("selected_features", []):
                raise ExportArtifactsError("consistency", "validate", "Feature ordering mismatch", "Re-run full pipeline")
            if len(fo) != fc:
                raise ExportArtifactsError("consistency", "validate", "Feature order length mismatch", "Re-run full pipeline")
            if len(set(fo)) != len(fo):
                raise ExportArtifactsError("consistency", "validate", "Duplicate features in feature order", "Re-run full pipeline")

        # Random seed
        rs = self.model_metadata["random_seed"]
        if "random_seed" in self.feature_metadata and self.feature_metadata["random_seed"] != rs:
            raise ExportArtifactsError("consistency", "validate", "Random seed mismatch", "Re-run full pipeline")
        if "random_state" in self.shap_metadata and self.shap_metadata["random_state"] != rs:
            raise ExportArtifactsError("consistency", "validate", "Random seed mismatch", "Re-run full pipeline")

        # Target column
        t = self.model_metadata.get("target", "isFraud")
        if "target" in self.feature_metadata and self.feature_metadata["target"] != t:
            raise ExportArtifactsError("consistency", "validate", "Target column mismatch", "Re-run full pipeline")

        # ── Issue 7: Runtime preprocessing deployment consistency ─────────────
        # Verify that the runtime preprocessing artifact was built from the same
        # pipeline version as the model.  This prevents accidentally deploying a
        # model trained with Aegis-1.1.0 alongside feature mappings from Aegis-1.0.0.
        rp_meta = self.runtime_preprocessing_metadata
        if rp_meta:
            rp_artifact_version = rp_meta.get("artifact_version")
            if rp_artifact_version and rp_artifact_version != pv:
                raise ExportArtifactsError(
                    "consistency",
                    "validate",
                    f"runtime_preprocessing artifact_version '{rp_artifact_version}' != "
                    f"model pipeline_version '{pv}'. Mixed artifacts from different pipeline "
                    "versions must not be deployed together.",
                    "Re-run feature engineering and model training with the same PIPELINE_VERSION"
                )

            rp_fe_version = rp_meta.get("feature_engineering_version")
            if rp_fe_version and rp_fe_version != pv:
                raise ExportArtifactsError(
                    "consistency",
                    "validate",
                    f"runtime_preprocessing feature_engineering_version '{rp_fe_version}' != "
                    f"model pipeline_version '{pv}'.",
                    "Re-run feature engineering stage with the same PIPELINE_VERSION as model training"
                )

            self.logger.info(
                f"Deployment consistency OK: runtime_preprocessing artifact_version='{rp_artifact_version}' "
                f"matches model pipeline_version='{pv}'"
            )

    def _validate_model(self, model: Any):
        self.logger.info("Validating XGBoost Model...")
        if not isinstance(model, xgb.XGBClassifier):
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Not an XGBClassifier", "Model must be XGBClassifier")
        
        # Verify it's a binary classifier
        classes = getattr(model, "classes_", None)
        n_classes = getattr(model, "n_classes_", None)
        if classes is not None and len(classes) != 2:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Not a binary classifier", "Model must have exactly 2 classes")
        elif n_classes is not None and n_classes != 2:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Not a binary classifier", "Model must have exactly 2 classes")
        
        try:
            b = model.get_booster()
        except xgb.core.XGBoostError:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Model not fitted", "Train model before exporting")
            
        if not hasattr(model, "predict_proba"):
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "predict_proba missing", "Model must support probability prediction")
            
        if not b:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Booster missing", "Model booster not found")
            
        fn = b.feature_names
        if not fn:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Feature names not stored", "Train model with feature names")
            
        if len(fn) != self.model_metadata["feature_count"]:
            raise ExportArtifactsError("xgboost_model.joblib", "validate", "Booster feature count mismatch", "Re-run training")

    def _validate_probability_calibrator(self, calibrator: Any, model: Any):
        self.logger.info("Validating Probability Calibrator...")
        
        try:
            check_is_fitted(calibrator)
        except NotFittedError:
            raise ExportArtifactsError("probability_calibrator.joblib", "validate", "Calibrator is not fitted", "Ensure calibrator is fitted before exporting")
            
        if not hasattr(calibrator, "predict_proba") and not hasattr(calibrator, "predict"):
            raise ExportArtifactsError("probability_calibrator.joblib", "validate", "Missing predict methods", "Calibrator must implement predict_proba or predict")

    def _validate_runtime_preprocessing(self):
        """
        Loads and validates the runtime preprocessing artifact against the
        formal schema (ARTIFACT_SCHEMA_VERSION = "1.0").

        Validation checks (Issue 6):
        1. schema_version key present and value == "1.0"
        2. aggregation_mappings present and non-empty (>= 1 group)
        3. frequency_mappings present and non-empty (>= 1 group)
        4. percentile_mapping present and len > 0
        5. Every aggregation group has >= 1 stat bucket, every bucket size > 0
        6. Every frequency group size > 0
        7. artifact_version == pipeline_version in model_metadata.json

        Raises:
            ExportArtifactsError: On any validation failure.
        """
        self.logger.info("Validating runtime preprocessing artifact (schema v1.0)...")
        artifact_path = os.path.join(self.artifacts_dir, "runtime_preprocessing.joblib")

        rp = self._load_joblib(artifact_path, "runtime_preprocessing.joblib")

        # ── 1. Schema version ────────────────────────────────────────────────
        schema_version = rp.get("schema_version")
        if schema_version != "1.0":
            raise ExportArtifactsError(
                "runtime_preprocessing.joblib",
                "validate",
                f"schema_version mismatch: expected '1.0', got '{schema_version}'. "
                "Re-run feature engineering stage to regenerate the artifact.",
                "Re-run feature engineering stage"
            )

        # ── 2. aggregation_mappings present and non-empty ────────────────────
        agg = rp.get("aggregation_mappings")
        if not agg:
            raise ExportArtifactsError(
                "runtime_preprocessing.joblib",
                "validate",
                "aggregation_mappings is absent or empty",
                "Re-run feature engineering stage"
            )

        # ── 3. frequency_mappings present and non-empty ──────────────────────
        freq = rp.get("frequency_mappings")
        if not freq:
            raise ExportArtifactsError(
                "runtime_preprocessing.joblib",
                "validate",
                "frequency_mappings is absent or empty",
                "Re-run feature engineering stage"
            )

        # ── 4. percentile_mapping present and non-empty ──────────────────────
        percentile = rp.get("percentile_mapping")
        if not percentile or len(percentile) == 0:
            raise ExportArtifactsError(
                "runtime_preprocessing.joblib",
                "validate",
                "percentile_mapping is absent or empty; Amount_Percentile cannot be served at inference",
                "Re-run feature engineering stage"
            )

        # ── 5. Per-group size checks for aggregation_mappings ────────────────
        for col, stats in agg.items():
            if not stats:
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "validate",
                    f"aggregation_mappings['{col}'] has no stat buckets (empty dict)",
                    "Re-run feature engineering stage"
                )
            for stat, bucket in stats.items():
                if len(bucket) == 0:
                    raise ExportArtifactsError(
                        "runtime_preprocessing.joblib",
                        "validate",
                        f"aggregation_mappings['{col}']['{stat}'] is empty (size=0)",
                        "Re-run feature engineering stage"
                    )

        # ── 6. Per-group size checks for frequency_mappings ──────────────────
        for group, mapping in freq.items():
            if len(mapping) == 0:
                raise ExportArtifactsError(
                    "runtime_preprocessing.joblib",
                    "validate",
                    f"frequency_mappings['{group}'] is empty (size=0)",
                    "Re-run feature engineering stage"
                )

        # ── 7. artifact_version == model pipeline_version ────────────────────
        artifact_version = rp.get("artifact_version")
        model_pipeline_version = self.model_metadata.get("pipeline_version") if self.model_metadata else None
        if model_pipeline_version and artifact_version != model_pipeline_version:
            raise ExportArtifactsError(
                "runtime_preprocessing.joblib",
                "validate",
                f"artifact_version '{artifact_version}' != model pipeline_version '{model_pipeline_version}'. "
                "Artifact and model were built from different pipeline versions.",
                "Re-run feature engineering stage with the same PIPELINE_VERSION as model training"
            )

        # ── Cache serialized bytes for NaN-safe deep copy verification ────────
        # We store bytes rather than the raw dicts to avoid NaN != NaN
        # false-positives when comparing the source vs. copied artifact later.
        buf_agg = io.BytesIO()
        buf_freq = io.BytesIO()
        joblib.dump(rp["aggregation_mappings"], buf_agg)
        joblib.dump(rp["frequency_mappings"], buf_freq)

        # Carry runtime preprocessing metadata forward for use in _generate_outputs
        # and _validate_consistency.
        self.runtime_preprocessing_metadata["schema_version"] = schema_version
        self.runtime_preprocessing_metadata["artifact_version"] = artifact_version
        self.runtime_preprocessing_metadata["feature_engineering_version"] = rp.get("feature_engineering_version", artifact_version)
        self.runtime_preprocessing_metadata["pipeline_version"] = rp.get("artifact_version", rp.get("pipeline_version", ""))
        self.runtime_preprocessing_metadata["percentile_buckets"] = len(percentile)
        self.runtime_preprocessing_metadata["aggregation_groups"] = list(agg.keys())
        self.runtime_preprocessing_metadata["frequency_groups"] = list(freq.keys())
        self.runtime_preprocessing_metadata["_bytes_aggregation_mappings"] = buf_agg.getvalue()
        self.runtime_preprocessing_metadata["_bytes_frequency_mappings"] = buf_freq.getvalue()

        self.logger.info(
            f"runtime_preprocessing.joblib validated: "
            f"schema_version={schema_version}, "
            f"artifact_version={artifact_version}, "
            f"aggregation_groups={list(agg.keys())}, "
            f"frequency_groups={list(freq.keys())}, "
            f"percentile_buckets={len(percentile):,}"
        )

    def _generate_outputs(self):
        self.logger.info("Generating deployment outputs...")
        
        is_deployment_ready = (self.validation_status == "SUCCESS" and len(self.errors) == 0 and len(self.missing_files) == 0)
        now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        model_feature_names = self.model_metadata.get("feature_names", self.model_metadata.get("feature_order", self.model_metadata.get("features", [])))
        selected_features = self.feature_metadata.get("selected_features", [])
        feature_order_verified = (model_feature_names == selected_features)
        
        deployment_config = {
            "schema_version": "2.0",
            "deployment_id": self.deployment_id,
            "created_at": now_utc,
            "pipeline_version": self.model_metadata.get("pipeline_version", "unknown"),
            "model_version": self.model_metadata.get("model_version", "unknown"),
            "deployment_version": self.model_metadata.get("pipeline_version", "1.0"),
            "model": {
                "model_type": self.model_metadata.get("model_type", "XGBClassifier"),
                "algorithm": self.model_metadata.get("algorithm", "XGBClassifier"),
                "objective": self.model_metadata.get("objective", "binary:logistic"),
                "target_column": self.model_metadata.get("target", "isFraud"),
                "random_seed": self.model_metadata.get("random_seed", 42),
                "feature_count": self.model_metadata.get("feature_count", len(selected_features))
            },
            "calibration": {
                "enabled": bool(self.calibration_metadata),
                "method": self.calibration_metadata.get("Calibration Method", self.calibration_metadata.get("calibration_method", "isotonic")),
                "model_file": "probability_calibrator.joblib"
            },
            "threshold": {
                "value": self.threshold.get("threshold", self.threshold.get("recommended_threshold", 0.5)),
                "strategy": self.threshold.get("strategy", "f1_optimization")
            },
            "features": {
                "feature_order": selected_features,
                "categorical_features": self.encoder_metadata.get("categorical_features", []),
                "numerical_features": self.encoder_metadata.get("numerical_features", []),
                "excluded_columns": self.encoder_metadata.get("excluded_columns", []),
                "expected_input_shape": [None, self.model_metadata.get("feature_count", len(selected_features))]
            },
            "files": {
                "model_file": "xgboost_model.joblib",
                "calibrator_file": "probability_calibrator.joblib",
                "runtime_preprocessing_file": "runtime_preprocessing.joblib",
                "config_file": "deployment_config.json"
            },
            "runtime_preprocessing": {
                "enabled": True,
                "artifact": "runtime_preprocessing.joblib",
                # ── Issue 3: schema and version fields for ML Worker startup validation ──
                "schema_version": self.runtime_preprocessing_metadata.get("schema_version", "1.0"),
                "artifact_version": self.runtime_preprocessing_metadata.get("artifact_version", ""),
                "feature_engineering_version": self.runtime_preprocessing_metadata.get("feature_engineering_version", ""),
                "aggregation_groups": self.runtime_preprocessing_metadata.get("aggregation_groups", []),
                "frequency_groups": self.runtime_preprocessing_metadata.get("frequency_groups", []),
                "percentile_buckets": self.runtime_preprocessing_metadata.get("percentile_buckets", 0),
            },
            "checksums": {
                "xgboost_model.joblib": self.checksums.get("xgboost_model.joblib", ""),
                "probability_calibrator.joblib": self.checksums.get("probability_calibrator.joblib", ""),
                "runtime_preprocessing.joblib": self.checksums.get("runtime_preprocessing.joblib", "")
            },
            "runtime": {
                "python_version": platform.python_version(),
                "xgboost_version": xgb.__version__,
                "sklearn_version": sklearn.__version__,
                "numpy_version": np.__version__,
                "pandas_version": pd.__version__,
                "scipy_version": scipy.__version__,
                "joblib_version": joblib.__version__
            },
            "validation": {
                "feature_order_verified": feature_order_verified,
                "checksum_verified": self.checksum_verified,
                "runtime_preprocessing_verified": "runtime_preprocessing.joblib" in self.validated_files,
                "deployment_ready": is_deployment_ready,
                "exported_by": "ExportArtifacts v2.0"
            }
        }
        
        config_path = os.path.join(self.deployment_dir, "deployment_config.json")
        with open(config_path, "w") as f:
            json.dump(deployment_config, f, indent=4, sort_keys=True)

        # ── Critical: post-write cross-check (Issue 1) ───────────────────────
        # Re-read the written deployment_config.json and assert that the
        # runtime_preprocessing section values are exactly equal to the values
        # extracted from the artifact during _validate_runtime_preprocessing().
        # This closes the gap between artifact validation and config generation:
        # even if a future refactor accidentally breaks the data flow, this
        # assertion will catch it immediately rather than at ML Worker startup.
        with open(config_path, "r") as f:
            written_config = json.load(f)

        written_rp = written_config.get("runtime_preprocessing", {})
        expected_agg_groups = self.runtime_preprocessing_metadata.get("aggregation_groups", [])
        expected_freq_groups = self.runtime_preprocessing_metadata.get("frequency_groups", [])
        expected_percentile_buckets = self.runtime_preprocessing_metadata.get("percentile_buckets", 0)

        config_agg_groups = written_rp.get("aggregation_groups", [])
        config_freq_groups = written_rp.get("frequency_groups", [])
        config_percentile_buckets = written_rp.get("percentile_buckets", -1)

        if config_agg_groups != expected_agg_groups:
            raise ExportArtifactsError(
                "deployment_config.json",
                "post_write_verify",
                f"runtime_preprocessing.aggregation_groups in written config "
                f"{config_agg_groups} != artifact groups {expected_agg_groups}",
                "Data flow between _validate_runtime_preprocessing and _generate_outputs is broken"
            )
        if config_freq_groups != expected_freq_groups:
            raise ExportArtifactsError(
                "deployment_config.json",
                "post_write_verify",
                f"runtime_preprocessing.frequency_groups in written config "
                f"{config_freq_groups} != artifact groups {expected_freq_groups}",
                "Data flow between _validate_runtime_preprocessing and _generate_outputs is broken"
            )
        if config_percentile_buckets != expected_percentile_buckets:
            raise ExportArtifactsError(
                "deployment_config.json",
                "post_write_verify",
                f"runtime_preprocessing.percentile_buckets in written config "
                f"{config_percentile_buckets} != artifact value {expected_percentile_buckets}",
                "Data flow between _validate_runtime_preprocessing and _generate_outputs is broken"
            )

        self.logger.info(
            "deployment_config.json post-write cross-check PASSED: "
            f"aggregation_groups={config_agg_groups}, "
            f"frequency_groups={config_freq_groups}, "
            f"percentile_buckets={config_percentile_buckets:,}"
        )

        val_report = {
            "schema_version": "2.0",
            "deployment_id": self.deployment_id,
            "validation_status": self.validation_status,
            "deployment_config_generated": True,
            "joblib_files_copied": len(self.copied_artifacts) == 3,
            "checksum_verification": self.checksum_verified,
            "feature_order_verification": feature_order_verified,
            "runtime_preprocessing_verified": "runtime_preprocessing.joblib" in self.validated_files,
            "deployment_ready": is_deployment_ready,
            "warnings": self.warnings,
            "errors": self.errors,
            "execution_time": time.time() - self.start_time
        }
        with open(os.path.join(self.deployment_dir, "deployment_validation_report.json"), "w") as f:
            json.dump(val_report, f, indent=4, sort_keys=True)
            
        self.logger.info("Outputs generated successfully.")

    def _generate_error_report(self):
        val_report = {
            "schema_version": "2.0",
            "deployment_id": getattr(self, "deployment_id", "UNKNOWN"),
            "validation_status": "FAILED",
            "deployment_config_generated": False,
            "joblib_files_copied": len(getattr(self, "copied_artifacts", [])) == 3,
            "checksum_verification": getattr(self, "checksum_verified", False),
            "feature_order_verification": False,
            "deployment_ready": False,
            "warnings": self.warnings,
            "errors": self.errors,
            "execution_time": time.time() - self.start_time
        }
        with open(os.path.join(self.deployment_dir, "deployment_validation_report.json"), "w") as f:
            json.dump(val_report, f, indent=4, sort_keys=True)


if __name__ == "__main__":
    exporter = ArtifactExporter()
    exporter.run()
