"""
cleaning.py

Stage 2:
- Load merged dataset
- Remove duplicate rows
- Remove constant columns
- Remove highly missing columns
- Generate cleaning report

Author: Sayantan Halder
"""

from pathlib import Path
import json

import numpy as np
import pandas as pd
from pandas.api.types import (
    is_integer_dtype,
    is_float_dtype,
)


# ==========================================================
# PATH CONFIGURATION
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent.parent
PREPROCESSED_DIR = BASE_DIR / "data" / "preprocessed"
INPUT_FILE = PREPROCESSED_DIR / "merged_dataset.parquet"
OUTPUT_FILE = PREPROCESSED_DIR / "cleaned_dataset.parquet"
REMOVED_COLUMNS_FILE = PREPROCESSED_DIR / "removed_columns.csv"
REPORT_FILE = PREPROCESSED_DIR / "cleaning_report.json"


# ==========================================================
# CONFIG
# ==========================================================

HIGH_MISSING_THRESHOLD = 95.0
TARGET_COLUMN = "isFraud"


# ==========================================================
# DATA CLEANER
# ==========================================================

class DataCleaner:

    def __init__(self):
        self.df = None
        self.removed_columns = []
        self.report = {}

    # ------------------------------------------------------

    def load_dataset(self):

        print("=" * 60)
        print("Loading merged dataset...")
        print("=" * 60)

        self.df = pd.read_parquet(INPUT_FILE)

        self.report["initial_rows"] = int(self.df.shape[0])
        self.report["initial_columns"] = int(self.df.shape[1])

        self.report["memory_before_mb"] = round(self.df.memory_usage(deep=True).sum() / 1024**2, 2)

        print(f"Shape : {self.df.shape}")

    # ------------------------------------------------------

    def remove_duplicates(self):

        print("\nRemoving duplicate rows...")

        before = len(self.df)

        self.df.drop_duplicates(inplace=True)

        removed = before - len(self.df)

        self.report["duplicate_rows_removed"] = int(removed)

        print(f"Removed : {removed}")

    # ------------------------------------------------------

    def remove_constant_columns(self):

        print("\nRemoving constant columns...")

        constant_cols = [

            col

            for col in self.df.columns

            if self.df[col].nunique(dropna=False) <= 1

        ]

        self.df.drop(

            columns=constant_cols,

            inplace=True

        )

        self.removed_columns.extend(constant_cols)

        self.report["constant_columns_removed"] = len(

            constant_cols

        )

        print(f"Removed : {len(constant_cols)}")

    # ------------------------------------------------------

    def remove_high_missing_columns(self):

        print("\nRemoving highly missing columns...")

        missing_percent = (self.df.isnull().mean() * 100)

        cols = missing_percent[missing_percent > HIGH_MISSING_THRESHOLD].index.tolist()

        if TARGET_COLUMN in cols:
            cols.remove(TARGET_COLUMN)

        self.df.drop(columns=cols, inplace=True)
        for col in cols:
            self.removed_columns.append({
                "column": col,
                "reason": "Missing >95%"
            })
        self.report["high_missing_columns_removed"] = len(cols)

        print(f"Removed : {len(cols)}")


    # ------------------------------------------------------
    # VERIFY TARGET COLUMN
    # ------------------------------------------------------

    def verify_target(self):

        print("\nVerifying target column...")

        if TARGET_COLUMN not in self.df.columns:

            raise ValueError(
                f"Target column '{TARGET_COLUMN}' not found."
            )

        unique_values = sorted(self.df[TARGET_COLUMN].dropna().unique().tolist())

        if unique_values != [0, 1]:

            raise ValueError(
                f"Target column should contain only [0,1]. "
                f"Found {unique_values}"
            )

        fraud_count = int(self.df[TARGET_COLUMN].sum())
        normal_count = int(
            (self.df[TARGET_COLUMN] == 0).sum()
        )

        fraud_ratio = round(
            fraud_count / len(self.df) * 100,
            4
        )

        self.report["fraud_cases"] = fraud_count
        self.report["normal_cases"] = normal_count
        self.report["fraud_ratio"] = fraud_ratio

        print("Target column verified.")
        print(f"Fraud Cases  : {fraud_count}")
        print(f"Normal Cases : {normal_count}")
        print(f"Fraud Ratio  : {fraud_ratio}%")

    
    # ------------------------------------------------------
    # OPTIMIZE DATA TYPES
    # ------------------------------------------------------

    def optimize_dtypes(self):

        print("\nOptimizing data types...")

        before = (self.df.memory_usage(deep=True).sum() / 1024**2)
        object_to_category = 0
        integer_downcast = 0
        float_downcast = 0

        for col in self.df.columns:

            # -------------------------------
            # Integer
            # -------------------------------

            if is_integer_dtype(self.df[col]):

                self.df[col] = pd.to_numeric(
                    self.df[col],
                    downcast="integer"
                )

                integer_downcast += 1

            # -------------------------------
            # Float
            # -------------------------------

            elif is_float_dtype(self.df[col]):

                self.df[col] = pd.to_numeric(
                    self.df[col],
                    downcast="float"
                )

                float_downcast += 1

            # -------------------------------
            # Object
            # -------------------------------

            elif self.df[col].dtype == "object":
                unique_count = self.df[col].nunique(dropna=False)
                unique_ratio = unique_count / len(self.df)
                if (unique_ratio < 0.50 and unique_count < 1000):
                    self.df[col] = self.df[col].astype("category")

                    object_to_category += 1

        after = (self.df.memory_usage(deep=True).sum() / 1024**2)

        self.report["memory_before_dtype_mb"] = round(before, 2)

        self.report["memory_after_dtype_mb"] = round(after, 2)

        self.report["integer_columns_downcasted"] = integer_downcast

        self.report["float_columns_downcasted"] = float_downcast

        self.report["object_columns_converted"] = object_to_category

        print(f"Memory Before : {before:.2f} MB")
        print(f"Memory After  : {after:.2f} MB")

        print(f"Integer Columns : {integer_downcast}")

        print(f"Float Columns   : {float_downcast}")

        print(f"Category Columns: {object_to_category}")


    # ------------------------------------------------------
    # FINAL MEMORY STATS
    # ------------------------------------------------------

    def calculate_final_statistics(self):

        self.report["final_rows"] = int(self.df.shape[0])

        self.report["final_columns"] = int(self.df.shape[1])

        self.report["memory_after_cleaning_mb"] = round(self.df.memory_usage(deep=True).sum() / 1024**2, 2)

        print("Memory After Cleaning: ", self.report["memory_after_cleaning_mb"], "MB")

    # ------------------------------------------------------

    # ------------------------------------------------------
    # SAVE DATASET & REPORTS
    # ------------------------------------------------------

    def save(self):
        print("\nSaving cleaned dataset...")
        # ---------------------------------------------
        # Save cleaned parquet
        # ---------------------------------------------

        self.df.to_parquet(OUTPUT_FILE, index=False)

        # ---------------------------------------------
        # Save removed columns
        # ---------------------------------------------

        if len(self.removed_columns) > 0:
            removed_df = pd.DataFrame(self.removed_columns)
            removed_df.to_csv(REMOVED_COLUMNS_FILE, index=False)

        # ---------------------------------------------
        # Save cleaning report
        # ---------------------------------------------

        with open(REPORT_FILE, "w") as f:
            json.dump(self.report, f, indent=4)

        print("\nCleaning completed successfully.")
        print("=" * 60)
        print(f"Final Shape : {self.df.shape}")
        print(f"Memory Usage : {self.report['memory_after_cleaning_mb']} MB")
        print(f"Removed Columns : {len(self.removed_columns)}")
        print("=" * 60)


# ==========================================================
# MAIN
# ==========================================================

def main():
    cleaner = DataCleaner()
    cleaner.load_dataset()
    cleaner.remove_duplicates()
    cleaner.remove_constant_columns()
    cleaner.remove_high_missing_columns()
    cleaner.verify_target()
    cleaner.optimize_dtypes()
    cleaner.calculate_final_statistics()
    cleaner.save()


if __name__ == "__main__":

    main()