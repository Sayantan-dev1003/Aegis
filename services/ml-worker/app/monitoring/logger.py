import os
import logging
import structlog
from opentelemetry import trace

def add_trace_context(logger, method, event_dict):
    """
    structlog processor that injects OTel trace_id and span_id
    into every log entry automatically.
    """
    span = trace.get_current_span()
    if span and span.get_span_context().is_valid:
        ctx = span.get_span_context()
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict

def add_service_context(logger, method, event_dict):
    event_dict["service"] = os.environ.get("OTEL_SERVICE_NAME", "aegis-ml-worker")
    return event_dict

def configure_logger():
    log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
    
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            add_service_context,
            add_trace_context,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )
    
    # Also configure stdlib logging to go through structlog
    logging.basicConfig(
        format="%(message)s",
        level=getattr(logging, log_level),
    )

def get_logger(name: str = "aegis"):
    return structlog.get_logger(name)
