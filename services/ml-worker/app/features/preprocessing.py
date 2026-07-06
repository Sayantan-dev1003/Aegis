from __future__ import annotations

import pandas as pd

from app.inference.artifact_loader import RuntimeArtifacts
from app.monitoring.logger import get_logger

logger = get_logger(__name__)


class Preprocessor:
    """Applies fitted imputer, always preserving the original input column names."""

    def __init__(self, artifacts: RuntimeArtifacts) -> None:
        self.imputer = artifacts.imputer

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        # Capture original columns BEFORE transform.
        # get_feature_names_out() on a ColumnTransformer may prefix column names
        # (e.g. "remainder__TransactionAmt"), which would break all downstream lookups.
        # The imputer only fills gaps — it never adds or removes columns — so the
        # original column list is always the correct one to reconstruct with.
        original_cols = df.columns.tolist()

        transformed_data = self.imputer.transform(df)

        if transformed_data.shape[1] != len(original_cols):
            raise ValueError(
                f"Imputer changed column count: expected {len(original_cols)}, "
                f"got {transformed_data.shape[1]}. This indicates an unexpected "
                "ColumnTransformer configuration."
            )

        return pd.DataFrame(transformed_data, columns=original_cols, index=df.index)
