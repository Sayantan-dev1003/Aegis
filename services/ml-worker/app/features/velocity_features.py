import time
import logging
from typing import Optional
from app.config.redis_client import get_redis_client

logger = logging.getLogger(__name__)

def compute_redis_features(account_id: str, device_id: Optional[str]) -> dict:
    """
    Computes velocity features using a single Redis pipeline to minimize latency.
    """
    rdb = get_redis_client()
    if rdb is None:
        logger.warning("Redis unavailable, returning default values for velocity features")
        return {"txn_velocity_1h": 0, "txn_velocity_24h": 0, "device_seen_before": 0}
    
    try:
        now = time.time()
        pipe = rdb.pipeline()
        
        # ZCOUNT for 1h and 24h.
        # Note: The ML worker consumes from `transactions.raw` AFTER the Go ingestor has already 
        # written this transaction to Redis. Therefore, this ZCOUNT includes the current transaction 
        # (count = N). The models were trained assuming the current transaction is included.
        txn_key = f"acct:{account_id}:txns"
        pipe.zcount(txn_key, now - 3600, now)
        pipe.zcount(txn_key, now - 86400, now)
        
        # SISMEMBER for device
        if device_id:
            device_key = f"acct:{account_id}:devices"
            pipe.sismember(device_key, device_id)
            
        results = pipe.execute()
        
        # If device_id is present, results has 3 elements. Otherwise, 2.
        txn_velocity_1h = int(results[0])
        txn_velocity_24h = int(results[1])
        device_seen_before = int(bool(results[2])) if device_id else 0
        
        return {
            "txn_velocity_1h": txn_velocity_1h,
            "txn_velocity_24h": txn_velocity_24h,
            "device_seen_before": device_seen_before,
        }
    except Exception as e:
        logger.warning(f"Redis pipeline failed: {e}")
        return {"txn_velocity_1h": 0, "txn_velocity_24h": 0, "device_seen_before": 0}
