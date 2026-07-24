package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
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
			ip_address::text, timestamp, ingested_at, status
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
		where += fmt.Sprintf(" AND t.status = $%d", argIdx)
		args = append(args, req.Status)
		argIdx++
	}

	if !req.FromDate.IsZero() {
		where += fmt.Sprintf(" AND t.timestamp >= $%d", argIdx)
		args = append(args, req.FromDate)
		argIdx++
	}

	if !req.ToDate.IsZero() {
		where += fmt.Sprintf(" AND t.timestamp <= $%d", argIdx)
		args = append(args, req.ToDate)
		argIdx++
	}

	if req.MinScore > 0 {
		where += fmt.Sprintf(" AND fr.fraud_score >= $%d", argIdx)
		args = append(args, req.MinScore)
		argIdx++
	}

	if req.IsFraud != nil {
		where += fmt.Sprintf(" AND fr.is_fraud = $%d", argIdx)
		args = append(args, *req.IsFraud)
		argIdx++
	}

	if req.MinAmount != nil {
		where += fmt.Sprintf(" AND t.amount >= $%d", argIdx)
		args = append(args, *req.MinAmount)
		argIdx++
	}

	if req.MaxAmount != nil {
		where += fmt.Sprintf(" AND t.amount <= $%d", argIdx)
		args = append(args, *req.MaxAmount)
		argIdx++
	}

	if req.Channel != "" {
		where += fmt.Sprintf(" AND t.channel ILIKE $%d", argIdx)
		args = append(args, req.Channel)
		argIdx++
	}

	if req.TransactionType != "" {
		where += fmt.Sprintf(" AND t.transaction_type ILIKE $%d", argIdx)
		args = append(args, req.TransactionType)
		argIdx++
	}

	if req.CountryCode != "" {
		where += fmt.Sprintf(" AND t.country_code ILIKE $%d", argIdx)
		args = append(args, req.CountryCode)
		argIdx++
	}

	if req.Search != "" {
		searchStr := req.Search
		if strings.HasPrefix(strings.ToUpper(searchStr), "ACCT_") {
			where += fmt.Sprintf(" AND t.account_id ILIKE $%d", argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		} else if len(searchStr) >= 8 && !strings.Contains(searchStr, " ") {
			where += fmt.Sprintf(" AND (t.id::text ILIKE $%d OR t.merchant_name ILIKE $%d)", argIdx, argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		} else {
			where += fmt.Sprintf(" AND t.merchant_name ILIKE $%d", argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		}
	}

	if req.CursorID != "" && !req.CursorDate.IsZero() {
		where += fmt.Sprintf(" AND (t.ingested_at, t.id) < ($%d, $%d)", argIdx, argIdx+1)
		args = append(args, req.CursorDate, req.CursorID)
		argIdx += 2
	}

	query := `
		SELECT 
			t.id, t.amount, t.currency, t.account_id, t.merchant_id, t.merchant_name, t.merchant_category, t.transaction_type, t.channel, t.country_code, t.ip_address::text, t.status, t.ingested_at, t.timestamp,
			fr.fraud_score, fr.is_fraud, fr.created_at as scored_at,
			r.decision
		FROM transactions t
		LEFT JOIN fraud_results fr ON fr.transaction_id = t.id
		LEFT JOIN reviews r ON r.transaction_id = t.id
		` + where + `
		ORDER BY t.ingested_at DESC, t.id DESC
		LIMIT $` + fmt.Sprintf("%d", argIdx)

	args = append(args, req.Limit)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("TransactionRepository.List: %w", err)
	}
	defer rows.Close()

	var results []model.TransactionSummary
	for rows.Next() {
		var summary model.TransactionSummary
		err := rows.Scan(
			&summary.ID, &summary.Amount, &summary.Currency, &summary.AccountID, &summary.MerchantID, &summary.MerchantName, &summary.MerchantCategory, &summary.TransactionType, &summary.Channel, &summary.CountryCode, &summary.IPAddress, &summary.Status, &summary.CreatedAt, &summary.Timestamp,
			&summary.FraudScore, &summary.IsFraud, &summary.ScoredAt,
			&summary.ReviewDecision,
		)
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

// CountByAccount gets the number of transactions for an account since a given time.
func (r *TransactionRepository) CountByAccount(ctx context.Context, accountID string, since time.Time) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM transactions
		WHERE account_id = $1 AND timestamp >= $2
	`
	var count int
	err := r.db.QueryRow(ctx, query, accountID, since).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("TransactionRepository.CountByAccount: %w", err)
	}
	return count, nil
}
