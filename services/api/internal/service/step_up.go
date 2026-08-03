package service

import (
	"context"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
)

type StepUpService struct {
	txRepo    *repository.TransactionRepository
	queueRepo *repository.QueueRepository
}

func NewStepUpService(txRepo *repository.TransactionRepository, queueRepo *repository.QueueRepository) *StepUpService {
	return &StepUpService{
		txRepo:    txRepo,
		queueRepo: queueRepo,
	}
}

// ResolveChallenge handles the completion of an MFA/step-up verification challenge.
// outcome can be "passed", "failed", or "timeout".
func (s *StepUpService) ResolveChallenge(ctx context.Context, transactionID string, outcome string) error {
	tx, err := s.txRepo.FindByID(ctx, transactionID)
	if err != nil || tx == nil {
		return fmt.Errorf("StepUpService.ResolveChallenge: transaction not found %s", transactionID)
	}

	var newStatus string
	var targetQueueID *string

	switch outcome {
	case "passed":
		// Check cached risk score
		if tx.RiskScore != nil && *tx.RiskScore < 0.45 {
			newStatus = "scored_approved"
		} else {
			// Medium/high risk or score nil -> route to Account Takeover Suspects queue
			newStatus = "escalated"
			if s.queueRepo != nil {
				atoQ, err := s.queueRepo.FindByName(ctx, "Account Takeover Suspects")
				if err == nil && atoQ != nil {
					targetQueueID = &atoQ.ID
				} else {
					fallbackQ, err2 := s.queueRepo.GetFallbackQueue(ctx)
					if err2 == nil && fallbackQ != nil {
						targetQueueID = &fallbackQ.ID
					}
				}
			}
		}
	case "failed", "timeout":
		// Immediate escalation to Account Takeover Suspects with high_risk priority
		newStatus = "escalated"
		if s.queueRepo != nil {
			atoQ, err := s.queueRepo.FindByName(ctx, "Account Takeover Suspects")
			if err == nil && atoQ != nil {
				targetQueueID = &atoQ.ID
			} else {
				fallbackQ, err2 := s.queueRepo.GetFallbackQueue(ctx)
				if err2 == nil && fallbackQ != nil {
					targetQueueID = &fallbackQ.ID
				}
			}
		}
	default:
		return fmt.Errorf("StepUpService.ResolveChallenge: invalid outcome %s", outcome)
	}

	// Update database
	if targetQueueID != nil {
		return s.txRepo.UpdateStatusAndQueue(ctx, transactionID, newStatus, targetQueueID)
	}
	return s.txRepo.UpdateStatus(ctx, transactionID, newStatus)
}
