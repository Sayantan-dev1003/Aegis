from __future__ import annotations

import json
from typing import Any
from confluent_kafka import Producer

from app.config.config import get_config
from app.monitoring.logger import get_logger
from app.monitoring.metrics import ml_kafka_publish_duration_seconds
from app.exceptions import KafkaProducerError

logger = get_logger(__name__)


class AegisProducer:
    """Production-grade Kafka producer wrapping confluent_kafka.Producer."""

    def __init__(self) -> None:
        config = get_config()
        self.producer = Producer(
            {
                "bootstrap.servers": config.settings.KAFKA_BROKERS,
                "acks": "all",
                "enable.idempotence": True,
                "compression.type": "gzip",
                "linger.ms": 5,
                "batch.size": 32768,
                "max.in.flight.requests.per.connection": 5,
                "retries": 5,
            }
        )
        self.topic_scored = config.settings.KAFKA_TOPIC_SCORED
        self.topic_dlq = config.settings.KAFKA_TOPIC_DLQ

    def _delivery_report(self, err: Any, msg: Any) -> None:
        if err is not None:
            logger.error("kafka_delivery_failed", error=str(err), topic=msg.topic())
        else:
            logger.debug(
                "kafka_delivery_success",
                topic=msg.topic(),
                partition=msg.partition(),
                offset=msg.offset(),
            )

    def publish_scored(
        self, result: dict[str, Any], key: str, headers: dict[str, str] | None = None
    ) -> None:
        self._publish(self.topic_scored, result, key, headers)

    def publish_dlq(
        self, payload: dict[str, Any], key: str, headers: dict[str, str] | None = None
    ) -> None:
        self._publish(self.topic_dlq, payload, key, headers)

    def _publish(
        self,
        topic: str,
        payload: dict[str, Any],
        key: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        with ml_kafka_publish_duration_seconds.labels(topic=topic).time():
            try:
                kafka_headers = (
                    [(k, v.encode("utf-8")) for k, v in headers.items()] if headers else None
                )
                self.producer.produce(
                    topic=topic,
                    key=key.encode("utf-8") if key else None,
                    value=json.dumps(payload).encode("utf-8"),
                    headers=kafka_headers,
                    on_delivery=self._delivery_report,
                )
                self.producer.poll(0)
            except Exception as e:
                raise KafkaProducerError(f"Failed to publish to {topic}: {e}")

    def flush(self, timeout: float = 30.0) -> None:
        """Blocks until all outstanding messages are delivered or timeout expires."""
        self.producer.flush(timeout)

    def close(self, timeout: float = 30.0) -> None:
        """Alias for flush — use this for explicit shutdown in signal handlers."""
        self.producer.flush(timeout)
        logger.info("kafka_producer_closed")
