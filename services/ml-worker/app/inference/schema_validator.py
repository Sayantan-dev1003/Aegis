from __future__ import annotations

import pandas as pd
import numpy as np

from app.exceptions import SchemaValidationError


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

        # ── All-NaN columns ───────────────────────────────────────────────────
        if df.isna().all().any():
            raise SchemaValidationError("One or more columns are entirely NaN (null).")

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
