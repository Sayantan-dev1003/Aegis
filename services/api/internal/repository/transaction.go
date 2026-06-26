package repository

import (
	"context"
	"errors"

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
		return nil, err
	}

	return &t, nil
}
