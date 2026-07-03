"""
Aegis - Real-Time Fraud Detection System
Module: Model Training

This module trains a production-grade XGBoost model with early stopping,
class imbalance handling, rigorous validation, comprehensive metrics,
and detailed artifact and report generation.
"""

import os
import json
import logging
import datetime
import platform
import time
from typing import List, Dict, Any, Tuple

try:
    import psutil
except ImportError:
    psutil = None

import pandas as pd
import numpy as np
import joblib
import sklearn
import xgboost as xgb
from xgboost import XGBClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, average_precision_score, confusion_matrix,
    balanced_accuracy_score, matthews_corrcoef, log_loss, brier_score_loss
)


class ModelTrainingError(Exception):
    """Custom exception for errors during the model training process."""
    pass


class ModelTrainer:
    """
    Production-grade Model Training module for Aegis Pipeline.
    
    Responsibilities:
    - Load train and validation data.
    - Identify features deterministically based on output of Feature Selection.
    - Train XGBoost Classifier with Early Stopping to prevent overfitting.
    - Compute comprehensive train/validation metrics.
    - Export trained model, feature importances, configuration, and detailed JSON reports.
    """

    def __init__(
        self,
        train_path: str = "data/selected/train.parquet",
        val_path: str = "data/selected/validation.parquet",
        metadata_path: str = "artifacts/feature_selector_metadata.json",
        artifact_dir: str = "artifacts",
        report_dir: str = "reports",
        random_state: int = 42
    ):
        self.train_path = train_path
        self.val_path = val_path
        self.metadata_path = metadata_path
        self.artifact_dir = artifact_dir
        self.report_dir = report_dir
        self.random_state = random_state

        self.logger = self._setup_logger()

        self.train_df: pd.DataFrame = pd.DataFrame()
        self.val_df: pd.DataFrame = pd.DataFrame()
        self.metadata: Dict[str, Any] = {}

        self.candidate_features: List[str] = []
        self.scale_pos_weight: float = 1.0

        self.model: XGBClassifier = None
        self.best_iteration: int = 0
        self.best_score: float = 0.0

        self.train_prob: np.ndarray = np.array([])
        self.val_prob: np.ndarray = np.array([])
        self.train_pred: np.ndarray = np.array([])
        self.val_pred: np.ndarray = np.array([])

        self.train_metrics: Dict[str, Any] = {}
        self.val_metrics: Dict[str, Any] = {}
        self.feature_importances: List[Dict[str, Any]] = []

        self.timings: Dict[str, float] = {}
        self.memory_usage: Dict[str, float] = {}
        self.run_start_time: float = 0.0

        self.overfitting_warnings: List[str] = []
        self.report_obj: Dict[str, Any] = {}
        
        # Keep only immutable defaults. Hyperparameters will be merged from best_hyperparameters.json,
        # or XGBoost will use its own internal defaults.
        self.training_config = {
            "objective": "binary:logistic",
            "eval_metric": "aucpr",
            "tree_method": "hist",
            "random_state": self.random_state,
            "n_jobs": -1
        }
        self.early_stopping_rounds = 100
        
        self._load_best_hyperparameters()

    def _setup_logger(self) -> logging.Logger:
        """Sets up a production-grade logger."""
        logger = logging.getLogger(self.__class__.__name__)
        logger.setLevel(logging.INFO)
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _load_best_hyperparameters(self) -> None:
        """Loads optimal hyperparameters. Fails if unavailable."""
        best_params_path = os.path.join(self.artifact_dir, "best_hyperparameters.json")
        if os.path.exists(best_params_path):
            self.logger.info(f"Found best_hyperparameters.json at {best_params_path}. Overwriting default config.")
            try:
                with open(best_params_path, "r") as f:
                    best_params = json.load(f)
                
                # Update training config
                self.training_config.update(best_params)
                
                # Update early stopping rounds if provided in optimized hyperparameters
                if "early_stopping_rounds" in best_params:
                    self.early_stopping_rounds = best_params["early_stopping_rounds"]
                
                # Ensure deterministic random state is preserved
                self.training_config["random_state"] = self.random_state
            except Exception as e:
                raise ModelTrainingError(f"Failed to load best_hyperparameters.json: {e}")
        else:
            raise ModelTrainingError(
                "best_hyperparameters.json not found. "
                "Run Hyperparameter Optimization before Model Training."
            )

    def _get_memory_mb(self, df: pd.DataFrame) -> float:
        """Calculates DataFrame memory usage in Megabytes."""
        if df is None or df.empty:
            return 0.0
        return df.memory_usage(deep=True).sum() / (1024 * 1024)

    def _record_process_memory(self, stage: str) -> None:
        if psutil is not None:
            mem = psutil.Process(os.getpid()).memory_info().rss / (1024 * 1024)
            self.memory_usage[f'process_{stage}_mb'] = mem
        else:
            if 'process_memory_skipped' not in self.memory_usage:
                self.memory_usage['process_memory_skipped'] = True
                self.logger.info("psutil unavailable. Peak memory monitoring skipped.")

    def load(self) -> None:
        """Loads training data, validation data, and feature selection metadata."""
        self.logger.info("Loading training and validation datasets...")
        start_time = time.time()
        self._record_process_memory("before_loading")

        try:
            self.train_df = pd.read_parquet(self.train_path)
            self.val_df = pd.read_parquet(self.val_path)
        except Exception as e:
            raise ModelTrainingError(f"Failed to load datasets: {e}")
            
        try:
            with open(self.metadata_path, 'r') as f:
                self.metadata = json.load(f)
        except Exception as e:
            raise ModelTrainingError(f"Failed to load metadata: {e}")

        self.memory_usage['train_mb'] = self._get_memory_mb(self.train_df)
        self.memory_usage['val_mb'] = self._get_memory_mb(self.val_df)

        self.logger.info(f"Loaded training data: {self.train_df.shape}, {self.memory_usage['train_mb']:.2f} MB")
        self.logger.info(f"Loaded validation data: {self.val_df.shape}, {self.memory_usage['val_mb']:.2f} MB")

        self._record_process_memory("after_loading")
        self.timings['load'] = time.time() - start_time

    def validate_input(self) -> None:
        """Validates the input DataFrames for schema and constraints."""
        self.logger.info("Validating input datasets...")
        start_time = time.time()

        def _validate_df(df: pd.DataFrame, name: str):
            if df is None or df.empty:
                raise ModelTrainingError(f"{name} dataframe is missing or empty.")
            if df.columns.duplicated().any():
                raise ModelTrainingError(f"{name} dataframe has duplicate columns.")
            if 'TransactionID' not in df.columns:
                raise ModelTrainingError(f"'TransactionID' missing from {name} dataframe.")
            if 'isFraud' not in df.columns:
                raise ModelTrainingError(f"'isFraud' missing from {name} dataframe.")
            if df.isnull().any().any():
                raise ModelTrainingError(f"{name} dataframe contains missing values.")
            
            num_cols = df.select_dtypes(include=[np.number]).columns
            if np.isinf(df[num_cols]).any().any():
                raise ModelTrainingError(f"Infinite values found in {name} dataframe.")
                
            unique_targets = df['isFraud'].unique()
            if not set(unique_targets).issubset({0, 1}):
                raise ModelTrainingError(f"{name} target contains invalid values. Expected 0 or 1, found {unique_targets}")
            
            if df['TransactionID'].duplicated().any():
                raise ModelTrainingError(f"{name} dataframe has duplicated TransactionIDs.")

        _validate_df(self.train_df, "Training")
        _validate_df(self.val_df, "Validation")

        if len(self.train_df.columns) != len(self.val_df.columns):
            raise ModelTrainingError("Train and Validation column counts differ.")
        
        if list(self.train_df.columns) != list(self.val_df.columns):
            raise ModelTrainingError("Train and Validation column names or ordering differ.")
            
        if not self.train_df.dtypes.equals(self.val_df.dtypes):
            raise ModelTrainingError("Train and Validation data types differ.")
            
        expected_feature_count = self.metadata.get("selected_feature_count")
        if expected_feature_count is not None:
            actual_feature_count = len(self.train_df.columns) - 2 # excluding ID and target
            if actual_feature_count != expected_feature_count:
                raise ModelTrainingError(f"Feature count mismatch: Expected {expected_feature_count} from metadata, found {actual_feature_count}.")

        self.timings['validate_input'] = time.time() - start_time
        self.logger.info("Input validation completed successfully.")

    def identify_features(self) -> None:
        """Identifies features eligible for training, guaranteeing deterministic ordering."""
        self.logger.info("Identifying candidate features...")
        start_time = time.time()

        exclude_cols = {'TransactionID', 'isFraud'}
        self.candidate_features = [col for col in self.train_df.columns if col not in exclude_cols]

        if not self.candidate_features:
            raise ModelTrainingError("No candidate features found after excluding TransactionID and isFraud.")

        selected_features = self.metadata.get("selected_features", [])
        
        missing = set(selected_features) - set(self.candidate_features)
        unexpected = set(self.candidate_features) - set(selected_features)
        if missing or unexpected or len(self.candidate_features) != len(selected_features):
            raise ModelTrainingError(
                f"Feature mismatch against metadata.\n"
                f"Missing features: {missing}\n"
                f"Unexpected features: {unexpected}"
            )
            
        if self.candidate_features != selected_features:
            raise ModelTrainingError("Feature ordering does not exactly match metadata['selected_features'].")

        self.timings['identify_features'] = time.time() - start_time
        self.logger.info(f"Identified and verified {len(self.candidate_features)} candidate features.")

    def compute_class_weights(self) -> None:
        """Validates that scale_pos_weight is present in the loaded hyperparameters."""
        self.logger.info("Validating class weights...")
        start_time = time.time()

        if 'scale_pos_weight' in self.training_config:
            self.scale_pos_weight = self.training_config['scale_pos_weight']
            self.logger.info(f"Using scale_pos_weight={self.scale_pos_weight:.4f} from loaded hyperparameters.")
        else:
            raise ModelTrainingError(
                "Optimal scale_pos_weight is missing from hyperparameters. "
                "Ensure best_hyperparameters.json is present and contains this value."
            )

        self.timings['compute_class_weights'] = time.time() - start_time

    def train(self) -> None:
        """Trains the XGBoost Classifier with Early Stopping."""
        self.logger.info("Initializing and training model...")
        start_time = time.time()
        self._record_process_memory("before_training")

        X_train = self.train_df[self.candidate_features]
        y_train = self.train_df['isFraud']
        X_val = self.val_df[self.candidate_features]
        y_val = self.val_df['isFraud']

        try:
            config = self.training_config.copy()
            # Handle early stopping rounds for different xgboost versions
            if 'early_stopping_rounds' in XGBClassifier().get_params():
                config['early_stopping_rounds'] = self.early_stopping_rounds
                self.model = XGBClassifier(**config)
                self.model.fit(
                    X_train, y_train,
                    eval_set=[(X_val, y_val)],
                    verbose=False
                )
            else:
                self.model = XGBClassifier(**config)
                self.model.fit(
                    X_train, y_train,
                    eval_set=[(X_val, y_val)],
                    early_stopping_rounds=self.early_stopping_rounds,
                    verbose=False
                )
        except Exception as e:
            raise ModelTrainingError(f"Model training failed: {e}")

        # XGBoost best_iteration and best_score extraction
        self.best_iteration = getattr(self.model, 'best_iteration', getattr(self.model, 'best_iteration_', -1))
        self.best_score = getattr(self.model, 'best_score', getattr(self.model, 'best_score_', -1.0))
        
        self.memory_usage['train_mb_after_training'] = self._get_memory_mb(self.train_df)
        self._record_process_memory("after_training")

        self.timings['train'] = time.time() - start_time
        self.logger.info(f"Training complete. Best iteration: {self.best_iteration}, Best Validation AUCPR: {self.best_score:.4f}")

    def predict(self) -> None:
        """Generates predictions and probabilities on Train and Validation sets."""
        self.logger.info("Generating predictions...")
        start_time = time.time()

        X_train = self.train_df[self.candidate_features]
        X_val = self.val_df[self.candidate_features]

        # Use predict_proba for probabilities, take the positive class (column 1)
        self.train_prob = self.model.predict_proba(X_train)[:, 1]
        self.val_prob = self.model.predict_proba(X_val)[:, 1]

        # Default threshold of 0.5
        self.train_pred = (self.train_prob >= 0.5).astype(int)
        self.val_pred = (self.val_prob >= 0.5).astype(int)

        self.timings['predict'] = time.time() - start_time

    def _compute_metrics(self, y_true: np.ndarray, y_pred: np.ndarray, y_prob: np.ndarray) -> Dict[str, float]:
        """Calculates a comprehensive suite of metrics."""
        cm = confusion_matrix(y_true, y_pred)
        return {
            "accuracy": float(accuracy_score(y_true, y_pred)),
            "precision": float(precision_score(y_true, y_pred, zero_division=0)),
            "recall": float(recall_score(y_true, y_pred, zero_division=0)),
            "f1": float(f1_score(y_true, y_pred, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_true, y_prob)),
            "pr_auc": float(average_precision_score(y_true, y_prob)),
            "balanced_accuracy": float(balanced_accuracy_score(y_true, y_pred)),
            "mcc": float(matthews_corrcoef(y_true, y_pred)),
            "log_loss": float(log_loss(y_true, y_prob)),
            "brier_score": float(brier_score_loss(y_true, y_prob)),
            "confusion_matrix": {
                "tn": int(cm[0, 0]) if cm.shape == (2, 2) else 0,
                "fp": int(cm[0, 1]) if cm.shape == (2, 2) else 0,
                "fn": int(cm[1, 0]) if cm.shape == (2, 2) else 0,
                "tp": int(cm[1, 1]) if cm.shape == (2, 2) else 0
            }
        }

    def evaluate(self) -> None:
        """Evaluates the model on Train and Validation sets."""
        self.logger.info("Computing metrics...")
        start_time = time.time()

        y_train = self.train_df['isFraud'].values
        y_val = self.val_df['isFraud'].values

        self.train_metrics = self._compute_metrics(y_train, self.train_pred, self.train_prob)
        self.val_metrics = self._compute_metrics(y_val, self.val_pred, self.val_prob)

        self.timings['evaluate'] = time.time() - start_time

    def detect_overfitting(self) -> None:
        """Compares Train and Validation metrics to flag possible overfitting."""
        self.logger.info("Running overfitting analysis...")
        start_time = time.time()

        thresholds = {
            "roc_auc": 0.05,
            "f1": 0.10,
            "precision": 0.15,
            "recall": 0.10,
            "log_loss": 0.20 # Val log loss > Train log loss + threshold
        }

        diffs = {}
        for metric in ['roc_auc', 'f1', 'precision', 'recall']:
            diff = self.train_metrics[metric] - self.val_metrics[metric]
            diffs[metric] = diff
            if diff > thresholds[metric]:
                msg = f"Possible Overfitting: Train {metric} ({self.train_metrics[metric]:.4f}) exceeds Validation ({self.val_metrics[metric]:.4f}) by {diff:.4f} (Threshold: {thresholds[metric]})"
                self.overfitting_warnings.append(msg)
                self.logger.warning(msg)
                
        ll_diff = self.val_metrics['log_loss'] - self.train_metrics['log_loss']
        diffs['log_loss'] = ll_diff
        if ll_diff > thresholds['log_loss']:
            msg = f"Possible Overfitting: Validation log_loss ({self.val_metrics['log_loss']:.4f}) exceeds Train ({self.train_metrics['log_loss']:.4f}) by {ll_diff:.4f} (Threshold: {thresholds['log_loss']})"
            self.overfitting_warnings.append(msg)
            self.logger.warning(msg)

        if not self.overfitting_warnings:
            self.logger.info("No significant overfitting detected.")

        self.timings['detect_overfitting'] = time.time() - start_time

    def extract_feature_importance(self) -> None:
        """Extracts and sorts feature importances."""
        self.logger.info("Extracting feature importances...")
        start_time = time.time()

        importances = self.model.feature_importances_
        
        feat_imp = list(zip(self.candidate_features, importances))
        feat_imp.sort(key=lambda x: x[1], reverse=True)
        
        # Top 100
        top_100 = feat_imp[:100]
        self.feature_importances = [
            {"feature": f, "importance": float(imp)} for f, imp in top_100
        ]

        self.timings['extract_feature_importance'] = time.time() - start_time

    def validate_output(self) -> None:
        """Validates the output models and predictions."""
        self.logger.info("Validating model and predictions...")
        start_time = time.time()

        if self.model is None:
            raise ModelTrainingError("Model is None. Training may have failed silently.")
            
        if not hasattr(self.model, "predict") or not hasattr(self.model, "predict_proba"):
            raise ModelTrainingError("Model does not support predict() or predict_proba().")

        try:
            X_sample = self.train_df[self.candidate_features].head(5)
            sample_pred = self.model.predict(X_sample)
            sample_prob = self.model.predict_proba(X_sample)
            
            if len(sample_pred) != len(X_sample) or len(sample_prob) != len(X_sample):
                raise ModelTrainingError("Sample prediction shape mismatch.")
            if np.isnan(sample_pred).any() or np.isnan(sample_prob).any():
                raise ModelTrainingError("Sample predictions contain NaN.")
            if np.isinf(sample_prob).any():
                raise ModelTrainingError("Sample prediction probabilities contain Inf.")
            if not ((sample_prob >= 0) & (sample_prob <= 1)).all():
                raise ModelTrainingError("Sample prediction probabilities out of [0, 1] bound.")
        except Exception as e:
            raise ModelTrainingError(f"Explicit model validation failed: {e}")

        if len(self.train_pred) != len(self.train_df):
            raise ModelTrainingError("Train prediction length does not match train rows.")
        if len(self.train_prob) != len(self.train_df):
            raise ModelTrainingError("Train prediction probability length does not match train rows.")
        if np.isnan(self.train_pred).any() or np.isnan(self.train_prob).any():
            raise ModelTrainingError("NaN found in train predictions.")
        if np.isinf(self.train_prob).any():
            raise ModelTrainingError("Inf found in train prediction probabilities.")
        if not ((self.train_prob >= 0) & (self.train_prob <= 1)).all():
            raise ModelTrainingError("Train prediction probabilities out of [0, 1] bound.")
        if not set(np.unique(self.train_pred)).issubset({0, 1}):
            raise ModelTrainingError("Train prediction values must be exactly 0 or 1.")

        if len(self.val_pred) != len(self.val_df):
            raise ModelTrainingError("Validation prediction length does not match validation rows.")
            
        if len(self.val_prob) != len(self.val_df):
            raise ModelTrainingError("Validation prediction probability length does not match validation rows.")

        if np.isnan(self.val_pred).any() or np.isnan(self.val_prob).any():
            raise ModelTrainingError("NaN found in validation predictions.")
            
        if np.isinf(self.val_prob).any():
            raise ModelTrainingError("Inf found in validation prediction probabilities.")
            
        if not ((self.val_prob >= 0) & (self.val_prob <= 1)).all():
            raise ModelTrainingError("Validation prediction probabilities out of [0, 1] bound.")
        if not set(np.unique(self.val_pred)).issubset({0, 1}):
            raise ModelTrainingError("Validation prediction values must be exactly 0 or 1.")

        if len(self.model.feature_names_in_) != len(self.candidate_features):
            raise ModelTrainingError("Model feature count does not match metadata candidate features.")

        self.timings['validate_output'] = time.time() - start_time
        self.logger.info("Output validation completed successfully.")

    def generate_report(self) -> None:
        """Generates a comprehensive JSON report."""
        self.logger.info("Assembling model training report...")
        start_time = time.time()

        self.report_obj = {
            "dataset": {
                "training_rows": len(self.train_df),
                "validation_rows": len(self.val_df),
                "feature_count": len(self.candidate_features),
                "positive_samples_train": int(self.train_df['isFraud'].sum()),
                "negative_samples_train": int(len(self.train_df) - self.train_df['isFraud'].sum()),
                "scale_pos_weight": self.scale_pos_weight
            },
            "training_summary": {
                "algorithm": "XGBClassifier",
                "hyperparameters": self.training_config,
                "early_stopping_rounds": self.early_stopping_rounds,
                "best_iteration": int(self.best_iteration),
                "best_validation_aucpr": float(self.best_score)
            },
            "metrics": {
                "train": self.train_metrics,
                "validation": self.val_metrics
            },
            "overfitting_analysis": {
                "warnings": self.overfitting_warnings,
                "is_overfitting_suspected": len(self.overfitting_warnings) > 0
            },
            "feature_importance": {
                "top_100_features": self.feature_importances
            },
            "memory_usage": self.memory_usage,
            "system_information": {
                "python_version": platform.python_version(),
                "pandas_version": pd.__version__,
                "xgboost_version": xgb.__version__,
                "scikit_learn_version": sklearn.__version__,
                "cpu_count": os.cpu_count(),
                "platform": platform.platform()
            },
            "random_seed": self.random_state,
            "pipeline_version": "Aegis-1.0.0",
            "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        self.timings['generate_report'] = time.time() - start_time

    def save_model(self) -> None:
        """Saves model artifacts and reports."""
        self.logger.info("Saving artifacts and metadata...")
        start_time = time.time()

        os.makedirs(self.artifact_dir, exist_ok=True)
        os.makedirs(self.report_dir, exist_ok=True)

        # Save model
        model_path = os.path.join(self.artifact_dir, "xgboost_model.joblib")
        joblib.dump(self.model, model_path)

        # Save feature importance
        fi_path = os.path.join(self.artifact_dir, "feature_importance.json")
        with open(fi_path, "w") as f:
            json.dump(self.feature_importances, f, indent=4)
            
        fi_csv_path = os.path.join(self.artifact_dir, "feature_importance.csv")
        pd.DataFrame(self.feature_importances).to_csv(fi_csv_path, index=False)

        # Save training config
        config_path = os.path.join(self.artifact_dir, "training_configuration.json")
        with open(config_path, "w") as f:
            json.dump(self.training_config, f, indent=4)

        # Update timings for metadata
        self.timings['save_model'] = time.time() - start_time
        if self.run_start_time > 0:
            self.timings['total_pipeline_runtime'] = time.time() - self.run_start_time

        # Save model metadata
        metadata_obj = {
            "model_type": "Classification",
            "algorithm": "XGBClassifier",
            "objective": self.training_config.get("objective", "binary:logistic"),
            "random_state": self.random_state,
            "random_seed": self.random_state,
            "training_rows": len(self.train_df),
            "validation_rows": len(self.val_df),
            "feature_count": len(self.candidate_features),
            "feature_names": self.candidate_features,
            "selected_feature_count": len(self.candidate_features),
            "best_iteration": int(self.best_iteration),
            "best_validation_aucpr": float(self.best_score),
            "scale_pos_weight": self.scale_pos_weight,
            "training_time": self.timings.get("train", 0.0),
            "python_version": platform.python_version(),
            "sklearn_version": sklearn.__version__,
            "xgboost_version": xgb.__version__,
            "pipeline_version": "Aegis-1.0.0",
            "model_version": "Aegis-1.0.0",
            "created_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "training_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "validation_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "feature_order": self.candidate_features,
        }

        metadata_path = os.path.join(self.artifact_dir, "model_metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata_obj, f, indent=4)

        # Update and save report
        self.report_obj['execution_timings'] = self.timings
        report_path = os.path.join(self.report_dir, "model_training_report.json")
        with open(report_path, "w") as f:
            json.dump(self.report_obj, f, indent=4)

        self.logger.info("Artifacts saved successfully.")

    def run(self) -> None:
        """Executes the complete model training pipeline."""
        self.run_start_time = time.time()
        try:
            self.load()
            self.validate_input()
            self.identify_features()
            self.compute_class_weights()
            self.train()
            self.predict()
            self.evaluate()
            self.detect_overfitting()
            self.extract_feature_importance()
            self.validate_output()
            self.generate_report()
            self.save_model()
            self.logger.info("Model Training pipeline completed successfully.")
        except Exception as e:
            self.logger.error(f"Model Training pipeline failed: {e}")
            raise

if __name__ == "__main__":
    try:
        trainer = ModelTrainer()
        trainer.run()
    except Exception as e:
        logging.getLogger("ModelTrainer").error(f"Execution failed: {e}")
        import sys
        sys.exit(1)
