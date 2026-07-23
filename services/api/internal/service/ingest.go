package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/validator"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ieeeEpoch is the origin date used by the IEEE fraud-detection training dataset
// (2017-11-30 00:00:00 UTC). TransactionDT in the dataset is seconds since this date.
var ieeeEpoch = time.Date(2017, 11, 30, 0, 0, 0, 0, time.UTC)

// buildMLPayload converts a Go Transaction into the ML worker's Kafka payload schema.
// The ML worker was trained on the IEEE fraud-detection dataset whose column names differ
// from the API model (e.g. "TransactionAmt" vs "amount", "TransactionDT" vs "timestamp").
//
// Fields absent from the API (card1-card5, addr1-addr2, email domains, id_* columns)
// are intentionally omitted; the ML worker inserts NaN via the imputer and XGBoost
// handles missing values natively through its learned split directions.
func buildMLPayload(t *model.Transaction) ([]byte, error) {
	// TransactionDT: seconds elapsed since the IEEE dataset epoch.
	transactionDT := int64(t.Timestamp.UTC().Sub(ieeeEpoch).Seconds())

	// ProductCD: approximate mapping from transaction_type.
	//   W = purchase (most common in training), H = transfer, C = withdrawal/cash
	productCD := "W"
	switch t.TransactionType {
	case "transfer":
		productCD = "H"
	case "withdrawal":
		productCD = "C"
	}

	// DeviceType: approximate mapping from channel.
	//   "desktop" for online; "mobile device" for physical point-of-sale / ATM.
	deviceType := "desktop"
	if t.Channel == "pos" || t.Channel == "atm" {
		deviceType = "mobile device"
	}

	payload := map[string]interface{}{
		"TransactionID":  t.ID,
		"TransactionDT":  transactionDT,
		"TransactionAmt": t.Amount,
		"ProductCD":      productCD,
		"DeviceType":     deviceType,
		"AccountID":      t.AccountID,
	}

	if t.DeviceID != nil && *t.DeviceID != "" {
		payload["DeviceID"] = *t.DeviceID
		// Use DeviceID as a DeviceInfo proxy — real DeviceInfo is browser/OS string
		// but it is not captured by the API; this at least flags known devices.
		payload["DeviceInfo"] = *t.DeviceID
	}

	return json.Marshal(payload)
}

// IngestService handles the business logic for transaction ingestion.
type IngestService struct {
	db         *pgxpool.Pool
	txRepo     *repository.TransactionRepository
	outboxRepo *repository.OutboxRepository
	rules      *RulesEngine
}

// NewIngestService creates a new IngestService.
func NewIngestService(db *pgxpool.Pool, txRepo *repository.TransactionRepository, outboxRepo *repository.OutboxRepository, rules *RulesEngine) *IngestService {
	return &IngestService{
		db:         db,
		txRepo:     txRepo,
		outboxRepo: outboxRepo,
		rules:      rules,
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
	if t.Currency == "" {
		t.Currency = "INR"
	}

	// 2. Evaluate Rules synchronously
	action, _, err := s.rules.Evaluate(ctx, t)
	if err != nil {
		// Log error but proceed gracefully if rules fail? For now let's just proceed.
		// A proper implementation would log it.
	}

	// Determine initial status based on rules
	skipML := false
	if action == "block" {
		t.Status = "auto_blocked"
		skipML = true
	} else if action == "flag" {
		t.Status = "escalated"
		skipML = true
	} else {
		t.Status = "pending"
	}

	// 3. Begin database transaction
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 4. Insert into transactions table (this will populate t.ID and t.IngestedAt)
	if err := s.txRepo.Create(ctx, tx, t); err != nil {
		return "", fmt.Errorf("failed to insert transaction: %w", err)
	}

	// 5. Insert into outbox_events table ONLY if we shouldn't skip ML
	if !skipML {
		payloadBytes, err := buildMLPayload(t)
		if err != nil {
			return "", fmt.Errorf("failed to marshal ML outbox payload: %w", err)
		}

		if err := s.outboxRepo.CreateEvent(ctx, tx, t.ID, "transactions.raw", payloadBytes); err != nil {
			return "", fmt.Errorf("failed to insert outbox event: %w", err)
		}
	}

	// 6. Commit transaction
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("failed to commit transaction: %w", err)
	}

	// 7. Return generated transaction ID
	return t.ID, nil
}
