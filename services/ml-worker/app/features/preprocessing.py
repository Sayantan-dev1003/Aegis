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
        original_cols = df.columns.tolist()

        try:
            num_features = self.imputer.transformers_[0][2]
            num_stats = self.imputer.named_transformers_["num"].statistics_
            
            cat_features = self.imputer.transformers_[1][2]
            cat_stats = self.imputer.named_transformers_["cat"].statistics_
            
            fill_dict = dict(zip(num_features, num_stats))
            fill_dict.update(dict(zip(cat_features, cat_stats)))
            
            # Fill NA in place
            df.fillna(value=fill_dict, inplace=True)
            
        except Exception as e:
            logger.error(f"Failed to manually apply imputer stats: {e}, falling back to transform")
            # If for some reason extraction fails, we can fall back (though it will likely fail on missing columns)
            transformed_data = self.imputer.transform(df)
            df = pd.DataFrame(transformed_data, columns=original_cols, index=df.index)

        return df
