import os
import logging
from typing import Dict, Any
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.propagate import extract, inject, set_global_textmap
from opentelemetry.propagators.composite import CompositePropagator
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from opentelemetry.baggage.propagation import W3CBaggagePropagator

logger = logging.getLogger(__name__)

_tracer: trace.Tracer = None

def setup_tracing() -> trace.Tracer:
    global _tracer
    if _tracer is not None:
        return _tracer
    
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")
    endpoint = endpoint.replace("http://", "").replace("https://", "")
    service_name = os.environ.get("OTEL_SERVICE_NAME", "aegis-ml-worker")
    
    resource = Resource.create({
        SERVICE_NAME: service_name,
        SERVICE_VERSION: "1.0.0",
        "deployment.environment": os.environ.get("DEPLOYMENT_ENV", "development"),
    })
    
    try:
        exporter = OTLPSpanExporter(
            endpoint=endpoint,
            insecure=True,
        )
        processor = BatchSpanProcessor(
            exporter,
            max_export_batch_size=512,
            export_timeout_millis=5000,
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(processor)
        trace.set_tracer_provider(provider)
        
        set_global_textmap(CompositePropagator(propagators=[
            TraceContextTextMapPropagator(),
            W3CBaggagePropagator(),
        ]))
        
        _tracer = trace.get_tracer("aegis.ml-worker")
        logger.info(f"OTel tracer initialised, endpoint={endpoint}")
    except Exception as e:
        logger.error(f"Failed to initialise OTel tracer: {e}")
        _tracer = trace.get_tracer("aegis.ml-worker.noop")
    
    return _tracer

def get_tracer() -> trace.Tracer:
    global _tracer
    if _tracer is None:
        return setup_tracing()
    return _tracer

def extract_trace_context(headers: Dict[str, str]) -> Any:
    # We don't actually need to return a context object to the caller unless they use it
    # But let's attach the extracted context to the current context.
    # Python otel uses context vars natively.
    ctx = extract(headers)
    import opentelemetry.context as otel_context
    otel_context.attach(ctx)
    return ctx

def inject_trace_context(headers: Dict[str, str]) -> Dict[str, str]:
    inject(headers)
    return headers
