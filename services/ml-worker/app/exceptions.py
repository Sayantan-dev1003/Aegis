from __future__ import annotations

class AegisBaseError(Exception):
    """Base exception for Aegis ML Worker errors."""
    def __init__(self, message: str, transaction_id: str | None = None, trace_id: str | None = None):
        super().__init__(message)
        self.message = message
        self.transaction_id = transaction_id
        self.trace_id = trace_id

class ArtifactLoadError(AegisBaseError):
    """Raised when an artifact fails to load."""
    pass

class ArtifactVersionError(ArtifactLoadError):
    """Raised when an artifact version mismatch is detected."""
    pass

class SchemaValidationError(AegisBaseError):
    """Raised when the input dataframe fails schema validation."""
    pass

class FeatureEngineeringError(AegisBaseError):
    """Raised when feature engineering fails."""
    pass

class InferenceError(AegisBaseError):
    """Raised during model prediction failures."""
    pass

class SHAPError(AegisBaseError):
    """Raised during SHAP explanation failures."""
    pass

class KafkaProducerError(AegisBaseError):
    """Raised when a message cannot be published to Kafka."""
    pass

class KafkaConsumerError(AegisBaseError):
    """Raised on unrecoverable Kafka consumption errors."""
    pass

class DLQError(AegisBaseError):
    """Raised when the dead letter queue handler fails."""
    pass

class RedisStateError(AegisBaseError):
    """Raised during Redis state retrieval or update failures."""
    pass
