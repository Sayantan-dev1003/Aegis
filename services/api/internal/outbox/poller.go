package outbox

import (
	"context"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"

	"github.com/Sayantan-dev1003/aegis/api/internal/kafka"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// Poller polls the outbox table for unpublished events and publishes them to Kafka.
type Poller struct {
	repo     *repository.OutboxRepository
	producer *kafka.Producer
}

// NewPoller creates a new Poller.
func NewPoller(repo *repository.OutboxRepository, producer *kafka.Producer) *Poller {
	return &Poller{
		repo:     repo,
		producer: producer,
	}
}

// Start begins the background polling loop. It blocks until the context is canceled.
func (p *Poller) Start(ctx context.Context) {
	logger.FromContext(ctx).Info().Msg("Starting Outbox Poller...")
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			logger.FromContext(ctx).Info().Msg("Shutting down Outbox Poller...")
			return
		case <-ticker.C:
			p.processBatch(ctx)
		}
	}
}

func (p *Poller) processBatch(ctx context.Context) {
	// 1. Fetch unpublished events
	events, err := p.repo.GetUnpublished(ctx, 100)
	if err != nil {
		logger.FromContext(ctx).Error().Err(err).Msg("Failed to fetch unpublished events")
		return
	}

	if len(events) == 0 {
		return // Nothing to do
	}

	// 2. Process each event
	for _, event := range events {
		// EventType serves as the topic in this pattern (e.g., transactions.raw)
		topic := event.EventType
		key := []byte(event.AggregateID)
		value := event.Payload
		
		// Create a span for the publish action
		tracer := otel.GetTracerProvider().Tracer("aegis/outbox-poller")
		pubCtx, span := tracer.Start(ctx, "outbox.publish", trace.WithSpanKind(trace.SpanKindProducer))
		span.End()

		// Publish to Kafka (headers handled in producer but we pass it)
		// Wait, the producer.Produce method currently doesn't take headers directly.
		// Let me check how producer.Produce is implemented... Wait, the prompt says:
		// "Then in the outbox poller, when building the Kafka message headers: propagator := otel.GetTextMapPropagator(); carrier := KafkaHeaderCarrier{headers: &msg.Headers}; propagator.Inject(ctx, carrier)"
		// If producer.Produce doesn't take headers, I'll need to modify it or do it differently.
		// I will just modify producer.Produce if it doesn't take headers, but it takes map[string]string for headers!
		
		headers := map[string]string{
			"event_id": event.ID,
		}
		
		propagator := otel.GetTextMapPropagator()
		// Inject into map directly since it's a map
		propagator.Inject(pubCtx, propagation.MapCarrier(headers))

		err := p.producer.Produce(pubCtx, topic, key, value, headers)
		if err != nil {
			logger.FromContext(ctx).Error().Err(err).
				Str("event_id", event.ID).
				Str("topic", topic).
				Msg("Failed to publish event to Kafka, will retry next cycle")
			// Stop processing this batch to preserve ordering for the failed aggregate/topic,
			// or continue to next event depending on requirements. Continuing to avoid blocking everything.
			continue
		}

		// On ACK: Mark as published
		if err := p.repo.MarkPublished(ctx, event.ID); err != nil {
			logger.FromContext(ctx).Error().Err(err).
				Str("event_id", event.ID).
				Msg("Failed to mark event as published in database")
			// Event might be re-published next cycle, causing a duplicate,
			// which is acceptable in at-least-once delivery semantics.
		} else {
			logger.FromContext(ctx).Debug().
				Str("event_id", event.ID).
				Str("topic", topic).
				Msg("Successfully published outbox event")
		}
	}
}
