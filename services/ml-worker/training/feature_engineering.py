import io
import pandas as pd
import numpy as np
import logging
import json
import time
import datetime
from pathlib import Path
from typing import Any, Dict, List

import joblib

# ---------------------------------------------------------------------------
# Configurable constants
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
PREPROCESSED_DIR = BASE_DIR / "data" / "preprocessed"
INPUT_FILE = PREPROCESSED_DIR / "cleaned_dataset.parquet"
OUTPUT_FILE = PREPROCESSED_DIR / "engineered_dataset.parquet"
REPORT_FILE = PREPROCESSED_DIR / "feature_engineering_report.json"
CREATED_FEATURES_FILE = PREPROCESSED_DIR / "created_features.csv"

# Runtime preprocessing artifact paths
ARTIFACTS_DIR = BASE_DIR / "artifacts"
RUNTIME_PREPROCESSING_ARTIFACT = ARTIFACTS_DIR / "runtime_preprocessing.joblib"
RUNTIME_PREPROCESSING_METADATA = ARTIFACTS_DIR / "runtime_preprocessing_metadata.json"

# Pipeline version constant — bump this whenever the feature engineering logic
# or artifact schema changes in a backward-incompatible way.
PIPELINE_VERSION = "Aegis-1.0.0"

# ---------------------------------------------------------------------------
# Artifact schema constants
# ---------------------------------------------------------------------------
# Bump ARTIFACT_SCHEMA_VERSION whenever the top-level key structure of
# runtime_preprocessing.joblib changes. The ML Worker validates this at
# startup and raises ArtifactVersionError on a mismatch.
#
# Version history:
#   "1.0" — initial formal schema: schema_version, artifact_version,
#            feature_engineering_version, created_at, aggregation_mappings,
#            frequency_mappings, percentile_mapping, metadata
ARTIFACT_SCHEMA_VERSION = "1.0"

# Stat buckets that create_aggregation_features() always produces for EVERY
# aggregation column.  This is the fixed contract between feature engineering
# and the ML Worker lookup — column names are dynamic (whatever was fitted),
# but these stat keys are always required for each column.
REQUIRED_AGG_STATS: List[str] = ['mean', 'median', 'count', 'std', 'max', 'min']

# Columns whose 'mean' stat is also consumed by create_amount_features() for
# the TransactionAmt_vs_{col}_Mean feature.  Must be a subset of agg columns.
# This stays as a constant because it reflects a deliberate feature design
# decision (not just "whatever was fitted").
AMOUNT_VS_MEAN_COLS: List[str] = ['card1', 'addr1', 'ProductCD']

# ---------------------------------------------------------------------------
# Unknown key policy (documentation constant — not runtime code)
# ---------------------------------------------------------------------------
# This constant documents the agreed contract for all lookup-based features.
# It is referenced in docs/runtime_preprocessing_contract.md and is preserved
# here as the single source of truth for the training codebase.
UNKNOWN_KEY_POLICY = (
    "Keys absent from a lookup mapping return NaN via dict.get(key, NaN). "
    "This is the training-consistent fallback: XGBoost handles NaN natively "
    "via the split direction learned during training. At runtime the ML Worker "
    "increments the ml_unknown_lookup_total Prometheus counter (label: feature) "
    "for every unseen key so that model drift can be detected early."
)

# ---------------------------------------------------------------------------
# Configure Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("FeatureEngineer")


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------
class RuntimePreprocessingExportError(Exception):
    """
    Raised when the runtime preprocessing artifact cannot be saved or
    validated successfully. Contains a descriptive message and the
    underlying cause for structured error handling.
    """

    def __init__(self, message: str, cause: Exception | None = None):
        self.cause = cause
        full_message = (
            message if cause is None
            else f"{message} | Caused by: {type(cause).__name__}: {cause}"
        )
        super().__init__(full_message)


# ---------------------------------------------------------------------------
# FeatureEngineer
# ---------------------------------------------------------------------------
class FeatureEngineer:
    """
    Production-grade Feature Engineering Pipeline for Fraud Detection.

    Responsibilities
    ----------------
    - Fit lookup mappings on training data (aggregation stats, frequency
      maps, percentile lookup) to prevent data leakage.
    - Transform a DataFrame using those mappings.
    - Export a formally-versioned runtime preprocessing artifact
      (runtime_preprocessing.joblib) consumed by the ML Worker at inference.

    Artifact schema (ARTIFACT_SCHEMA_VERSION = "1.0")
    -------------------------------------------------
    runtime_preprocessing.joblib
    ├── schema_version             str  — "1.0"
    ├── artifact_version           str  — PIPELINE_VERSION
    ├── feature_engineering_version str — PIPELINE_VERSION
    ├── created_at                 str  — ISO 8601 UTC timestamp
    ├── aggregation_mappings       dict — {col: {stat: {key: float}}}
    │     (card1, card2, card3, card5, addr1, ProductCD, DeviceType)
    ├── frequency_mappings         dict — {group: {key: float}}
    │     (DeviceInfo, DeviceType, DeviceCombined, EmailProvider)
    ├── percentile_mapping         list — sorted TransactionAmt values
    │     from training; use np.searchsorted at runtime to map a raw
    │     amount to a [0, 1] percentile rank identical to training.
    └── metadata                   dict
          ├── aggregation_groups   list[str]
          ├── frequency_groups     list[str]
          ├── percentile_buckets   int
          ├── total_agg_statistics int
          ├── total_agg_entries    int
          └── total_freq_mappings  int

    Unknown key policy
    ------------------
    See UNKNOWN_KEY_POLICY module constant.
    """

    def __init__(self, input_file: Path | str = INPUT_FILE, output_file: Path | str = OUTPUT_FILE):
        self.input_file = Path(input_file)
        self.output_file = Path(output_file)
        self.report: Dict[str, Any] = {}
        self.df = pd.DataFrame()
        self.initial_columns: List[str] = []
        self.created_features: List[str] = []
        self.dropped_features: List[str] = []
        self.aggregation_mappings: Dict[str, Dict[str, Dict[Any, float]]] = {}
        self.frequency_mappings: Dict[str, Dict[Any, float]] = {}
        # Sorted array of training TransactionAmt values; used to compute
        # Amount_Percentile via np.searchsorted — identical at training and
        # inference time.
        self.percentile_mapping: List[float] = []

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _add_feature(self, column_name: str, series: pd.Series) -> None:
        """Helper to add a feature and track it preserving order."""
        self.df[column_name] = series
        if column_name not in self.created_features:
            self.created_features.append(column_name)

    # ------------------------------------------------------------------
    # Data loading
    # ------------------------------------------------------------------

    def load_dataset(self) -> None:
        """Loads the preprocessed dataset and initializes tracking."""
        logger.info(f"Loading dataset from {self.input_file}")
        if not self.input_file.exists():
            raise FileNotFoundError(f"Input file not found: {self.input_file}")

        start_time = time.time()
        self.df = pd.read_parquet(self.input_file)

        if self.df.empty:
            raise ValueError("The loaded dataframe is empty.")

        self.initial_columns = self.df.columns.tolist()
        self.report["initial_rows"] = len(self.df)
        self.report["initial_columns"] = len(self.initial_columns)
        self.report["memory_before_mb"] = self.df.memory_usage(deep=True).sum() / (1024 * 1024)

        logger.info(f"Dataset loaded in {time.time() - start_time:.2f} seconds. Shape: {self.df.shape}")

    # ------------------------------------------------------------------
    # Fit methods
    # ------------------------------------------------------------------

    def fit_aggregation_statistics(self, df_train: pd.DataFrame) -> None:
        """
        Computes mapping dictionaries for target aggregations using training data
        to prevent data leakage.
        """
        logger.info("Fitting aggregation statistics...")
        self.aggregation_mappings = {}
        agg_cols = ['card1', 'card2', 'card3', 'card5', 'addr1', 'ProductCD', 'DeviceType']
        valid_agg_cols = [c for c in agg_cols if c in df_train.columns]

        for col in valid_agg_cols:
            grouped_amt = df_train.groupby(col)['TransactionAmt']
            mapping_dict = {
                'mean': grouped_amt.mean().to_dict(),
                'median': grouped_amt.median().to_dict(),
                'count': grouped_amt.count().to_dict(),
                'std': grouped_amt.std().to_dict(),
                'max': grouped_amt.max().to_dict(),
                'min': grouped_amt.min().to_dict(),
            }
            merchant_proxy = 'addr1' if 'addr1' in df_train.columns and col != 'addr1' else 'ProductCD'
            if merchant_proxy in df_train.columns:
                mapping_dict['unique_merchant'] = df_train.groupby(col)[merchant_proxy].nunique().to_dict()

            self.aggregation_mappings[col] = mapping_dict

    def fit_frequency_mappings(self, df_train: pd.DataFrame) -> None:
        """
        Computes frequency mappings using training data to prevent data leakage.
        """
        logger.info("Fitting frequency mappings...")
        self.frequency_mappings = {}

        if 'DeviceInfo' in df_train.columns:
            self.frequency_mappings['DeviceInfo'] = df_train['DeviceInfo'].value_counts(dropna=False).to_dict()

        if 'DeviceType' in df_train.columns:
            self.frequency_mappings['DeviceType'] = df_train['DeviceType'].value_counts(dropna=False).to_dict()

        if 'DeviceInfo' in df_train.columns and 'DeviceType' in df_train.columns:
            combined_device = (
                df_train['DeviceType'].fillna('unknown') + "_" + df_train['DeviceInfo'].fillna('unknown')
            )
            self.frequency_mappings['DeviceCombined'] = combined_device.value_counts(dropna=False).to_dict()

        if 'P_emaildomain' in df_train.columns:
            email_provider = df_train['P_emaildomain'].str.extract(r'^([^.]+)', expand=False)
            self.frequency_mappings['EmailProvider'] = email_provider.value_counts(dropna=False).to_dict()

    def fit_percentile_mapping(self, df_train: pd.DataFrame) -> None:
        """
        Builds a sorted array of TransactionAmt values from training data.

        At inference time the ML Worker uses np.searchsorted on this array
        to map a raw TransactionAmt → Amount_Percentile in [0, 1].  This
        produces the same value that training would have assigned via
        amt.rank(pct=True) for that observation (to within the interpolation
        resolution of the sorted array).

        The sorted array is stored as a Python list in self.percentile_mapping
        and is persisted verbatim inside runtime_preprocessing.joblib under
        the key "percentile_mapping".

        Args:
            df_train: Training DataFrame; must contain 'TransactionAmt'.

        Raises:
            KeyError: If 'TransactionAmt' is absent from df_train.
            RuntimePreprocessingExportError: If the resulting array is empty.
        """
        logger.info("Fitting percentile mapping (sorted TransactionAmt array)...")
        if 'TransactionAmt' not in df_train.columns:
            raise KeyError("'TransactionAmt' column required to fit percentile mapping.")

        sorted_amounts = np.sort(df_train['TransactionAmt'].dropna().values)

        if len(sorted_amounts) == 0:
            raise RuntimePreprocessingExportError(
                "Cannot fit percentile mapping: TransactionAmt has no non-null values."
            )

        self.percentile_mapping = sorted_amounts.tolist()
        logger.info(f"  Percentile mapping fitted: {len(self.percentile_mapping):,} sorted values "
                    f"(min={sorted_amounts[0]:.2f}, max={sorted_amounts[-1]:.2f})")

    def fit(self, df: pd.DataFrame) -> 'FeatureEngineer':
        """
        Fits all mappings (aggregations, frequencies, percentile) on the provided
        dataset.  Does not modify the dataframe.
        """
        logger.info("Fitting feature engineer mappings...")
        self.fit_aggregation_statistics(df)
        self.fit_frequency_mappings(df)
        self.fit_percentile_mapping(df)
        return self

    # ------------------------------------------------------------------
    # Transform methods
    # ------------------------------------------------------------------

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Applies engineered features to the provided dataframe using pre-fitted mappings.
        """
        logger.info("Transforming dataset...")
        self.df = df.copy()

        self.create_transaction_features()
        self.create_time_features()
        self.create_amount_features()
        self.create_identity_features()
        self.create_device_features()
        self.create_email_features()
        self.create_aggregation_features()
        self.create_velocity_features()

        return self.df

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Fits mappings and transforms the dataset."""
        return self.fit(df).transform(df)

    # ------------------------------------------------------------------
    # Feature creation methods
    # ------------------------------------------------------------------

    def create_transaction_features(self) -> None:
        """
        Generates mathematical features based on transaction amounts.
        """
        logger.info("Creating Transaction Features...")
        if 'TransactionAmt' not in self.df.columns:
            raise KeyError("Column 'TransactionAmt' is required but not found.")

        amt = self.df['TransactionAmt']
        self._add_feature('TransactionAmt_Log', np.log1p(amt))
        self._add_feature('TransactionAmt_Sqrt', np.sqrt(amt))
        self._add_feature('TransactionAmt_IsZero', (amt == 0).astype(np.int8))
        self._add_feature('TransactionAmt_Rounded', np.round(amt))

        try:
            bucket_series = pd.qcut(amt, q=10, labels=False, duplicates='drop')
        except Exception as e:
            logger.warning(f"Could not calculate TransactionAmt_Bucket: {e}")
            bucket_series = np.nan

        self._add_feature('TransactionAmt_Bucket', bucket_series)

        self.report.setdefault("feature_groups_created", []).append("Transaction Features")

    def create_time_features(self) -> None:
        """
        Extracts and transforms temporal features from TransactionDT representing elapsed time.
        """
        logger.info("Creating Time Features...")
        if 'TransactionDT' not in self.df.columns:
            raise KeyError("Column 'TransactionDT' is required but not found.")

        dt_seconds = self.df['TransactionDT']

        self._add_feature('ElapsedDays', np.floor((dt_seconds / (3600 * 24))).astype(np.int32))
        self._add_feature('ElapsedWeeks', np.floor((dt_seconds / (3600 * 24 * 7))).astype(np.int32))

        hour = np.floor((dt_seconds / 3600) % 24).astype(np.int8)
        self._add_feature('Hour', hour)

        weekday = np.floor((dt_seconds / (3600 * 24)) % 7).astype(np.int8)
        self._add_feature('Weekday', weekday)
        self._add_feature('Weekend', (weekday >= 5).astype(np.int8))
        self._add_feature('IsNight', hour.isin([0, 1, 2, 3, 4, 5, 6]).astype(np.int8))

        self._add_feature('Hour_Sin', np.sin(2 * np.pi * hour / 24))
        self._add_feature('Hour_Cos', np.cos(2 * np.pi * hour / 24))
        self._add_feature('Weekday_Sin', np.sin(2 * np.pi * weekday / 7))
        self._add_feature('Weekday_Cos', np.cos(2 * np.pi * weekday / 7))

        self.report.setdefault("feature_groups_created", []).append("Time Features")

    def create_amount_features(self) -> None:
        """
        Derives statistical and grouping features based on transaction amounts.

        Amount_Percentile
        -----------------
        Uses the sorted training amount array stored in self.percentile_mapping
        (fitted by fit_percentile_mapping).  At inference the ML Worker applies
        the same computation:

            sorted_amts = np.array(artifact["percentile_mapping"])
            pct = np.searchsorted(sorted_amts, transaction_amt) / len(sorted_amts)

        This guarantees that Amount_Percentile is numerically identical between
        training and inference (to within the resolution of the sorted array).
        It replaces the previous amt.rank(pct=True) which was a batch-global rank
        that cannot be reproduced for a single transaction at runtime.
        """
        logger.info("Creating Amount Features...")
        amt = self.df['TransactionAmt']

        self._add_feature('Amount_Rank', amt.rank())

        # Amount_Percentile — artifact-backed, runtime-consistent
        if self.percentile_mapping:
            sorted_amts = np.array(self.percentile_mapping)
            n = len(sorted_amts)
            pct_values = amt.apply(lambda v: np.searchsorted(sorted_amts, v) / n if pd.notna(v) else np.nan)
            self._add_feature('Amount_Percentile', pct_values)
        else:
            # Fallback for edge cases where fit_percentile_mapping was not called
            logger.warning(
                "percentile_mapping is empty — Amount_Percentile will use batch rank(pct=True). "
                "Call fit() before transform() to get the artifact-consistent value."
            )
            self._add_feature('Amount_Percentile', amt.rank(pct=True))

        for col in ['card1', 'addr1', 'ProductCD']:
            if col in self.df.columns and col in self.aggregation_mappings:
                mean_mapping = self.aggregation_mappings[col].get('mean', {})
                mean_series = self.df[col].map(mean_mapping)
                self._add_feature(f'TransactionAmt_vs_{col}_Mean', amt / (mean_series + 1e-9))

        self.report.setdefault("feature_groups_created", []).append("Amount Features")

    def create_identity_features(self) -> None:
        """
        Extracts features from categorical identity columns.
        """
        logger.info("Creating Identity Features...")

        if 'DeviceInfo' in self.df.columns:
            self._add_feature('DeviceInfo_Missing_Flag', self.df['DeviceInfo'].isnull().astype(np.int8))
            self._add_feature('HasDeviceInfo', self.df['DeviceInfo'].notnull().astype(np.int8))
            self._add_feature('DeviceInfo_Length', self.df['DeviceInfo'].astype(str).str.len())

        if 'DeviceType' in self.df.columns:
            self._add_feature('HasDeviceType', self.df['DeviceType'].notnull().astype(np.int8))

        id_cols = [col for col in self.df.columns if str(col).startswith('id_')]
        if id_cols:
            self._add_feature('HasIdentity', self.df[id_cols].notnull().any(axis=1).astype(np.int8))
        else:
            self._add_feature('HasIdentity', pd.Series(0, index=self.df.index, dtype=np.int8))

        if 'id_30' in self.df.columns:
            self._add_feature('OS_Type', self.df['id_30'].str.split(' ', expand=True)[0])

        if 'id_31' in self.df.columns:
            self._add_feature('Browser_Type', self.df['id_31'].str.split(' ', expand=True)[0])

        if 'id_33' in self.df.columns:
            self._add_feature('Screen_Category', self.df['id_33'].str.split('x', expand=True)[0])

        self.report.setdefault("feature_groups_created", []).append("Identity Features")

    def create_device_features(self) -> None:
        """
        Computes device usage frequencies.
        """
        logger.info("Creating Device Features...")

        if 'DeviceInfo' in self.df.columns and 'DeviceInfo' in self.frequency_mappings:
            freq_mapping = self.frequency_mappings['DeviceInfo']
            freq = self.df['DeviceInfo'].map(freq_mapping)
            self._add_feature('DeviceInfoFrequency', freq)
            self._add_feature('KnownDevice', (freq > 1).astype(np.int8))

        if 'DeviceType' in self.df.columns and 'DeviceType' in self.frequency_mappings:
            freq_mapping = self.frequency_mappings['DeviceType']
            self._add_feature('DeviceTypeFrequency', self.df['DeviceType'].map(freq_mapping))

        if ('DeviceInfo' in self.df.columns and 'DeviceType' in self.df.columns
                and 'DeviceCombined' in self.frequency_mappings):
            combined_device = (
                self.df['DeviceType'].fillna('unknown') + "_" + self.df['DeviceInfo'].fillna('unknown')
            )
            freq_mapping = self.frequency_mappings['DeviceCombined']
            self._add_feature('DeviceFrequency', combined_device.map(freq_mapping))
        elif 'DeviceInfo' in self.df.columns:
            self._add_feature(
                'DeviceFrequency',
                self.df.get('DeviceInfoFrequency', pd.Series(np.nan, index=self.df.index))
            )
        elif 'DeviceType' in self.df.columns:
            self._add_feature(
                'DeviceFrequency',
                self.df.get('DeviceTypeFrequency', pd.Series(np.nan, index=self.df.index))
            )

        self.report.setdefault("feature_groups_created", []).append("Device Features")

    def create_email_features(self) -> None:
        """
        Extracts domains and computes features related to email providers.
        """
        logger.info("Creating Email Features...")

        has_p = 'P_emaildomain' in self.df.columns
        has_r = 'R_emaildomain' in self.df.columns

        if has_p:
            self._add_feature('Email_Missing_Flag', self.df['P_emaildomain'].isnull().astype(np.int8))

        if has_r:
            self._add_feature('HasRecipientEmail', self.df['R_emaildomain'].notnull().astype(np.int8))

        if has_p and has_r:
            self._add_feature(
                'SameEmailDomain',
                (self.df['P_emaildomain'] == self.df['R_emaildomain']).astype(np.int8)
            )

        if has_p:
            email_provider = self.df['P_emaildomain'].str.extract(r'^([^.]+)', expand=False)
            self._add_feature('EmailProvider', email_provider)

            if 'EmailProvider' in self.frequency_mappings:
                freq_mapping = self.frequency_mappings['EmailProvider']
                self._add_feature('EmailProviderFrequency', self.df['EmailProvider'].map(freq_mapping))

            common_providers = ['gmail', 'yahoo', 'hotmail', 'aol', 'outlook', 'icloud']
            self._add_feature('CommonProvider', self.df['EmailProvider'].isin(common_providers).astype(np.int8))

        self.report.setdefault("feature_groups_created", []).append("Email Features")

    def create_aggregation_features(self) -> None:
        """
        Applies pre-computed aggregation statistics to prevent leakage.
        """
        logger.info("Creating Aggregation Features...")

        for col, mappings in self.aggregation_mappings.items():
            if col in self.df.columns:
                self._add_feature(f'{col}_Mean_TransactionAmt', self.df[col].map(mappings.get('mean', {})))
                self._add_feature(f'{col}_Median_TransactionAmt', self.df[col].map(mappings.get('median', {})))
                self._add_feature(f'{col}_Count_Transaction', self.df[col].map(mappings.get('count', {})))
                self._add_feature(f'{col}_Std_TransactionAmt', self.df[col].map(mappings.get('std', {})))
                self._add_feature(f'{col}_Max_TransactionAmt', self.df[col].map(mappings.get('max', {})))
                self._add_feature(f'{col}_Min_TransactionAmt', self.df[col].map(mappings.get('min', {})))

                if 'unique_merchant' in mappings:
                    self._add_feature(f'{col}_Unique_Merchant_Count', self.df[col].map(mappings['unique_merchant']))

        self.report.setdefault("feature_groups_created", []).append("Aggregation Features")

    def create_velocity_features(self) -> None:
        """
        Calculates offline velocity features based on cumulative statistics.

        Note
        ----
        At runtime these features are approximated via Redis INCR/GETSET on a
        rolling 30-day window rather than the groupby.cumcount()/diff() approach
        used here.  This is a documented and accepted production approximation.
        See docs/runtime_preprocessing_contract.md § Training ↔ Inference
        Consistency Table for details.
        """
        logger.info("Creating Offline Velocity Features...")

        if 'TransactionDT' not in self.df.columns:
            logger.warning("TransactionDT missing, cannot create velocity features.")
            return

        self.df = self.df.sort_values('TransactionDT').reset_index(drop=True)

        if 'card1' in self.df.columns:
            self._add_feature('Transaction_Per_Card', self.df.groupby('card1').cumcount())
            self._add_feature('Card_Frequency', self.df.groupby('card1')['TransactionDT'].transform('count'))
            self._add_feature('Card_Time_Diff', self.df.groupby('card1')['TransactionDT'].diff())

        if 'DeviceInfo' in self.df.columns:
            self._add_feature('Transaction_Per_Device', self.df.groupby('DeviceInfo').cumcount())

        if 'addr1' in self.df.columns:
            self._add_feature('Address_Frequency', self.df.groupby('addr1')['TransactionDT'].transform('count'))

        if 'P_emaildomain' in self.df.columns:
            self._add_feature('Email_Transaction_Count', self.df.groupby('P_emaildomain').cumcount())

        self.report.setdefault("feature_groups_created", []).append("Offline Velocity Features")

    # ------------------------------------------------------------------
    # Artifact coverage validation
    # ------------------------------------------------------------------

    def _validate_artifact_coverage(self, artifact: Dict[str, Any]) -> None:
        """
        Asserts that every lookup-based feature produced by the pipeline has
        its corresponding mapping present and non-empty in the artifact.

        This runs immediately before joblib.dump() in
        save_runtime_preprocessing_artifact() so that missing mappings are
        caught at training time rather than at inference time.

        Design — dynamic, not hardcoded
        --------------------------------
        The set of aggregation columns to check is derived from
        ``self.aggregation_mappings.keys()`` — whatever was actually fitted.
        This means adding a new column (e.g. card4, addr2) to
        ``fit_aggregation_statistics()`` automatically extends coverage
        validation without any manual update here.

        The required stat buckets per column are governed by
        ``REQUIRED_AGG_STATS`` (module constant) — these are fixed because
        ``create_aggregation_features()`` always reads exactly these stats.

        Similarly, the frequency groups to check are derived from
        ``self.frequency_mappings.keys()``.

        Args:
            artifact: The candidate artifact dict to validate.

        Raises:
            RuntimePreprocessingExportError: If any required mapping is absent
                or empty.
        """
        logger.info("Validating artifact coverage (feature → mapping presence)...")

        agg_mappings = artifact.get("aggregation_mappings", {})
        freq_mappings = artifact.get("frequency_mappings", {})
        percentile = artifact.get("percentile_mapping", [])

        failures: List[str] = []

        # ── Aggregation coverage ─────────────────────────────────────────────
        # Derive the expected columns from what was actually fitted.  This makes
        # the check future-proof: adding a new column to fit_aggregation_statistics
        # automatically requires it to be non-empty here.
        fitted_agg_cols = list(self.aggregation_mappings.keys())
        if not fitted_agg_cols:
            failures.append("FAIL | aggregation_mappings — no columns were fitted (empty)")
        else:
            for col in fitted_agg_cols:
                if col not in agg_mappings:
                    failures.append(f"FAIL | aggregation_mappings['{col}'] — missing from artifact")
                else:
                    col_stats = agg_mappings[col]
                    # Every stat in REQUIRED_AGG_STATS must be present and non-empty
                    for stat in REQUIRED_AGG_STATS:
                        if stat not in col_stats:
                            failures.append(
                                f"FAIL | aggregation_mappings['{col}']['{stat}'] — missing stat bucket"
                            )
                        elif len(col_stats[stat]) == 0:
                            failures.append(
                                f"FAIL | aggregation_mappings['{col}']['{stat}'] — empty (size=0)"
                            )
                        else:
                            logger.info(
                                f"  PASS | aggregation_mappings['{col}']['{stat}'] "
                                f"— {len(col_stats[stat]):,} entries"
                            )

        # TransactionAmt_vs_{col}_Mean secondary check — only for the columns
        # that AMOUNT_VS_MEAN_COLS specifies (these are design-fixed, not dynamic)
        for col in AMOUNT_VS_MEAN_COLS:
            if col in agg_mappings and len(agg_mappings[col].get('mean', {})) == 0:
                failures.append(
                    f"FAIL | aggregation_mappings['{col}']['mean'] — "
                    f"required for TransactionAmt_vs_{col}_Mean but empty"
                )

        # ── Frequency coverage ───────────────────────────────────────────────
        # Derive the expected groups from what was actually fitted.
        fitted_freq_groups = list(self.frequency_mappings.keys())
        if not fitted_freq_groups:
            failures.append("FAIL | frequency_mappings — no groups were fitted (empty)")
        else:
            for group in fitted_freq_groups:
                if group not in freq_mappings:
                    failures.append(f"FAIL | frequency_mappings['{group}'] — missing from artifact")
                elif len(freq_mappings[group]) == 0:
                    failures.append(f"FAIL | frequency_mappings['{group}'] — empty (size=0)")
                else:
                    logger.info(
                        f"  PASS | frequency_mappings['{group}'] "
                        f"— {len(freq_mappings[group]):,} entries"
                    )

        # ── Percentile coverage ──────────────────────────────────────────────
        if not percentile:
            failures.append("FAIL | percentile_mapping — absent or empty; Amount_Percentile will be wrong at runtime")
        else:
            logger.info(f"  PASS | percentile_mapping — {len(percentile):,} sorted values")

        # ── Log results ──────────────────────────────────────────────────────
        total_checks = (
            len(fitted_agg_cols) * len(REQUIRED_AGG_STATS)
            + len(fitted_freq_groups)
            + 1  # percentile
        )
        passed = total_checks - len(failures)

        logger.info(f"Coverage validation: {passed}/{total_checks} checks passed.")
        if failures:
            for msg in failures:
                logger.error(f"  {msg}")
            raise RuntimePreprocessingExportError(
                f"Artifact coverage validation failed ({len(failures)} issue(s)). "
                "Fix the mappings above before deploying. See log for details."
            )

        logger.info("  All coverage checks PASSED.")

    # ------------------------------------------------------------------
    # Artifact export
    # ------------------------------------------------------------------

    def save_runtime_preprocessing_artifact(
        self,
        output_path: Path | str = RUNTIME_PREPROCESSING_ARTIFACT,
        metadata_path: Path | str = RUNTIME_PREPROCESSING_METADATA,
    ) -> Path:
        """
        Persists the formally-versioned runtime preprocessing artifact to disk.

        The artifact conforms to ARTIFACT_SCHEMA_VERSION "1.0" and contains:
        - schema_version, artifact_version, feature_engineering_version, created_at
        - aggregation_mappings — {col: {stat: {key: float}}}
        - frequency_mappings   — {group: {key: float}}
        - percentile_mapping   — sorted list of training TransactionAmt values
        - metadata             — summary statistics (not used at inference)

        The following validations run before the artifact is returned:
        1. Coverage validation (_validate_artifact_coverage) — every
           lookup-based feature has a non-empty mapping.
        2. Round-trip byte-stream validation — aggregation_mappings,
           frequency_mappings, and percentile_mapping all survive a
           joblib load/dump cycle with identical byte streams.

        Args:
            output_path: Destination path for the joblib artifact.
            metadata_path: Destination path for the JSON metadata report.

        Returns:
            Resolved path of the written joblib artifact.

        Raises:
            RuntimePreprocessingExportError:
                If mappings are empty, coverage validation fails, the file
                cannot be written, or the round-trip validation fails.
        """
        output_path = Path(output_path)
        metadata_path = Path(metadata_path)

        if not self.aggregation_mappings and not self.frequency_mappings:
            raise RuntimePreprocessingExportError(
                "Cannot export runtime preprocessing artifact: both aggregation_mappings "
                "and frequency_mappings are empty. Call fit() before saving."
            )

        if not self.percentile_mapping:
            raise RuntimePreprocessingExportError(
                "Cannot export runtime preprocessing artifact: percentile_mapping is empty. "
                "Call fit() before saving."
            )

        output_path.parent.mkdir(parents=True, exist_ok=True)

        created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # ── Compute metadata stats ───────────────────────────────────────────
        total_aggregation_statistics = sum(
            len(stats) for stats in self.aggregation_mappings.values()
        )
        total_aggregation_entries = sum(
            len(bucket)
            for stats in self.aggregation_mappings.values()
            for bucket in stats.values()
        )
        total_freq_mappings = len(self.frequency_mappings)

        # ── Build the formal artifact ────────────────────────────────────────
        artifact: Dict[str, Any] = {
            "schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_version": PIPELINE_VERSION,
            "feature_engineering_version": PIPELINE_VERSION,
            "created_at": created_at,
            "aggregation_mappings": self.aggregation_mappings,
            "frequency_mappings": self.frequency_mappings,
            "percentile_mapping": self.percentile_mapping,
            "metadata": {
                "aggregation_groups": list(self.aggregation_mappings.keys()),
                "frequency_groups": list(self.frequency_mappings.keys()),
                "percentile_buckets": len(self.percentile_mapping),
                "total_agg_statistics": total_aggregation_statistics,
                "total_agg_entries": total_aggregation_entries,
                "total_freq_mappings": total_freq_mappings,
            },
        }

        # ── Pre-save coverage validation ─────────────────────────────────────
        self._validate_artifact_coverage(artifact)

        # ── Persist using joblib ─────────────────────────────────────────────
        try:
            joblib.dump(artifact, output_path)
        except Exception as exc:
            raise RuntimePreprocessingExportError(
                f"Failed to write runtime preprocessing artifact to {output_path}", exc
            ) from exc

        artifact_size_bytes = output_path.stat().st_size
        artifact_size_kb = artifact_size_bytes / 1024

        # ── Round-trip validation (byte-level) ───────────────────────────────
        # We intentionally avoid Python dict equality here because aggregation
        # statistics produced by pandas (e.g. .std() on a single-element group)
        # can contain NaN values, and  NaN != NaN  in Python — meaning a plain
        # `==` comparison would always report a mismatch even when the artifact
        # is perfectly correct.  Comparing the serialized byte streams via
        # io.BytesIO sidesteps floating-point NaN semantics entirely.
        try:
            reloaded = joblib.load(output_path)
        except Exception as exc:
            raise RuntimePreprocessingExportError(
                f"Failed to reload saved artifact from {output_path} during validation", exc
            ) from exc

        for key in ("aggregation_mappings", "frequency_mappings", "percentile_mapping"):
            buf_original = io.BytesIO()
            buf_reloaded = io.BytesIO()
            joblib.dump(artifact[key], buf_original)
            joblib.dump(reloaded.get(key), buf_reloaded)
            if buf_original.getvalue() != buf_reloaded.getvalue():
                raise RuntimePreprocessingExportError(
                    f"Validation failed: reloaded '{key}' byte stream does not match the original. "
                    "The artifact may be corrupt."
                )

        logger.info("Round-trip byte-stream validation passed for all 3 mapping keys.")

        # ── Verify schema_version survived round-trip ────────────────────────
        if reloaded.get("schema_version") != ARTIFACT_SCHEMA_VERSION:
            raise RuntimePreprocessingExportError(
                f"schema_version mismatch after reload: expected '{ARTIFACT_SCHEMA_VERSION}', "
                f"got '{reloaded.get('schema_version')}'"
            )

        # ── Metadata report ──────────────────────────────────────────────────
        metadata_report = {
            "schema_version": ARTIFACT_SCHEMA_VERSION,
            "artifact_version": PIPELINE_VERSION,
            "feature_engineering_version": PIPELINE_VERSION,
            "pipeline_version": PIPELINE_VERSION,          # backward compat
            "created_at": created_at,
            "aggregation_groups": list(self.aggregation_mappings.keys()),
            "frequency_groups": list(self.frequency_mappings.keys()),
            "percentile_buckets": len(self.percentile_mapping),
            "total_aggregation_statistics": total_aggregation_statistics,
            "total_aggregation_entries": total_aggregation_entries,
            "total_frequency_mappings": total_freq_mappings,
            "artifact_size_bytes": artifact_size_bytes,
            "joblib_filename": output_path.name,
        }

        try:
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            with open(metadata_path, "w") as mf:
                json.dump(metadata_report, mf, indent=4)
        except Exception as exc:
            raise RuntimePreprocessingExportError(
                f"Failed to write runtime preprocessing metadata to {metadata_path}", exc
            ) from exc

        # ── Structured logging ───────────────────────────────────────────────
        logger.info("Runtime preprocessing artifact created successfully.")
        logger.info(f"  Schema version      : {ARTIFACT_SCHEMA_VERSION}")
        logger.info(f"  Artifact version    : {PIPELINE_VERSION}")
        logger.info(f"  Aggregation groups  : {len(self.aggregation_mappings)} ({list(self.aggregation_mappings.keys())})")
        logger.info(f"  Frequency groups    : {total_freq_mappings} ({list(self.frequency_mappings.keys())})")
        logger.info(f"  Percentile buckets  : {len(self.percentile_mapping):,}")
        logger.info(f"  Output path         : {output_path.resolve()}")
        logger.info(f"  Artifact size       : {artifact_size_kb:.2f} KB ({artifact_size_bytes} bytes)")

        return output_path

    # ------------------------------------------------------------------
    # Validation and memory optimization
    # ------------------------------------------------------------------

    def validate_features(self) -> None:
        """Validates the generated features for missing values, infinites, and duplicates."""
        logger.info("Validating Features...")

        nan_counts = self.df.isna().sum().sum()
        numeric_cols = self.df.select_dtypes(include=[np.number]).columns
        inf_counts = np.isinf(self.df[numeric_cols]).sum().sum()

        duplicate_cols = self.df.columns[self.df.columns.duplicated()].tolist()
        has_target = 'isFraud' in self.df.columns

        validation_report = {
            "total_nan_values": int(nan_counts),
            "total_infinite_values": int(inf_counts),
            "duplicate_columns_found": len(duplicate_cols),
            "target_column_exists": has_target
        }

        self.report["validation"] = validation_report
        logger.info(f"Validation Report: {json.dumps(validation_report, indent=2)}")

        if duplicate_cols:
            logger.warning(f"Found duplicate columns: {duplicate_cols}")

    def optimize_memory(self) -> None:
        """Downcasts numerical values and categorizes object types to reduce memory footprint."""
        logger.info("Optimizing Memory...")
        memory_before = self.df.memory_usage(deep=True).sum() / (1024 * 1024)

        for col in self.df.columns:
            col_type = self.df[col].dtype

            if col_type != object and not isinstance(col_type, pd.CategoricalDtype):
                c_min = self.df[col].min()
                c_max = self.df[col].max()
                has_nan = self.df[col].isna().any()

                if pd.api.types.is_integer_dtype(col_type) and not has_nan:
                    if c_min > np.iinfo(np.int8).min and c_max < np.iinfo(np.int8).max:
                        self.df[col] = self.df[col].astype(np.int8)
                    elif c_min > np.iinfo(np.int16).min and c_max < np.iinfo(np.int16).max:
                        self.df[col] = self.df[col].astype(np.int16)
                    elif c_min > np.iinfo(np.int32).min and c_max < np.iinfo(np.int32).max:
                        self.df[col] = self.df[col].astype(np.int32)
                    elif c_min > np.iinfo(np.int64).min and c_max < np.iinfo(np.int64).max:
                        self.df[col] = self.df[col].astype(np.int64)
                elif pd.api.types.is_float_dtype(col_type):
                    if c_min > np.finfo(np.float32).min and c_max < np.finfo(np.float32).max:
                        self.df[col] = self.df[col].astype(np.float32)

            elif col_type == object:
                num_unique = self.df[col].nunique()
                unique_ratio = num_unique / len(self.df)
                if num_unique < 1000 and unique_ratio < 0.5:
                    self.df[col] = self.df[col].astype('category')

        memory_after = self.df.memory_usage(deep=True).sum() / (1024 * 1024)
        self.report["memory_after_mb"] = memory_after
        self.report["memory_saved_mb"] = memory_before - memory_after
        logger.info(f"Memory optimized: {memory_before:.2f} MB -> {memory_after:.2f} MB")

    # ------------------------------------------------------------------
    # Save engineered dataset
    # ------------------------------------------------------------------

    def save(self) -> None:
        """Saves the engineered dataset and reports to disk."""
        logger.info(f"Saving engineered dataset to {self.output_file}")

        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        self.df.to_parquet(self.output_file, index=False)

        self.report["final_rows"] = len(self.df)
        self.report["final_columns"] = len(self.df.columns)
        self.report["new_features_created"] = len(self.created_features)
        self.report["dropped_features"] = len(self.dropped_features)

        report_path = self.output_file.parent / "feature_engineering_report.json"
        with open(report_path, "w") as f:
            json.dump(self.report, f, indent=4)

        features_df = pd.DataFrame({"created_features": self.created_features})
        features_csv_path = self.output_file.parent / "created_features.csv"
        features_df.to_csv(features_csv_path, index=False)

        logger.info("Pipeline completed successfully.")

    # ------------------------------------------------------------------
    # Full pipeline
    # ------------------------------------------------------------------

    def run(self) -> None:
        """Executes the full feature engineering pipeline sequentially."""
        start_time = time.time()

        self.load_dataset()
        self.df = self.fit_transform(self.df)
        self.validate_features()
        self.optimize_memory()
        self.save()
        self.save_runtime_preprocessing_artifact()

        self.report["execution_time_seconds"] = time.time() - start_time
        logger.info(f"Total execution time: {self.report['execution_time_seconds']:.2f} seconds")


if __name__ == "__main__":
    try:
        pipeline = FeatureEngineer()
        pipeline.run()
    except Exception as e:
        logger.error(f"Feature Engineering pipeline failed: {str(e)}")
        raise
