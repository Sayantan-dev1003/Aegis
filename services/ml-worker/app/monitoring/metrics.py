from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

ml_inference_latency_seconds = Histogram("ml_inference_latency_seconds", "Latency of full inference pipeline")
ml_feature_engineering_duration_seconds = Histogram("ml_feature_engineering_duration_seconds", "Latency of feature engineering")
ml_shap_duration_seconds = Histogram("ml_shap_duration_seconds", "Latency of SHAP explainer")

ml_kafka_publish_duration_seconds = Histogram("ml_kafka_publish_duration_seconds", "Latency of Kafka publish", ["topic"])
ml_kafka_consume_duration_seconds = Histogram("ml_kafka_consume_duration_seconds", "Latency of Kafka consume loop")

ml_prediction_total = Counter("ml_prediction_total", "Total predictions made", ["is_fraud"])
ml_fraud_total = Counter("ml_fraud_total", "Total fraud predictions made")
ml_inference_errors_total = Counter("ml_inference_errors_total", "Total inference errors", ["error_type"])
ml_dlq_total = Counter("ml_dlq_total", "Total dead letter queue publishes")

ml_consumer_lag = Gauge("ml_consumer_lag", "Kafka consumer lag", ["partition"])
ml_startup_duration_seconds = Gauge("ml_startup_duration_seconds", "Startup duration")
ml_model_load_duration_seconds = Gauge("ml_model_load_duration_seconds", "Model load duration")
ml_artifact_validation_duration_seconds = Gauge("ml_artifact_validation_duration_seconds", "Artifact validation duration")

ml_redis_fallback_total = Counter("ml_redis_fallback_total", "Total redis fallback occurrences", ["feature"])
ml_unknown_lookup_total = Counter("ml_unknown_lookup_total", "Total unknown categorical lookups returning NaN")
