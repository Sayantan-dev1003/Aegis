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
	db        *pgxpool.Pool
	txRepo    *repository.TransactionRepository
	reviewRepo *repository.ReviewRepository
	auditRepo *repository.AuditRepository
	hub       WebSocketHub
}

func NewReviewService(
	db *pgxpool.Pool,
	txRepo *repository.TransactionRepository,
	reviewRepo *repository.ReviewRepository,
	auditRepo *repository.AuditRepository,
	hub WebSocketHub,
) *ReviewService {
	return &ReviewService{
		db:         db,
		txRepo:     txRepo,
		reviewRepo: reviewRepo,
		auditRepo:  auditRepo,
		hub:        hub,
	}
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
	// We use the pool to find by ID directly, but ideally this should use the Tx.
	// For simplicity, let's execute a FOR UPDATE query directly.
	var status string
	err = dbTx.QueryRow(ctx, "SELECT status FROM transactions WHERE id = $1 FOR UPDATE", txID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("transaction not found") // handled as 404 in handler
		}
		return nil, fmt.Errorf("failed to lock transaction: %w", err)
	}

	if status != "scored" && status != "auto_blocked" {
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
		// Could check for unique constraint
		return nil, fmt.Errorf("failed to create review (maybe already reviewed): %w", err)
	}

	// Step 3: Update transaction status
	newStatus := "reviewed"
	if req.Decision == "escalate" {
		newStatus = "escalated"
	}
	
	_, err = dbTx.Exec(ctx, "UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2", newStatus, txID)
	if err != nil {
		return nil, fmt.Errorf("failed to update transaction status: %w", err)
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
