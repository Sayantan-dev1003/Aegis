package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReviewService struct {
	db           *pgxpool.Pool
	txRepo       *repository.TransactionRepository
	reviewRepo   *repository.ReviewRepository
	auditRepo    *repository.AuditRepository
	queueRepo    *repository.QueueRepository
	analystRepo  *repository.AnalystRepository
	incidentRepo *repository.IncidentRepository
	notifService *NotificationService
	hub          WebSocketHub
}

func strPtr(s string) *string {
	return &s
}

func NewReviewService(
	db *pgxpool.Pool,
	txRepo *repository.TransactionRepository,
	reviewRepo *repository.ReviewRepository,
	auditRepo *repository.AuditRepository,
	queueRepo *repository.QueueRepository,
	analystRepo *repository.AnalystRepository,
	incidentRepo *repository.IncidentRepository,
	notifService *NotificationService,
	hub WebSocketHub,
) *ReviewService {
	return &ReviewService{
		db:           db,
		txRepo:       txRepo,
		reviewRepo:   reviewRepo,
		auditRepo:    auditRepo,
		queueRepo:    queueRepo,
		analystRepo:  analystRepo,
		incidentRepo: incidentRepo,
		notifService: notifService,
		hub:          hub,
	}
}

// ClaimTransaction claims an escalated transaction for review by an analyst.
func (s *ReviewService) ClaimTransaction(ctx context.Context, txID string, analystID string) error {
	tx, err := s.txRepo.FindByID(ctx, txID)
	if err != nil || tx == nil {
		return fmt.Errorf("transaction not found")
	}
	if tx.RequiresAdminReview {
		if s.analystRepo != nil {
			analyst, err := s.analystRepo.FindByID(ctx, analystID)
			if err != nil || analyst == nil || (analyst.Role != "admin" && analyst.Role != "supervisor") {
				return fmt.Errorf("forbidden: transaction requires admin review")
			}
		}
	}

	query := `
		UPDATE transactions 
		SET claimed_by = $1, claimed_at = NOW(), sla_paused_at = NOW(), updated_at = NOW()
		WHERE id = $2 AND status IN ('escalated', 'breached') AND (claimed_by IS NULL OR claimed_by = $1)
	`
	res, err := s.db.Exec(ctx, query, analystID, txID)
	if err != nil {
		return fmt.Errorf("failed to claim transaction: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("transaction is already claimed by another reviewer or not escalated")
	}

	if s.hub != nil {
		event := map[string]any{
			"event_type":     "transaction.claimed",
			"transaction_id": txID,
			"analyst_id":     analystID,
			"timestamp":      time.Now().UTC(),
		}
		s.hub.Broadcast(txID, event)
	}
	return nil
}

// RejectTransaction rejects an escalated transaction and moves it to the appropriate queue with symmetric SLA.
func (s *ReviewService) RejectTransaction(ctx context.Context, txID string, analystID string, reason string) error {
	var slaStart *time.Time
	var slaRemaining *int
	var currentQueueID *string
	var rejectCount *int
	err := s.db.QueryRow(ctx, "SELECT sla_start_at, sla_remaining_seconds, queue_id, COALESCE(reject_count, 0) FROM transactions WHERE id = $1 AND status IN ('escalated', 'breached')", txID).
		Scan(&slaStart, &slaRemaining, &currentQueueID, &rejectCount)
	if err != nil {
		return fmt.Errorf("transaction not found or not in escalated status: %w", err)
	}

	curCount := 0
	if rejectCount != nil {
		curCount = *rejectCount
	}
	newRejectCount := curCount + 1

	if newRejectCount >= 2 {
		// Second reject: reject cap reached -> force-escalate to Admin Escalations
		adminQ, err := s.queueRepo.FindByName(ctx, "Admin Escalations")
		if err != nil || adminQ == nil {
			return fmt.Errorf("failed to find Admin Escalations queue: %w", err)
		}

		// Explicit, urgent 5-minute window (300s) for reject-cap force escalations
		urgentSec := 300

		updateQ := `
			UPDATE transactions 
			SET queue_id = $1, claimed_by = NULL, claimed_at = NULL, sla_paused_at = NULL, 
			    sla_remaining_seconds = $2, reject_count = $3, requires_admin_review = TRUE, 
			    priority_level = 'urgent', updated_at = NOW()
			WHERE id = $4
		`
		if _, err := s.db.Exec(ctx, updateQ, adminQ.ID, urgentSec, newRejectCount, txID); err != nil {
			return fmt.Errorf("failed to force-escalate transaction: %w", err)
		}

		if s.incidentRepo != nil {
			_ = s.incidentRepo.Create(ctx, &model.Incident{
				TransactionID: strPtr(txID),
				IncidentType:  strPtr("force_escalation"),
				Description:   strPtr(fmt.Sprintf("Transaction force-escalated to Admin Escalations after %d rejections. Reason: %s", newRejectCount, reason)),
			})
		}

		if s.notifService != nil {
			s.notifService.NotifyAdminEscalation(ctx, adminQ, &model.Transaction{ID: txID}, fmt.Sprintf("Force-escalated after %d rejections", newRejectCount))
		}

		if s.hub != nil {
			event := map[string]any{
				"event_type":     "transaction.force_escalated",
				"transaction_id": txID,
				"analyst_id":     analystID,
				"new_queue_id":   adminQ.ID,
				"reason":         reason,
				"timestamp":      time.Now().UTC(),
			}
			s.hub.Broadcast(txID, event)
		}
		return nil
	}

	// First reject (newRejectCount == 1): symmetric SLA (manual reject = FULL fresh SLA of fallback queue)
	fallbackQ, err := s.queueRepo.GetFallbackQueue(ctx)
	if err != nil || fallbackQ == nil {
		return fmt.Errorf("failed to get default fallback queue: %w", err)
	}

	fullFreshSec := fallbackQ.SlaTargetMinutes * 60

	updateQ := `
		UPDATE transactions 
		SET queue_id = $1, claimed_by = NULL, claimed_at = NULL, sla_paused_at = NULL, 
		    sla_remaining_seconds = $2, reject_count = $3, sla_breach_type = 'manual_reject', updated_at = NOW()
		WHERE id = $4
	`
	_, err = s.db.Exec(ctx, updateQ, fallbackQ.ID, fullFreshSec, newRejectCount, txID)
	if err != nil {
		return fmt.Errorf("failed to re-route rejected transaction: %w", err)
	}

	if s.hub != nil {
		event := map[string]any{
			"event_type":     "transaction.rejected",
			"transaction_id": txID,
			"analyst_id":     analystID,
			"new_queue_id":   fallbackQ.ID,
			"reason":         reason,
			"timestamp":      time.Now().UTC(),
		}
		s.hub.Broadcast(txID, event)
	}
	return nil
}

func (s *ReviewService) SubmitReview(
	ctx context.Context,
	txID string,
	analystID string,
	req model.SubmitReviewRequest,
	ipAddress string,
	userAgent string,
) (*model.Review, error) {

	// Start a DB transaction
	dbTx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to begin tx: %w", err)
	}
	defer dbTx.Rollback(ctx)

	// Step 1: Validate transaction (with FOR UPDATE)
	var status string
	err = dbTx.QueryRow(ctx, "SELECT status FROM transactions WHERE id = $1 FOR UPDATE", txID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("transaction not found")
		}
		return nil, fmt.Errorf("failed to lock transaction: %w", err)
	}

	if status != "scored" && status != "auto_blocked" && status != "escalated" && status != "breached" {
		return nil, fmt.Errorf("transaction is not in a reviewable state: %s", status)
	}

	// Step 2: Insert into reviews
	review := &model.Review{
		TransactionID: txID,
		ReviewerID:    analystID,
		Decision:      req.Decision,
		Notes:         req.Notes,
		ReviewedAt:    time.Now().UTC(),
	}

	if err := s.reviewRepo.Create(ctx, dbTx, review); err != nil {
		return nil, fmt.Errorf("failed to create review (maybe already reviewed): %w", err)
	}

	// Step 3: Update transaction status
	newStatus := "reviewed"
	if req.Decision == "escalate" {
		newStatus = "escalated"
	}

	if status == "breached" {
		_, err = dbTx.Exec(ctx, "UPDATE transactions SET claimed_by = NULL, claimed_at = NULL, sla_paused_at = NULL, updated_at = NOW() WHERE id = $1", txID)
		if err != nil {
			return nil, fmt.Errorf("failed to update transaction claimed fields: %w", err)
		}
		_, err = dbTx.Exec(ctx, "UPDATE sla_breaches SET status = $1 WHERE transaction_id = $2 AND tier = 1", newStatus, txID)
		if err != nil {
			return nil, fmt.Errorf("failed to update sla_breaches status: %w", err)
		}
	} else {
		_, err = dbTx.Exec(ctx, "UPDATE transactions SET status = $1, claimed_by = NULL, claimed_at = NULL, sla_paused_at = NULL, updated_at = NOW() WHERE id = $2", newStatus, txID)
		if err != nil {
			return nil, fmt.Errorf("failed to update transaction status: %w", err)
		}
	}

	// Commit
	if err := dbTx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit tx: %w", err)
	}

	// Step 4: WebSocket broadcast
	if s.hub != nil {
		event := model.TransactionReviewedEvent{
			EventType:     "transaction.reviewed",
			TransactionID: txID,
			Decision:      req.Decision,
			ReviewerID:    analystID,
			Status:        newStatus,
			Timestamp:     time.Now().UTC(),
		}
		s.hub.Broadcast(txID, event)
	}

	// Step 5: Write audit log
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		metadataJSON := fmt.Sprintf(`{"decision":"%s","notes":"%s"}`, req.Decision, req.Notes)
		s.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      analystID,
			Action:       "review.submitted",
			ResourceType: "transaction",
			ResourceID:   &txID,
			NewValue:     &metadataJSON,
			IPAddress:    &ipAddress,
			UserAgent:    &userAgent,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	return review, nil
}
