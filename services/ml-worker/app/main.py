from __future__ import annotations

import sys
import signal
import threading
import uvicorn
import redis
import atexit

from opentelemetry import trace

from app.monitoring.logger import configure_logger, get_logger
from app.monitoring.tracing import setup_tracing
from app.config.config import get_config
from app.runtime.container import container
from app.runtime.state_store import StateStore
from app.inference.artifact_loader import ArtifactLoader
from app.inference.predictor import InferenceEngine, DecisionEngine
from app.inference.shap_explainer import SHAPExplainer
from app.features.pipeline import FeaturePipeline
from app.kafka.producer import AegisProducer
from app.consumer.consumer import AegisConsumer
from app.consumer.processor import Processor
from app.api.health import api
from app.exceptions import ArtifactLoadError, RedisStateError, KafkaProducerError, KafkaConsumerError
from confluent_kafka import KafkaException

logger = get_logger(__name__)

def bootstrap() -> None:
    try:
        # 1. Logger
        configure_logger()
        logger.info("bootstrap_started")
        
        # 2. Config & Tracing
        config = get_config()
        setup_tracing()

        # 3. Artifact Validation
        logger.info("loading_artifacts")
        loader = ArtifactLoader()
        container.artifacts = loader.load()
        container.health_state["model_loaded"] = True
        container.health_state["preprocessing_loaded"] = True
        
        # 4. Redis Connect
        logger.info("connecting_redis")
        rc = redis.Redis.from_url(config.settings.REDIS_URL, decode_responses=True)
        rc.ping()
        container.redis_client = rc
        state_store = StateStore(rc)
        container.health_state["redis_ready"] = True
        
        # 5. Initialize Pipeline
        logger.info("initializing_pipeline")
        container.feature_pipeline = FeaturePipeline(container.artifacts, state_store)
        container.inference_engine = InferenceEngine(container.artifacts)
        container.decision_engine = DecisionEngine(container.artifacts)
        container.shap_explainer = SHAPExplainer(container.artifacts)
        container.health_state["shap_ready"] = True
        
        # 6. Initialize Kafka
        logger.info("initializing_kafka")
        container.kafka_producer = AegisProducer()
        
        # Verify Kafka connectivity before marking as ready
        try:
            container.kafka_producer.producer.list_topics(timeout=5.0)
        except Exception as e:
            raise KafkaProducerError(f"Kafka broker unreachable: {e}")

        container.kafka_consumer = AegisConsumer(Processor.process)
        container.health_state["kafka_ready"] = True
        
        logger.info("bootstrap_complete", is_ready=container.is_ready)
    except ArtifactLoadError as e:
        logger.critical("bootstrap_failed_artifact_load", error=str(e))
        sys.exit(1)
    except (redis.RedisError, RedisStateError) as e:
        logger.critical("bootstrap_failed_redis", error=str(e))
        sys.exit(1)
    except (KafkaProducerError, KafkaConsumerError, KafkaException) as e:
        logger.critical("bootstrap_failed_kafka", error=str(e))
        sys.exit(1)
    except Exception as e:
        logger.critical("bootstrap_failed_unknown", error=str(e))
        sys.exit(1)

def init_background():
    bootstrap()
    # Start consumer in this background thread
    if hasattr(container, 'kafka_consumer') and container.kafka_consumer:
        container.kafka_consumer.start()

def main() -> None:
    # Start background initialization thread
    bg_thread = threading.Thread(target=init_background, daemon=True)
    bg_thread.start()

    # Graceful shutdown handler
    def handle_sigterm(signum, frame):
        logger.info("sigterm_received_shutting_down")
        
        container.health_state["kafka_ready"] = False
        container.health_state["redis_ready"] = False
        container.health_state["model_loaded"] = False
        
        if container.kafka_consumer:
            container.kafka_consumer.stop()
        bg_thread.join(timeout=30.0)
        if container.kafka_producer:
            container.kafka_producer.close(timeout=5.0)
        if container.redis_client:
            container.redis_client.close()
            
        provider = trace.get_tracer_provider()
        if hasattr(provider, "shutdown"):
            provider.shutdown()
            
        sys.exit(0)
        
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)
    
    def shutdown_tracer():
        provider = trace.get_tracer_provider()
        if hasattr(provider, "shutdown"):
            provider.shutdown()
            
    atexit.register(shutdown_tracer)
    
    # Run FastAPI server for health/metrics
    config = get_config()
    uvicorn.run(api, host="0.0.0.0", port=config.settings.METRICS_PORT, log_level="warning")

if __name__ == "__main__":
    main()
