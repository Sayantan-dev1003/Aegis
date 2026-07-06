from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    KAFKA_BROKERS: str
    KAFKA_TOPIC_RAW: str
    KAFKA_TOPIC_SCORED: str
    KAFKA_TOPIC_DLQ: str
    KAFKA_CONSUMER_GROUP: str

    DEPLOYMENT_DIR: str
    ARTIFACTS_DIR: str

    REDIS_URL: str

    SHAP_MAX_FEATURES: int = 10
    ML_MAX_RETRIES: int = 3

    OTEL_EXPORTER_OTLP_ENDPOINT: str
    OTEL_SERVICE_NAME_ML: str

    PROMETHEUS_PORT: int

    FRAUD_THRESHOLD: float
    AUTO_BLOCK_THRESHOLD: float

    # Confidence level distance thresholds (distance from decision threshold)
    CONFIDENCE_HIGH_THRESHOLD: float = 0.2
    CONFIDENCE_MEDIUM_THRESHOLD: float = 0.1

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
