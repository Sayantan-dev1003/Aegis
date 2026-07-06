from __future__ import annotations

from typing import Any

class RuntimeContainer:
    """Singleton container for all long-lived runtime objects."""
    
    def __init__(self) -> None:
        self.artifacts: Any | None = None
        self.feature_pipeline: Any | None = None
        self.inference_engine: Any | None = None
        self.decision_engine: Any | None = None
        self.shap_explainer: Any | None = None
        self.redis_client: Any | None = None
        self.kafka_producer: Any | None = None
        self.kafka_consumer: Any | None = None
        
        self.health_state = {
            "model_loaded": False,
            "preprocessing_loaded": False,
            "redis_ready": False,
            "kafka_ready": False,
            "shap_ready": False,
        }

    @property
    def is_ready(self) -> bool:
        """Returns True only when all health_state flags are True."""
        return all(self.health_state.values())

# Global singleton instance
container = RuntimeContainer()
