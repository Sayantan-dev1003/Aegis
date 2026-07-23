from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Any

from app.features.cleaning import Cleaner
from app.features.preprocessing import Preprocessor
from app.features.feature_engineering import FeatureEngineer
from app.inference.schema_validator import SchemaValidator
from app.inference.artifact_loader import RuntimeArtifacts
from app.runtime.state_store import StateStore
from app.monitoring.metrics import ml_feature_engineering_duration_seconds
from app.monitoring.logger import get_logger

logger = get_logger(__name__)


def _derive_raw_columns(artifacts: RuntimeArtifacts) -> list[str]:
    """
    Returns the list of raw (pre-feature-engineering) column names.

    Primary source
    --------------
    The imputer (a ColumnTransformer) was fitted on the pre-engineering split
    data (data/splits/train.parquet) and therefore its ``feature_names_in_``
    attribute contains exactly the raw columns seen before feature engineering.
    This is authoritative: when a new raw column is added during training, the
    imputer re-fits on it and the runtime automatically picks it up from here.

    Fallback
    --------
    If ``feature_names_in_`` is unavailable (older sklearn or non-fitted
    transformer), we fall back to the full ``feature_order`` list from the
    deployment config and strip known engineered-feature prefixes.  The
    fallback is fragile — if a new engineered feature is added to training
    without updating the prefix list in pipeline.py, the Cleaner may silently
    accept it as a raw column.

    .. warning::
        If you see unexpected column counts in Cleaner warnings after a model
        retrain, first check that the imputer artifact is up to date.  The
        prefix-list fallback in this file may need updating if new engineered
        feature prefixes are introduced.

    Returns
    -------
    list[str]
        Column names that exist in the raw Kafka payload before feature
        engineering.  These are passed to ``Cleaner`` so it can validate the
        payload and insert missing columns as NaN.
    """
    # ── Primary: imputer feature_names_in_ ───────────────────────────────────
    imputer = artifacts.imputer
    if hasattr(imputer, "feature_names_in_") and imputer.feature_names_in_ is not None:
        raw_cols = list(imputer.feature_names_in_)
        excluded = {"TransactionID", "isFraud"}
        raw_cols = [c for c in raw_cols if c not in excluded]
        
        # Strip engineered features that the imputer saw during training 
        # but which will be generated at runtime, so the Cleaner does not
        # expect them in the raw payload.
        raw_cols = _derive_raw_columns_fallback(raw_cols)
        
        logger.info(
            "raw_columns_sourced_from_imputer",
            count=len(raw_cols),
        )
        return raw_cols

    # ── Fallback: strip engineered prefixes from feature_order ───────────────
    logger.warning(
        "imputer_feature_names_in_unavailable",
        reason="Falling back to engineered-prefix stripping. "
               "Update pipeline.py prefix list if new engineered features are added.",
    )
    return _derive_raw_columns_fallback(artifacts.feature_order)


# ── Fallback implementation ───────────────────────────────────────────────────
# MAINTENANCE NOTE: This list must be kept in sync with FeatureEngineer.
# Whenever a new feature group is added to training/feature_engineering.py,
# add its output column name (or shared prefix) here.
#
# ⚠  Only used if imputer.feature_names_in_ is unavailable.
#
_ENGINEERED_EXACT_NAMES: frozenset[str] = frozenset({
    "TransactionAmt_Log",
    "TransactionAmt_Sqrt",
    "TransactionAmt_IsZero",
    "TransactionAmt_Rounded",
    "TransactionAmt_Bucket",
    "Amount_Rank",
    "Amount_Percentile",
    "ElapsedDays",
    "ElapsedWeeks",
    "Hour",
    "Weekday",
    "Weekend",
    "IsNight",
    "Hour_Sin",
    "Hour_Cos",
    "Weekday_Sin",
    "Weekday_Cos",
    "DeviceInfo_Missing_Flag",
    "HasDeviceInfo",
    "DeviceInfo_Length",
    "HasDeviceType",
    "HasIdentity",
    "OS_Type",
    "Browser_Type",
    "Screen_Category",
    "DeviceInfoFrequency",
    "KnownDevice",
    "DeviceTypeFrequency",
    "DeviceFrequency",
    "Email_Missing_Flag",
    "HasRecipientEmail",
    "SameEmailDomain",
    "EmailProvider",
    "EmailProviderFrequency",
    "CommonProvider",
    "Transaction_Per_Card",
    "Card_Frequency",
    "Card_Time_Diff",
    "Transaction_Per_Device",
    "Address_Frequency",
    "Email_Transaction_Count",
})

_ENGINEERED_PREFIXES: tuple[str, ...] = (
    "TransactionAmt_vs_",
    "card1_",
    "card2_",
    "card3_",
    "card5_",
    "addr1_",
    "ProductCD_",
    "DeviceType_",
)


def _derive_raw_columns_fallback(feature_order: list[str]) -> list[str]:
    """
    Strips known engineered-feature names from the post-encoder feature_order
    to approximate the raw column list.

    This is inherently fragile because feature_order is the post-encoder list
    (480 features) and contains one-hot-encoded columns that the Cleaner
    should NOT expect in the raw payload (e.g. "card4_visa").  The resulting
    list may be too broad (includes some OHE columns as "raw") or too narrow
    (misses a new engineered column whose prefix is not listed).

    For this reason, this fallback only excludes columns whose names are in
    the exact set OR start with a known engineered prefix; everything else is
    considered raw — a conservative choice that errs on the side of "don't
    reject a real raw column".
    """
    raw = []
    for col in feature_order:
        if col in _ENGINEERED_EXACT_NAMES:
            continue
        if any(col.startswith(p) for p in _ENGINEERED_PREFIXES):
            continue
        raw.append(col)
    return raw


class FeaturePipeline:
    def __init__(self, artifacts: RuntimeArtifacts, state_store: StateStore) -> None:
        self.artifacts = artifacts

        # Derive raw columns from the imputer (primary) or prefix list (fallback)
        raw_columns = _derive_raw_columns(artifacts)

        self.cleaner = Cleaner(expected_raw_columns=raw_columns)
        self.preprocessor = Preprocessor(artifacts)
        self.feature_engineer = FeatureEngineer(artifacts, state_store)
        self.encoder = artifacts.encoder
        self.feature_selector = artifacts.feature_selector
        self.schema_validator = SchemaValidator(artifacts.feature_order)

    def run(self, raw_dict: dict[str, Any]) -> pd.DataFrame:
        with ml_feature_engineering_duration_seconds.time():
            # 1. Clean — validate payload, insert missing raw cols as NaN
            df = self.cleaner.clean(raw_dict)

            # 2. Engineer — add all derived features (before imputation, matching training)
            df = self.feature_engineer.transform(df)

            # 3. Impute — fill NaNs; column names preserved (not prefixed)
            df = self.preprocessor.transform(df)

            # 4. Encode — categorical columns → one-hot / ordinal
            # Drop any columns that the encoder wasn't trained on (e.g. velocity
            # features added at runtime: txn_velocity_1h, txn_velocity_24h,
            # device_seen_before, AccountID). Passing unknown columns to a fitted
            # ColumnTransformer raises ValueError: "Feature names unseen at fit time".
            if hasattr(self.encoder, "feature_names_in_"):
                known_cols = [c for c in self.encoder.feature_names_in_ if c in df.columns]
                df_for_encoder = df[known_cols].copy()
                numeric_cols = [c for c in df.columns if c not in known_cols]
            else:
                df_for_encoder = df.copy()
                numeric_cols = []
                
            encoded_array = self.encoder.transform(df_for_encoder)

            # Use the encoder's own output names when available; fall back to
            # positional names only if the encoder doesn't expose them.
            if hasattr(self.encoder, "get_feature_names_out"):
                encoded_cols = list(self.encoder.get_feature_names_out())
            else:
                encoded_cols = [f"enc_{i}" for i in range(encoded_array.shape[1])]

            df_encoded = pd.DataFrame(
                encoded_array.toarray() if hasattr(encoded_array, "toarray") else encoded_array,
                columns=encoded_cols,
                index=df.index,
            )
            
            # Merge un-encoded numeric features back with encoded features
            if numeric_cols:
                df_encoded = pd.concat([df[numeric_cols], df_encoded], axis=1)

            # 5. Select — apply boolean mask; use mask to index encoded column names directly
            if hasattr(self.feature_selector, "feature_names_in_"):
                sel_cols = list(self.feature_selector.feature_names_in_)
                # Ensure df_encoded columns exactly match what the selector expects
                for c in sel_cols:
                    if c not in df_encoded.columns:
                        df_encoded[c] = np.nan
                df_for_selector = df_encoded[sel_cols].copy()
            else:
                df_for_selector = df_encoded.copy()
                
            selected_array = self.feature_selector.transform(df_for_selector)
            mask = self.feature_selector.get_support()
            selected_cols = df_for_selector.columns[mask].tolist()

            final_df = pd.DataFrame(
                selected_array,
                columns=selected_cols,
                index=df_for_selector.index,
            )

            # 6. Validate schema
            self.schema_validator.validate(final_df)

            return final_df
