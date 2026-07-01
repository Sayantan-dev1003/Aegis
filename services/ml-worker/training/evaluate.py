"""
Aegis - Real-Time Fraud Detection System
Module: Model Evaluation

This module evaluates the COMPLETE production inference pipeline.

The evaluation sequence is

Validation Data
      ↓
Trained Model
      ↓
Probability Calibration
      ↓
Deployment Threshold
      ↓
Final Prediction

No model training, no probability calibration fitting, and no threshold optimization are performed here.
This module only performs inference.
"""

"""
INPUT FILES
-----------

data/selected/validation.parquet

artifacts/model.joblib

artifacts/model_metadata.json

artifacts/training_configuration.json

artifacts/feature_importance.json

artifacts/probability_calibrator.joblib

artifacts/calibration_metadata.json

artifacts/deployment_threshold.json

reports/model_training_report.json

reports/calibration_report.json

reports/threshold_optimization_report.json
"""

"""
OUTPUT FILES
------------

reports/

    model_evaluation_report.json

    evaluation_configuration.json

    confusion_matrix.csv

    confusion_matrix.json

    error_analysis.csv

    roc_curve.csv

    pr_curve.csv

    lift_gain_curve.csv

plots/

    confusion_matrix.png

    confusion_matrix_normalized.png

    roc_curve.png

    pr_curve.png

    gain_curve.png

    lift_curve.png

    probability_distribution.png
"""

import os
import json
import logging
import datetime
import platform
import time
import gc
from typing import List, Dict, Any, Tuple

try:
    import psutil
except ImportError:
    psutil = None

import pandas as pd
import numpy as np
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
import sklearn
import xgboost as xgb

from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
    balanced_accuracy_score, matthews_corrcoef, log_loss, brier_score_loss,
    cohen_kappa_score, roc_curve, precision_recall_curve
)


class ModelEvaluationError(Exception):
    """Custom exception for errors during the model evaluation process."""
    pass


class ModelEvaluator:
    """
    Production-grade Model Evaluation module for Aegis Pipeline.
    
    Responsibilities:
    - Load trained model, calibrator, thresholds and validation data.
    - Validate exact feature ordering and input consistency.
    - Generate final predictions using calibrated probabilities and deployment threshold.
    - Compute comprehensive metrics and business metrics.
    - Generate lift, gain curves and visualizations.
    - Generate artifact files and JSON reports.
    """

    def __init__(
        self,
        val_path: str = "data/selected/validation.parquet",
        model_path: str = "artifacts/model.joblib",
        metadata_path: str = "artifacts/model_metadata.json",
        config_path: str = "artifacts/training_configuration.json",
        importance_path: str = "artifacts/feature_importance.json",
        training_report_path: str = "reports/model_training_report.json",
        calibrator_path: str = "artifacts/probability_calibrator.joblib",
        calibration_meta_path: str = "artifacts/calibration_metadata.json",
        threshold_path: str = "artifacts/deployment_threshold.json",
        calibration_report_path: str = "reports/calibration_report.json",
        threshold_report_path: str = "reports/threshold_optimization_report.json",
        report_dir: str = "reports",
        plots_dir: str = "plots"
    ):
        self.val_path = val_path
        self.model_path = model_path
        self.metadata_path = metadata_path
        self.config_path = config_path
        self.importance_path = importance_path
        self.training_report_path = training_report_path
        
        self.calibrator_path = calibrator_path
        self.calibration_meta_path = calibration_meta_path
        self.threshold_path = threshold_path
        self.calibration_report_path = calibration_report_path
        self.threshold_report_path = threshold_report_path
        
        self.report_dir = report_dir
        self.plots_dir = plots_dir
        
        self.logger = self._setup_logger()
        
        # Loaded data
        self.val_df: pd.DataFrame = pd.DataFrame()
        self.model: Any = None
        self.metadata: Dict[str, Any] = {}
        self.config: Dict[str, Any] = {}
        self.importance: List[Dict[str, Any]] = []
        self.training_report: Dict[str, Any] = {}
        
        self.calibrator: Any = None
        self.calibration_metadata: Dict[str, Any] = {}
        self.threshold_config: Dict[str, Any] = {}
        self.calibration_report: Dict[str, Any] = {}
        self.threshold_report: Dict[str, Any] = {}
        
        # State
        self.validation_features: List[str] = []
        self.y_true: np.ndarray = np.array([])
        self.raw_probability: np.ndarray = np.array([])
        self.calibrated_probability: np.ndarray = np.array([])
        self.final_prediction: np.ndarray = np.array([])
        self.transaction_ids: pd.Series = pd.Series(dtype='object')
        
        # Timings and Monitoring
        self.timings: Dict[str, float] = {}
        self.memory_usage: Dict[str, float] = {}
        self.run_start_time: float = 0.0
        
        # Results
        self.metrics: Dict[str, Any] = {}
        self.business_metrics: Dict[str, Any] = {}
        self.dataset_stats: Dict[str, Any] = {}
        self.model_confidence: Dict[str, Any] = {}
        self.prob_quality: Dict[str, Any] = {}
        self.threshold_summary: Dict[str, Any] = {}
        
        # Final Readiness
        self.evaluation_status: str = "FAIL"
        
        # Ensure directories exist
        os.makedirs(self.report_dir, exist_ok=True)
        os.makedirs(self.plots_dir, exist_ok=True)
        
        # Default config for quality gates
        self.min_roc_auc = 0.95
        self.min_pr_auc = 0.75

    def _setup_logger(self) -> logging.Logger:
        """Configures structured, production-grade logging."""
        logger = logging.getLogger("ModelEvaluation")
        if not logger.handlers:
            logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _log_memory(self, stage: str):
        """Logs current process memory if psutil is available."""
        if psutil:
            process = psutil.Process(os.getpid())
            mem_mb = process.memory_info().rss / (1024 * 1024)
            self.memory_usage[stage] = mem_mb
            self.logger.info(f"Memory usage [{stage}]: {mem_mb:.2f} MB")
        else:
            self.memory_usage[stage] = "Memory monitoring unavailable."

    def _time_stage(self, stage_name: str, start_time: float):
        """Records execution time of a stage."""
        elapsed = time.time() - start_time
        self.timings[stage_name] = elapsed
        self.logger.info(f"Stage '{stage_name}' completed in {elapsed:.4f}s")

    def load(self):
        """Loads all required artifacts and validation data."""
        start_time = time.time()
        self.logger.info("Loading artifacts and validation data...")
        self._log_memory("before_loading")
        
        try:
            # 1. Check file existence
            files_to_check = [
                self.val_path, self.model_path, self.metadata_path, 
                self.config_path, self.importance_path,
                self.calibrator_path, self.calibration_meta_path, self.threshold_path,
                self.calibration_report_path, self.threshold_report_path
            ]
            for fpath in files_to_check:
                if not os.path.exists(fpath):
                    raise ModelEvaluationError(f"Required artifact not found: {fpath}")

            # 2. Load model and calibrator
            self.logger.info("Loading trained model...")
            self.model = joblib.load(self.model_path)
            self.logger.info("Loading probability calibrator...")
            self.calibrator = joblib.load(self.calibrator_path)
            
            # 3. Load JSONs
            with open(self.metadata_path, 'r') as f:
                self.metadata = json.load(f)
            with open(self.config_path, 'r') as f:
                self.config = json.load(f)
            with open(self.importance_path, 'r') as f:
                self.importance = json.load(f)
            with open(self.calibration_meta_path, 'r') as f:
                self.calibration_metadata = json.load(f)
            
            with open(self.threshold_path, 'r') as f:
                self.threshold_config = json.load(f)
            with open(self.calibration_report_path, 'r') as f:
                self.calibration_report = json.load(f)
            with open(self.threshold_report_path, 'r') as f:
                self.threshold_report = json.load(f)
                
            if os.path.exists(self.training_report_path):
                with open(self.training_report_path, 'r') as f:
                    self.training_report = json.load(f)
            else:
                self.logger.info("Training report not found. Overfitting information will be unavailable.")
                
            # 4. Load validation data
            self.val_df = pd.read_parquet(self.val_path)
            
            self._log_memory("after_loading")
            self._time_stage("loading", start_time)
            
        except Exception as e:
            self.logger.error(f"Failed during load(): {str(e)}")
            raise ModelEvaluationError(f"Failed to load artifacts/data: {str(e)}")

    def validate_input(self):
        """Validates the validation dataset against strict criteria."""
        start_time = time.time()
        self.logger.info("Validating inputs...")
        try:
            if self.val_df.empty:
                raise ModelEvaluationError("Validation dataset is empty.")
            
            if self.val_df.columns.duplicated().any():
                raise ModelEvaluationError("Validation dataset contains duplicate columns.")
                
            if "TransactionID" not in self.val_df.columns:
                raise ModelEvaluationError("TransactionID column is missing from validation dataset.")
                
            if "isFraud" not in self.val_df.columns:
                raise ModelEvaluationError("isFraud target column is missing from validation dataset.")
                
            if self.val_df["TransactionID"].duplicated().any():
                raise ModelEvaluationError("Validation dataset contains duplicated TransactionIDs.")
                
            unique_targets = set(self.val_df["isFraud"].unique())
            if not unique_targets.issubset({0, 1}):
                raise ModelEvaluationError(f"isFraud contains invalid values: {unique_targets}. Allowed: {0, 1}.")
                
            self.validation_features = [col for col in self.val_df.columns if col not in ["TransactionID", "isFraud"]]
            
            if self.val_df[self.validation_features].isna().any().any():
                raise ModelEvaluationError("Validation dataset contains missing values (NaN) in features.")
            
            numeric_data = self.val_df[self.validation_features].select_dtypes(include=[np.number])
            if numeric_data.shape[1] != len(self.validation_features):
                raise ModelEvaluationError("Validation dataset contains non-numeric features.")
                
            if np.isinf(numeric_data.values).any():
                raise ModelEvaluationError("Validation dataset contains infinite values (Inf).")
            
            expected_dtypes = self.metadata.get("feature_dtypes")
            if expected_dtypes:
                for feat in self.validation_features:
                    if feat in expected_dtypes:
                        expected_type = expected_dtypes[feat]
                        actual_type = str(self.val_df[feat].dtype)
                        if expected_type != actual_type:
                            raise ModelEvaluationError(f"Data type mismatch for {feat}. Expected {expected_type}, got {actual_type}.")
            else:
                self.logger.warning("feature_dtypes not found in metadata. Skipping strict dtype validation.")
                
            self._time_stage("input_validation", start_time)
        except Exception as e:
            self.logger.error(f"Input validation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def validate_feature_ordering(self):
        """Ensures absolute strict feature ordering consistency and metadata presence."""
        start_time = time.time()
        self.logger.info("Validating feature ordering and extended metadata...")
        
        try:
            required_metadata_fields = [
                "model_version", "pipeline_version", "algorithm", 
                "feature_count", "feature_order", "training_timestamp", "random_seed"
            ]
            for field in required_metadata_fields:
                if field not in self.metadata:
                    raise ModelEvaluationError(f"Missing required metadata field: {field}")
            
            expected_features = self.metadata["feature_order"]
            
            if len(self.validation_features) != len(expected_features):
                raise ModelEvaluationError(
                    f"Feature count mismatch. Model expects {len(expected_features)}, "
                    f"validation data has {len(self.validation_features)}."
                )
                
            if self.metadata["feature_count"] != len(self.validation_features):
                raise ModelEvaluationError(
                    f"Feature count metadata mismatch. Metadata says {self.metadata['feature_count']}, "
                    f"validation data has {len(self.validation_features)}."
                )
                
            if self.validation_features != expected_features:
                raise ModelEvaluationError(
                    "Feature ordering mismatch! Validation data columns do not exactly "
                    "match the order specified in model_metadata['feature_order']. "
                    "Never reorder automatically."
                )
                
            self._time_stage("feature_validation", start_time)
        except Exception as e:
            self.logger.error(f"Feature validation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def validate_model(self):
        """Validates that the model supports required methods and produces valid outputs."""
        start_time = time.time()
        self.logger.info("Validating model compatibility...")
        try:
            if not hasattr(self.model, "predict") or not callable(getattr(self.model, "predict")):
                raise ModelEvaluationError("Model does not support predict() method.")
                
            if not hasattr(self.model, "predict_proba") or not callable(getattr(self.model, "predict_proba")):
                raise ModelEvaluationError("Model does not support predict_proba() method.")
                
            X_test = self.val_df[self.validation_features].head(5)
            preds = self.model.predict(X_test)
            probs = self.model.predict_proba(X_test)
            
            if len(preds.shape) != 1 or preds.shape[0] != 5:
                raise ModelEvaluationError(f"Incorrect predict() output shape: {preds.shape}")
                
            if len(probs.shape) != 2 or probs.shape[0] != 5 or probs.shape[1] != 2:
                raise ModelEvaluationError(f"Incorrect predict_proba() output shape: {probs.shape}")
                
            if np.isnan(preds).any() or np.isnan(probs).any():
                raise ModelEvaluationError("Model produced NaN outputs.")
                
            if np.isinf(preds).any() or np.isinf(probs).any():
                raise ModelEvaluationError("Model produced Inf outputs.")
                
            if (probs < 0).any() or (probs > 1).any():
                raise ModelEvaluationError("Probabilities are outside [0, 1] range.")
                
            if not np.allclose(probs.sum(axis=1), 1.0):
                raise ModelEvaluationError("Probabilities do not sum to 1.0 across classes.")
                
            self._time_stage("model_validation", start_time)
        except Exception as e:
            self.logger.error(f"Model validation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def _get_case_insensitive_key(self, dictionary, key):
        """Helper to fetch a key case insensitively or fallback to common alternates."""
        for k, v in dictionary.items():
            if k.lower().replace(" ", "_") == key.lower().replace(" ", "_"):
                return v
            if key == "created_at" and k == "Execution Timestamp":
                return v
        return None

    def validate_calibration_metadata(self):
        """Validates calibration metadata to ensure strict artifact correctness."""
        start_time = time.time()
        
        expected_fields = ["pipeline_version", "model_version", "calibration_method", "created_at"]
        for field in expected_fields:
            val = self._get_case_insensitive_key(self.calibration_metadata, field)
            if val is None or val == "":
                raise ModelEvaluationError(f"Calibration metadata validation failed.\nMissing required field: {field}.")
        
        # Cross validate with model metadata
        model_version = self._get_case_insensitive_key(self.metadata, "model_version")
        pipeline_version = self._get_case_insensitive_key(self.metadata, "pipeline_version")
        
        calib_model_version = self._get_case_insensitive_key(self.calibration_metadata, "model_version")
        calib_pipeline_version = self._get_case_insensitive_key(self.calibration_metadata, "pipeline_version")
        
        if calib_model_version != model_version or calib_pipeline_version != pipeline_version:
            raise ModelEvaluationError("Calibration artifact does not belong to this trained model.")
            
        self._time_stage("validate_calibration_metadata", start_time)

    def validate_deployment_threshold(self):
        """Validates deployment threshold configuration strictly."""
        start_time = time.time()
        
        expected_fields = ["threshold", "strategy", "pipeline_version", "model_version", "created_at"]
        for field in expected_fields:
            val = self._get_case_insensitive_key(self.threshold_config, field)
            if val is None or val == "":
                raise ModelEvaluationError(f"Deployment threshold validation failed.\nMissing or empty required field: {field}.")
                
        threshold = self._get_case_insensitive_key(self.threshold_config, "threshold")
        if not isinstance(threshold, (int, float)):
            raise ModelEvaluationError(f"Threshold must be numeric, got {type(threshold)}")
            
        if not (0 < threshold < 1):
            raise ModelEvaluationError(f"Deployment threshold invalid or out of bounds: {threshold}")
            
        # Cross validate with model metadata
        model_version = self._get_case_insensitive_key(self.metadata, "model_version")
        pipeline_version = self._get_case_insensitive_key(self.metadata, "pipeline_version")
        
        thresh_model_version = self._get_case_insensitive_key(self.threshold_config, "model_version")
        thresh_pipeline_version = self._get_case_insensitive_key(self.threshold_config, "pipeline_version")
        
        if thresh_model_version != model_version or thresh_pipeline_version != pipeline_version:
            raise ModelEvaluationError("Deployment threshold artifact does not match the current model.")
            
        self._time_stage("validate_deployment_threshold", start_time)

    def generate_predictions(self):
        """Generates raw probabilities, calibrates them, and applies deployment threshold."""
        start_time = time.time()
        self._log_memory("before_prediction")
        
        try:
            self.transaction_ids = self.val_df["TransactionID"]
            self.y_true = self.val_df["isFraud"].values
            X_val = self.val_df[self.validation_features]
            
            self.logger.info("Generating raw probabilities...")
            full_probs = self.model.predict_proba(X_val)
            self.raw_probability = full_probs[:, 1]
            
            calib_method = self._get_case_insensitive_key(self.calibration_metadata, "calibration_method") or "Unknown"
            self.logger.info(f"Calibration method: {calib_method}")
            self.logger.info("Applying probability calibration...")
            
            if hasattr(self.calibrator, "predict_proba"):
                calibrated_full_probs = self.calibrator.predict_proba(X_val)
                self.calibrated_probability = calibrated_full_probs[:, 1]
            elif hasattr(self.calibrator, "transform"):
                self.calibrated_probability = self.calibrator.transform(self.raw_probability)
            elif hasattr(self.calibrator, "predict"):
                self.calibrated_probability = self.calibrator.predict(self.raw_probability)
            else:
                raise ModelEvaluationError("Unsupported probability calibrator.")
                
            if np.isnan(self.calibrated_probability).any():
                raise ModelEvaluationError("Calibration produced NaN values.")
            if np.isinf(self.calibrated_probability).any():
                raise ModelEvaluationError("Calibration produced Inf values.")
            if (self.calibrated_probability < 0).any() or (self.calibrated_probability > 1).any():
                raise ModelEvaluationError("Calibrated probabilities are outside [0, 1] range.")
            
            threshold = self._get_case_insensitive_key(self.threshold_config, "threshold")
            self.logger.info(f"Using deployment threshold: {threshold}")
            self.logger.info("Generating final deployment predictions...")
            self.final_prediction = (self.calibrated_probability >= threshold).astype(int)
            
            self._log_memory("after_prediction")
            self._time_stage("prediction", start_time)
        except Exception as e:
            self.logger.error(f"Prediction generation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def compute_metrics(self):
        """Computes comprehensive statistical ML metrics using calibrated probabilities and final predictions."""
        start_time = time.time()
        
        try:
            y_t = self.y_true
            y_p = self.final_prediction
            y_prob = self.calibrated_probability
            
            tn, fp, fn, tp = confusion_matrix(y_t, y_p).ravel()
            
            self.metrics = {
                "Accuracy": float(accuracy_score(y_t, y_p)),
                "Precision": float(precision_score(y_t, y_p, zero_division=0)),
                "Recall": float(recall_score(y_t, y_p, zero_division=0)),
                "F1 Score": float(f1_score(y_t, y_p, zero_division=0)),
                "ROC AUC": float(roc_auc_score(y_t, y_prob)),
                "PR AUC": float(average_precision_score(y_t, y_prob)),
                "Balanced Accuracy": float(balanced_accuracy_score(y_t, y_p)),
                "Matthews Correlation Coefficient": float(matthews_corrcoef(y_t, y_p)),
                "Log Loss": float(log_loss(y_t, y_prob)),
                "Brier Score": float(brier_score_loss(y_t, y_prob)),
                "Cohen's Kappa": float(cohen_kappa_score(y_t, y_p)),
                
                "True Positive Rate": float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0,
                "True Negative Rate": float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0,
                "False Positive Rate": float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0,
                "False Negative Rate": float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0,
                
                "Specificity": float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0,
                "Sensitivity": float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0,
                
                "True Positives": int(tp),
                "True Negatives": int(tn),
                "False Positives": int(fp),
                "False Negatives": int(fn),
                "Total Predictions": len(y_t)
            }
            
            self._time_stage("compute_metrics", start_time)
        except Exception as e:
            self.logger.error(f"Metrics computation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def compute_business_metrics(self):
        """Computes critical business metrics for fraud detection."""
        start_time = time.time()
        
        try:
            tn, fp, fn, tp = (
                self.metrics["True Negatives"], self.metrics["False Positives"],
                self.metrics["False Negatives"], self.metrics["True Positives"]
            )
            
            total_actual_fraud = tp + fn
            total_actual_legit = tn + fp
            total_predicted_fraud = tp + fp
            total = len(self.y_true)
            
            self.business_metrics = {
                "Fraud Capture %": float(tp / total_actual_fraud * 100) if total_actual_fraud > 0 else 0.0,
                "Missed Fraud %": float(fn / total_actual_fraud * 100) if total_actual_fraud > 0 else 0.0,
                "Legitimate Approval %": float(tn / total_actual_legit * 100) if total_actual_legit > 0 else 0.0,
                "False Alarm %": float(fp / total_actual_legit * 100) if total_actual_legit > 0 else 0.0,
                "Fraud to Legitimate ratio": float(total_actual_fraud / total_actual_legit) if total_actual_legit > 0 else 0.0,
                "Predicted Fraud %": float(total_predicted_fraud / total * 100) if total > 0 else 0.0,
                "Actual Fraud %": float(total_actual_fraud / total * 100) if total > 0 else 0.0,
                "Fraud Detection Rate": float(tp / total) if total > 0 else 0.0,
                "Legitimate Approval Rate": float(tn / total) if total > 0 else 0.0,
                "Misclassification Rate": float((fp + fn) / total) if total > 0 else 0.0
            }
            
            self.metrics["Fraud Detection Rate"] = self.business_metrics["Fraud Detection Rate"]
            self.metrics["Legitimate Approval Rate"] = self.business_metrics["Legitimate Approval Rate"]
            self.metrics["Misclassification Rate"] = self.business_metrics["Misclassification Rate"]
            
            self._time_stage("business_metrics", start_time)
        except Exception as e:
            self.logger.error(f"Business metrics computation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def analyze_dataset_and_confidence(self):
        """Analyzes dataset statistics and probability distributions/confidence using calibrated probabilities."""
        start_time = time.time()
        self.logger.info("Analyzing dataset statistics and confidence...")
        
        try:
            total = len(self.y_true)
            fraud = int(self.y_true.sum())
            legit = total - fraud
            
            mem_usage = self.memory_usage.get("after_loading", 0.0)
            
            self.dataset_stats = {
                "Validation rows": total,
                "Fraud count": fraud,
                "Legitimate count": legit,
                "Fraud ratio": float(fraud / total) if total > 0 else 0.0,
                "Feature count": len(self.validation_features),
                "Memory usage (MB)": mem_usage
            }
            
            fraud_probs = self.calibrated_probability[self.y_true == 1]
            legit_probs = self.calibrated_probability[self.y_true == 0]
            
            self.model_confidence = {
                "Average fraud probability": float(np.mean(fraud_probs)) if len(fraud_probs) > 0 else 0.0,
                "Average legitimate probability": float(np.mean(legit_probs)) if len(legit_probs) > 0 else 0.0,
                "Maximum probability": float(np.max(self.calibrated_probability)),
                "Minimum probability": float(np.min(self.calibrated_probability)),
                "Median probability": float(np.median(self.calibrated_probability)),
                "Standard deviation": float(np.std(self.calibrated_probability)),
                "Probability percentiles": {
                    "10%": float(np.percentile(self.calibrated_probability, 10)),
                    "25%": float(np.percentile(self.calibrated_probability, 25)),
                    "50%": float(np.percentile(self.calibrated_probability, 50)),
                    "75%": float(np.percentile(self.calibrated_probability, 75)),
                    "90%": float(np.percentile(self.calibrated_probability, 90)),
                }
            }
            
            self.prob_quality = {
                "Above 0.90": int((self.calibrated_probability > 0.90).sum()),
                "Above 0.95": int((self.calibrated_probability > 0.95).sum()),
                "Above 0.99": int((self.calibrated_probability > 0.99).sum()),
                "Below 0.10": int((self.calibrated_probability < 0.10).sum()),
                "Below 0.05": int((self.calibrated_probability < 0.05).sum())
            }
            
            self._time_stage("dataset_confidence_analysis", start_time)
        except Exception as e:
            self.logger.error(f"Dataset & confidence analysis failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def generate_confusion_matrix(self):
        """Generates raw and normalized confusion matrices and exports them."""
        start_time = time.time()
        
        try:
            cm = confusion_matrix(self.y_true, self.final_prediction)
            cm_norm = confusion_matrix(self.y_true, self.final_prediction, normalize='true')
            
            cm_df = pd.DataFrame(cm, index=["Actual_Legit", "Actual_Fraud"], columns=["Pred_Legit", "Pred_Fraud"])
            cm_df.to_csv(os.path.join(self.report_dir, "confusion_matrix.csv"))
            
            tn, fp, fn, tp = cm.ravel()
            tn_norm, fp_norm, fn_norm, tp_norm = cm_norm.ravel()
            cm_json = {
                "raw": {
                    "true_negative": int(tn),
                    "false_positive": int(fp),
                    "false_negative": int(fn),
                    "true_positive": int(tp)
                },
                "normalized": {
                    "true_negative": float(tn_norm),
                    "false_positive": float(fp_norm),
                    "false_negative": float(fn_norm),
                    "true_positive": float(tp_norm)
                }
            }
            with open(os.path.join(self.report_dir, "confusion_matrix.json"), 'w') as f:
                json.dump(cm_json, f, indent=4)
            
            plt.figure(figsize=(8, 6))
            sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                        xticklabels=['Legitimate', 'Fraud'], yticklabels=['Legitimate', 'Fraud'])
            plt.title('Confusion Matrix (Raw)')
            plt.ylabel('Actual Label')
            plt.xlabel('Predicted Label')
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "confusion_matrix.png"))
            plt.close()
            
            plt.figure(figsize=(8, 6))
            sns.heatmap(cm_norm, annot=True, fmt='.3f', cmap='Blues', 
                        xticklabels=['Legitimate', 'Fraud'], yticklabels=['Legitimate', 'Fraud'])
            plt.title('Confusion Matrix (Normalized)')
            plt.ylabel('Actual Label')
            plt.xlabel('Predicted Label')
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "confusion_matrix_normalized.png"))
            plt.close()
            
            self._time_stage("confusion_matrix_generation", start_time)
        except Exception as e:
            self.logger.error(f"Confusion matrix generation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def generate_curves(self):
        """Generates ROC and PR curves using calibrated probabilities."""
        start_time = time.time()
        
        try:
            fpr, tpr, roc_thresh = roc_curve(self.y_true, self.calibrated_probability)
            roc_auc = self.metrics["ROC AUC"]
            
            roc_df = pd.DataFrame({"Threshold": roc_thresh, "FPR": fpr, "TPR": tpr})
            roc_df.to_csv(os.path.join(self.report_dir, "roc_curve.csv"), index=False)
            
            plt.figure(figsize=(8, 6))
            plt.plot(fpr, tpr, label=f'ROC Curve (AUC = {roc_auc:.4f})', color='darkorange')
            plt.plot([0, 1], [0, 1], 'k--', label='Random Guess')
            plt.xlabel('False Positive Rate')
            plt.ylabel('True Positive Rate')
            plt.title('Receiver Operating Characteristic')
            plt.legend(loc="lower right")
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "roc_curve.png"))
            plt.close()
            
            precision, recall, pr_thresh = precision_recall_curve(self.y_true, self.calibrated_probability)
            pr_auc = self.metrics["PR AUC"]
            
            pr_thresh = np.append(pr_thresh, 1.0)
            pr_df = pd.DataFrame({"Threshold": pr_thresh, "Precision": precision, "Recall": recall})
            pr_df.to_csv(os.path.join(self.report_dir, "pr_curve.csv"), index=False)
            
            plt.figure(figsize=(8, 6))
            plt.plot(recall, precision, label=f'PR Curve (AUC = {pr_auc:.4f})', color='blue')
            plt.xlabel('Recall')
            plt.ylabel('Precision')
            plt.title('Precision-Recall Curve')
            plt.legend(loc="lower left")
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "pr_curve.png"))
            plt.close()
            
            self._time_stage("curve_generation", start_time)
        except Exception as e:
            self.logger.error(f"Curve generation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def analyze_probability_distribution(self):
        """Generates Calibrated Probability Distribution plots."""
        start_time = time.time()
        
        try:
            plt.figure(figsize=(10, 6))
            sns.histplot(self.calibrated_probability[self.y_true == 0], bins=50, color='green', alpha=0.5, label='Legitimate (0)', stat='density')
            sns.histplot(self.calibrated_probability[self.y_true == 1], bins=50, color='red', alpha=0.5, label='Fraud (1)', stat='density')
            plt.xlabel('Calibrated Fraud Probability')
            plt.ylabel('Density')
            plt.title('Calibrated Probability Distribution by Class')
            plt.legend()
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "probability_distribution.png"))
            plt.close()
            
            self._time_stage("probability_distribution_plot", start_time)
        except Exception as e:
            self.logger.error(f"Probability distribution analysis failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def generate_lift_gain_curves(self):
        """Generates Lift and Cumulative Gain curves using calibrated probabilities."""
        start_time = time.time()
        
        try:
            df = pd.DataFrame({'y_true': self.y_true, 'y_prob': self.calibrated_probability})
            df = df.sort_values(by='y_prob', ascending=False).reset_index(drop=True)
            
            total_frauds = df['y_true'].sum()
            df['cumulative_data_fraction'] = (df.index + 1) / len(df)
            df['cumulative_frauds'] = df['y_true'].cumsum()
            df['cumulative_fraud_fraction'] = df['cumulative_frauds'] / total_frauds
            
            df['baseline_fraud_fraction'] = df['cumulative_data_fraction']
            df['lift'] = df['cumulative_fraud_fraction'] / df['baseline_fraud_fraction']
            
            df[['cumulative_data_fraction', 'cumulative_fraud_fraction', 'lift']].to_csv(
                os.path.join(self.report_dir, "lift_gain_curve.csv"), index=False
            )
            
            plt.figure(figsize=(8, 6))
            plt.plot(df['cumulative_data_fraction'], df['cumulative_fraud_fraction'], label='Model', color='blue')
            plt.plot([0, 1], [0, 1], linestyle='--', label='Baseline', color='black')
            plt.xlabel('Fraction of Data Tested')
            plt.ylabel('Fraction of Fraud Detected (TPR)')
            plt.title('Cumulative Gain Curve')
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "gain_curve.png"))
            plt.close()
            
            plt.figure(figsize=(8, 6))
            plt.plot(df['cumulative_data_fraction'], df['lift'], label='Model Lift', color='orange')
            plt.axhline(y=1, linestyle='--', color='black', label='Baseline (1.0)')
            plt.xlabel('Fraction of Data Tested')
            plt.ylabel('Lift')
            plt.title('Lift Curve')
            plt.legend()
            plt.grid(True, alpha=0.3)
            plt.tight_layout()
            plt.savefig(os.path.join(self.plots_dir, "lift_curve.png"))
            plt.close()
            
            self._time_stage("lift_gain_curves", start_time)
        except Exception as e:
            self.logger.error(f"Lift/Gain curve generation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def perform_error_analysis(self):
        """Identifies True/False Positives/Negatives and exports sorted errors."""
        start_time = time.time()
        
        try:
            results_df = pd.DataFrame({
                "TransactionID": self.transaction_ids,
                "True Label": self.y_true,
                "Prediction": self.final_prediction,
                "Probability": self.calibrated_probability
            })
            
            fp_df = results_df[(results_df["True Label"] == 0) & (results_df["Prediction"] == 1)].copy()
            fn_df = results_df[(results_df["True Label"] == 1) & (results_df["Prediction"] == 0)].copy()
            
            fp_df = fp_df.sort_values(by="Probability", ascending=False)
            fn_df = fn_df.sort_values(by="Probability", ascending=True)
            
            error_df = pd.concat([fp_df, fn_df])
            error_df.to_csv(os.path.join(self.report_dir, "error_analysis.csv"), index=False)
            
            self.metrics["Top False Positives"] = fp_df.head(100).to_dict(orient="records")
            self.metrics["Top False Negatives"] = fn_df.head(100).to_dict(orient="records")
            
            self._time_stage("error_analysis", start_time)
        except Exception as e:
            self.logger.error(f"Error analysis failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def determine_recommendations(self):
        """Determines pipeline recommendations based on metrics."""
        rec = {
            "deployment_suitable": False,
            "strengths": [],
            "risks": []
        }
        
        roc = self.metrics.get("ROC AUC", 0.0)
        pr = self.metrics.get("PR AUC", 0.0)
        
        if roc >= self.min_roc_auc and pr >= self.min_pr_auc:
            self.evaluation_status = "PASS"
        elif roc >= (self.min_roc_auc - 0.05) and pr >= (self.min_pr_auc - 0.10):
            self.evaluation_status = "PASS_WITH_WARNINGS"
        else:
            self.evaluation_status = "FAIL"
            
        if self.evaluation_status == "PASS":
            rec["deployment_suitable"] = True
            rec["strengths"].extend([
                "Deployment Ready",
                "Model Stable",
                "Calibration Applied",
                "Threshold Applied",
                "Evaluation Passed"
            ])
            rec["strengths"].append(f"Model meets quality gates (ROC-AUC >= {self.min_roc_auc}, PR-AUC >= {self.min_pr_auc}).")
        elif self.evaluation_status == "PASS_WITH_WARNINGS":
            rec["deployment_suitable"] = True
            rec["strengths"].extend([
                "Deployment Possible",
                "Review warnings",
                "Monitor production carefully",
                "Calibration Applied",
                "Threshold Applied"
            ])
            rec["risks"].append("Model passed with warnings. Monitor production.")
        else:
            rec["deployment_suitable"] = False
            rec["risks"].extend([
                "Deployment NOT Recommended",
                "Retraining Required",
                "Investigate model performance",
                f"Model fails quality gates (ROC={roc:.4f}, PR={pr:.4f})."
            ])
            
        return rec

    def validate_outputs(self):
        """Checks for artifact completeness and validity strictly."""
        start_time = time.time()
        
        try:
            expected_csvs = [
                os.path.join(self.report_dir, "error_analysis.csv"),
                os.path.join(self.report_dir, "confusion_matrix.csv"),
                os.path.join(self.report_dir, "roc_curve.csv"),
                os.path.join(self.report_dir, "pr_curve.csv"),
                os.path.join(self.report_dir, "lift_gain_curve.csv")
            ]
            expected_jsons = [
                os.path.join(self.report_dir, "confusion_matrix.json"),
                os.path.join(self.report_dir, "evaluation_configuration.json"),
                os.path.join(self.report_dir, "model_evaluation_report.json")
            ]
            expected_pngs = [
                os.path.join(self.plots_dir, "roc_curve.png"),
                os.path.join(self.plots_dir, "pr_curve.png"),
                os.path.join(self.plots_dir, "confusion_matrix.png"),
                os.path.join(self.plots_dir, "confusion_matrix_normalized.png"),
                os.path.join(self.plots_dir, "lift_curve.png"),
                os.path.join(self.plots_dir, "gain_curve.png"),
                os.path.join(self.plots_dir, "probability_distribution.png")
            ]
            
            for csv_file in expected_csvs:
                if not os.path.exists(csv_file):
                    raise ModelEvaluationError(f"Artifact validation failed. Missing CSV: {csv_file}")
                try:
                    df = pd.read_csv(csv_file)
                    if df.empty:
                        raise ModelEvaluationError(f"CSV is empty: {csv_file}")
                        
                    if "roc_curve" in csv_file:
                        if not all(col in df.columns for col in ["Threshold", "FPR", "TPR"]):
                            raise ModelEvaluationError(f"Missing columns in {csv_file}")
                    elif "pr_curve" in csv_file:
                        if not all(col in df.columns for col in ["Threshold", "Precision", "Recall"]):
                            raise ModelEvaluationError(f"Missing columns in {csv_file}")
                    elif "error_analysis" in csv_file:
                        if not all(col in df.columns for col in ["TransactionID", "True Label", "Prediction", "Probability"]):
                            raise ModelEvaluationError(f"Missing columns in {csv_file}")
                except Exception as e:
                    raise ModelEvaluationError(f"Artifact validation failed for CSV {csv_file}: {str(e)}")

            for json_file in expected_jsons:
                if not os.path.exists(json_file):
                    raise ModelEvaluationError(f"Artifact validation failed. Missing JSON: {json_file}")
                try:
                    with open(json_file, 'r') as f:
                        data = json.load(f)
                        
                    if "model_evaluation_report.json" in json_file:
                        if not isinstance(data, dict):
                            raise ModelEvaluationError(f"Artifact validation failed. Root object is not a dictionary in {json_file}")
                        
                        required_keys = [
                            "evaluation_status", "pipeline_version", "metrics",
                            "business_metrics", "calibration", "threshold",
                            "recommendations", "execution_timings", "memory_usage",
                            "system_information"
                        ]
                        for key in required_keys:
                            if key not in data:
                                raise ModelEvaluationError(f"Artifact validation failed. Missing required key '{key}' in {json_file}")
                except Exception as e:
                    raise ModelEvaluationError(f"Artifact validation failed. JSON parse error: {json_file} ({str(e)})")
                    
            for png_file in expected_pngs:
                if not os.path.exists(png_file):
                    raise ModelEvaluationError(f"Artifact validation failed. Missing PNG: {png_file}")
                if os.path.getsize(png_file) == 0:
                    raise ModelEvaluationError(f"Artifact validation failed. PNG is empty (0 bytes): {png_file}")
                try:
                    plt.imread(png_file)
                except Exception as e:
                    raise ModelEvaluationError(f"Artifact validation failed. PNG is unreadable: {png_file} - {str(e)}")
                    
            self.logger.info(f"Evaluation Status: {self.evaluation_status}")
            self._time_stage("output_validation", start_time)
        except Exception as e:
            self.logger.error(f"Output validation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def save_configuration(self):
        """Saves the configuration used for evaluation."""
        pipeline_version = self.metadata.get("pipeline_version", "Aegis-1.0.0")
        threshold = self._get_case_insensitive_key(self.threshold_config, "threshold")
        calib_method = self._get_case_insensitive_key(self.calibration_metadata, "calibration_method")
        thresh_strategy = self._get_case_insensitive_key(self.threshold_config, "strategy")
        
        config = {
            "pipeline_version": pipeline_version,
            "evaluation_timestamp": datetime.datetime.now().isoformat(),
            "deployment_threshold": threshold,
            "calibration_method": calib_method,
            "threshold_strategy": thresh_strategy,
            "quality_gates": {
                "min_roc_auc": self.min_roc_auc,
                "min_pr_auc": self.min_pr_auc
            }
        }
        with open(os.path.join(self.report_dir, "evaluation_configuration.json"), 'w') as f:
            json.dump(config, f, indent=4)

    def generate_report(self):
        """Generates the final comprehensive JSON report."""
        start_time = time.time()
        
        try:
            top_features = self.importance[:20] if isinstance(self.importance, list) else []
            recommendations = self.determine_recommendations()
            pipeline_version = self.metadata.get("pipeline_version", "Aegis-1.0.0")
            
            total_time = time.time() - self.run_start_time
            self.timings["total_runtime"] = total_time
            self._log_memory("after_evaluation")
            
            if self.training_report:
                overfitting_summary = {
                    "warnings": self.training_report.get("overfitting_warnings", []),
                    "train_metrics": self.training_report.get("train_metrics", {}),
                    "validation_metrics": self.training_report.get("val_metrics", {}),
                    "generalization_gap": self.training_report.get("generalization_gap", {})
                }
            else:
                overfitting_summary = "No overfitting information available."
            
            system_info = {
                "platform": platform.platform(),
                "operating_system": platform.system(),
                "architecture": platform.machine(),
                "processor": platform.processor(),
                "python_version": platform.python_version(),
                "pandas_version": pd.__version__,
                "numpy_version": np.__version__,
                "scikit_learn_version": sklearn.__version__,
                "xgboost_version": xgb.__version__,
                "cpu_count": os.cpu_count(),
                "timezone": time.tzname[0],
                "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            
            calibration_summary = {
                "method": self._get_case_insensitive_key(self.calibration_metadata, "calibration_method") or "Unknown",
                "brier_before": self._get_case_insensitive_key(self.calibration_report, "brier_before") or "N/A",
                "brier_after": self._get_case_insensitive_key(self.calibration_report, "brier_after") or "N/A"
            }
            
            threshold_summary = {
                "recommended_threshold": self._get_case_insensitive_key(self.threshold_config, "threshold"),
                "optimization_strategy": self._get_case_insensitive_key(self.threshold_report, "optimization_strategy"),
                "selected_metric": self._get_case_insensitive_key(self.threshold_report, "selected_metric"),
                "business_score": self._get_case_insensitive_key(self.threshold_report, "business_score"),
                "precision": self._get_case_insensitive_key(self.threshold_report, "precision"),
                "recall": self._get_case_insensitive_key(self.threshold_report, "recall"),
                "F1": self._get_case_insensitive_key(self.threshold_report, "f1"),
                "balanced_accuracy": self._get_case_insensitive_key(self.threshold_report, "balanced_accuracy"),
                "comparison_with_default_threshold": self._get_case_insensitive_key(self.threshold_report, "comparison_with_default_threshold")
            }
            
            report = {
                "timestamp": datetime.datetime.now().isoformat(),
                "pipeline_version": pipeline_version,
                "evaluation_status": self.evaluation_status,
                "dataset_summary": self.dataset_stats,
                "model_summary": {
                    "type": str(type(self.model)),
                    "feature_count": len(self.validation_features)
                },
                "metrics": self.metrics,
                "business_metrics": self.business_metrics,
                "model_confidence": self.model_confidence,
                "probability_quality": self.prob_quality,
                "calibration": calibration_summary,
                "threshold": threshold_summary,
                "recommendations": recommendations,
                "feature_importance_top_20": top_features,
                "overfitting_summary": overfitting_summary,
                "quality_gates": {
                    "min_roc_auc": self.min_roc_auc,
                    "min_pr_auc": self.min_pr_auc
                },
                "execution_timings": self.timings,
                "memory_usage": self.memory_usage,
                "system_information": system_info
            }
            
            if "Top False Positives" in report["metrics"]:
                del report["metrics"]["Top False Positives"]
            if "Top False Negatives" in report["metrics"]:
                del report["metrics"]["Top False Negatives"]
                
            report_path = os.path.join(self.report_dir, "model_evaluation_report.json")
            with open(report_path, 'w') as f:
                json.dump(report, f, indent=4)
                
            self._time_stage("report_generation", start_time)
        except Exception as e:
            self.logger.error(f"Report generation failed: {str(e)}")
            raise ModelEvaluationError(str(e))

    def cleanup(self):
        """Cleans up memory to reduce usage after evaluation."""
        self.logger.info("Cleaning up memory...")
        attributes_to_clear = [
            'raw_probability', 'calibrated_probability', 'final_prediction', 
            'val_df', 'importance', 'training_report', 'calibration_report', 
            'threshold_report', 'model_confidence', 'metrics', 'business_metrics'
        ]
        for attr in attributes_to_clear:
            if hasattr(self, attr):
                setattr(self, attr, None)
                
        gc.collect()

    def run(self):
        """Executes the complete production inference pipeline evaluation."""
        self.run_start_time = time.time()
        self.logger.info("Starting Model Evaluation Pipeline...")
        
        try:
            self.load()
            
            self.logger.info(f"Model Version: {self._get_case_insensitive_key(self.metadata, 'model_version')}")
            self.logger.info(f"Pipeline Version: {self._get_case_insensitive_key(self.metadata, 'pipeline_version')}")
            self.logger.info(f"Calibration Version: {self._get_case_insensitive_key(self.calibration_metadata, 'model_version')}")
            self.logger.info(f"Threshold Strategy: {self._get_case_insensitive_key(self.threshold_config, 'strategy')}")
            self.logger.info(f"Deployment Threshold: {self._get_case_insensitive_key(self.threshold_config, 'threshold')}")
            
            self.validate_input()
            self.validate_feature_ordering()
            self.validate_model()
            self.validate_calibration_metadata()
            self.validate_deployment_threshold()
            
            self.generate_predictions()
            
            self.logger.info("Computing evaluation metrics...")
            self.compute_metrics()
            self.compute_business_metrics()
            
            self.analyze_dataset_and_confidence()
            
            self.generate_confusion_matrix()
            self.generate_curves()
            self.analyze_probability_distribution()
            self.generate_lift_gain_curves()
            
            self.perform_error_analysis()
            
            self.save_configuration()
            self.logger.info("Generating evaluation reports...")
            self.generate_report()
            
            self.logger.info("Validating generated artifacts...")
            self.validate_outputs()
            
            self.cleanup()
            
            self.logger.info("Model Evaluation completed successfully.")
            return self.evaluation_status
            
        except Exception as e:
            self.logger.error("Model Evaluation failed entirely and halted.")
            raise ModelEvaluationError(str(e))

if __name__ == "__main__":
    try:
        evaluator = ModelEvaluator()
        status = evaluator.run()
        print(f"Model Evaluation finished with status: {status}")
    except Exception as e:
        print(f"Evaluation Script failed: {str(e)}")
        exit(1)
