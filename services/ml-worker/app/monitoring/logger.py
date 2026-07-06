from __future__ import annotations

import logging
import structlog
from typing import Any, MutableMapping

from app.monitoring.tracing import get_trace_id


def add_service_name(
    logger: logging.Logger, method_name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    event_dict["service"] = "fraud-ml-worker"
    return event_dict


def add_trace_id(
    logger: logging.Logger, method_name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    """Automatically binds the current OpenTelemetry trace_id to every log record."""
    trace_id = get_trace_id()
    if trace_id:
        event_dict["trace_id"] = trace_id
    return event_dict


def configure_logger() -> None:
    """Configures structlog to output JSON with standard keys."""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            add_service_name,
            add_trace_id,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to pass through to structlog
    logging.basicConfig(format="%(message)s", level=logging.INFO)


def get_logger(name: str | None = None) -> structlog.BoundLogger:
    """Returns a structlog bound logger."""
    return structlog.get_logger(name)
