import os
import json
import logging
import datetime
import time
import gc
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass, field
from enum import Enum

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib
import xgboost
import platform
from sklearn.calibration import CalibratedClassifierCV


class ThresholdOptimizationError(Exception):
    """Custom exception for threshold optimization errors."""
    pass


class OptimizationStrategy(Enum):
    MAXIMIZE_F1 = "maximize_f1"
    MAXIMIZE_PRECISION = "maximize_precision"
    MAXIMIZE_RECALL = "maximize_recall"
    MAXIMIZE_BALANCED_ACCURACY = "maximize_balanced_accuracy"
    MAXIMIZE_BUSINESS_SCORE = "maximize_business_score"
    MAXIMIZE_PROFIT = "maximize_profit"
    MINIMIZE_FALSE_POSITIVE_RATE = "minimize_false_positive_rate"
    MINIMIZE_FALSE_NEGATIVE_RATE = "minimize_false_negative_rate"


@dataclass
class BusinessCostMatrix:
    cost_fn: float = 100.0
    cost_fp: float = 5.0
    reward_tp: float = 25.0
    reward_tn: float = 0.0

    def __post_init__(self):
        if self.cost_fn < 0 or self.cost_fp < 0 or self.reward_tp < 0 or self.reward_tn < 0:
            raise ThresholdOptimizationError(
                "Invalid business costs: all costs and rewards must be non-negative."
            )


@dataclass
class OptimizerConfig:
    strategy: OptimizationStrategy = OptimizationStrategy.MAXIMIZE_F1
    costs: BusinessCostMatrix = field(default_factory=BusinessCostMatrix)


class ThresholdOptimizer:
    """
    Production-grade Threshold Optimization module for Aegis Pipeline.
    
    Responsibilities:
    - Load validation dataset and trained model/calibrator.
    - Generate raw and calibrated probabilities.
    - Evaluate multiple optimization strategies using Enums on actual confusion matrix values.
    - Apply business cost matrix to determine financial impact.
    - Apply sanity checks and safety constraints.
    - Export the final deployment threshold configuration.
    """

    def __init__(
        self,
        config: Optional[OptimizerConfig] = None,
        artifacts_dir: str = "artifacts",
        reports_dir: str = "reports",
        plots_dir: str = "plots",
        data_dir: str = "data"
    ):
        self.config = config or OptimizerConfig()
        self.artifacts_dir = artifacts_dir
        self.reports_dir = reports_dir
        self.plots_dir = plots_dir
        self.data_dir = data_dir
        
        self.logger = self._setup_logger()
        
        self.inputs = {
            "model": os.path.join(self.artifacts_dir, "xgboost_model.joblib"),
            "probability_calibrator": os.path.join(self.artifacts_dir, "probability_calibrator.joblib"),
            "model_meta": os.path.join(self.artifacts_dir, "model_metadata.json"),
            "train_config": os.path.join(self.artifacts_dir, "training_configuration.json"),
            "feature_selector": os.path.join(self.artifacts_dir, "feature_selector.joblib"),
            "feature_selector_meta": os.path.join(self.artifacts_dir, "feature_selector_metadata.json"),
            "encoder": os.path.join(self.artifacts_dir, "encoder.joblib"),
            "imputer": os.path.join(self.artifacts_dir, "imputer.joblib"),
            "validation_data": os.path.join(self.data_dir, "selected", "validation.parquet"),
            "calibration_metadata": os.path.join(self.artifacts_dir, "calibration_metadata.json")
        }
        
        os.makedirs(self.artifacts_dir, exist_ok=True)
        os.makedirs(self.reports_dir, exist_ok=True)
        os.makedirs(self.plots_dir, exist_ok=True)

        self.loaded_jsons: Dict[str, Any] = {}
        
        # State variables
        self.model = None
        self.calibrator = None
        self.X_val = None
        self.y_val = None
        self.raw_probs = None
        self.calibrated_probs = None
        self.df_thresh: pd.DataFrame = pd.DataFrame()
        
        self.optimal_row: pd.Series = pd.Series(dtype=float)
        self.default_row: pd.Series = pd.Series(dtype=float)
        self.warnings: List[str] = []
        
        self.fraud_count: float = 0.0
        self.legitimate_count: float = 0.0
        self.default_prediction_threshold: float = 0.50
        
        self.target_metric: str = ""
        self.target_ascending: bool = False
        self.stage_timings: Dict[str, float] = {}
        self.calib_method: str = "unknown"
        self.model_class_detected: str = "unknown"
        
        # Sweep configuration
        self.sweep_start = 0.00
        self.sweep_end = 1.00
        self.sweep_step = 0.01

    def _setup_logger(self) -> logging.Logger:
        logger = logging.getLogger("ThresholdOptimization")
        if not logger.handlers:
            logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _run_stage(self, stage_name: str, key_name: str, func) -> None:
        self.logger.info(f"{stage_name} started.")
        t0 = time.time()
        func()
        elapsed = time.time() - t0
        self.stage_timings[key_name] = elapsed
        self.logger.info(f"{stage_name} completed.")
        self.logger.info(f"Execution time: {elapsed:.2f} sec")

    def run(self):
        """Executes the full threshold optimization pipeline."""
        total_start = time.time()
        self.logger.info("Threshold Optimization Started")
        
        self.validate_inputs()
        
        self._run_stage("Load Validation Dataset", "load_dataset", self.load_data)
        self._run_stage("Validate Feature Metadata", "validate_metadata", self.validate_metadata)
        self._run_stage("Load Model", "load_model", self.load_model)
        self._run_stage("Generate Raw Probabilities", "raw_probs", self.generate_raw_probabilities)
        self._run_stage("Load Probability Calibrator", "load_calibrator", self.load_calibrator)
        self._run_stage("Generate Calibrated Probabilities", "calibrated_probs", self.generate_calibrated_probabilities)
        self._run_stage("Generate Threshold Sweep and Compute Metrics", "sweep", self.generate_threshold_sweep)
        self._run_stage("Compute Business Score", "business_score", self.compute_business_scores)
        self._run_stage("Select Optimal Threshold", "selection", self.select_optimal_threshold)
        self._run_stage("Run Sanity Checks", "sanity_checks", self.sanity_checks)
        self._run_stage("Generate Reports", "report_generation", self.generate_reports)
        self._run_stage("Generate Plots", "plot_generation", self.generate_plots)
        self._run_stage("Export Deployment Artifact", "artifact_export", self.export_deployment_artifact)
        self._run_stage("Validate Outputs", "output_validation", self.validate_outputs)
        
        total_elapsed = time.time() - total_start
        self.stage_timings["total_runtime"] = total_elapsed
        
        self._update_metadata_timings()
        
        # Cleanup memory at the very end
        self._run_stage("Release Temporary Memory", "memory_cleanup", self.release_memory)
        
        self.logger.info(f"Total runtime: {total_elapsed:.2f} sec")
        self.logger.info("Threshold Optimization Complete")

    def validate_inputs(self):
        for name, path in self.inputs.items():
            if not os.path.exists(path):
                raise ThresholdOptimizationError(f"Missing required input artifact: {path}")

    def load_data(self):
        try:
            val_df = pd.read_parquet(self.inputs["validation_data"])
        except Exception as e:
            raise ThresholdOptimizationError(f"Error loading validation dataset: {e}")
            
        if val_df.empty:
            raise ThresholdOptimizationError("Validation dataset is empty.")
            
        if "isFraud" not in val_df.columns:
            raise ThresholdOptimizationError("Target column 'isFraud' is missing from the dataset.")
            
        y_series = val_df["isFraud"]
        
        if y_series.isnull().any():
            raise ThresholdOptimizationError("Target column contains NaN values.")
            
        unique_vals = set(y_series.unique())
        if not unique_vals.issubset({0, 1}):
            raise ThresholdOptimizationError(f"Target contains invalid label values. Found: {unique_vals}.")
            
        if len(unique_vals) < 2:
            raise ThresholdOptimizationError("Target contains only one class; threshold optimization requires both classes.")
            
        self.y_val = y_series.values
        self.X_val = val_df.drop(columns=["isFraud", "TransactionID"], errors="ignore")
        
        self.fraud_count = np.sum(self.y_val == 1)
        self.legitimate_count = np.sum(self.y_val == 0)
        
        if self.fraud_count <= 0:
            raise ThresholdOptimizationError("Zero Fraud Dataset Validation failed: Fraud count must be > 0")
        if self.legitimate_count <= 0:
            raise ThresholdOptimizationError("Zero Legitimate Dataset Validation failed: Legitimate count must be > 0")

    def _check_schema(self, data: dict, expected_types: Dict[str, Union[type, tuple]], schema_name: str):
        for k, expected_type in expected_types.items():
            if k not in data:
                raise ThresholdOptimizationError(f"[{schema_name}] Missing required key: {k}")
            if data[k] is None:
                raise ThresholdOptimizationError(f"[{schema_name}] Null value for key: {k}")
            if not isinstance(data[k], expected_type):
                exp_names = [t.__name__ for t in expected_type] if isinstance(expected_type, tuple) else expected_type.__name__
                raise ThresholdOptimizationError(f"[{schema_name}] Type mismatch for key {k}: expected {exp_names}, got {type(data[k]).__name__}")

    def validate_metadata(self):
        try:
            json_keys = ["model_meta", "train_config", "feature_selector_meta", "calibration_metadata"]
            for key in json_keys:
                with open(self.inputs[key], "r") as f:
                    self.loaded_jsons[key] = json.load(f)
        except json.JSONDecodeError as e:
            raise ThresholdOptimizationError(f"Corrupted JSON file detected: {e}")
            
        meta = self.loaded_jsons["model_meta"]
        self._check_schema(meta, {
            "pipeline_version": str, 
            "model_version": str, 
            "feature_count": int,
            "feature_order": list
        }, "model_metadata.json")
            
        fs_meta = self.loaded_jsons["feature_selector_meta"]
        
        model_features = meta.get("feature_order", [])
        fs_features = fs_meta.get("feature_order", fs_meta.get("selected_features", []))
        dataset_features = self.X_val.columns.tolist()
        
        # Robust Feature Validation
        if self.X_val.empty or self.X_val.shape[1] == 0:
            raise ThresholdOptimizationError("Validation dataset has empty feature matrix.")
            
        if self.X_val.columns.duplicated().any():
            raise ThresholdOptimizationError("Validation dataset contains duplicate feature names.")
            
        if self.X_val.select_dtypes(include=['object', 'string']).shape[1] > 0:
            raise ThresholdOptimizationError("Validation dataset contains unsupported object/string dtypes.")
        
        if len(dataset_features) != len(model_features):
            raise ThresholdOptimizationError(f"Feature count mismatch: dataset has {len(dataset_features)}, model expects {len(model_features)}")
        if dataset_features != model_features:
            raise ThresholdOptimizationError("Feature ordering mismatch between dataset and model_metadata. Do not reorder automatically.")
            
        fs_features_clean = [f for f in fs_features if f not in ["isFraud", "TransactionID"]]
        if dataset_features != fs_features_clean:
            raise ThresholdOptimizationError("Feature ordering mismatch between dataset and feature_selector_metadata.")
            
        # Robust calibration metadata lookup
        calib_meta = self.loaded_jsons.get("calibration_metadata", {})
        for key in ["calibration_method", "selected_method", "method", "Calibration Method"]:
            if key in calib_meta:
                self.calib_method = calib_meta[key]
                break
                
        if self.calib_method == "unknown":
            self.logger.warning("Calibration method not found in metadata.")

    def load_model(self):
        try:
            self.model = joblib.load(self.inputs["model"])
        except Exception as e:
            raise ThresholdOptimizationError(f"Error loading model: {e}")
            
        is_sklearn = hasattr(self.model, "predict_proba")
        is_xgboost = isinstance(self.model, xgboost.Booster) or isinstance(self.model, xgboost.XGBClassifier)
        if not (is_sklearn or is_xgboost):
            raise ThresholdOptimizationError("Loaded model does not support probability prediction.")
            
        self.model_class_detected = type(self.model).__name__

    def generate_raw_probabilities(self):
        try:
            if hasattr(self.model, "predict_proba"):
                self.raw_probs = self.model.predict_proba(self.X_val)[:, 1]
            else:
                self.raw_probs = self.model.predict(xgboost.DMatrix(self.X_val))
        except Exception as e:
            raise ThresholdOptimizationError(f"Error generating raw probabilities: {e}")

    def load_calibrator(self):
        try:
            self.calibrator = joblib.load(self.inputs["probability_calibrator"])
        except Exception as e:
            raise ThresholdOptimizationError(f"Error loading probability calibrator: {e}")

    def _validate_probabilities(self, probs):
        if not isinstance(probs, np.ndarray):
            probs = np.array(probs)
        if len(probs) != len(self.y_val):
            raise ThresholdOptimizationError(f"Probability output length mismatch. Expected {len(self.y_val)}, got {len(probs)}")
        if np.isnan(probs).any():
            raise ThresholdOptimizationError("Calibrated probabilities contain NaN values.")
        if np.isinf(probs).any():
            raise ThresholdOptimizationError("Calibrated probabilities contain infinite values.")
        if np.any((probs < 0) | (probs > 1)):
            raise ThresholdOptimizationError("Calibrated probabilities are outside the range [0, 1].")

    def generate_calibrated_probabilities(self):
        try:
            is_wrapper = isinstance(self.calibrator, CalibratedClassifierCV) or hasattr(self.calibrator, "estimator")
            
            if is_wrapper:
                # Validation Features -> Calibrator.predict_proba(X) -> Calibrated Probabilities
                # Matches the deployment pipeline when CalibratedClassifierCV wraps the trained model.
                self.logger.info("Detected calibrator as a wrapper (e.g. CalibratedClassifierCV).")
                self.calibrated_probs = self.calibrator.predict_proba(self.X_val)[:, 1]
            else:
                # Standalone probability calibrator
                # Validation Features -> Model.predict_proba() -> Raw Probabilities -> Probability Calibrator -> Calibrated Probabilities
                # Matches the deployment pipeline for standalone calibrators.
                self.logger.info("Detected standalone calibrator.")
                if not hasattr(self.calibrator, "predict_proba") and not hasattr(self.calibrator, "predict"):
                    raise ThresholdOptimizationError("Incompatible calibrator object: missing predict/predict_proba methods.")
                    
                if self.raw_probs is None:
                    self.generate_raw_probabilities()
                
                probs_2d = self.raw_probs.reshape(-1, 1)
                
                if hasattr(self.calibrator, "predict_proba"):
                    self.calibrated_probs = self.calibrator.predict_proba(probs_2d)[:, 1]
                else:
                    self.calibrated_probs = self.calibrator.predict(self.raw_probs)
                    
            # Perform immediate probability validation
            self._validate_probabilities(self.calibrated_probs)
            
            # Clip probabilities to prevent issues with metrics like log loss
            self.calibrated_probs = np.clip(self.calibrated_probs, 1e-15, 1.0 - 1e-15)
            
        except ThresholdOptimizationError:
            raise
        except Exception as e:
            raise ThresholdOptimizationError(f"Error generating calibrated probabilities: {e}")

    def generate_threshold_sweep(self):
        train_config = self.loaded_jsons.get("train_config", {})
        
        self.sweep_start = float(train_config.get("threshold_start", 0.00))
        self.sweep_end = float(train_config.get("threshold_end", 1.00))
        self.sweep_step = float(train_config.get("threshold_step", 0.01))
        
        thresholds = np.arange(self.sweep_start, self.sweep_end + self.sweep_step, self.sweep_step)
        # Ensure we don't exceed end due to floating point rounding
        thresholds = thresholds[thresholds <= self.sweep_end]
        
        results = []
        
        for thresh in thresholds:
            preds = (self.calibrated_probs >= thresh).astype(int)
            
            # Fast confusion matrix computation for binary classification
            tp = np.sum((preds == 1) & (self.y_val == 1))
            fp = np.sum((preds == 1) & (self.y_val == 0))
            tn = np.sum((preds == 0) & (self.y_val == 0))
            fn = np.sum((preds == 0) & (self.y_val == 1))
            
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
            specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
            balanced_accuracy = (recall + specificity) / 2.0
            fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
            fnr = fn / (tp + fn) if (tp + fn) > 0 else 0.0
            fdr = recall
            lar = specificity # Legitimate Approval Rate is Percentage of legitimate transactions correctly approved: TN / (TN + FP)
            accuracy = (tp + tn) / len(self.y_val) if len(self.y_val) > 0 else 0.0
            
            # MCC
            denom = np.sqrt(float(tp + fp) * float(tp + fn) * float(tn + fp) * float(tn + fn))
            mcc = (tp * tn - fp * fn) / denom if denom > 0 else 0.0
            
            results.append({
                "Threshold": round(thresh, 2),
                "TP": tp,
                "FP": fp,
                "TN": tn,
                "FN": fn,
                "Precision": precision,
                "Recall": recall,
                "F1 Score": f1,
                "Specificity": specificity,
                "Balanced Accuracy": balanced_accuracy,
                "False Positive Rate": fpr,
                "False Negative Rate": fnr,
                "Fraud Detection Rate": fdr,
                "Legitimate Approval Rate": lar,
                "Accuracy": accuracy,
                "MCC": mcc
            })
            
        self.df_thresh = pd.DataFrame(results)

    def compute_business_scores(self):
        c = self.config.costs
        
        self.df_thresh["Business Score"] = (
            self.df_thresh["TP"] * c.reward_tp -
            self.df_thresh["FP"] * c.cost_fp -
            self.df_thresh["FN"] * c.cost_fn +
            self.df_thresh["TN"] * c.reward_tn
        )

    def select_optimal_threshold(self):
        strat = self.config.strategy
        if strat == OptimizationStrategy.MAXIMIZE_F1:
            self.target_metric = "F1 Score"
            self.target_ascending = False
        elif strat == OptimizationStrategy.MAXIMIZE_PRECISION:
            self.target_metric = "Precision"
            self.target_ascending = False
        elif strat == OptimizationStrategy.MAXIMIZE_RECALL:
            self.target_metric = "Recall"
            self.target_ascending = False
        elif strat == OptimizationStrategy.MAXIMIZE_BALANCED_ACCURACY:
            self.target_metric = "Balanced Accuracy"
            self.target_ascending = False
        elif strat in [OptimizationStrategy.MAXIMIZE_BUSINESS_SCORE, OptimizationStrategy.MAXIMIZE_PROFIT]:
            self.target_metric = "Business Score"
            self.target_ascending = False
        elif strat == OptimizationStrategy.MINIMIZE_FALSE_POSITIVE_RATE:
            self.target_metric = "False Positive Rate"
            self.target_ascending = True
        elif strat == OptimizationStrategy.MINIMIZE_FALSE_NEGATIVE_RATE:
            self.target_metric = "False Negative Rate"
            self.target_ascending = True
        else:
            raise ThresholdOptimizationError(f"Unsupported strategy: {strat.value}")

        best_val = self.df_thresh[self.target_metric].min() if self.target_ascending else self.df_thresh[self.target_metric].max()
        
        mask = np.isclose(self.df_thresh[self.target_metric], best_val, rtol=1e-9, atol=1e-12)
        candidates_idx = self.df_thresh.index[mask]
        
        best_idx = self.df_thresh.loc[candidates_idx].sort_values(
            by=["Recall", "Precision", "False Positive Rate", "Threshold"],
            ascending=[False, False, True, True]
        ).index[0]
        
        self.optimal_row = self.df_thresh.loc[best_idx]
        
        diffs = (self.df_thresh["Threshold"] - self.default_prediction_threshold).abs()
        self.default_row = self.df_thresh.loc[diffs.idxmin()]

    def sanity_checks(self):
        rec = self.optimal_row["Recall"]
        prec = self.optimal_row["Precision"]
        fpr = self.optimal_row["False Positive Rate"]
        thresh = self.optimal_row["Threshold"]
        
        if rec < 0.50:
            raise ThresholdOptimizationError(f"Threshold rejected: Recall ({rec:.4f}) < 0.50")
        if prec < 0.10:
            raise ThresholdOptimizationError(f"Threshold rejected: Precision ({prec:.4f}) < 0.10")
        if fpr > 0.30:
            raise ThresholdOptimizationError(f"Threshold rejected: False Positive Rate ({fpr:.4f}) > 0.30")
            
        if thresh > 0.90 or thresh < 0.10:
            self.warnings.append(f"Recommended threshold ({thresh:.4f}) is extreme (>0.90 or <0.10).")
            
        opt_val = self.optimal_row[self.target_metric]
        def_val = self.default_row[self.target_metric]
        
        improvement = abs((opt_val - def_val) / def_val) if def_val != 0 else 1.0
            
        if improvement < 0.005:
            self.warnings.append(f"Improvement over default threshold for {self.target_metric} is minimal (<0.5%).")
            
        within_1_pct_mask = (self.df_thresh[self.target_metric] >= opt_val * 0.99) & (self.df_thresh[self.target_metric] <= opt_val * 1.01)
        if within_1_pct_mask.sum() > 1:
            self.warnings.append(f"Multiple thresholds ({within_1_pct_mask.sum()}) are within 1% of the optimum value.")

    def generate_reports(self):
        # 1. Export CSV
        self.df_thresh.to_csv(os.path.join(self.reports_dir, "threshold_analysis.csv"), index=False)
        
        # 2. Export JSON full sweep
        self.df_thresh.to_json(os.path.join(self.reports_dir, "threshold_analysis.json"), orient="records", indent=4)
        
        # 3. Export threshold analysis metadata
        meta = self.loaded_jsons["model_meta"]
        tmeta = {
            "pipeline_version": meta.get("pipeline_version", "unknown"),
            "model_version": meta.get("model_version", "unknown"),
            "threshold_start": self.sweep_start,
            "threshold_end": self.sweep_end,
            "step": self.sweep_step,
            "total_thresholds": len(self.df_thresh),
            "default_threshold": float(self.default_row["Threshold"]),
            "best_f1_threshold": float(self.df_thresh.loc[self.df_thresh["F1 Score"].idxmax(), "Threshold"]),
            "best_precision_threshold": float(self.df_thresh.loc[self.df_thresh["Precision"].idxmax(), "Threshold"]),
            "best_recall_threshold": float(self.df_thresh.loc[self.df_thresh["Recall"].idxmax(), "Threshold"]),
            "recommended_threshold": float(self.optimal_row["Threshold"]),
            "strategy": self.config.strategy.value,
            "selected_metric": self.target_metric,
            "calibration_method": self.calib_method,
            "model_class": self.model_class_detected,
            "validation_sample_count": len(self.y_val),
            "fraud_sample_count": int(self.fraud_count),
            "legitimate_sample_count": int(self.legitimate_count),
            "fraud_prevalence": float(self.fraud_count / len(self.y_val)) if len(self.y_val) > 0 else 0.0,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "software_versions": {
                "python": platform.python_version(),
                "pandas": pd.__version__,
                "numpy": np.__version__
            },
            "execution_time": 0.0,
            "stage_timings": {}
        }
        with open(os.path.join(self.reports_dir, "threshold_analysis_metadata.json"), "w") as f:
            json.dump(tmeta, f, indent=4)
        with open(os.path.join(self.reports_dir, "threshold_metadata.json"), "w") as f:
            json.dump(tmeta, f, indent=4)
            
        # 4. Generate summary reports
        comp_df = self.df_thresh.copy()
        comp_df["Difference vs Default"] = comp_df[self.target_metric] - self.default_row[self.target_metric]
        comp_df["Rank"] = comp_df[self.target_metric].rank(ascending=self.target_ascending, method="dense").astype(int)
        
        export_cols = [
            "Threshold", "Precision", "Recall", "F1 Score", "Balanced Accuracy", 
            "Business Score", "Difference vs Default", "Rank"
        ]
        comp_df[export_cols].to_csv(os.path.join(self.reports_dir, "threshold_comparison.csv"), index=False)
        
        report = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "pipeline_version": meta.get("pipeline_version", "unknown"),
            "model_version": meta.get("model_version", "unknown"),
            "optimization_strategy": self.config.strategy.value,
            "target_metric": self.target_metric,
            "recommended_threshold": float(self.optimal_row["Threshold"]),
            "business_score": float(self.optimal_row["Business Score"]),
            "reason": f"Optimal threshold selected based on {self.config.strategy.value} directly from Calibrated Probabilities.",
            "comparison_with_default": {
                "default_threshold": float(self.default_row["Threshold"]),
                "default_metrics": {
                    "Precision": float(self.default_row["Precision"]),
                    "Recall": float(self.default_row["Recall"]),
                    "F1 Score": float(self.default_row["F1 Score"]),
                    "Balanced Accuracy": float(self.default_row["Balanced Accuracy"]),
                    "Business Score": float(self.default_row["Business Score"]),
                    "Fraud Capture %": float(self.default_row["Fraud Detection Rate"]) * 100,
                    "False Alarm %": float(self.default_row["False Positive Rate"]) * 100,
                    "Legitimate Approval %": float(self.default_row["Legitimate Approval Rate"]) * 100
                },
                "recommended_metrics": {
                    "Precision": float(self.optimal_row["Precision"]),
                    "Recall": float(self.optimal_row["Recall"]),
                    "F1 Score": float(self.optimal_row["F1 Score"]),
                    "Balanced Accuracy": float(self.optimal_row["Balanced Accuracy"]),
                    "Business Score": float(self.optimal_row["Business Score"]),
                    "Fraud Capture %": float(self.optimal_row["Fraud Detection Rate"]) * 100,
                    "False Alarm %": float(self.optimal_row["False Positive Rate"]) * 100,
                    "Legitimate Approval %": float(self.optimal_row["Legitimate Approval Rate"]) * 100
                },
                "difference": float(self.optimal_row[self.target_metric] - self.default_row[self.target_metric])
            },
            "metric_improvements": {
                "F1 Score": float(self.optimal_row["F1 Score"] - self.default_row["F1 Score"]),
                "Recall": float(self.optimal_row["Recall"] - self.default_row["Recall"]),
                "Precision": float(self.optimal_row["Precision"] - self.default_row["Precision"]),
                self.target_metric: float(self.optimal_row[self.target_metric] - self.default_row[self.target_metric])
            },
            "deployment_recommendation": "PROCEED" if not self.warnings else "REVIEW",
            "warnings": self.warnings
        }
        with open(os.path.join(self.reports_dir, "threshold_optimization_report.json"), "w") as f:
            json.dump(report, f, indent=4)
            
        summary = {
            "default_threshold": float(self.default_row["Threshold"]),
            "recommended_threshold": float(self.optimal_row["Threshold"]),
            "metric_changes": report["metric_improvements"],
            "business_changes": {
                "score_change": float(self.optimal_row["Business Score"] - self.default_row["Business Score"])
            },
            "quality_checks": "PASSED" if not self.warnings else "WARNINGS",
            "warnings": self.warnings
        }
        with open(os.path.join(self.reports_dir, "threshold_summary.json"), "w") as f:
            json.dump(summary, f, indent=4)

    def generate_plots(self):
        plt.style.use("default")
        
        t = self.df_thresh["Threshold"]
        opt_t = self.optimal_row["Threshold"]
        
        def save_plot(y_col, filename):
            fig, ax = plt.subplots(figsize=(8, 6))
            ax.plot(t, self.df_thresh[y_col], label=y_col, color="blue", linewidth=2)
            ax.axvline(x=opt_t, color="red", linestyle="--", label=f"Recommended ({opt_t:.2f})")
            ax.set_title(f"Threshold vs {y_col}")
            ax.set_xlabel("Threshold")
            ax.set_ylabel(y_col)
            ax.legend()
            ax.grid(True, linestyle=":", alpha=0.6)
            fig.tight_layout()
            fig.savefig(os.path.join(self.plots_dir, filename))
            plt.close(fig)

        save_plot("Precision", "threshold_vs_precision.png")
        save_plot("Recall", "threshold_vs_recall.png")
        save_plot("F1 Score", "threshold_vs_f1.png")
        save_plot("Business Score", "threshold_vs_business_score.png")
        
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.plot(t, self.df_thresh["Precision"], label="Precision")
        ax.plot(t, self.df_thresh["Recall"], label="Recall")
        ax.plot(t, self.df_thresh["F1 Score"], label="F1 Score")
        
        b_min = self.df_thresh["Business Score"].min()
        b_max = self.df_thresh["Business Score"].max()
        if b_max > b_min:
            b_norm = (self.df_thresh["Business Score"] - b_min) / (b_max - b_min)
            ax.plot(t, b_norm, label="Business Score (Normalized)", linestyle=":")
            
        ax.axvline(x=opt_t, color="red", linestyle="--", label=f"Recommended ({opt_t:.2f})")
        ax.set_title("Threshold Tradeoff Analysis")
        ax.set_xlabel("Threshold")
        ax.set_ylabel("Metric Value")
        ax.legend()
        ax.grid(True, linestyle=":", alpha=0.6)
        fig.tight_layout()
        fig.savefig(os.path.join(self.plots_dir, "threshold_tradeoff.png"))
        plt.close(fig)

    def export_deployment_artifact(self):
        meta = self.loaded_jsons["model_meta"]
        
        artifact = {
            "threshold": float(self.optimal_row["Threshold"]),
            "strategy": self.config.strategy.value,
            "pipeline_version": meta.get("pipeline_version", "unknown"),
            "model_version": meta.get("model_version", "unknown"),
            "calibration_method": self.calib_method,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        with open(os.path.join(self.artifacts_dir, "deployment_threshold.json"), "w") as f:
            json.dump(artifact, f, indent=4)

    def validate_outputs(self):
        expected_plots = [
            "threshold_vs_precision.png", "threshold_vs_recall.png",
            "threshold_vs_f1.png", "threshold_vs_business_score.png",
            "threshold_tradeoff.png"
        ]
        for plot in expected_plots:
            path = os.path.join(self.plots_dir, plot)
            if not os.path.exists(path) or os.path.getsize(path) == 0:
                raise ThresholdOptimizationError(f"Plot missing or empty: {path}")

        dpath = os.path.join(self.artifacts_dir, "deployment_threshold.json")
        if not os.path.exists(dpath):
            raise ThresholdOptimizationError(f"Missing deployment artifact: {dpath}")
        with open(dpath, "r") as f:
            dt = json.load(f)
            self._check_schema(dt, {
                "threshold": (int, float), "strategy": str, 
                "pipeline_version": str, "model_version": str,
                "calibration_method": str, "created_at": str
            }, "deployment_threshold.json")
            if dt["threshold"] < 0 or dt["threshold"] > 1:
                raise ThresholdOptimizationError("Invalid deployment threshold value.")
                
        self._validate_generated_reports()
        
        cpath = os.path.join(self.reports_dir, "threshold_comparison.csv")
        if not os.path.exists(cpath):
            raise ThresholdOptimizationError(f"Missing CSV: {cpath}")
        df_out = pd.read_csv(cpath)
        required_out = ["Threshold", "Precision", "Recall", "F1 Score", "Balanced Accuracy", "Business Score", "Difference vs Default", "Rank"]
        for c in required_out:
            if c not in df_out.columns:
                raise ThresholdOptimizationError(f"Missing column {c} in generated CSV.")
        if df_out.isnull().values.any():
            raise ThresholdOptimizationError("Generated CSV contains NaN values.")
        if not np.isfinite(df_out.select_dtypes(include=[np.number]).values).all():
            raise ThresholdOptimizationError("Generated CSV contains infinite values.")

    def _validate_generated_reports(self):
        rep_path = os.path.join(self.reports_dir, "threshold_optimization_report.json")
        if not os.path.exists(rep_path):
             raise ThresholdOptimizationError(f"Missing report JSON: {rep_path}")
        with open(rep_path, "r") as f:
             rep_data = json.load(f)
        self._check_schema(rep_data, {
             "timestamp": str, "pipeline_version": str, "model_version": str, "optimization_strategy": str,
             "target_metric": str, "recommended_threshold": (int, float), "business_score": (int, float), "reason": str,
             "comparison_with_default": dict, "metric_improvements": dict,
             "deployment_recommendation": str, "warnings": list
        }, "threshold_optimization_report.json")
        
        sum_path = os.path.join(self.reports_dir, "threshold_summary.json")
        if not os.path.exists(sum_path):
             raise ThresholdOptimizationError(f"Missing summary JSON: {sum_path}")
        with open(sum_path, "r") as f:
             sum_data = json.load(f)
        self._check_schema(sum_data, {
             "default_threshold": (int, float), "recommended_threshold": (int, float),
             "metric_changes": dict, "business_changes": dict,
             "quality_checks": str, "warnings": list
        }, "threshold_summary.json")
        
        meta_path = os.path.join(self.reports_dir, "threshold_metadata.json")
        if not os.path.exists(meta_path):
             raise ThresholdOptimizationError(f"Missing metadata JSON: {meta_path}")
        with open(meta_path, "r") as f:
             meta_data = json.load(f)
        self._check_schema(meta_data, {
             "pipeline_version": str, "model_version": str, "strategy": str,
             "threshold_start": (int, float), "threshold_end": (int, float),
             "step": (int, float), "total_thresholds": int,
             "default_threshold": (int, float), "recommended_threshold": (int, float),
             "best_f1_threshold": (int, float), "best_precision_threshold": (int, float),
             "best_recall_threshold": (int, float), "timestamp": str,
             "software_versions": dict, "execution_time": (int, float), "stage_timings": dict,
             "validation_sample_count": int, "fraud_sample_count": int, "legitimate_sample_count": int,
             "fraud_prevalence": (int, float), "calibration_method": str, "selected_metric": str,
             "model_class": str
        }, "threshold_metadata.json")

    def _update_metadata_timings(self):
        meta_paths = [
            os.path.join(self.reports_dir, "threshold_metadata.json"),
            os.path.join(self.reports_dir, "threshold_analysis_metadata.json")
        ]
        
        for meta_path in meta_paths:
            if os.path.exists(meta_path):
                with open(meta_path, "r") as f:
                    tmeta = json.load(f)
                tmeta["stage_timings"] = self.stage_timings
                tmeta["execution_time"] = float(self.stage_timings.get("total_runtime", 0.0))
                with open(meta_path, "w") as f:
                    json.dump(tmeta, f, indent=4)

    def release_memory(self):
        """Release large temporary objects after all computations and exports are finished."""
        self.logger.info("Releasing large temporary objects...")
        if hasattr(self, 'raw_probs') and self.raw_probs is not None:
            del self.raw_probs
            self.raw_probs = None
        if hasattr(self, 'calibrated_probs') and self.calibrated_probs is not None:
            del self.calibrated_probs
            self.calibrated_probs = None
        if hasattr(self, 'X_val') and self.X_val is not None:
            del self.X_val
            self.X_val = None
        if hasattr(self, 'df_thresh') and self.df_thresh is not None:
            del self.df_thresh
            self.df_thresh = None
        gc.collect()
        self.logger.info("Memory cleanup complete.")


if __name__ == "__main__":
    try:
        # Move up one directory level to get the root of ml-worker for defaults
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        optimizer = ThresholdOptimizer(
            artifacts_dir=os.path.join(base_dir, "artifacts"),
            reports_dir=os.path.join(base_dir, "reports"),
            plots_dir=os.path.join(base_dir, "plots"),
            data_dir=os.path.join(base_dir, "data")
        )
        optimizer.run()
    except Exception as e:
        logging.getLogger("ThresholdOptimization").error(f"Optimization failed: {e}")
        raise
