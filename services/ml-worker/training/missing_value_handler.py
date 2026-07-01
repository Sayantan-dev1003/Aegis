"""
Missing Value Handler Module for Aegis Fraud Detection System.

This module handles missing value imputation for both numerical and categorical features.
It implements a robust pipeline to fit on training data and transform both training
and validation data without data leakage.
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
import sklearn
import platform

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


class MissingValueHandlerError(Exception):
    """Custom exception raised for errors in the MissingValueHandler."""
    pass


class MissingValueHandler:
    """
    Handles missing value imputation for the fraud detection dataset.
    Fits imputers on training data and applies them to train and validation sets.
    """
    
    def __init__(
        self,
        train_path: str = "data/splits/train.parquet",
        val_path: str = "data/splits/validation.parquet",
        imputed_train_path: str = "data/imputed/train.parquet",
        imputed_val_path: str = "data/imputed/validation.parquet",
        imputer_model_path: str = "artifacts/imputer.joblib",
        imputer_metadata_path: str = "artifacts/imputer_metadata.json",
        report_path: str = "reports/imputation_report.json"
    ):
        """
        Initialize the MissingValueHandler with file paths.
        """
        self.train_path = Path(train_path)
        self.val_path = Path(val_path)
        self.imputed_train_path = Path(imputed_train_path)
        self.imputed_val_path = Path(imputed_val_path)
        self.imputer_model_path = Path(imputer_model_path)
        self.imputer_metadata_path = Path(imputer_metadata_path)
        self.report_path = Path(report_path)
        
        self.train_df: Optional[pd.DataFrame] = None
        self.val_df: Optional[pd.DataFrame] = None
        
        self.numerical_cols: List[str] = []
        self.categorical_cols: List[str] = []
        
        self.imputer: Optional[ColumnTransformer] = None
        
        self.report: Dict[str, Any] = {}
        
        # Columns to exclude from imputation
        self.excluded_cols = {"TransactionID", "isFraud"}
        self.original_columns: List[str] = []
        self.original_dtypes: Optional[pd.Series] = None
        self.original_train_rows: int = 0
        self.original_val_rows: int = 0
        self.train_excluded_vals: Optional[pd.DataFrame] = None
        self.val_excluded_vals: Optional[pd.DataFrame] = None

    def load(self) -> None:
        """Loads training and validation datasets from parquet files."""
        logger.info("Loading training and validation datasets...")
        if not self.train_path.exists():
            raise MissingValueHandlerError(f"Training data not found at {self.train_path}")
        if not self.val_path.exists():
            raise MissingValueHandlerError(f"Validation data not found at {self.val_path}")
            
        self.train_df = pd.read_parquet(self.train_path)
        self.val_df = pd.read_parquet(self.val_path)
        
        logger.info(f"Loaded train shape: {self.train_df.shape}")
        logger.info(f"Loaded val shape: {self.val_df.shape}")

    def validate(self) -> None:
        """Validates the datasets before fitting."""
        logger.info("Validating datasets before fitting...")
        if self.train_df is None or self.val_df is None:
            raise MissingValueHandlerError("Datasets not loaded. Call load() first.")
            
        train_cols = set(self.train_df.columns)
        val_cols = set(self.val_df.columns)
        
        if train_cols != val_cols:
            raise MissingValueHandlerError("Train and validation datasets have different columns.")
            
        if "isFraud" not in train_cols:
            raise MissingValueHandlerError("Target column 'isFraud' is missing.")
            
        if self.train_df.columns.duplicated().any():
            raise MissingValueHandlerError("Training dataset has duplicate columns.")
            
        if self.val_df.columns.duplicated().any():
            raise MissingValueHandlerError("Validation dataset has duplicate columns.")
            
        if not self.train_df.dtypes.equals(self.val_df.dtypes):
            logger.warning("Train and validation datasets have different dtypes.")
            
        self.original_columns = self.train_df.columns.tolist()
        self.original_dtypes = self.train_df.dtypes
        self.original_train_rows = len(self.train_df)
        self.original_val_rows = len(self.val_df)
        logger.info("Pre-fit validation passed.")

    def identify_columns(self) -> None:
        """Identifies numerical and categorical columns for imputation."""
        logger.info("Identifying numerical and categorical columns...")
        df = self.train_df
        
        self.numerical_cols = [
            col for col in df.select_dtypes(include="number").columns
            if col not in self.excluded_cols
        ]
        
        self.categorical_cols = [
            col for col in df.select_dtypes(include=["object", "category"]).columns
            if col not in self.excluded_cols
        ]
        
        logger.info(f"Identified {len(self.numerical_cols)} numerical columns.")
        logger.info(f"Identified {len(self.categorical_cols)} categorical columns.")

    def fit_imputer(self) -> None:
        """Fits the sklearn ColumnTransformer on the training data."""
        logger.info("Fitting the imputer on training data...")
        start_time = time.time()
        
        numeric_transformer = SimpleImputer(strategy="median")
        categorical_transformer = SimpleImputer(strategy="most_frequent")
        
        self.imputer = ColumnTransformer(
            transformers=[
                ("num", numeric_transformer, self.numerical_cols),
                ("cat", categorical_transformer, self.categorical_cols),
            ],
            remainder="passthrough",
            verbose_feature_names_out=False
        )
        
        self.imputer.set_output(transform="pandas")
        self.imputer.fit(self.train_df)
        
        fit_time = time.time() - start_time
        logger.info(f"Imputer fitted in {fit_time:.4f} seconds.")
        self.report["fit_time_seconds"] = fit_time

    def _restore_schema(self, df: pd.DataFrame) -> pd.DataFrame:
        """Helper to restore original column order and dtypes."""
        df = df[self.original_columns]
        for col, dtype in self.original_dtypes.items():
            if df[col].dtype != dtype:
                try:
                    df[col] = df[col].astype(dtype)
                except Exception as e:
                    logger.warning(
                        f"Unable to restore dtype for column '{col}'\n"
                        f"Original dtype: {dtype}\n"
                        f"Current dtype: {df[col].dtype}\n"
                        f"Reason: {str(e)}"
                    )
        return df

    def transform(self) -> None:
        """Transforms both training and validation datasets."""
        logger.info("Transforming training data...")
        
        # Calculate missing values before for report
        train_missing_before = {k: int(v) for k, v in self.train_df.isna().sum().items()}
        val_missing_before = {k: int(v) for k, v in self.val_df.isna().sum().items()}
        
        self.report["missing_before"] = {
            "train_total": int(self.train_df.isna().sum().sum()),
            "val_total": int(self.val_df.isna().sum().sum()),
            "train_per_column": train_missing_before,
            "val_per_column": val_missing_before
        }
        
        # Capture excluded column values for validation
        excluded_present = list(self.excluded_cols.intersection(self.train_df.columns))
        self.train_excluded_vals = self.train_df[excluded_present].copy()
        self.val_excluded_vals = self.val_df[excluded_present].copy()
        
        # Transform train
        start_time = time.time()
        self.train_df = self.imputer.transform(self.train_df)
        self.train_df = self._restore_schema(self.train_df)
        train_transform_time = time.time() - start_time
        logger.info(f"Training data transformed in {train_transform_time:.4f} seconds.")
        
        # Transform validation
        logger.info("Transforming validation data...")
        start_time = time.time()
        self.val_df = self.imputer.transform(self.val_df)
        self.val_df = self._restore_schema(self.val_df)
        val_transform_time = time.time() - start_time
        logger.info(f"Validation data transformed in {val_transform_time:.4f} seconds.")
        
        self.report["transform_time_seconds"] = {
            "train": train_transform_time,
            "val": val_transform_time
        }

    def validate_output(self) -> None:
        """Validates the structure and properties of the transformed datasets."""
        logger.info("Validating transformed datasets...")
        
        # Row count preservation
        if len(self.train_df) != self.original_train_rows:
            raise MissingValueHandlerError("Train row count changed after transform.")
        if len(self.val_df) != self.original_val_rows:
            raise MissingValueHandlerError("Validation row count changed after transform.")
            
        # Column count preservation
        if len(self.train_df.columns) != len(self.original_columns):
            raise MissingValueHandlerError("Train column count changed after transform.")
        if len(self.val_df.columns) != len(self.original_columns):
            raise MissingValueHandlerError("Validation column count changed after transform.")
            
        # Schema consistency
        if not self.train_df.columns.equals(self.val_df.columns):
            raise MissingValueHandlerError("Train and validation datasets have different columns after transform.")
            
        if list(self.train_df.columns) != self.original_columns:
            raise MissingValueHandlerError("Train column order changed after transform.")
            
        if self.train_df.columns.duplicated().any():
            raise MissingValueHandlerError("Duplicate columns found in transformed train data.")
            
        # Check no missing in imputed columns
        imputed_cols = self.numerical_cols + self.categorical_cols
        if self.train_df[imputed_cols].isna().any().any():
            raise MissingValueHandlerError("NaNs remain in imputed columns in training data.")
            
        if self.val_df[imputed_cols].isna().any().any():
            raise MissingValueHandlerError("NaNs remain in imputed columns in validation data.")
            
        # Check excluded columns preserved
        for col in self.excluded_cols:
            if col in self.original_columns:
                if col not in self.train_df.columns:
                    raise MissingValueHandlerError(f"Excluded column '{col}' is missing after transform.")
                
                # Check unchanged values
                if not self.train_df[col].equals(self.train_excluded_vals[col]):
                    raise MissingValueHandlerError(f"Values in excluded column '{col}' changed in train after transform.")
                if not self.val_df[col].equals(self.val_excluded_vals[col]):
                    raise MissingValueHandlerError(f"Values in excluded column '{col}' changed in validation after transform.")
                
        logger.info("Post-transform validation passed.")

    def generate_report(self) -> None:
        """Generates a JSON report summarizing the imputation process."""
        logger.info("Generating imputation report...")
        
        train_missing_after = {k: int(v) for k, v in self.train_df.isna().sum().items()}
        val_missing_after = {k: int(v) for k, v in self.val_df.isna().sum().items()}
        
        self.report.update({
            "dataset_metadata": {
                "train_rows": len(self.train_df),
                "val_rows": len(self.val_df),
                "total_columns": len(self.original_columns),
                "numerical_columns_count": len(self.numerical_cols),
                "categorical_columns_count": len(self.categorical_cols),
                "excluded_columns_count": len([c for c in self.original_columns if c in self.excluded_cols])
            },
            "numerical_columns": self.numerical_cols,
            "categorical_columns": self.categorical_cols,
            "missing_after": {
                "train_total": int(self.train_df.isna().sum().sum()),
                "val_total": int(self.val_df.isna().sum().sum()),
                "train_per_column": train_missing_after,
                "val_per_column": val_missing_after
            },
            "imputation_strategy": {
                "numerical": "median",
                "categorical": "most_frequent"
            },
            "environment": {
                "python_version": platform.python_version(),
                "pandas_version": pd.__version__,
                "scikit_learn_version": sklearn.__version__,
                "timestamp_utc": datetime.now(timezone.utc).isoformat()
            }
        })
        logger.info("Report generated successfully.")

    def save(self) -> None:
        """Saves the datasets, imputer artifact, and report to disk."""
        logger.info("Saving artifacts and datasets...")
        
        self.imputed_train_path.parent.mkdir(parents=True, exist_ok=True)
        self.imputed_val_path.parent.mkdir(parents=True, exist_ok=True)
        self.imputer_model_path.parent.mkdir(parents=True, exist_ok=True)
        self.imputer_metadata_path.parent.mkdir(parents=True, exist_ok=True)
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Save datasets
        logger.info(f"Saving imputed train dataset to {self.imputed_train_path}")
        self.train_df.to_parquet(self.imputed_train_path, index=False)
        
        logger.info(f"Saving imputed validation dataset to {self.imputed_val_path}")
        self.val_df.to_parquet(self.imputed_val_path, index=False)
        
        # Save imputer
        logger.info(f"Saving fitted imputer to {self.imputer_model_path}")
        joblib.dump(self.imputer, self.imputer_model_path)
        
        # Save imputer metadata
        logger.info(f"Saving imputer metadata to {self.imputer_metadata_path}")
        metadata = {
            "numerical_columns": self.numerical_cols,
            "categorical_columns": self.categorical_cols,
            "excluded_columns": list(self.excluded_cols),
            "column_order": self.original_columns,
            "numerical_strategy": "median",
            "categorical_strategy": "most_frequent",
            "scikit_learn_version": sklearn.__version__,
            "pandas_version": pd.__version__,
            "python_version": platform.python_version(),
            "created_at_utc": datetime.now(timezone.utc).isoformat()
        }
        with open(self.imputer_metadata_path, "w") as f:
            json.dump(metadata, f, indent=4)
        
        # Save report
        logger.info(f"Saving report to {self.report_path}")
        with open(self.report_path, "w") as f:
            json.dump(self.report, f, indent=4)
            
        logger.info("All outputs saved successfully.")

    def run(self) -> None:
        """Executes the complete missing value handling pipeline."""
        logger.info("Starting MissingValueHandler pipeline...")
        try:
            self.load()
            self.validate()
            self.identify_columns()
            self.fit_imputer()
            self.transform()
            self.validate_output()
            self.generate_report()
            self.save()
            logger.info("MissingValueHandler pipeline completed successfully.")
        except Exception as e:
            logger.error(f"Pipeline failed: {str(e)}")
            raise


if __name__ == "__main__":
    handler = MissingValueHandler()
    handler.run()
