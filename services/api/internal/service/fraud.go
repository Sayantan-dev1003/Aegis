package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const AutoBlockThreshold = 0.85



// WebSocketHub interface for broadcasting messages.
type WebSocketHub interface {
	Broadcast(transactionID string, payload interface{})
}

// FraudService handles the business logic for processing fraud results.
type FraudService struct {
	fraudRepo     *repository.FraudResultRepository
	txRepo        *repository.TransactionRepository
	configService *ConfigService
	hub           WebSocketHub
	tracer        trace.Tracer
}

// NewFraudService creates a new FraudService.
func NewFraudService(
	fraudRepo *repository.FraudResultRepository,
	txRepo *repository.TransactionRepository,
	configService *ConfigService,
	hub WebSocketHub,
) *FraudService {
	return &FraudService{
		fraudRepo:     fraudRepo,
		txRepo:        txRepo,
		configService: configService,
		hub:           hub,
		tracer:        otel.Tracer("aegis/api/service"),
	}
}

// HandleScoredResult processes a fraud result from the ML worker.
func (s *FraudService) HandleScoredResult(ctx context.Context, result *model.FraudResult) error {
	ctx, span := s.tracer.Start(ctx, "fraud_service.handle_scored_result")
	defer span.End()

	autoBlocked := result.IsFraud && result.FraudScore >= s.configService.GetConfigFloat(ctx, "auto_block_threshold", AutoBlockThreshold)

	span.SetAttributes(
		attribute.String("transaction_id", result.TransactionID),
		attribute.Float64("fraud_score", result.FraudScore),
		attribute.Bool("is_fraud", result.IsFraud),
		attribute.Bool("auto_blocked", autoBlocked),
	)

	modelVersion := "unknown"
	if result.ModelVersion != nil {
		modelVersion = *result.ModelVersion
	}

	// Emit Prometheus counters
	metrics.ResultsConsumedTotal.WithLabelValues("success").Inc()
	if autoBlocked {
		metrics.AutoBlockedTotal.WithLabelValues(modelVersion).Inc()
	}

	// Step 1: Insert into fraud_results
	if err := s.fraudRepo.Create(ctx, result); err != nil {
		return fmt.Errorf("failed to save fraud result: %w", err)
	}

	// Step 2: Update transaction status
	status := "scored"
	if autoBlocked {
		status = "auto_blocked"
	}
	if err := s.txRepo.UpdateStatus(ctx, result.TransactionID, status); err != nil {
		return fmt.Errorf("failed to update transaction status: %w", err)
	}

	// Step 3: WebSocket broadcast
	if s.hub != nil {
		// modelVersion already computed above
		event := model.TransactionScoredEvent{
			EventType:     "transaction.scored",
			TransactionID: result.TransactionID,
			FraudScore:    result.FraudScore,
			IsFraud:       result.IsFraud,
			Status:        status,
			ModelVersion:  modelVersion,
			Timestamp:     time.Now().UTC(),
		}
		s.hub.Broadcast(result.TransactionID, event)
	}

	return nil
}
