package kafka

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/segmentio/kafka-go"
)



// DLQMessage represents the format of messages sent to the DLQ by the ML worker.
type DLQMessage struct {
	TransactionID   string          `json:"transaction_id"`
	Error           string          `json:"error"`
	OriginalPayload json.RawMessage `json:"original_payload,omitempty"`
}

// DLQConsumer consumes messages from the dead-letter queue.
type DLQConsumer struct {
	reader *kafka.Reader
	txRepo *repository.TransactionRepository
}

// NewDLQConsumer initializes a new DLQConsumer.
func NewDLQConsumer(brokers string, txRepo *repository.TransactionRepository) *DLQConsumer {
	brokerList := strings.Split(brokers, ",")
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokerList,
		GroupID:  "api-dlq-consumer",
		Topic:    "transactions.dlq",
		MinBytes: 10e3,
		MaxBytes: 10e6,
	})

	return &DLQConsumer{
		reader: r,
		txRepo: txRepo,
	}
}

// Start runs a blocking read loop to consume DLQ messages.
func (c *DLQConsumer) Start(ctx context.Context) error {
	logger.FromContext(ctx).Info().Msg("Starting DLQ Consumer...")
	defer c.reader.Close()

	for {
		select {
		case <-ctx.Done():
			logger.FromContext(ctx).Info().Msg("Shutting down DLQ Consumer...")
			return ctx.Err()
		default:
		}

		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			logger.FromContext(ctx).Error().Err(err).Msg("Failed to fetch message from DLQ")
			continue
		}

		c.processMessage(ctx, msg)
	}
}

func (c *DLQConsumer) processMessage(ctx context.Context, msg kafka.Message) {
	var dlqMsg DLQMessage
	if err := json.Unmarshal(msg.Value, &dlqMsg); err != nil {
		logger.FromContext(ctx).Error().
			Err(err).
			Str("consumer_group", "api-dlq-consumer").
			Msg("Failed to deserialize DLQ message JSON")
		// Commit offset to skip unparseable message
		c.reader.CommitMessages(ctx, msg)
		return
	}

	l := logger.FromContext(ctx).With().
		Str("transaction_id", dlqMsg.TransactionID).
		Str("error", dlqMsg.Error).
		Str("consumer_group", "api-dlq-consumer").
		Logger()

	l.Warn().Msg("Processing DLQ message")

	if dlqMsg.TransactionID != "" {
		if err := c.txRepo.UpdateStatus(ctx, dlqMsg.TransactionID, "scoring_failed"); err != nil {
			l.Error().Err(err).Msg("Failed to update transaction status to scoring_failed")
			// Depending on requirements, we might want to NOT commit here to retry database updates.
			// The instructions say "Commit offset after processing", so we will commit below anyway,
			// or we can choose not to commit on DB failure. Let's assume we commit on DB failure
			// to avoid infinite loops, but usually we should retry. Since prompt says "Commit offset after processing"
			// and doesn't specify DB failure behavior, we will continue and commit.
		}
	}

	if err := c.reader.CommitMessages(ctx, msg); err != nil {
		l.Error().Err(err).Msg("Failed to commit DLQ offset")
		return
	}

	metrics.DLQMessagesProcessedTotal.Inc()
	l.Debug().Msg("Successfully processed DLQ message")
}
