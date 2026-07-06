from __future__ import annotations

import time
import traceback
from typing import Any

import redis

from app.runtime.container import container
from app.kafka.dlq import build_dlq_payload
from app.exceptions import (
    ArtifactLoadError,
    ArtifactVersionError,
    FeatureEngineeringError,
    KafkaProducerError,
    SchemaValidationError,
    SHAPError,
)
from app.monitoring.logger import get_logger
from app.monitoring.metrics import (
    ml_inference_errors_total,
    ml_prediction_total,
    ml_fraud_total,
    ml_inference_latency_seconds,
)
from app.monitoring.tracing import extract_trace_context, inject_trace_context
from app.config.constants import KAFKA_MAX_RETRIES, KAFKA_BACKOFF_BASE_SEC, KAFKA_BACKOFF_CAP_SEC

logger = get_logger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Permanent failure classification
# ──────────────────────────────────────────────────────────────────────────────
# These exception types represent deterministic failures: re-processing the same
# message will produce the same error.  Retry adds latency with no benefit.
# Route straight to DLQ on first occurrence.
_PERMANENT_ERROR_TYPES = (
    SchemaValidationError,   # Malformed or schema-violating payload
    ArtifactLoadError,       # Artifact integrity issue (should not reach here normally)
    ArtifactVersionError,    # Ditto
    FeatureEngineeringError, # Deterministic feature computation bug
    SHAPError,               # SHAP crash — usually a model/feature mismatch
    TypeError,               # Programming error / wrong type
    ValueError,              # Invalid literal / value
    AttributeError,          # Programming error
    KeyError,                # Missing required key — deterministic
)

# Transient failures that MAY succeed on retry:
# redis.RedisError, KafkaProducerError, OSError, TimeoutError, ConnectionError, generic Exception


def _is_permanent(exc: BaseException) -> bool:
    return isinstance(exc, _PERMANENT_ERROR_TYPES)


class Processor:
    """Pure orchestration — zero Kafka internals, zero ML logic."""

    @staticmethod
    def process(raw_message: dict[str, Any], headers: dict[str, str], key: str) -> None:
        """
        Processes a single Kafka message through the full inference pipeline.

        Retry policy
        ------------
        Permanent errors (schema, artifact, programming bugs) bypass all retries
        and route directly to the DLQ.

        Transient errors (Redis down, Kafka producer timeout, etc.) are retried
        up to KAFKA_MAX_RETRIES times with exponential backoff.

        Offset commit responsibility
        ----------------------------
        This method returns normally on success.  On permanent terminal failure
        it also returns normally (after routing to DLQ) so the caller can commit
        the offset and move on.  Transient failures that exhaust retries do the
        same.  The caller should NOT commit the offset if this method raises —
        though currently it returns rather than raises after DLQ routing.
        """
        if not container.is_ready:
            raise RuntimeError("Runtime container not ready.")

        if not (
            container.feature_pipeline
            and container.inference_engine
            and container.decision_engine
            and container.shap_explainer
            and container.kafka_producer
        ):
            raise RuntimeError("Pipeline components not initialised in container.")

        extract_trace_context(headers)

        transaction_id = str(raw_message.get("TransactionID", key))

        attempt = 0
        last_exc: BaseException | None = None

        while attempt <= KAFKA_MAX_RETRIES:
            try:
                inference_start = time.time()

                # ── 1. Full inference pipeline ────────────────────────────────
                feature_df = container.feature_pipeline.run(raw_message)
                prediction = container.inference_engine.predict(feature_df)
                decision = container.decision_engine.decide(
                    prediction, start_time=inference_start
                )
                shap_result = container.shap_explainer.explain(
                    feature_df, prediction_probability=decision.probability
                )

                # ── 2. Record latency metric ──────────────────────────────────
                ml_inference_latency_seconds.observe(decision.latency_ms / 1000.0)

                # ── 3. Increment prediction counters ──────────────────────────
                ml_prediction_total.labels(is_fraud=str(decision.is_fraud)).inc()
                if decision.is_fraud:
                    ml_fraud_total.inc()

                # ── 4. Build and publish result ───────────────────────────────
                result_payload = {
                    "transaction_id": transaction_id,
                    "is_fraud": decision.is_fraud,
                    "fraud_score": decision.probability,
                    "raw_score": decision.raw_probability,
                    "threshold": decision.threshold,
                    "confidence": decision.confidence_level,
                    "top_features": shap_result.top_features,
                    "prediction_probability": shap_result.prediction_probability,
                    "model_version": decision.model_version,
                    "pipeline_version": decision.pipeline_version,
                    "latency_ms": decision.latency_ms,
                }

                out_headers = inject_trace_context(headers.copy())
                container.kafka_producer.publish_scored(result_payload, transaction_id, out_headers)
                return  # ← success; caller commits offset

            except BaseException as exc:
                last_exc = exc

                if _is_permanent(exc):
                    # ── Permanent failure: skip retries, go to DLQ ────────────
                    logger.error(
                        "permanent_failure_routing_to_dlq",
                        transaction_id=transaction_id,
                        error_type=type(exc).__name__,
                        error=str(exc),
                    )
                    ml_inference_errors_total.labels(error_type=type(exc).__name__).inc()
                    _send_to_dlq(raw_message, transaction_id, exc, headers, retry_count=0)
                    return  # ← DLQ sent; caller commits offset (poison pill gone)

                # ── Transient failure: apply backoff then retry ────────────────
                attempt += 1
                logger.warning(
                    "transient_inference_failure",
                    transaction_id=transaction_id,
                    attempt=attempt,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )
                ml_inference_errors_total.labels(error_type=type(exc).__name__).inc()

                if attempt > KAFKA_MAX_RETRIES:
                    break

                backoff = min(
                    KAFKA_BACKOFF_BASE_SEC * (2 ** (attempt - 1)), KAFKA_BACKOFF_CAP_SEC
                )
                time.sleep(backoff)

        # ── Exhausted retries ─────────────────────────────────────────────────
        logger.error(
            "max_retries_exceeded_routing_to_dlq",
            transaction_id=transaction_id,
            attempts=attempt,
        )
        _send_to_dlq(raw_message, transaction_id, last_exc, headers, retry_count=KAFKA_MAX_RETRIES)
        # Return normally so caller commits offset — message is in DLQ.


def _send_to_dlq(
    raw_message: dict[str, Any],
    transaction_id: str,
    exc: BaseException | None,
    headers: dict[str, str],
    retry_count: int,
) -> None:
    """Builds and publishes the DLQ payload. Swallows DLQ publish errors to avoid loops."""
    if not container.kafka_producer:
        logger.error("dlq_publish_skipped_no_producer", transaction_id=transaction_id)
        return

    dlq_payload = build_dlq_payload(
        original_payload=raw_message,
        transaction_id=transaction_id,
        error_type=type(exc).__name__ if exc else "Unknown",
        error_message=str(exc) if exc else "Unknown error",
        stack_trace=traceback.format_exc(),
        retry_count=retry_count,
        trace_id=headers.get("traceparent"),
        deployment_config=container.artifacts.deployment_config if container.artifacts else {},
    )

    try:
        container.kafka_producer.publish_dlq(dlq_payload, transaction_id, headers)
    except Exception as dlq_exc:
        logger.critical(
            "dlq_publish_failed",
            transaction_id=transaction_id,
            error=str(dlq_exc),
        )
