"""
preprocessing.py

Stage 1:
- Load IEEE-CIS Dataset
- Merge datasets
- Dataset inspection
- Memory optimization
- Missing value analysis
- Duplicate analysis
- Class distribution
- Save merged dataset

Author: Sayantan Halder
"""

from pathlib import Path
import json
from pandas.api.types import (
    is_integer_dtype,
    is_float_dtype,
    is_object_dtype,
)
import numpy as np
import pandas as pd
from scipy.stats import zscore
from pandas.api.types import is_numeric_dtype


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent

RAW_DATA = BASE_DIR / "data" / "raw"
PREPROCESSED_DATA = BASE_DIR / "data" / "preprocessed"

PREPROCESSED_DATA.mkdir(parents=True, exist_ok=True)

TRANSACTION_FILE = RAW_DATA / "train_transaction.csv"
IDENTITY_FILE = RAW_DATA / "train_identity.csv"


# ============================================================
# DATA LOADER
# ============================================================

class DataLoader:

    def __init__(self):
        self.transaction = None
        self.identity = None
        self.df = None

    def load(self):

        print("=" * 60)
        print("Loading datasets...")
        print("=" * 60)

        self.transaction = pd.read_csv(TRANSACTION_FILE)
        self.transaction = optimize_memory(self.transaction)

        self.identity = pd.read_csv(IDENTITY_FILE)
        self.identity = optimize_memory(self.identity)

        print(f"Transaction Shape : {self.transaction.shape}")
        print(f"Identity Shape    : {self.identity.shape}")

    def merge(self):

        print("\nMerging datasets...")

        self.df = self.transaction.merge(
            self.identity,
            how="left",
            on="TransactionID"
        )
        
        # Free up memory immediately
        del self.transaction
        del self.identity
        import gc
        gc.collect()

        print(f"Merged Shape : {self.df.shape}")

        return self.df


# ============================================================
# MEMORY OPTIMIZATION
# ============================================================

def optimize_memory(df):

    start_mem = df.memory_usage(deep=True).sum() / 1024**2

    for col in df.columns:

        if is_integer_dtype(df[col]):

            df[col] = pd.to_numeric(df[col], downcast="integer")

        elif is_float_dtype(df[col]):

            df[col] = pd.to_numeric(df[col], downcast="float")

        elif is_object_dtype(df[col]):

            # Convert low-cardinality object columns to category
            num_unique = df[col].nunique(dropna=False)

            if num_unique / len(df) < 0.5:
                df[col] = df[col].astype("category")

    end_mem = df.memory_usage(deep=True).sum() / 1024**2

    print(f"Memory Before : {start_mem:.2f} MB")
    print(f"Memory After  : {end_mem:.2f} MB")

    return df


# ============================================================
# DATASET SUMMARY
# ============================================================

def dataset_summary(df):

    print("\nGenerating dataset summary...")

    summary = {
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "fraud_cases": int(df["isFraud"].sum()),
        "normal_cases": int((df["isFraud"] == 0).sum()),
        "fraud_ratio": round(df["isFraud"].mean() * 100, 4),
        "memory_mb": round(df.memory_usage(deep=True).sum() / 1024**2, 2)
    }

    print(json.dumps(summary, indent=4))

    with open(
        PREPROCESSED_DATA / "dataset_summary.json",
        "w"
    ) as f:

        json.dump(summary, f, indent=4)


# ============================================================
# MISSING VALUES
# ============================================================

def missing_value_report(df):

    print("\nCreating missing value report...")

    report = pd.DataFrame({

        "column": df.columns,
        "missing_count": df.isnull().sum().values,
        "missing_percent": (
            df.isnull().mean() * 100
        ).values

    })

    report = report.sort_values(
        by="missing_percent",
        ascending=False
    )

    report.to_csv(
        PREPROCESSED_DATA / "missing_values.csv",
        index=False
    )

    print(report.head(20))


# ============================================================
# DUPLICATE REPORT
# ============================================================

def duplicate_report(df):

    duplicates = df.duplicated().sum()

    print("\nDuplicate Rows :", duplicates)


# ============================================================
# CLASS DISTRIBUTION
# ============================================================

def class_distribution(df):

    print("\nFraud Distribution")

    distribution = df["isFraud"].value_counts()

    percentage = (
        df["isFraud"]
        .value_counts(normalize=True)
        * 100
    )

    result = pd.DataFrame({

        "count": distribution,
        "percentage": percentage

    })

    print(result)


# ============================================================
# NUMERICAL SUMMARY
# ============================================================

def numerical_summary(df):

    print("\nGenerating numerical summary...")

    summary = df.describe().T

    summary.to_csv(
        PREPROCESSED_DATA / "numerical_summary.csv"
    )


# ============================================================
# OUTLIER ANALYSIS
# ============================================================

def outlier_analysis(df):

    print("\nPerforming Outlier Analysis...")

    EXCLUDED_COLUMNS = {
        "TransactionID",
        "TransactionDT",
        "isFraud"
    }

    report = []

    for col in df.columns:

        # ----------------------------------------
        # Skip non-numeric columns
        # ----------------------------------------
        if not is_numeric_dtype(df[col]):
            continue

        # ----------------------------------------
        # Skip identifier / target columns
        # ----------------------------------------
        if col in EXCLUDED_COLUMNS:
            continue

        # ----------------------------------------
        # Skip highly missing columns
        # (>95% missing)
        # ----------------------------------------
        missing_percent = df[col].isna().mean() * 100

        if missing_percent > 95:
            continue

        series = df[col].dropna()

        # ----------------------------------------
        # Too few values
        # ----------------------------------------
        if len(series) < 30:
            continue

        # ----------------------------------------
        # Constant columns
        # ----------------------------------------
        if series.nunique() <= 1:
            continue

        # ----------------------------------------
        # Skip binary features
        # ----------------------------------------
        unique_values = set(series.unique())

        if unique_values.issubset({0, 1}):
            continue

        # ----------------------------------------
        # Skip low-cardinality columns
        # Example:
        # card4
        # M1-M9
        # etc.
        # ----------------------------------------
        if series.nunique() < 10:
            continue

        # ========================================
        # IQR
        # ========================================

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)

        iqr = q3 - q1

        if iqr == 0:
            continue

        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr

        iqr_mask = (series < lower) | (series > upper)

        iqr_outliers = int(iqr_mask.sum())

        # ========================================
        # Z-Score
        # ========================================

        std = series.std()

        if std == 0:
            z_outliers = 0
        else:
            z = np.abs(zscore(series))
            z_outliers = int((z > 3).sum())

        report.append({

            "column": col,

            "missing_percent": round(missing_percent, 2),

            "unique_values": int(series.nunique()),

            "min": float(series.min()),

            "max": float(series.max()),

            "mean": float(series.mean()),

            "median": float(series.median()),

            "std": float(std),

            "iqr_outliers": iqr_outliers,

            "iqr_percent": round(
                (iqr_outliers / len(series)) * 100,
                2
            ),

            "zscore_outliers": z_outliers,

            "zscore_percent": round(
                (z_outliers / len(series)) * 100,
                2
            )

        })

    report_df = pd.DataFrame(report)

    report_df = report_df.sort_values(
        by="iqr_percent",
        ascending=False
    )

    report_df.to_csv(
        PREPROCESSED_DATA / "outlier_report.csv",
        index=False
    )

    print(f"\nAnalyzed {len(report_df)} numerical features.")
    print(report_df.head(20))


# ============================================================
# SAVE DATASET
# ============================================================

def save_dataset(df):

    print("\nSaving merged dataset...")

    df.to_parquet(

        PREPROCESSED_DATA /
        "merged_dataset.parquet",

        index=False

    )

    print("Saved successfully.")


# ============================================================
# MAIN
# ============================================================

def main():

    loader = DataLoader()

    loader.load()

    df = loader.merge()

    df = optimize_memory(df)

    dataset_summary(df)

    missing_value_report(df)

    duplicate_report(df)

    class_distribution(df)

    numerical_summary(df)

    outlier_analysis(df)

    save_dataset(df)

    print("\nStage 1 Completed Successfully.")


if __name__ == "__main__":

    main()