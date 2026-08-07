package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CustomerRepository handles database operations for customers.
type CustomerRepository struct {
	db *pgxpool.Pool
}

// NewCustomerRepository creates a new CustomerRepository.
func NewCustomerRepository(db *pgxpool.Pool) *CustomerRepository {
	return &CustomerRepository{db: db}
}

// FindByAccountID retrieves a customer by their account ID.
func (r *CustomerRepository) FindByAccountID(ctx context.Context, accountID string) (*model.Customer, error) {
	query := `
		SELECT 
			account_id, full_name, email, kyc_status, created_at
		FROM customers
		WHERE account_id = $1
	`

	var c model.Customer
	err := r.db.QueryRow(ctx, query, accountID).Scan(
		&c.AccountID,
		&c.FullName,
		&c.Email,
		&c.KYCStatus,
		&c.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, fmt.Errorf("CustomerRepository.FindByAccountID: %w", err)
	}

	return &c, nil
}
