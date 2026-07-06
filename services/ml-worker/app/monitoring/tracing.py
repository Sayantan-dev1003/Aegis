from __future__ import annotations

from opentelemetry import trace
from opentelemetry.trace import TracerProvider, Context
from opentelemetry.propagate import extract, inject

def setup_tracing() -> None:
    """Configures OpenTelemetry TracerProvider."""
    # Note: OTLP exporter and config are handled automatically by 
    # OpenTelemetry autoinstrumentation or environment variables.
    if getattr(trace.get_tracer_provider(), "get_tracer", None) is None:
        # Fallback if no global provider is set
        trace.set_tracer_provider(TracerProvider())

def extract_trace_context(headers: dict) -> Context:
    """Extracts traceparent from Kafka headers."""
    return extract(headers)

def inject_trace_context(headers: dict) -> dict:
    """Injects traceparent into Kafka headers."""
    inject(headers)
    return headers

def get_trace_id() -> str | None:
    """Returns current span's trace ID for structlog binding."""
    span = trace.get_current_span()
    if span and span.get_span_context().is_valid:
        return trace.format_trace_id(span.get_span_context().trace_id)
    return None
