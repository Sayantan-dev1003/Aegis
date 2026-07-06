from __future__ import annotations

import math
from dataclasses import dataclass

import redis

from app.monitoring.logger import get_logger
from app.monitoring.metrics import ml_redis_fallback_total
from app.config.constants import (
    REDIS_KEY_TTL_SEC,
    REDIS_PREFIX_CARD,
    REDIS_PREFIX_DEVICE,
    REDIS_PREFIX_ADDR,
    REDIS_PREFIX_EMAIL,
)

logger = get_logger(__name__)


@dataclass
class VelocityState:
    transaction_per_card: int | float
    card_frequency: int | float
    card_time_diff: float


class StateStore:
    """Redis client wrapper for velocity feature computation."""

    def __init__(self, redis_client: redis.Redis) -> None:
        self.redis = redis_client

    def get_card_velocity(self, card1: str, timestamp: float) -> VelocityState:
        """
        Atomically increments transaction count and records timestamp for card1.
        Returns (transaction_per_card, card_frequency, card_time_diff).

        Note: transaction_per_card and card_frequency are both the cumulative INCR
        count — an accepted approximation of the training offline cumcount/transform.
        """
        try:
            count_key = f"{REDIS_PREFIX_CARD}{card1}:count"
            ts_key = f"{REDIS_PREFIX_CARD}{card1}:last_ts"

            pipe = self.redis.pipeline()
            pipe.incr(count_key)
            pipe.get(ts_key)
            pipe.set(ts_key, str(timestamp))
            pipe.expire(count_key, REDIS_KEY_TTL_SEC)
            pipe.expire(ts_key, REDIS_KEY_TTL_SEC)

            results = pipe.execute()

            count = results[0]
            last_ts_raw = results[1]

            if last_ts_raw is None:
                time_diff = float("nan")
            else:
                time_diff = timestamp - float(last_ts_raw)

            return VelocityState(
                transaction_per_card=count,
                card_frequency=count,
                card_time_diff=time_diff,
            )
        except redis.RedisError as e:
            logger.warning("redis_error", feature="card_velocity", error=str(e))
            ml_redis_fallback_total.labels(feature="card_velocity").inc()
            return VelocityState(float("nan"), float("nan"), float("nan"))

    def get_device_velocity(self, device_info: str) -> int | float:
        try:
            key = f"{REDIS_PREFIX_DEVICE}{device_info}:count"
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, REDIS_KEY_TTL_SEC)
            results = pipe.execute()
            return results[0]
        except redis.RedisError as e:
            logger.warning("redis_error", feature="Transaction_Per_Device", error=str(e))
            ml_redis_fallback_total.labels(feature="Transaction_Per_Device").inc()
            return float("nan")

    def get_address_frequency(self, addr1: str) -> int | float:
        try:
            key = f"{REDIS_PREFIX_ADDR}{addr1}:count"
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, REDIS_KEY_TTL_SEC)
            results = pipe.execute()
            return results[0]
        except redis.RedisError as e:
            logger.warning("redis_error", feature="Address_Frequency", error=str(e))
            ml_redis_fallback_total.labels(feature="Address_Frequency").inc()
            return float("nan")

    def get_email_count(self, email_domain: str) -> int | float:
        if not email_domain or not isinstance(email_domain, str):
            return float("nan")

        try:
            key = f"{REDIS_PREFIX_EMAIL}{email_domain}:count"
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, REDIS_KEY_TTL_SEC)
            results = pipe.execute()
            return results[0]
        except redis.RedisError as e:
            logger.warning("redis_error", feature="Email_Transaction_Count", error=str(e))
            ml_redis_fallback_total.labels(feature="Email_Transaction_Count").inc()
            return float("nan")
