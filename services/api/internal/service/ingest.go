package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/validator"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IngestService handles the business logic for transaction ingestion.
type IngestService struct {
	db         *pgxpool.Pool
	txRepo     *repository.TransactionRepository
	outboxRepo *repository.OutboxRepository
}

// NewIngestService creates a new IngestService.
func NewIngestService(db *pgxpool.Pool, txRepo *repository.TransactionRepository, outboxRepo *repository.OutboxRepository) *IngestService {
	return &IngestService{
		db:         db,
		txRepo:     txRepo,
		outboxRepo: outboxRepo,
	}
}

// IngestTransaction processes an incoming transaction, writing it to the database
// and queueing an outbox event atomically.
func (s *IngestService) IngestTransaction(ctx context.Context, t *model.Transaction) (string, error) {
	// 1. Validate incoming transaction
	if err := validator.ValidateTransaction(t); err != nil {
		return "", fmt.Errorf("validation error: %w", err)
	}

	// Set defaults if missing
	if t.Status == "" {
		t.Status = "pending"
	}
	if t.Currency == "" {
		t.Currency = "INR"
	}

	// 2. Begin database transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 3. Insert into transactions table (this will populate t.ID and t.IngestedAt)
	if err := s.txRepo.Create(ctx, tx, t); err != nil {
		return "", fmt.Errorf("failed to insert transaction: %w", err)
	}

	// 4. Insert into outbox_events table
	payloadBytes, err := json.Marshal(t)
	if err != nil {
		return "", fmt.Errorf("failed to marshal outbox payload: %w", err)
	}

	if err := s.outboxRepo.CreateEvent(ctx, tx, t.ID, "transaction.created", payloadBytes); err != nil {
		return "", fmt.Errorf("failed to insert outbox event: %w", err)
	}

	// 5. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	// 6. Return generated transaction ID
	return t.ID, nil
}
