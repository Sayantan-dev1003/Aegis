package repository

import (
	"context"
	"errors"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)



// FraudResultRepository handles database operations for fraud results.
type FraudResultRepository struct {
	db *pgxpool.Pool
}

// NewFraudResultRepository creates a new FraudResultRepository.
func NewFraudResultRepository(db *pgxpool.Pool) *FraudResultRepository {
	return &FraudResultRepository{db: db}
}

// Create inserts a new fraud result into the database.
// It is idempotent: duplicate insertions on the same transaction_id are ignored and return nil.
func (r *FraudResultRepository) Create(ctx context.Context, result *model.FraudResult) error {
	query := `
		INSERT INTO fraud_results (transaction_id, fraud_score, is_fraud, model_version, shap_values, threshold_used, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE(NULLIF($7, '0001-01-01 00:00:00+00'::timestamptz), NOW()))
	`

	_, err := r.db.Exec(ctx, query,
		result.TransactionID,
		result.FraudScore,
		result.IsFraud,
		result.ModelVersion,
		result.SHAPValues,
		result.ThresholdUsed,
		result.CreatedAt,
	)

	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			logger.FromContext(ctx).Warn().
				Str("transaction_id", result.TransactionID).
				Msg("Duplicate fraud result ignored (idempotent)")
			metrics.DuplicateFraudResultTotal.Inc()
			return nil
		}
		return err
	}

	return nil
}

// GetByTransactionID retrieves a fraud result by transaction ID.
func (r *FraudResultRepository) GetByTransactionID(ctx context.Context, txID string) (*model.FraudResult, error) {
	query := `
		SELECT transaction_id, fraud_score, is_fraud, model_version, shap_values, threshold_used, created_at
		FROM fraud_results
		WHERE transaction_id = $1
	`
	var result model.FraudResult
	err := r.db.QueryRow(ctx, query, txID).Scan(
		&result.TransactionID,
		&result.FraudScore,
		&result.IsFraud,
		&result.ModelVersion,
		&result.SHAPValues,
		&result.ThresholdUsed,
		&result.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, err
	}

	return &result, nil
}
