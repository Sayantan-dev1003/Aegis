from __future__ import annotations

# Kafka retries
KAFKA_MAX_RETRIES = 3
KAFKA_BACKOFF_BASE_SEC = 1.0
KAFKA_BACKOFF_CAP_SEC = 30.0

# SHAP
SHAP_MAX_FEATURES = 10

# Thresholds
DEFAULT_FRAUD_THRESHOLD = 0.38

# Redis
REDIS_KEY_TTL_SEC = 30 * 24 * 60 * 60  # 30 days
REDIS_PREFIX_CARD = "vel:card:"
REDIS_PREFIX_DEVICE = "vel:device:"
REDIS_PREFIX_ADDR = "vel:addr:"
REDIS_PREFIX_EMAIL = "vel:email:"
