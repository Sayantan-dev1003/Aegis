package service

import (
	"context"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

const AutoBlockThreshold = 0.95

func getRiskBand(score float64) string {
	if score < 0.45 {
		return "low"
	}
	if score < 0.85 {
		return "medium"
	}
	if score >= AutoBlockThreshold {
		return "critical"
	}
	return "high"
}

// WebSocketHub interface for broadcasting messages.
type WebSocketHub interface {
	Broadcast(transactionID string, payload interface{})
}

// FraudService handles the business logic for processing fraud results.
type FraudService struct {
	fraudRepo       *repository.FraudResultRepository
	txRepo          *repository.TransactionRepository
	configService   *ConfigService
	hub             WebSocketHub
	queueRepo       *repository.QueueRepository
	auditSampleRepo *repository.AuditSampleRepository
	tracer          trace.Tracer
}

// NewFraudService creates a new FraudService.
func NewFraudService(
	fraudRepo *repository.FraudResultRepository,
	txRepo *repository.TransactionRepository,
	configService *ConfigService,
	hub WebSocketHub,
	queueRepo *repository.QueueRepository,
	auditSampleRepo *repository.AuditSampleRepository,
) *FraudService {
	return &FraudService{
		fraudRepo:       fraudRepo,
		txRepo:          txRepo,
		configService:   configService,
		hub:             hub,
		queueRepo:       queueRepo,
		auditSampleRepo: auditSampleRepo,
		tracer:          otel.Tracer("aegis/api/service"),
	}
}

// HandleScoredResult processes a fraud result from the ML worker.
func (s *FraudService) HandleScoredResult(ctx context.Context, result *model.FraudResult) error {
	ctx, span := s.tracer.Start(ctx, "fraud_service.handle_scored_result")
	defer span.End()

	span.SetAttributes(
		attribute.String("transaction_id", result.TransactionID),
		attribute.Float64("fraud_score", result.FraudScore),
		attribute.Bool("is_fraud", result.IsFraud),
	)

	modelVersion := "unknown"
	if result.ModelVersion != nil {
		modelVersion = *result.ModelVersion
	}

	// Emit Prometheus counters
	metrics.ResultsConsumedTotal.WithLabelValues("success").Inc()

	// Step 1: Insert into fraud_results
	if err := s.fraudRepo.Create(ctx, result); err != nil {
		return fmt.Errorf("failed to save fraud result: %w", err)
	}

	// Step 2: Fetch existing transaction to inspect current status
	tx, err := s.txRepo.FindByID(ctx, result.TransactionID)
	if err != nil || tx == nil {
		return fmt.Errorf("transaction not found: %s", result.TransactionID)
	}

	riskScore := result.FraudScore
	riskBand := getRiskBand(riskScore)
	threshold := s.configService.GetConfigFloat(ctx, "auto_block_threshold", AutoBlockThreshold)
	autoBlocked := result.IsFraud && riskScore >= threshold
	status := tx.Status

	if autoBlocked && tx.Status == "pending" {
		metrics.AutoBlockedTotal.WithLabelValues(modelVersion).Inc()
	}

	switch tx.Status {
	case "pending":
		if autoBlocked {
			status = "auto_blocked"
			if err := s.txRepo.UpdateStatusAndRisk(ctx, result.TransactionID, status, riskScore, riskBand, "ml"); err != nil {
				return err
			}
			// 100% ML auto-block audit sampling
			if s.auditSampleRepo != nil {
				_ = s.auditSampleRepo.Create(ctx, &model.BlockAuditSample{
					TransactionID: result.TransactionID,
					SampledReason: "ml_auto_block",
				})
			}
		} else if riskScore >= 0.45 {
			status = "escalated"
			var queueID *string
			if s.queueRepo != nil {
				mlQ, err := s.queueRepo.FindByName(ctx, "ML Borderline Review")
				if err == nil && mlQ != nil {
					queueID = &mlQ.ID
				} else {
					fallbackQ, err2 := s.queueRepo.GetFallbackQueue(ctx)
					if err2 == nil && fallbackQ != nil {
						queueID = &fallbackQ.ID
					}
				}
			}
			if err := s.txRepo.UpdateStatusRiskAndQueue(ctx, result.TransactionID, status, queueID, riskScore, riskBand, "ml"); err != nil {
				return err
			}
		} else {
			status = "scored_approved"
			if err := s.txRepo.UpdateStatusAndRisk(ctx, result.TransactionID, status, riskScore, riskBand, "ml"); err != nil {
				return err
			}
		}
	case "escalated":
		// Rule-flagged: enrich with ML score without changing status or queue
		if err := s.txRepo.UpdateRiskEnrichment(ctx, result.TransactionID, riskScore, riskBand, "hybrid"); err != nil {
			return err
		}
	case "auto_blocked":
		// Rule auto-blocked: enrich and sample
		if err := s.txRepo.UpdateRiskEnrichment(ctx, result.TransactionID, riskScore, riskBand, "rule"); err != nil {
			return err
		}
		if s.auditSampleRepo != nil {
			if riskScore < 0.20 {
				_ = s.auditSampleRepo.Create(ctx, &model.BlockAuditSample{
					TransactionID: result.TransactionID,
					SampledReason: "low_score_despite_block",
				})
			} else if time.Now().UnixNano()%10 == 0 { // 10% random sample
				_ = s.auditSampleRepo.Create(ctx, &model.BlockAuditSample{
					TransactionID: result.TransactionID,
					SampledReason: "random",
				})
			}
		}
	default:
		_ = s.txRepo.UpdateRiskEnrichment(ctx, result.TransactionID, riskScore, riskBand, "hybrid")
	}

	// Step 3: WebSocket broadcast
	if s.hub != nil {
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
