import os
import time
import json
import logging
import warnings
import platform
from datetime import datetime
from typing import Tuple, List, Dict, Any

import pandas as pd
import numpy as np
from sklearn.preprocessing import OrdinalEncoder
import joblib
import sklearn

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class CategoricalEncoderError(Exception):
    """Custom exception for categorical encoder errors."""
    pass

class CategoricalEncoder:
    """
    Categorical Encoding module for the Aegis Fraud Detection System.
    Applies OneHotEncoder to categorical features while preserving schema,
    numerical columns, and special columns (TransactionID, isFraud).
    """
    
    def __init__(
        self,
        train_path: str = "data/imputed/train.parquet",
        val_path: str = "data/imputed/validation.parquet",
        out_train_path: str = "data/encoded/train.parquet",
        out_val_path: str = "data/encoded/validation.parquet",
        encoder_path: str = "artifacts/encoder.joblib",
        report_path: str = "reports/encoding_report.json",
        metadata_path: str = "artifacts/encoder_metadata.json",
        expansion_threshold: int = 5000,
        memory_warning_threshold_mb: float = 500.0
    ):
        self.train_path = train_path
        self.val_path = val_path
        self.out_train_path = out_train_path
        self.out_val_path = out_val_path
        self.encoder_path = encoder_path
        self.report_path = report_path
        self.metadata_path = metadata_path
        
        self.expansion_threshold = expansion_threshold
        self.memory_warning_threshold_mb = memory_warning_threshold_mb
        
        self.id_col = "TransactionID"
        self.target_col = "isFraud"
        self.exclude_cols = [self.id_col, self.target_col]
        
        self.encoder = OrdinalEncoder(handle_unknown='use_encoded_value', unknown_value=-1, encoded_missing_value=-1)
        self.cat_cols: List[str] = []
        self.num_cols: List[str] = []
        self.encoded_feature_names: List[str] = []
        self.final_feature_order: List[str] = []
        self.report: Dict[str, Any] = {}
        self.start_time: float = 0.0

    def _ensure_dir(self, path: str):
        """Creates directory for the given path if it doesn't exist."""
        os.makedirs(os.path.dirname(path), exist_ok=True)

    def load_data(self) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """Loads training and validation Parquet files."""
        logger.info("Loading training and validation data...")
        try:
            train_df = pd.read_parquet(self.train_path)
            val_df = pd.read_parquet(self.val_path)
            return train_df, val_df
        except Exception as e:
            raise CategoricalEncoderError(f"Failed to load data: {str(e)}")

    def validate_input(self, df: pd.DataFrame, name: str):
        """Validates that input DataFrames contain required columns and valid structure."""
        logger.info(f"Validating {name} input...")
        if df.empty:
            raise CategoricalEncoderError(f"{name} dataframe is empty.")
        if df.columns.duplicated().any():
            raise CategoricalEncoderError(f"Duplicate columns found in {name} dataframe.")
        if self.id_col not in df.columns:
            raise CategoricalEncoderError(f"'{self.id_col}' missing in {name} data")
        if self.target_col not in df.columns:
            raise CategoricalEncoderError(f"'{self.target_col}' missing in {name} data")

    def _cross_validate_inputs(self, train_df: pd.DataFrame, val_df: pd.DataFrame):
        """Validates consistency between train and validation dataframes."""
        logger.info("Cross-validating train and validation schemas...")
        if list(train_df.columns) != list(val_df.columns):
            raise CategoricalEncoderError("Train and validation columns or order do not match.")
        
        train_dtypes = train_df.dtypes
        val_dtypes = val_df.dtypes
        if not train_dtypes.equals(val_dtypes):
            mismatches = [(col, train_dtypes[col], val_dtypes[col]) for col in train_df.columns if train_dtypes[col] != val_dtypes[col]]
            raise CategoricalEncoderError(f"Train and validation dtypes do not match. Mismatches: {mismatches}")

    def detect_categorical_columns(self, train_df: pd.DataFrame):
        """Detects categorical columns based on dtype (object, category, string)."""
        logger.info("Detecting categorical columns...")
        self.cat_cols = [
            col for col in train_df.columns 
            if col not in self.exclude_cols and 
            (train_df[col].dtype == 'object' or 
             train_df[col].dtype.name == 'category' or 
             train_df[col].dtype == 'string')
        ]
        self.num_cols = [
            col for col in train_df.columns
            if col not in self.exclude_cols and col not in self.cat_cols
        ]
        logger.info(f"Detected {len(self.cat_cols)} categorical columns: {self.cat_cols}")

    def fit_encoder(self, train_df: pd.DataFrame):
        """Fits the OneHotEncoder exclusively on the training data."""
        logger.info("Fitting encoder on training data...")
        if not self.cat_cols:
            logger.warning("No categorical columns detected. Encoding will be skipped.")
            return

        t0 = time.time()
        self.encoder.fit(train_df[self.cat_cols])
        fit_time = time.time() - t0
        
        feature_names = self.encoder.get_feature_names_out(self.cat_cols)
        self.encoded_feature_names = list(feature_names)
        
        if len(set(self.encoded_feature_names)) != len(self.encoded_feature_names):
            raise CategoricalEncoderError("Duplicate encoded feature names detected after get_feature_names_out().")
            
        original_count = len(self.cat_cols)
        encoded_count = len(self.encoded_feature_names)
        expansion_ratio = encoded_count / original_count if original_count > 0 else 0.0
        
        logger.info(f"Original categorical columns : {original_count}")
        logger.info(f"Encoded features : {encoded_count}")
        logger.info(f"Expansion ratio : {expansion_ratio:.1f}x")
        
        if encoded_count > self.expansion_threshold:
            logger.warning(
                "Large feature expansion detected. "
                "Training memory usage may increase significantly."
            )
        
        logger.info(f"Fitting completed in {fit_time:.2f} seconds.")
        self.report["fit_time_seconds"] = fit_time

    def transform_data(self, df: pd.DataFrame, name: str) -> pd.DataFrame:
        """Transforms data using the fitted encoder and reconstructs the DataFrame explicitly."""
        logger.info(f"Transforming {name} data...")
        if not self.cat_cols:
            return df.copy()

        t0 = time.time()
        
        # Transform categorical features
        encoded_array = self.encoder.transform(df[self.cat_cols])
        
        # Create DataFrame from encoded array
        encoded_df = pd.DataFrame(encoded_array, columns=self.encoded_feature_names, index=df.index)
        
        # Monitor memory usage of dense output
        mem_usage_mb = encoded_df.memory_usage(deep=True).sum() / (1024 ** 2)
        logger.info(f"Encoded dataframe memory: {mem_usage_mb:.1f} MB")
        
        if mem_usage_mb > self.memory_warning_threshold_mb:
            logger.warning(
                "Encoded dataframe is very large. "
                "Consider switching to sparse output or another encoding strategy."
            )
        
        # Get numerical features explicitly
        num_df = df[self.num_cols]
        
        # Assemble dataframe with explicit deterministic ordering
        # TransactionID -> numerical -> encoded categorical -> isFraud
        id_df = df[[self.id_col]]
        target_df = df[[self.target_col]]
        
        # Concatenate horizontally
        final_df = pd.concat([id_df, num_df, encoded_df, target_df], axis=1)
        
        # Store feature order on the first pass (train)
        if not self.final_feature_order:
            self.final_feature_order = list(final_df.columns)
        else:
            if list(final_df.columns) != self.final_feature_order:
                raise CategoricalEncoderError("Validation feature order differs from training feature order.")
        
        transform_time = time.time() - t0
        logger.info(f"Transformation of {name} completed in {transform_time:.2f} seconds.")
        self.report[f"{name}_transform_time_seconds"] = transform_time
        
        return final_df

    def validate_output(self, orig_df: pd.DataFrame, new_df: pd.DataFrame, name: str):
        """Validates the structure and integrity of the encoded DataFrame."""
        logger.info(f"Validating {name} output...")
        
        # 1. Rows unchanged
        if len(orig_df) != len(new_df):
            raise CategoricalEncoderError(f"Row count changed for {name}: {len(orig_df)} -> {len(new_df)}")
        
        # 2. Target preserved
        if not (orig_df[self.target_col].values == new_df[self.target_col].values).all():
            raise CategoricalEncoderError(f"'{self.target_col}' column altered in {name}")
            
        # 3. TransactionID preserved
        if not (orig_df[self.id_col].values == new_df[self.id_col].values).all():
            raise CategoricalEncoderError(f"'{self.id_col}' column altered in {name}")
            
        # 4. Duplicate columns absent
        if new_df.columns.duplicated().any():
            dups = new_df.columns[new_df.columns.duplicated()].tolist()
            raise CategoricalEncoderError(f"Duplicate columns found in {name}: {dups}")
            
        # 5. No unnamed columns
        unnamed = [c for c in new_df.columns if str(c).startswith("Unnamed:")]
        if unnamed:
            raise CategoricalEncoderError(f"Unnamed columns found in {name}: {unnamed}")

    def generate_report(self, train_orig: pd.DataFrame, train_new: pd.DataFrame, val_orig: pd.DataFrame, val_new: pd.DataFrame):
        """Generates a performance and integrity report for the encoding process."""
        logger.info("Generating report...")
        
        encoded_feature_count = len(self.encoded_feature_names) if self.cat_cols else 0
        new_feature_count = len(train_new.columns) - len(train_orig.columns)
        
        self.report.update({
            "timestamp_utc": datetime.utcnow().isoformat() + "Z",
            "encoder_type": "OrdinalEncoder",
            "scikit_learn_version": sklearn.__version__,
            "pandas_version": pd.__version__,
            "original_categorical_columns": self.cat_cols,
            "encoded_feature_count": encoded_feature_count,
            "new_feature_count": new_feature_count,
            "train_rows": len(train_orig),
            "val_rows": len(val_orig),
            "train_columns_before": len(train_orig.columns),
            "train_columns_after": len(train_new.columns),
            "val_columns_before": len(val_orig.columns),
            "val_columns_after": len(val_new.columns),
            "total_execution_time_seconds": time.time() - self.start_time
        })

    def save_artifacts(self, train_new: pd.DataFrame, val_new: pd.DataFrame):
        """Saves encoded Parquet files, fitted encoder model, metadata, and report JSON."""
        logger.info("Saving artifacts...")
        try:
            # Ensure output directories exist
            self._ensure_dir(self.out_train_path)
            self._ensure_dir(self.out_val_path)
            self._ensure_dir(self.encoder_path)
            self._ensure_dir(self.report_path)
            self._ensure_dir(self.metadata_path)
            
            # Save transformed data
            logger.info(f"Saving encoded train data to {self.out_train_path}")
            train_new.to_parquet(self.out_train_path, index=False)
            
            logger.info(f"Saving encoded validation data to {self.out_val_path}")
            val_new.to_parquet(self.out_val_path, index=False)
            
            # Save the fitted encoder object (for inference later)
            logger.info(f"Saving encoder model to {self.encoder_path}")
            joblib.dump(self.encoder, self.encoder_path)
            
            # Save encoder metadata
            metadata = {
                "categorical_columns": self.cat_cols,
                "numerical_columns": self.num_cols,
                "excluded_columns": self.exclude_cols,
                "encoded_columns": self.encoded_feature_names,
                "feature_order": self.final_feature_order,
                "encoder_type": "OrdinalEncoder",
                "handle_unknown": "use_encoded_value",
                "scikit_learn_version": sklearn.__version__,
                "pandas_version": pd.__version__,
                "python_version": platform.python_version(),
                "created_at_utc": datetime.utcnow().isoformat() + "Z"
            }
            
            logger.info(f"Saving encoder metadata to {self.metadata_path}")
            with open(self.metadata_path, "w") as f:
                json.dump(metadata, f, indent=4)
            
            # Save report
            logger.info(f"Saving report to {self.report_path}")
            with open(self.report_path, "w") as f:
                json.dump(self.report, f, indent=4)
                
        except Exception as e:
            raise CategoricalEncoderError(f"Failed to save artifacts: {str(e)}")

    def run(self):
        """Executes the complete categorical encoding pipeline."""
        self.start_time = time.time()
        logger.info("Starting Categorical Encoding Pipeline...")
        
        # 1. Load data
        train_df, val_df = self.load_data()
        
        # 2. Validate input
        self.validate_input(train_df, "train")
        self.validate_input(val_df, "validation")
        self._cross_validate_inputs(train_df, val_df)
        
        # 3. Detect categorical columns
        self.detect_categorical_columns(train_df)
        
        # 4. Fit encoder on train ONLY
        self.fit_encoder(train_df)
        
        # 5. Transform train and validation
        train_new = self.transform_data(train_df, "train")
        val_new = self.transform_data(val_df, "validation")
        
        # 6. Validate identical train/validation feature schema after encoding
        if list(train_new.columns) != list(val_new.columns):
            raise CategoricalEncoderError("Train and Validation output feature schemas do not match.")
            
        # 7. Validate output contents
        self.validate_output(train_df, train_new, "train")
        self.validate_output(val_df, val_new, "validation")
        
        # 8. Generate report
        self.generate_report(train_df, train_new, val_df, val_new)
        
        # 9. Save all artifacts
        self.save_artifacts(train_new, val_new)
        
        logger.info("Categorical Encoding Pipeline completed successfully.")

if __name__ == "__main__":
    try:
        pipeline = CategoricalEncoder()
        pipeline.run()
    except CategoricalEncoderError as e:
        logger.error(f"Pipeline failed with CategoricalEncoderError: {str(e)}")
        exit(1)
    except Exception as e:
        logger.error(f"Pipeline failed with unexpected error: {str(e)}")
        exit(1)
