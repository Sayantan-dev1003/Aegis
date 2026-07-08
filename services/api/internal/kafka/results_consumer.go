package kafka

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/segmentio/kafka-go"
	"go.opentelemetry.io/otel"
)



// ResultsConsumer consumes scored transaction results from Kafka.
type ResultsConsumer struct {
	reader       *kafka.Reader
	fraudService *service.FraudService
}

// NewResultsConsumer initializes a new ResultsConsumer.
func NewResultsConsumer(brokers string, fraudService *service.FraudService) *ResultsConsumer {
	brokerList := strings.Split(brokers, ",")
	r := kafka.NewReader(kafka.ReaderConfig{
		Brokers:  brokerList,
		GroupID:  "api-results-consumer",
		Topic:    "transactions.scored",
		MinBytes: 10e3, // 10KB
		MaxBytes: 10e6, // 10MB
	})

	return &ResultsConsumer{
		reader:       r,
		fraudService: fraudService,
	}
}

// Start runs a blocking read loop to consume messages.
func (c *ResultsConsumer) Start(ctx context.Context) error {
	logger.Get().Info().Msg("Starting Results Consumer...")
	defer c.reader.Close()

	for {
		// Respect context cancellation
		select {
		case <-ctx.Done():
			logger.Get().Info().Msg("Shutting down Results Consumer...")
			return ctx.Err()
		default:
		}

		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			logger.Get().Error().Err(err).Msg("Failed to fetch message from Kafka")
			continue
		}

		c.processMessage(ctx, msg)
	}
}

func (c *ResultsConsumer) processMessage(ctx context.Context, msg kafka.Message) {
	// Not observing duration for this specific bucket in the new metrics setup, but we could add it.
	// Actually we didn't add resultsProcessingDuration in the new setup, let's omit it or add it later if needed.

	// Extract OTel trace context from headers
	carrier := KafkaHeaderCarrier{Headers: &msg.Headers}
	propagator := otel.GetTextMapPropagator()
	ctx = propagator.Extract(ctx, carrier)

	tracer := otel.Tracer("aegis/api/kafka")
	ctx, span := tracer.Start(ctx, "results_consumer.process")
	defer span.End()

	var result model.FraudResult
	if err := json.Unmarshal(msg.Value, &result); err != nil {
		logger.FromContext(ctx).Error().
			Err(err).
			Str("consumer_group", "api-results-consumer").
			Msg("Failed to deserialize fraud result JSON")
		metrics.ResultsConsumedTotal.WithLabelValues("deserialization_error").Inc()
		// Commit offset so we don't get stuck on malformed messages
		c.reader.CommitMessages(ctx, msg)
		return
	}

	reqLogger := logger.FromContext(ctx)
	reqLogger = logger.WithTransaction(reqLogger, result.TransactionID)
	
	reqLogger.Info().
		Float64("fraud_score", result.FraudScore).
		Bool("is_fraud", result.IsFraud).
		Str("consumer_group", "api-results-consumer").
		Msg("Processing scored result")

	if err := c.fraudService.HandleScoredResult(ctx, &result); err != nil {
		reqLogger.Error().Err(err).Msg("Failed to process scored result")
		metrics.ResultsConsumedTotal.WithLabelValues("error").Inc()
		// Do not commit message offset on processing failure, allowing retries
		return
	}

	if err := c.reader.CommitMessages(ctx, msg); err != nil {
		reqLogger.Error().Err(err).Msg("Failed to commit Kafka offset")
		return
	}

	metrics.ResultsConsumedTotal.WithLabelValues("success").Inc()
	reqLogger.Debug().Msg("Successfully processed scored result")
}
