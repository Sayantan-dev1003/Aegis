"""
Dataset Splitter Module.

This module is responsible for loading the engineered dataset, validating its
integrity, performing a train/validation split (stratified by the target variable),
and saving the resulting datasets and a summary report.

This module is strictly for dataset splitting and does not perform feature engineering,
imputation, scaling, or model training.
"""

import json
import logging
import time
import hashlib
import platform
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

import pandas as pd
import sklearn
from sklearn.model_selection import train_test_split

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


class DatasetSplitterError(Exception):
    """Custom exception for DatasetSplitter errors."""
    pass


class DatasetSplitter:
    """
    Handles the splitting of a dataset into training and validation sets.

    Attributes:
        input_path (Path): Path to the input dataset (Parquet format).
        train_output_path (Path): Path to save the training dataset.
        validation_output_path (Path): Path to save the validation dataset.
        report_output_path (Path): Path to save the split report (JSON).
        target_column (str): The name of the target column for stratification.
        test_size (float): The proportion of the dataset to include in the validation split.
        random_state (int): Controls the shuffling applied to the data before applying the split.
        df (Optional[pd.DataFrame]): The loaded dataframe.
        train_df (Optional[pd.DataFrame]): The resulting training dataframe.
        val_df (Optional[pd.DataFrame]): The resulting validation dataframe.
        report (Dict[str, Any]): Dictionary containing split statistics.
        timings (Dict[str, float]): Execution times for different pipeline stages.
        overall_start_time (float): The start time of the entire run operation.
    """

    def __init__(
        self,
        input_path: Path,
        train_output_path: Path,
        validation_output_path: Path,
        report_output_path: Path,
        target_column: str = "isFraud",
        test_size: float = 0.20,
        random_state: int = 42,
    ) -> None:
        """
        Initializes the DatasetSplitter with configuration parameters.

        Args:
            input_path: Path to the preprocessed dataset.
            train_output_path: Destination path for the training set.
            validation_output_path: Destination path for the validation set.
            report_output_path: Destination path for the summary JSON report.
            target_column: The target variable for stratification. Defaults to 'isFraud'.
            test_size: Proportion of the dataset for validation. Defaults to 0.20.
            random_state: Seed used by the random number generator. Defaults to 42.

        Raises:
            ValueError: If test_size is not between 0 and 1.
        """
        if not (0.0 < test_size < 1.0):
            raise ValueError(f"test_size must be between 0 and 1. Got {test_size}")

        self.input_path = input_path
        self.train_output_path = train_output_path
        self.validation_output_path = validation_output_path
        self.report_output_path = report_output_path
        self.target_column = target_column
        self.test_size = test_size
        self.random_state = random_state

        self.df: Optional[pd.DataFrame] = None
        self.train_df: Optional[pd.DataFrame] = None
        self.val_df: Optional[pd.DataFrame] = None
        self.report: Dict[str, Any] = {}
        self.timings: Dict[str, float] = {}
        self.overall_start_time: float = 0.0

    def load_dataset(self) -> None:
        """
        Loads the dataset from the input path.

        Raises:
            DatasetSplitterError: If the input file does not exist or cannot be read.
        """
        logger.info(f"Loading dataset from: {self.input_path}")
        if not self.input_path.exists():
            raise DatasetSplitterError(f"Input file not found: {self.input_path}")

        try:
            self.df = pd.read_parquet(self.input_path)
            logger.info(f"Dataset loaded successfully with shape: {self.df.shape}")
        except Exception as e:
            raise DatasetSplitterError(f"Failed to read Parquet file: {e}")

    def validate_dataset(self) -> None:
        """
        Validates the loaded dataset to ensure it meets requirements before splitting.

        Raises:
            DatasetSplitterError: If the dataset is empty, missing the target column,
                                  or contains duplicate columns.
        """
        logger.info("Validating dataset integrity...")
        if self.df is None:
            raise DatasetSplitterError("Dataset has not been loaded.")

        if self.df.empty:
            raise DatasetSplitterError("Dataset is empty. Cannot perform split.")

        if self.target_column not in self.df.columns:
            raise DatasetSplitterError(
                f"Target column '{self.target_column}' not found in the dataset."
            )

        if self.df.columns.duplicated().any():
            duplicate_cols = self.df.columns[self.df.columns.duplicated()].tolist()
            raise DatasetSplitterError(f"Dataset contains duplicate columns: {duplicate_cols}")

        if len(self.df) == 0:
            raise DatasetSplitterError("Dataset has 0 rows. Cannot perform split.")

        logger.info("Dataset validation passed.")

    def perform_split(self) -> None:
        """
        Performs the train/validation split using stratification on the target column.

        Raises:
            DatasetSplitterError: If stratification fails (e.g., due to insufficient class instances).
        """
        logger.info(
            f"Performing stratified split (test_size={self.test_size}, "
            f"random_state={self.random_state})"
        )
        if self.df is None:
            raise DatasetSplitterError("Dataset has not been loaded.")

        try:
            # Using train_test_split natively preserves the DataFrame index unless explicitly reset.
            self.train_df, self.val_df = train_test_split(
                self.df,
                test_size=self.test_size,
                random_state=self.random_state,
                shuffle=True,
                stratify=self.df[self.target_column],
            )
            logger.info(
                f"Split complete. Train shape: {self.train_df.shape}, "
                f"Val shape: {self.val_df.shape}"
            )
        except Exception as e:
            raise DatasetSplitterError(f"Failed to perform split: {e}")

    def _calculate_fraud_counts(self, df: pd.DataFrame) -> Tuple[int, int]:
        """
        Calculates the absolute counts of positive (fraud) and negative (non-fraud) instances.

        Args:
            df: The dataframe to calculate counts for.

        Returns:
            A tuple of (fraud_count, nonfraud_count).
        """
        if df.empty or self.target_column not in df.columns:
            return 0, 0
        fraud_count = int(df[self.target_column].sum())
        nonfraud_count = len(df) - fraud_count
        return fraud_count, nonfraud_count

    def _calculate_fraud_ratio(self, df: pd.DataFrame) -> float:
        """
        Calculates the ratio of positive (fraud) instances in the dataset.

        Args:
            df: The dataframe to calculate the ratio for.

        Returns:
            The fraud ratio as a float.
        """
        if df.empty or self.target_column not in df.columns:
            return 0.0
        return float(df[self.target_column].mean())

    def _generate_file_hash(self, file_path: Path) -> str:
        """
        Generates a SHA-256 hash of the specified file.
        
        Args:
            file_path: The path to the file.
            
        Returns:
            The SHA-256 hash as a hex string.
        """
        sha256_hash = hashlib.sha256()
        try:
            with open(file_path, "rb") as f:
                # Read in 4KB chunks to keep memory usage low
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            logger.warning(f"Failed to generate dataset hash: {e}")
            return "hash_generation_failed"

    def generate_report(self) -> None:
        """
        Generates a summary report of the split operation and statistics.
        """
        logger.info("Generating split report...")
        if self.df is None or self.train_df is None or self.val_df is None:
            raise DatasetSplitterError("Cannot generate report before splitting.")

        initial_rows, initial_cols = self.df.shape
        train_rows, train_cols = self.train_df.shape
        val_rows, val_cols = self.val_df.shape

        train_fraud_count, train_nonfraud_count = self._calculate_fraud_counts(self.train_df)
        val_fraud_count, val_nonfraud_count = self._calculate_fraud_counts(self.val_df)

        train_fraud_ratio = self._calculate_fraud_ratio(self.train_df)
        val_fraud_ratio = self._calculate_fraud_ratio(self.val_df)

        # Validate stratification quality
        ratio_diff = abs(train_fraud_ratio - val_fraud_ratio)
        if ratio_diff > 0.001:
            logger.warning(
                f"Stratification difference exceeds 0.001! "
                f"Train ratio: {train_fraud_ratio:.5f}, Val ratio: {val_fraud_ratio:.5f}, "
                f"Difference: {ratio_diff:.5f}"
            )

        self.report = {
            "metadata": {
                "dataset_name": self.input_path.name,
                "input_file": str(self.input_path.absolute()),
                "train_output": str(self.train_output_path.absolute()),
                "validation_output": str(self.validation_output_path.absolute()),
                "report_output": str(self.report_output_path.absolute()),
                "split_timestamp_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "dataset_sha256": self._generate_file_hash(self.input_path),
            },
            "environment": {
                "python_version": platform.python_version(),
                "pandas_version": pd.__version__,
                "scikit_learn_version": sklearn.__version__,
            },
            "parameters": {
                "target_column": self.target_column,
                "test_size": self.test_size,
                "random_state": self.random_state,
            },
            "statistics": {
                "initial_rows": initial_rows,
                "initial_columns": initial_cols,
                "train_rows": train_rows,
                "train_columns": train_cols,
                "validation_rows": val_rows,
                "validation_columns": val_cols,
                "fraud_count_train": train_fraud_count,
                "nonfraud_count_train": train_nonfraud_count,
                "fraud_count_validation": val_fraud_count,
                "nonfraud_count_validation": val_nonfraud_count,
                "fraud_ratio_train": train_fraud_ratio,
                "fraud_ratio_validation": val_fraud_ratio,
            }
        }
        logger.info("Report generated successfully.")

    def _save_parquet(
        self,
        dataframe: pd.DataFrame,
        output_path: Path,
        save_index: bool
    ) -> None:
        """
        Saves a dataframe to Parquet format.
        
        Args:
            dataframe: The dataframe to save.
            output_path: The destination path.
            save_index: Whether to preserve the dataframe index.
            
        Raises:
            DatasetSplitterError: If saving fails.
        """
        try:
            dataframe.to_parquet(output_path, index=save_index)
            logger.info(f"Saved parquet data to {output_path}")
        except Exception as e:
            raise DatasetSplitterError(f"Failed to save parquet file {output_path}: {e}")

    def save(self) -> None:
        """
        Saves the training dataframe, validation dataframe, and report to disk.
        Creates parent directories if they do not exist.

        Raises:
            DatasetSplitterError: If saving fails.
        """
        logger.info("Saving split datasets and report...")
        if self.train_df is None or self.val_df is None or not self.report:
            raise DatasetSplitterError("Nothing to save. Ensure split and report are generated.")

        start_time = time.time()
        try:
            self.train_output_path.parent.mkdir(parents=True, exist_ok=True)
            self.validation_output_path.parent.mkdir(parents=True, exist_ok=True)
            self.report_output_path.parent.mkdir(parents=True, exist_ok=True)

            save_index = "TransactionID" not in self.train_df.columns
            if not save_index:
                logger.info("TransactionID detected. Saving parquet without dataframe index.")
            else:
                logger.info("TransactionID not found. Preserving dataframe index.")

            self._save_parquet(self.train_df, self.train_output_path, save_index)
            self._save_parquet(self.val_df, self.validation_output_path, save_index)

            self.timings["saving_time_seconds"] = time.time() - start_time
            if self.overall_start_time > 0:
                self.timings["total_execution_time_seconds"] = time.time() - self.overall_start_time
            
            # Assemble the complete report before writing to avoid mutating self.report
            final_report = {
                **self.report,
                "timings": self.timings
            }

            with open(self.report_output_path, "w") as f:
                json.dump(final_report, f, indent=4)
            logger.info(f"Saved split report to {self.report_output_path}")

        except Exception as e:
            raise DatasetSplitterError(f"Failed to save outputs: {e}")

    def run(self) -> None:
        """
        Executes the entire dataset splitting pipeline:
        Load -> Validate -> Split -> Report -> Save.
        """
        logger.info("Starting DatasetSplitter pipeline...")
        self.overall_start_time = time.time()

        start_time = time.time()
        self.load_dataset()
        self.timings["loading_time_seconds"] = time.time() - start_time

        start_time = time.time()
        self.validate_dataset()
        self.timings["validation_time_seconds"] = time.time() - start_time

        start_time = time.time()
        self.perform_split()
        self.timings["split_time_seconds"] = time.time() - start_time

        start_time = time.time()
        self.generate_report()
        self.timings["report_generation_time_seconds"] = time.time() - start_time

        self.save()

        logger.info("DatasetSplitter pipeline completed successfully.")


if __name__ == "__main__":
    # Example execution configuration
    base_dir = Path("data")
    preprocessed_dir = base_dir / "preprocessed"
    split_dir = base_dir / "splits"

    splitter = DatasetSplitter(
        input_path=preprocessed_dir / "engineered_dataset.parquet",
        train_output_path=split_dir / "train.parquet",
        validation_output_path=split_dir / "validation.parquet",
        report_output_path=split_dir / "split_report.json",
    )

    try:
        if splitter.input_path.exists():
            splitter.run()
        else:
            logger.warning(
                f"Input file {splitter.input_path} does not exist. "
                "Skipping execution in __main__."
            )
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
