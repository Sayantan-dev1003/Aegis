import os
import json
import logging
import time
from typing import Any, Optional
from app.config.redis_client import get_redis_client

logger = logging.getLogger(__name__)

_fallback_config: dict = {}
_fallback_loaded_at: float = 0

def _load_fallback_config() -> dict:
    global _fallback_config, _fallback_loaded_at
    config_path = os.path.join(os.path.dirname(__file__), "feature_config.json")
    try:
        with open(config_path, "r") as f:
            _fallback_config = json.load(f)
            _fallback_loaded_at = time.time()
            logger.info(f"Loaded fallback config from {config_path}")
    except Exception as e:
        logger.error(f"Failed to load fallback config: {e}")
        _fallback_config = {"fraud_threshold": 0.42}  # absolute last resort
    return _fallback_config


def get_config_value(key: str, default: Any = None) -> Optional[str]:
    """
    Fetch config value from Redis (matching Go's aegis:config:<key> cache key).
    Falls back to feature_config.json on Redis miss or error.
    """
    rdb = get_redis_client()
    if rdb is not None:
        try:
            cache_key = f"aegis:config:{key}"
            val = rdb.get(cache_key)
            if val is not None:
                return val  # Redis hit (decode_responses=True, already a string)
            # Redis miss — value not cached yet
            logger.debug(f"Config cache miss for key={key}, using fallback")
        except Exception as e:
            logger.warning(f"Redis config fetch failed key={key}: {e}")
    
    # Fallback to JSON file
    if not _fallback_config:
        _load_fallback_config()
    
    val = _fallback_config.get(key)
    if val is not None:
        return str(val)
    
    if default is not None:
        return str(default)
    
    return None


def get_config_float(key: str, default: float) -> float:
    val = get_config_value(key, default)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        logger.error(f"Config value for key={key} not parseable as float: {val!r}")
        return default
