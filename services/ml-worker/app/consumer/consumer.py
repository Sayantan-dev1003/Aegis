from __future__ import annotations

import json
from typing import Any, Callable

from confluent_kafka import Consumer, KafkaError
from app.config.config import get_config
from app.monitoring.logger import get_logger
from app.monitoring.metrics import ml_kafka_consume_duration_seconds
from app.exceptions import KafkaConsumerError

logger = get_logger(__name__)


class AegisConsumer:
    """Production-grade Kafka consumer wrapping confluent_kafka.Consumer."""

    def __init__(
        self, processor_callback: Callable[[dict[str, Any], dict[str, str], str], None]
    ) -> None:
        config = get_config()
        self.consumer = Consumer(
            {
                "bootstrap.servers": config.settings.KAFKA_BROKERS,
                "group.id": config.settings.KAFKA_CONSUMER_GROUP,
                "auto.offset.reset": "earliest",
                "enable.auto.commit": False,
                "max.poll.interval.ms": 300000,
                "heartbeat.interval.ms": 3000,
                "session.timeout.ms": 30000,
            }
        )
        self.topic = config.settings.KAFKA_TOPIC_RAW
        self.processor_callback = processor_callback
        self.running = False

        # Poison message tracking: (partition, offset) → failure_count
        self.poison_tracker: dict[tuple[int, int], int] = {}

    def _on_assign(self, consumer: Consumer, partitions: list[Any]) -> None:
        logger.info("kafka_partitions_assigned", partitions=[p.partition for p in partitions])
        consumer.assign(partitions)

    def _on_revoke(self, consumer: Consumer, partitions: list[Any]) -> None:
        logger.info("kafka_partitions_revoked", partitions=[p.partition for p in partitions])
        consumer.unassign()

    def start(self) -> None:
        """Starts the Kafka polling loop."""
        self.consumer.subscribe(
            [self.topic], on_assign=self._on_assign, on_revoke=self._on_revoke
        )
        self.running = True
        logger.info("kafka_consumer_started", topic=self.topic)

        while self.running:
            with ml_kafka_consume_duration_seconds.time():
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    continue

                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    else:
                        logger.error("kafka_consume_error", error=str(msg.error()))
                        raise KafkaConsumerError(str(msg.error()))

                # ── Extract headers ───────────────────────────────────────────
                headers: dict[str, str] = {}
                if msg.headers():
                    for k, v in msg.headers():
                        headers[k] = v.decode("utf-8") if v else ""

                key = msg.key().decode("utf-8") if msg.key() else ""

                # ── JSON decode ───────────────────────────────────────────────
                try:
                    payload = json.loads(msg.value().decode("utf-8"))
                except json.JSONDecodeError as e:
                    logger.error(
                        "kafka_poison_message",
                        partition=msg.partition(),
                        offset=msg.offset(),
                        error=str(e),
                    )
                    tracker_key = (msg.partition(), msg.offset())
                    self.poison_tracker[tracker_key] = (
                        self.poison_tracker.get(tracker_key, 0) + 1
                    )
                    if self.poison_tracker[tracker_key] >= 3:
                        logger.critical(
                            "poison_message_dlq_routed",
                            partition=msg.partition(),
                            offset=msg.offset(),
                        )
                        # Commit to discard the un-parseable message permanently
                        self.consumer.commit(asynchronous=False)
                        del self.poison_tracker[tracker_key]
                    # Do NOT commit until we have retried 3 times
                    continue

                # ── Process ───────────────────────────────────────────────────
                # at-least-once semantics: only commit the offset AFTER the
                # processor has successfully handled the message (or routed it
                # to the DLQ after retries).  If processor_callback raises, we
                # do NOT commit — Kafka will redeliver the message.
                try:
                    self.processor_callback(payload, headers, key)
                    # Processor returned normally → success or DLQ-routed.
                    # Both cases are terminal for this message; commit.
                    self.consumer.commit(asynchronous=False)
                except Exception as e:
                    # Processor raised unexpectedly (e.g. container not ready).
                    # Do NOT commit — allow redelivery.
                    logger.error(
                        "kafka_processor_raised_no_commit",
                        error=str(e),
                        partition=msg.partition(),
                        offset=msg.offset(),
                    )

    def stop(self) -> None:
        """Stops the consumer gracefully."""
        self.running = False
        self.consumer.close()
