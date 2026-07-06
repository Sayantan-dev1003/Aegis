from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Any

from app.exceptions import SchemaValidationError
from app.monitoring.logger import get_logger

logger = get_logger(__name__)

# Columns that must be numeric.  Any string value will be coerced via pd.to_numeric.
_NUMERIC_COERCE_COLS = {
    "TransactionAmt", "TransactionDT",
    "card1", "card2", "card3", "card5",
    "addr1", "addr2",
    "dist1", "dist2",
}


class Cleaner:
    """
    Validates and normalises a raw Kafka payload dict into a single-row DataFrame.

    Steps
    -----
    1. Reject empty payloads immediately.
    2. Detect unexpected keys (warn, keep — downstream encoder ignores unknowns).
    3. Insert missing expected-raw columns as NaN.
    4. Coerce known numeric columns from string to float where possible.
    5. Replace Python None / missing with np.nan uniformly.
    """

    def __init__(self, expected_raw_columns: list[str]) -> None:
        """
        Args:
            expected_raw_columns: The list of raw input columns that were present
                in the engineered dataset before encoding.  Sourced from the
                deployment config at startup.  Missing columns will be inserted as NaN.
        """
        self._expected = set(expected_raw_columns)
        self._expected_list = list(expected_raw_columns)

    @staticmethod
    def _static_clean(raw_dict: dict[str, Any]) -> pd.DataFrame:
        """
        Compatibility shim — used by tests that construct a Cleaner-less pipeline.
        Performs only the bare minimum: dict → DataFrame + fillna.
        """
        df = pd.DataFrame([raw_dict])
        df.fillna(value=np.nan, inplace=True)
        return df

    def clean(self, raw_dict: dict[str, Any]) -> pd.DataFrame:
        """
        Validates and normalises a raw Kafka payload.

        Raises:
            SchemaValidationError: If the payload is empty or None.
        """
        if not raw_dict:
            raise SchemaValidationError("Received an empty or null payload from Kafka.")

        incoming_keys = set(raw_dict.keys())

        # ── 1. Detect unexpected keys ─────────────────────────────────────────
        unexpected = incoming_keys - self._expected
        if unexpected:
            logger.warning(
                "unexpected_keys_in_payload",
                keys=sorted(unexpected),
                count=len(unexpected),
            )

        # ── 2. Detect missing expected keys ───────────────────────────────────
        missing = self._expected - incoming_keys
        if missing:
            logger.warning(
                "missing_expected_keys_inserting_nan",
                keys=sorted(missing),
                count=len(missing),
            )

        # ── 3. Build DataFrame; fill missing keys with NaN ────────────────────
        # Start from raw_dict so unexpected keys are preserved (encoder ignores them).
        row = dict(raw_dict)
        for col in missing:
            row[col] = np.nan

        df = pd.DataFrame([row])

        # ── 4. Coerce known numeric columns from string → float ───────────────
        for col in _NUMERIC_COERCE_COLS:
            if col in df.columns and df[col].dtype == object:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        # ── 5. Normalise None / NaN uniformly ─────────────────────────────────
        df.fillna(value=np.nan, inplace=True)

        return df
