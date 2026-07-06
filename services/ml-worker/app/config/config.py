from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from app.config.settings import Settings

class AppConfig:
    """Singleton configuration wrapping Settings with resolved Path objects."""
    
    def __init__(self) -> None:
        self.settings = Settings()
        
        self.deployment_dir = Path(self.settings.DEPLOYMENT_DIR)
        self.artifacts_dir = Path(self.settings.ARTIFACTS_DIR)
        
        # Deployment artifacts
        self.model_path = self.deployment_dir / "xgboost_model.joblib"
        self.calibrator_path = self.deployment_dir / "probability_calibrator.joblib"
        self.deployment_config_path = self.deployment_dir / "deployment_config.json"
        self.deployment_report_path = self.deployment_dir / "deployment_validation_report.json"
        self.runtime_preprocessing_path = self.deployment_dir / "runtime_preprocessing.joblib"
        
        # Training artifacts
        self.imputer_path = self.artifacts_dir / "imputer.joblib"
        self.encoder_path = self.artifacts_dir / "encoder.joblib"
        self.feature_selector_path = self.artifacts_dir / "feature_selector.joblib"

@lru_cache()
def get_config() -> AppConfig:
    """Returns the singleton AppConfig instance."""
    return AppConfig()
