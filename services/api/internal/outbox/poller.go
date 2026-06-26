package outbox

import (
	"context"
	"time"

	"github.com/rs/zerolog/log"

	"github.com/Sayantan-dev1003/aegis/api/internal/kafka"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
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
	log.Info().Msg("Starting Outbox Poller...")
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Shutting down Outbox Poller...")
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
		log.Error().Err(err).Msg("Failed to fetch unpublished events")
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

		// Publish to Kafka
		err := p.producer.Produce(ctx, topic, key, value, map[string]string{
			"event_id": event.ID,
		})
		if err != nil {
			log.Error().Err(err).
				Str("event_id", event.ID).
				Str("topic", topic).
				Msg("Failed to publish event to Kafka, will retry next cycle")
			// Stop processing this batch to preserve ordering for the failed aggregate/topic,
			// or continue to next event depending on requirements. Continuing to avoid blocking everything.
			continue
		}

		// On ACK: Mark as published
		if err := p.repo.MarkPublished(ctx, event.ID); err != nil {
			log.Error().Err(err).
				Str("event_id", event.ID).
				Msg("Failed to mark event as published in database")
			// Event might be re-published next cycle, causing a duplicate,
			// which is acceptable in at-least-once delivery semantics.
		} else {
			log.Debug().
				Str("event_id", event.ID).
				Str("topic", topic).
				Msg("Successfully published outbox event")
		}
	}
}
