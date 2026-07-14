"""
Tests for SchemaValidator.

All tests are pure unit tests — no model files, no Kafka, no Redis.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.exceptions import SchemaValidationError
from app.inference.schema_validator import SchemaValidator

FEATURE_NAMES = ["feat_a", "feat_b", "feat_c", "feat_d"]


def _valid_df(cols: list[str] = FEATURE_NAMES) -> pd.DataFrame:
    """Creates a minimal valid 1-row DataFrame."""
    return pd.DataFrame(
        {col: [float(i + 1)] for i, col in enumerate(cols)},
        dtype=np.float64,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Happy path
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorValid:
    def test_valid_df_no_error(self):
        validator = SchemaValidator(FEATURE_NAMES)
        validator.validate(_valid_df())  # should not raise

    def test_float32_accepted(self):
        """float32 dtype is also acceptable."""
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df().astype(np.float32)
        validator.validate(df)  # should not raise


# ──────────────────────────────────────────────────────────────────────────────
# Column count errors
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorColumnCount:
    def test_too_many_columns_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df(FEATURE_NAMES + ["extra_col"])
        df["extra_col"] = df["extra_col"].astype(np.float64)
        with pytest.raises(SchemaValidationError, match="Expected"):
            validator.validate(df)

    def test_too_few_columns_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df(FEATURE_NAMES[:-1])  # one column missing
        with pytest.raises(SchemaValidationError, match="Expected"):
            validator.validate(df)

    def test_empty_dataframe_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = pd.DataFrame()
        with pytest.raises(SchemaValidationError):
            validator.validate(df)


# ──────────────────────────────────────────────────────────────────────────────
# Column order / name errors
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorColumnOrder:
    def test_wrong_order_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        reversed_cols = list(reversed(FEATURE_NAMES))
        df = _valid_df(reversed_cols)
        with pytest.raises(SchemaValidationError, match="[Cc]olumn"):
            validator.validate(df)

    def test_wrong_name_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        wrong = FEATURE_NAMES[:-1] + ["WRONG_NAME"]
        df = _valid_df(wrong)
        with pytest.raises(SchemaValidationError):
            validator.validate(df)


# ──────────────────────────────────────────────────────────────────────────────
# All-NaN column
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorNaN:
    def test_all_nan_column_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df["feat_a"] = np.nan
        with pytest.raises(SchemaValidationError, match="[Nn]aN|null"):
            validator.validate(df)

    def test_single_nan_value_is_ok(self):
        """A single NaN in one cell of a multi-row df should be allowed
        (the column is NOT entirely NaN, so no SchemaValidationError)."""
        validator = SchemaValidator(FEATURE_NAMES)
        # Use 2-row df so that feat_b has one NaN and one valid value
        df = pd.DataFrame(
            {col: [float(i + 1), float(i + 2)] for i, col in enumerate(FEATURE_NAMES)},
            dtype=np.float64,
        )
        df.loc[0, "feat_b"] = np.nan
        # Only one of two rows is NaN — column is NOT entirely NaN
        validator.validate(df)  # should not raise


# ──────────────────────────────────────────────────────────────────────────────
# Infinite values
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorInfinite:
    def test_inf_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df.loc[0, "feat_c"] = np.inf
        with pytest.raises(SchemaValidationError, match="[Ii]nfinite|[Ii]nf"):
            validator.validate(df)

    def test_negative_inf_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df.loc[0, "feat_d"] = -np.inf
        with pytest.raises(SchemaValidationError, match="[Ii]nfinite|[Ii]nf"):
            validator.validate(df)


# ──────────────────────────────────────────────────────────────────────────────
# dtype errors
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorDtype:
    def test_object_dtype_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df["feat_a"] = df["feat_a"].astype(object)
        with pytest.raises(SchemaValidationError, match="[Dd]type|object"):
            validator.validate(df)

    def test_bool_dtype_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df["feat_a"] = df["feat_a"].astype(bool)
        with pytest.raises(SchemaValidationError, match="[Dd]type|bool"):
            validator.validate(df)

    def test_int64_dtype_raises(self):
        """Integer dtype should be rejected — all features must be float."""
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df["feat_b"] = df["feat_b"].astype(np.int64)
        with pytest.raises(SchemaValidationError, match="[Ii]nteger|[Dd]type"):
            validator.validate(df)

    def test_int32_dtype_raises(self):
        validator = SchemaValidator(FEATURE_NAMES)
        df = _valid_df()
        df["feat_c"] = df["feat_c"].astype(np.int32)
        with pytest.raises(SchemaValidationError, match="[Ii]nteger|[Dd]type"):
            validator.validate(df)


# ──────────────────────────────────────────────────────────────────────────────
# Duplicated columns
# ──────────────────────────────────────────────────────────────────────────────


class TestSchemaValidatorDuplicates:
    def test_duplicate_columns_raises(self):
        """A DataFrame with duplicated column names must raise SchemaValidationError.

        Note: the SchemaValidator checks column count → column identity/order → duplicates.
        When a column is duplicated (e.g. feat_a appears at position 3 instead of feat_d),
        the column-identity check fires first with "Column mismatch at position N".
        We accept any SchemaValidationError from this DataFrame.
        """
        validator = SchemaValidator(FEATURE_NAMES)
        # Use numpy to force actual duplicated column names in the DataFrame.
        data = np.ones((1, len(FEATURE_NAMES)), dtype=np.float64)
        duped_names = list(FEATURE_NAMES)   # e.g. ["feat_a", "feat_b", "feat_c", "feat_d"]
        duped_names[-1] = duped_names[0]    # → ["feat_a", "feat_b", "feat_c", "feat_a"]
        df_dup = pd.DataFrame(data, columns=duped_names)
        # Sanity: columns actually contain a duplicate
        assert df_dup.columns.duplicated().any(), "Test setup error: columns not duplicated"
        with pytest.raises(SchemaValidationError):
            validator.validate(df_dup)
