from __future__ import annotations

import pandas as pd
import numpy as np

from app.exceptions import SchemaValidationError
from app.monitoring.logger import get_logger

logger = get_logger(__name__)

# Columns that are genuinely required to be non-NaN for inference.
# Aggregation/frequency/lookup columns (card*_, addr*_, ProductCD_*, DeviceType_*, etc.)
# are intentionally excluded — they are legitimately NaN for unseen categories and
# XGBoost handles missing values natively via its learned split directions.
_REQUIRED_NON_NAN = frozenset([
    "TransactionAmt",
    "ElapsedWeeks",
    "SameEmailDomain",
])


class SchemaValidator:
    """Validates the post-pipeline feature DataFrame before model inference."""

    def __init__(self, feature_order: list[str]) -> None:
        self.feature_order = feature_order
        self.expected_count = len(feature_order)

    def validate(self, df: pd.DataFrame) -> None:
        # ── Column count ──────────────────────────────────────────────────────
        if len(df.columns) != self.expected_count:
            raise SchemaValidationError(
                f"Expected {self.expected_count} columns, got {len(df.columns)}"
            )

        # ── Column identity and order ─────────────────────────────────────────
        if list(df.columns) != self.feature_order:
            # Report the first mismatch for easier debugging
            for i, (actual, expected) in enumerate(zip(df.columns, self.feature_order)):
                if actual != expected:
                    raise SchemaValidationError(
                        f"Column mismatch at position {i}: "
                        f"got '{actual}', expected '{expected}'."
                    )
            raise SchemaValidationError("Column order or names do not match expected feature_order.")

        # ── Duplicates ────────────────────────────────────────────────────────
        if df.columns.duplicated().any():
            raise SchemaValidationError("Duplicated column names found.")

        # ── Required non-NaN columns (core pipeline failures only) ───────────
        # NOTE: Aggregation/lookup features (card*_, addr*_, ProductCD_*, etc.) are
        # intentionally allowed to be NaN for unseen category keys — XGBoost handles
        # missing values natively. Only truly required core features are checked here.
        required_present = [c for c in _REQUIRED_NON_NAN if c in df.columns]
        nan_required = [c for c in required_present if df[c].isna().all()]
        if nan_required:
            raise SchemaValidationError(
                f"Required core columns are entirely NaN: {nan_required}"
            )

        # ── Infinite values ───────────────────────────────────────────────────
        numeric_df = df.select_dtypes(include=[np.number])
        if np.isinf(numeric_df).any().any():
            raise SchemaValidationError("Infinite values found in DataFrame.")

        # ── dtype validity ────────────────────────────────────────────────────
        for col, dtype in df.dtypes.items():
            if dtype == "object" or dtype == "bool":
                raise SchemaValidationError(
                    f"Column '{col}' has invalid dtype {dtype}. Expected numeric."
                )

        # ── Float dtype consistency (float32 / float64 only) ─────────────────
        # XGBoost expects float input.  Integer dtypes (int8, int16, int32, int64)
        # produced by memory optimisation should have been cast to float by the
        # encoder, but we guard here explicitly.
        for col in numeric_df.columns:
            dtype = numeric_df[col].dtype
            if dtype.kind == "i" or dtype.kind == "u":
                raise SchemaValidationError(
                    f"Column '{col}' has integer dtype {dtype}. "
                    "All features should be float32 or float64 after encoding."
                )

        # Log NaN summary at debug level (non-fatal, expected for lookup misses)
        nan_cols = df.columns[df.isna().any()].tolist()
        if nan_cols:
            logger.debug(
                "nan_columns_present_will_use_xgboost_nan_handling",
                count=len(nan_cols),
            )
