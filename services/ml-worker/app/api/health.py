from __future__ import annotations

import json
from fastapi import FastAPI, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.runtime.container import container

api = FastAPI(title="Aegis ML Worker API")


@api.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@api.get("/live")
def liveness() -> dict[str, str]:
    return {"status": "live"}


@api.get("/ready")
def readiness() -> Response:
    """
    Returns the full health state so operators can see exactly which
    subsystem is not yet ready (model, redis, kafka, etc.).

    HTTP 200 when ready=true, HTTP 503 otherwise.
    """
    ready = container.is_ready
    body = {
        "ready": ready,
        "health_state": container.health_state,
    }
    return Response(
        content=json.dumps(body),
        media_type="application/json",
        status_code=200 if ready else 503,
    )


@api.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@api.get("/version")
def version() -> dict:
    """
    Returns complete version and deployment metadata for operational visibility.
    """
    if container.artifacts:
        a = container.artifacts
        dc = a.deployment_config
        threshold_block = dc.get("threshold", {})
        threshold_value = (
            threshold_block.get("value", a.threshold)
            if isinstance(threshold_block, dict)
            else float(threshold_block)
        )
        return {
            "model_version": a.model_version,
            "pipeline_version": a.pipeline_version,
            "threshold": threshold_value,
            "deployment_version": getattr(a, "deployment_version", dc.get("deployment_version", "unknown")),
            "deployment_id": getattr(a, "deployment_id", dc.get("deployment_id", "unknown")),
            "calibration_method": getattr(a, "calibration_method", dc.get("calibration", {}).get("method", "unknown")),
            "loaded_at": a.loaded_at.isoformat() + "Z",
        }
    return {"model_version": "unknown", "pipeline_version": "unknown"}
