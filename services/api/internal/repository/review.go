package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrAlreadyReviewed = errors.New("transaction already reviewed")

type ReviewRepository struct {
	db *pgxpool.Pool
}

func NewReviewRepository(db *pgxpool.Pool) *ReviewRepository {
	return &ReviewRepository{db: db}
}

// Create inserts a new review.
func (r *ReviewRepository) Create(ctx context.Context, tx pgx.Tx, review *model.Review) error {
	query := `
		INSERT INTO reviews (transaction_id, reviewer_id, decision, notes, reviewed_at)
		VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5, '0001-01-01 00:00:00+00'::timestamptz), NOW()))
		RETURNING id, reviewed_at
	`
	
	err := tx.QueryRow(ctx, query,
		review.TransactionID,
		review.ReviewerID,
		review.Decision,
		review.Notes,
		review.ReviewedAt,
	).Scan(&review.ID, &review.ReviewedAt)

	if err != nil {
		return fmt.Errorf("ReviewRepository.Create: %w", err)
	}
	return nil
}

// GetByTransactionID retrieves a review by transaction ID.
func (r *ReviewRepository) GetByTransactionID(ctx context.Context, txID string) (*model.Review, error) {
	query := `
		SELECT id, transaction_id, reviewer_id, decision, notes, reviewed_at
		FROM reviews
		WHERE transaction_id = $1
	`
	var result model.Review
	err := r.db.QueryRow(ctx, query, txID).Scan(
		&result.ID,
		&result.TransactionID,
		&result.ReviewerID,
		&result.Decision,
		&result.Notes,
		&result.ReviewedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, fmt.Errorf("ReviewRepository.GetByTransactionID: %w", err)
	}

	return &result, nil
}
