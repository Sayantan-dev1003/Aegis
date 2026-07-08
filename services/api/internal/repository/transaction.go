package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TransactionRepository handles database operations for transactions.
type TransactionRepository struct {
	db *pgxpool.Pool
}

// NewTransactionRepository creates a new TransactionRepository.
func NewTransactionRepository(db *pgxpool.Pool) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create inserts a new transaction into the database within an existing transaction block.
func (r *TransactionRepository) Create(ctx context.Context, tx pgx.Tx, t *model.Transaction) error {
	query := `
		INSERT INTO transactions (
			external_id, account_id, merchant_id, merchant_name, merchant_category,
			amount, currency, country_code, transaction_type, channel, device_id,
			ip_address, timestamp, status
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
		) RETURNING id, ingested_at
	`

	err := tx.QueryRow(ctx, query,
		t.ExternalID,
		t.AccountID,
		t.MerchantID,
		t.MerchantName,
		t.MerchantCategory,
		t.Amount,
		t.Currency,
		t.CountryCode,
		t.TransactionType,
		t.Channel,
		t.DeviceID,
		t.IPAddress,
		t.Timestamp,
		t.Status,
	).Scan(&t.ID, &t.IngestedAt)

	return err
}

// UpdateStatus updates the status of an existing transaction.
func (r *TransactionRepository) UpdateStatus(ctx context.Context, id string, status string) error {
	query := `
		UPDATE transactions
		SET status = $1
		WHERE id = $2
	`
	_, err := r.db.Exec(ctx, query, status, id)
	return err
}

// FindByID retrieves a transaction by its internal ID.
func (r *TransactionRepository) FindByID(ctx context.Context, id string) (*model.Transaction, error) {
	query := `
		SELECT 
			id, external_id, account_id, merchant_id, merchant_name, merchant_category,
			amount, currency, country_code, transaction_type, channel, device_id,
			ip_address, timestamp, ingested_at, status
		FROM transactions
		WHERE id = $1
	`

	var t model.Transaction
	err := r.db.QueryRow(ctx, query, id).Scan(
		&t.ID,
		&t.ExternalID,
		&t.AccountID,
		&t.MerchantID,
		&t.MerchantName,
		&t.MerchantCategory,
		&t.Amount,
		&t.Currency,
		&t.CountryCode,
		&t.TransactionType,
		&t.Channel,
		&t.DeviceID,
		&t.IPAddress,
		&t.Timestamp,
		&t.IngestedAt,
		&t.Status,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, fmt.Errorf("TransactionRepository.FindByID: %w", err)
	}

	return &t, nil
}

// GetByID retrieves a transaction by ID. Identical to FindByID but added to fulfill requirements.
func (r *TransactionRepository) GetByID(ctx context.Context, id string) (*model.Transaction, error) {
	return r.FindByID(ctx, id)
}

// List transactions with keyset pagination and dynamic filters.
func (r *TransactionRepository) List(ctx context.Context, req model.ListTransactionsRequest) ([]model.TransactionSummary, string, error) {
	args := []interface{}{}
	argIdx := 1
	where := "WHERE 1=1"

	if req.Status != "" {
		where += " AND t.status = $" + string(rune('0'+argIdx))
		args = append(args, req.Status)
		argIdx++
	}

	if !req.FromDate.IsZero() {
		where += " AND t.ingested_at >= $" + string(rune('0'+argIdx))
		args = append(args, req.FromDate)
		argIdx++
	}

	if !req.ToDate.IsZero() {
		where += " AND t.ingested_at <= $" + string(rune('0'+argIdx))
		args = append(args, req.ToDate)
		argIdx++
	}

	if req.MinScore > 0 {
		where += " AND fr.fraud_score >= $" + string(rune('0'+argIdx))
		args = append(args, req.MinScore)
		argIdx++
	}

	if req.IsFraud != nil {
		where += " AND fr.is_fraud = $" + string(rune('0'+argIdx))
		args = append(args, *req.IsFraud)
		argIdx++
	}

	if req.CursorID != "" && !req.CursorDate.IsZero() {
		where += " AND (t.ingested_at, t.id) < ($" + string(rune('0'+argIdx)) + ", $" + string(rune('0'+argIdx+1)) + ")"
		args = append(args, req.CursorDate, req.CursorID)
		argIdx += 2
	}

	query := `
		SELECT 
			t.id, t.amount, t.merchant_id, t.status, t.ingested_at,
			fr.fraud_score, fr.is_fraud, fr.created_at as scored_at
		FROM transactions t
		LEFT JOIN fraud_results fr ON fr.transaction_id = t.id
		` + where + `
		ORDER BY t.ingested_at DESC, t.id DESC
		LIMIT $` + string(rune('0'+argIdx))

	args = append(args, req.Limit)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("TransactionRepository.List: %w", err)
	}
	defer rows.Close()

	var results []model.TransactionSummary
	for rows.Next() {
		var summary model.TransactionSummary
		err := rows.Scan(&summary.ID, &summary.Amount, &summary.MerchantID, &summary.Status, &summary.CreatedAt, &summary.FraudScore, &summary.IsFraud, &summary.ScoredAt)
		if err != nil {
			return nil, "", fmt.Errorf("TransactionRepository.List scan: %w", err)
		}
		results = append(results, summary)
	}

	// Calculate next cursor
	nextCursor := ""
	// Handler will generate it from the last item.

	return results, nextCursor, nil
}

// ListDLQ lists scoring failed transactions for DLQ with keyset pagination.
func (r *TransactionRepository) ListDLQ(ctx context.Context, limit int, cursorID string, cursorDate time.Time) ([]model.Transaction, string, error) {
	args := []interface{}{limit}
	where := "WHERE status = 'scoring_failed'"
	
	if cursorID != "" && !cursorDate.IsZero() {
		where += " AND (ingested_at, id) < ($2, $3)"
		args = append(args, cursorDate, cursorID)
	}

	query := `
		SELECT id, amount, merchant_id, account_id, status, requeue_count, last_requeued_at, ingested_at, updated_at, external_id, timestamp
		FROM transactions
		` + where + `
		ORDER BY ingested_at DESC, id DESC
		LIMIT $1
	`
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("TransactionRepository.ListDLQ: %w", err)
	}
	defer rows.Close()

	var results []model.Transaction
	for rows.Next() {
		var t model.Transaction
		err := rows.Scan(&t.ID, &t.Amount, &t.MerchantID, &t.AccountID, &t.Status, &t.RequeueCount, &t.LastRequeuedAt, &t.IngestedAt, &t.UpdatedAt, &t.ExternalID, &t.Timestamp)
		if err != nil {
			return nil, "", fmt.Errorf("TransactionRepository.ListDLQ scan: %w", err)
		}
		results = append(results, t)
	}
	return results, "", nil
}

// IncrementRequeue increments requeue count and status.
func (r *TransactionRepository) IncrementRequeue(ctx context.Context, id string) error {
	query := `
		UPDATE transactions 
		SET status = 'processing', 
			requeue_count = requeue_count + 1,
			last_requeued_at = NOW(),
			updated_at = NOW()
		WHERE id = $1
	`
	res, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("TransactionRepository.IncrementRequeue: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("TransactionRepository.IncrementRequeue: %w", pgx.ErrNoRows)
	}
	return nil
}
