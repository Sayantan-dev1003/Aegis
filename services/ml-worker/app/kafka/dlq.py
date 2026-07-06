from __future__ import annotations

from typing import Any
from datetime import datetime

from app.monitoring.metrics import ml_dlq_total

def build_dlq_payload(
    original_payload: dict[str, Any],
    transaction_id: str,
    error_type: str,
    error_message: str,
    stack_trace: str,
    retry_count: int,
    trace_id: str | None,
    deployment_config: dict[str, Any]
) -> dict[str, Any]:
    """Builds an enriched payload for the dead-letter queue and increments metric."""
    ml_dlq_total.inc()
    
    return {
        "transaction_id": transaction_id,
        "original_payload": original_payload,
        "error_type": error_type,
        "error_message": error_message,
        "stack_trace": stack_trace,
        "retry_count": retry_count,
        "worker_version": deployment_config.get("runtime", {}).get("pipeline_version", "unknown"),
        "deployment_version": deployment_config.get("deployment_id", "unknown"),
        "pipeline_version": deployment_config.get("runtime", {}).get("pipeline_version", "unknown"),
        "model_version": deployment_config.get("runtime", {}).get("model_version", "unknown"),
        "failed_at": datetime.utcnow().isoformat() + "Z",
        "trace_id": trace_id
    }
