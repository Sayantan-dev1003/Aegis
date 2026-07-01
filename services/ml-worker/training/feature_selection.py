"""
Aegis - Real-Time Fraud Detection System
Module: Feature Selection

This module performs feature selection using SelectFromModel with XGBClassifier.
It guarantees deterministic feature ordering, strict validation, memory monitoring,
and extensive reporting.
"""

import os
import json
import logging
import datetime
import platform
import time
from typing import List, Dict, Any

import pandas as pd
import numpy as np
import joblib
import sklearn
import xgboost as xgb
from xgboost import XGBClassifier
from sklearn.feature_selection import SelectFromModel


class FeatureSelectionError(Exception):
    """Custom exception for errors during the feature selection process."""
    pass


class FeatureSelector:
    """
    Production-grade Feature Selection module for Aegis Pipeline.
    
    Responsibilities:
    - Load train and validation data.
    - Identify and retain most useful features using SelectFromModel and XGBoost.
    - Guarantee deterministic feature ordering.
    - Monitor memory usage and execution performance.
    - Export trained selector, metadata, and comprehensive JSON reports.
    """

    def __init__(
        self,
        train_path: str = "data/encoded/train.parquet",
        val_path: str = "data/encoded/validation.parquet",
        out_train_path: str = "data/selected/train.parquet",
        out_val_path: str = "data/selected/validation.parquet",
        artifact_dir: str = "artifacts",
        report_dir: str = "reports",
        threshold: str = "mean",
        random_state: int = 42
    ):
        self.train_path = train_path
        self.val_path = val_path
        self.out_train_path = out_train_path
        self.out_val_path = out_val_path
        self.artifact_dir = artifact_dir
        self.report_dir = report_dir
        self.threshold = threshold
        self.random_state = random_state

        self.logger = self._setup_logger()

        self.train_df: pd.DataFrame = pd.DataFrame()
        self.val_df: pd.DataFrame = pd.DataFrame()
        self.out_train_df: pd.DataFrame = pd.DataFrame()
        self.out_val_df: pd.DataFrame = pd.DataFrame()

        self.candidate_features: List[str] = []
        self.selected_features: List[str] = []
        self.removed_features: List[str] = []

        self.selector: SelectFromModel = None
        self.timings: Dict[str, float] = {}
        self.memory_usage: Dict[str, float] = {}
        self.run_start_time: float = 0.0
        self.report_obj: Dict[str, Any] = {}

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

    def _get_memory_mb(self, df: pd.DataFrame) -> float:
        """Calculates DataFrame memory usage in Megabytes."""
        if df.empty:
            return 0.0
        return df.memory_usage(deep=True).sum() / (1024 * 1024)

    def load(self) -> None:
        """Loads training and validation Parquet datasets."""
        self.logger.info("Loading training and validation datasets...")
        start_time = time.time()

        try:
            self.train_df = pd.read_parquet(self.train_path)
            self.val_df = pd.read_parquet(self.val_path)
        except Exception as e:
            raise FeatureSelectionError(f"Failed to load datasets: {e}")

        self.memory_usage['train_original_mb'] = self._get_memory_mb(self.train_df)
        self.memory_usage['val_original_mb'] = self._get_memory_mb(self.val_df)

        self.logger.info(f"Loaded training data: {self.train_df.shape}, {self.memory_usage['train_original_mb']:.2f} MB")
        self.logger.info(f"Loaded validation data: {self.val_df.shape}, {self.memory_usage['val_original_mb']:.2f} MB")

        self.timings['load'] = time.time() - start_time

    def validate_input(self) -> None:
        """Validates the input DataFrames for schema and constraints."""
        self.logger.info("Validating input datasets...")
        start_time = time.time()

        def _validate_df(df: pd.DataFrame, name: str):
            if df is None or df.empty:
                raise FeatureSelectionError(f"{name} dataframe is missing or empty.")
            if df.columns.duplicated().any():
                raise FeatureSelectionError(f"{name} dataframe has duplicate columns.")
            if 'TransactionID' not in df.columns:
                raise FeatureSelectionError(f"'TransactionID' missing from {name} dataframe.")
            if 'isFraud' not in df.columns:
                raise FeatureSelectionError(f"'isFraud' missing from {name} dataframe.")
            if df.isnull().any().any():
                raise FeatureSelectionError(f"{name} dataframe contains missing values. Previous pipeline steps should guarantee no missing values.")

        _validate_df(self.train_df, "Training")
        _validate_df(self.val_df, "Validation")

        # Cross Validation between Train and Validation schemas
        if len(self.train_df.columns) != len(self.val_df.columns):
            raise FeatureSelectionError("Train and Validation column counts differ.")
        
        if list(self.train_df.columns) != list(self.val_df.columns):
            raise FeatureSelectionError("Train and Validation column names or ordering differ.")
            
        if not self.train_df.dtypes.equals(self.val_df.dtypes):
            raise FeatureSelectionError("Train and Validation data types differ.")

        self.timings['validate_input'] = time.time() - start_time
        self.logger.info("Input validation completed successfully.")

    def identify_candidate_features(self) -> None:
        """Identifies features eligible for selection, excluding target and ID columns."""
        self.logger.info("Identifying candidate features...")
        start_time = time.time()

        exclude_cols = {'TransactionID', 'isFraud'}
        self.candidate_features = [col for col in self.train_df.columns if col not in exclude_cols]

        if not self.candidate_features:
            raise FeatureSelectionError("No candidate features found after excluding TransactionID and isFraud.")

        self.timings['identify_candidate_features'] = time.time() - start_time
        self.logger.info(f"Identified {len(self.candidate_features)} candidate features.")

    def fit_selector(self) -> None:
        """Fits the feature selector on the training dataset using XGBClassifier."""
        self.logger.info("Fitting SelectFromModel feature selector...")
        start_time = time.time()

        X_train = self.train_df[self.candidate_features]
        y_train = self.train_df['isFraud']

        xgb_model = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            random_state=self.random_state,
            n_jobs=-1,
            eval_metric="logloss",
            tree_method="hist"
        )

        self.selector = SelectFromModel(
            estimator=xgb_model,
            threshold=self.threshold,
            prefit=False
        )

        self.selector.fit(X_train, y_train)

        support = self.selector.get_support()
        self.selected_features = [f for f, s in zip(self.candidate_features, support) if s]
        self.removed_features = [f for f, s in zip(self.candidate_features, support) if not s]

        if not self.selected_features:
            raise FeatureSelectionError("Zero features were selected by the model.")

        if len(set(self.selected_features)) != len(self.selected_features):
            raise FeatureSelectionError("Duplicate features found in selected_features.")

        ratio = len(self.selected_features) / len(self.candidate_features)
        self.logger.info(f"Feature selection completed. Selected {len(self.selected_features)} features.")
        self.logger.info(f"Selection ratio: {ratio:.2%}")

        self.timings['fit_selector'] = time.time() - start_time

    def transform_train(self) -> None:
        """Transforms the training dataset using the selected features."""
        self.logger.info("Transforming train dataset...")
        start_time = time.time()

        missing_features = [f for f in self.selected_features if f not in self.train_df.columns]
        if missing_features:
            raise FeatureSelectionError(f"Selected features missing in train data: {missing_features}")

        ordered_columns = ['TransactionID'] + self.selected_features + ['isFraud']
        self.out_train_df = self.train_df[ordered_columns].copy()

        self.memory_usage['train_selected_mb'] = self._get_memory_mb(self.out_train_df)
        reduction = 1 - (self.memory_usage['train_selected_mb'] / self.memory_usage['train_original_mb'])
        self.memory_usage['train_memory_reduction_percent'] = reduction * 100
        
        self.logger.info(f"Train memory reduced by {reduction:.1%} "
                         f"({self.memory_usage['train_original_mb']:.1f} MB -> {self.memory_usage['train_selected_mb']:.1f} MB)")

        self.timings['transform_train'] = time.time() - start_time

    def transform_validation(self) -> None:
        """Transforms the validation dataset using the selected features."""
        self.logger.info("Transforming validation dataset...")
        start_time = time.time()

        missing_features = [f for f in self.selected_features if f not in self.val_df.columns]
        if missing_features:
            raise FeatureSelectionError(f"Selected features missing in validation data: {missing_features}")

        ordered_columns = ['TransactionID'] + self.selected_features + ['isFraud']
        self.out_val_df = self.val_df[ordered_columns].copy()

        self.memory_usage['val_selected_mb'] = self._get_memory_mb(self.out_val_df)
        reduction = 1 - (self.memory_usage['val_selected_mb'] / self.memory_usage['val_original_mb'])
        self.memory_usage['val_memory_reduction_percent'] = reduction * 100
        
        self.logger.info(f"Validation memory reduced by {reduction:.1%} "
                         f"({self.memory_usage['val_original_mb']:.1f} MB -> {self.memory_usage['val_selected_mb']:.1f} MB)")
        
        self.timings['transform_validation'] = time.time() - start_time

    def validate_output(self) -> None:
        """Validates the transformed DataFrames for structural integrity."""
        self.logger.info("Validating output datasets...")
        start_time = time.time()

        def _validate_out_df(orig_df: pd.DataFrame, out_df: pd.DataFrame, name: str):
            if len(orig_df) != len(out_df):
                raise FeatureSelectionError(f"{name} row count changed during transformation.")
            
            selected_cols = [c for c in out_df.columns if c not in ['TransactionID', 'isFraud']]
            if len(selected_cols) == 0:
                raise FeatureSelectionError(f"{name} transformed dataset has 0 selected features.")
            if len(selected_cols) > len(orig_df.columns) - 2:
                raise FeatureSelectionError(f"{name} transformed dataset has more selected features than original candidate features.")
                
            if not orig_df['TransactionID'].equals(out_df['TransactionID']):
                raise FeatureSelectionError(f"'TransactionID' modified in {name} dataset.")
            if not orig_df['isFraud'].equals(out_df['isFraud']):
                raise FeatureSelectionError(f"'isFraud' modified in {name} dataset.")
                
            if out_df.columns.duplicated().any():
                raise FeatureSelectionError(f"{name} transformed dataset has duplicate columns.")
                
            num_cols = out_df.select_dtypes(include=[np.number]).columns
            if np.isinf(out_df[num_cols]).any().any():
                raise FeatureSelectionError(f"Infinite values (np.inf or -np.inf) found in {name} selected features.")
                
        _validate_out_df(self.train_df, self.out_train_df, "Training")
        _validate_out_df(self.val_df, self.out_val_df, "Validation")
        
        if list(self.out_train_df.columns) != list(self.out_val_df.columns):
            raise FeatureSelectionError("Train and Validation transformed feature schema and order differ.")
            
        missing_in_original = [f for f in self.selected_features if f not in self.train_df.columns]
        if missing_in_original:
            raise FeatureSelectionError("Not all selected features exist in original dataset.")

        self.timings['validate_output'] = time.time() - start_time
        self.logger.info("Output validation completed successfully.")

    def generate_report(self) -> None:
        """Generates a comprehensive JSON report object containing selection details and performance metrics."""
        self.logger.info("Assembling feature selection report object...")
        start_time = time.time()

        if len(self.selected_features) + len(self.removed_features) != len(self.candidate_features):
            raise FeatureSelectionError("Report validation failed: selected + removed count != original candidate feature count.")

        estimator = self.selector.estimator_
        importances = estimator.feature_importances_
        
        all_feature_importances = {
            feat: float(imp) for feat, imp in zip(self.candidate_features, importances)
        }
        
        feat_imp = list(zip(self.candidate_features, importances))
        feat_imp.sort(key=lambda x: x[1], reverse=True)
        top_50 = feat_imp[:50]
        
        top_50_features = [x[0] for x in top_50]
        top_50_scores = [float(x[1]) for x in top_50]

        self.report_obj = {
            "rows": {
                "train": len(self.out_train_df),
                "validation": len(self.out_val_df)
            },
            "columns_before": len(self.train_df.columns),
            "columns_after": len(self.out_train_df.columns),
            "selected_feature_count": len(self.selected_features),
            "removed_feature_count": len(self.removed_features),
            "selection_ratio": len(self.selected_features) / len(self.candidate_features) if self.candidate_features else 0,
            "top_50_most_important_features": top_50_features,
            "top_50_importance_scores": top_50_scores,
            "all_feature_importances": all_feature_importances,
            "memory_usage": {
                "train_original_mb": self.memory_usage['train_original_mb'],
                "train_selected_mb": self.memory_usage['train_selected_mb'],
                "train_memory_reduction_percent": self.memory_usage.get('train_memory_reduction_percent', 0.0),
                "val_original_mb": self.memory_usage['val_original_mb'],
                "val_selected_mb": self.memory_usage['val_selected_mb'],
                "val_memory_reduction_percent": self.memory_usage.get('val_memory_reduction_percent', 0.0)
            },
            "versions": {
                "python": platform.python_version(),
                "pandas": pd.__version__,
                "xgboost": xgb.__version__,
                "scikit_learn": sklearn.__version__
            },
            "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        self.timings['generate_report'] = time.time() - start_time
        self.logger.info("Report assembled successfully. Will serialize after artifacts are saved.")

    def save_artifacts(self) -> None:
        """Saves transformed datasets, models, metadata, and finalized report to disk."""
        self.logger.info("Saving artifacts and metadata...")
        start_time = time.time()

        os.makedirs(os.path.dirname(self.out_train_path), exist_ok=True)
        os.makedirs(self.artifact_dir, exist_ok=True)

        self.out_train_df.to_parquet(self.out_train_path, index=False)
        self.out_val_df.to_parquet(self.out_val_path, index=False)

        selector_path = os.path.join(self.artifact_dir, "feature_selector.joblib")
        joblib.dump(self.selector, selector_path)
        
        estimator_path = os.path.join(self.artifact_dir, "feature_selector_estimator.joblib")
        joblib.dump(self.selector.estimator_, estimator_path)

        # Artifact corruption check
        self.logger.info("Reloading feature selector artifact...")
        try:
            reloaded_selector = joblib.load(selector_path)
        except Exception as e:
            raise FeatureSelectionError(f"Failed to load selector artifact: {e}")

        if not np.array_equal(reloaded_selector.get_support(), self.selector.get_support()):
            raise FeatureSelectionError("Reloaded selector feature mask differs from original selector.")
        self.logger.info("Feature mask validated successfully.")

        if not np.isclose(reloaded_selector.threshold_, self.selector.threshold_):
            raise FeatureSelectionError("Reloaded selector threshold differs from original selector.")
        self.logger.info("Threshold validated successfully.")

        if type(reloaded_selector.estimator_) != type(self.selector.estimator_):
            raise FeatureSelectionError("Reloaded selector estimator type mismatch.")
        self.logger.info("Estimator type validated successfully.")

        self.logger.info("Artifact integrity verification completed successfully.")

        metadata = {
            "selector_type": "SelectFromModel",
            "estimator": "XGBClassifier",
            "importance_metric": "feature_importances_",
            "threshold": self.threshold,
            "original_feature_count": len(self.candidate_features),
            "selected_feature_count": len(self.selected_features),
            "removed_feature_count": len(self.removed_features),
            "selected_features": self.selected_features,
            "removed_features": self.removed_features,
            "feature_order": ['TransactionID'] + self.selected_features + ['isFraud'],
            "excluded_columns": [
                "TransactionID",
                "isFraud"
            ],
            "random_state": self.random_state,
            "artifacts": {
                "selector": "feature_selector.joblib",
                "estimator": "feature_selector_estimator.joblib",
                "metadata": "feature_selector_metadata.json",
                "train_dataset": os.path.basename(self.out_train_path),
                "validation_dataset": os.path.basename(self.out_val_path),
                "report": "feature_selection_report.json"
            },
            "xgboost_version": xgb.__version__,
            "scikit_learn_version": sklearn.__version__,
            "python_version": platform.python_version(),
            "pandas_version": pd.__version__,
            "created_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        if len(metadata["selected_features"]) != metadata["selected_feature_count"]:
            raise FeatureSelectionError("Metadata validation failed: selected_features length mismatch.")
            
        if len(metadata["removed_features"]) != metadata["removed_feature_count"]:
            raise FeatureSelectionError("Metadata validation failed: removed_features length mismatch.")
            
        if metadata["selected_feature_count"] + metadata["removed_feature_count"] != metadata["original_feature_count"]:
            raise FeatureSelectionError("Metadata validation failed: selected + removed != original.")

        metadata_path = os.path.join(self.artifact_dir, "feature_selector_metadata.json")
        with open(metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)

        self.timings['save_artifacts'] = time.time() - start_time
        
        # Calculate total execution time including artifact saving
        if self.run_start_time > 0:
            self.timings['total_execution_time_seconds'] = time.time() - self.run_start_time

        # Update and write the report
        if not self.report_obj:
            raise FeatureSelectionError("Report object is empty. generate_report() must be called before save_artifacts().")
            
        self.report_obj['execution_timings'] = self.timings

        os.makedirs(self.report_dir, exist_ok=True)
        report_path = os.path.join(self.report_dir, "feature_selection_report.json")
        with open(report_path, "w") as f:
            json.dump(self.report_obj, f, indent=4)

        self.logger.info("Feature selection module execution completed.")

    def run(self) -> None:
        """Executes the complete feature selection pipeline."""
        self.run_start_time = time.time()
        self.load()
        self.validate_input()
        self.identify_candidate_features()
        self.fit_selector()
        self.transform_train()
        self.transform_validation()
        self.validate_output()
        self.generate_report()
        self.save_artifacts()

if __name__ == "__main__":
    try:
        selector = FeatureSelector()
        selector.run()
    except Exception as e:
        logging.getLogger("FeatureSelector").error(f"Feature selection pipeline failed: {e}")
        raise
