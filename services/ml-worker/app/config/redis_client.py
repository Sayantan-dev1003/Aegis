import os
import redis
import logging

logger = logging.getLogger(__name__)

_redis_client = None

def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    
    redis_url = os.environ.get("REDIS_URL")
    redis_host = os.environ.get("REDIS_HOST", "localhost")
    redis_port = int(os.environ.get("REDIS_PORT", "6379"))
    redis_password = os.environ.get("REDIS_PASSWORD", "")
    redis_db = int(os.environ.get("REDIS_DB", "0"))
    
    try:
        if redis_url:
            _redis_client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=1,
                retry_on_timeout=True,
            )
        else:
            _redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                password=redis_password if redis_password else None,
                db=redis_db,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=1,
                retry_on_timeout=True,
            )
        _redis_client.ping()
        logger.info("Redis connection established for ML worker")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        _redis_client = None
    
    return _redis_client
