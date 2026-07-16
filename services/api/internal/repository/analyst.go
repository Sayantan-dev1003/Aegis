package repository

import (
	"context"
	"errors"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalystRepository handles database operations for analysts.
type AnalystRepository struct {
	db *pgxpool.Pool
}

// NewAnalystRepository creates a new AnalystRepository.
func NewAnalystRepository(db *pgxpool.Pool) *AnalystRepository {
	return &AnalystRepository{db: db}
}

// FindByEmail fetches an analyst by their email address.
func (r *AnalystRepository) FindByEmail(ctx context.Context, email string) (*model.Analyst, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, is_active, created_at, last_login
		FROM analysts
		WHERE email = $1
	`

	var a model.Analyst
	err := r.db.QueryRow(ctx, query, email).Scan(
		&a.ID,
		&a.Email,
		&a.PasswordHash,
		&a.FullName,
		&a.Role,
		&a.IsActive,
		&a.CreatedAt,
		&a.LastLogin,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, err
	}

	return &a, nil
}

// FindByID fetches an analyst by their ID.
func (r *AnalystRepository) FindByID(ctx context.Context, id string) (*model.Analyst, error) {
	query := `
		SELECT id, email, password_hash, full_name, role, is_active, created_at, last_login
		FROM analysts
		WHERE id = $1
	`

	var a model.Analyst
	err := r.db.QueryRow(ctx, query, id).Scan(
		&a.ID,
		&a.Email,
		&a.PasswordHash,
		&a.FullName,
		&a.Role,
		&a.IsActive,
		&a.CreatedAt,
		&a.LastLogin,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &a, nil
}

// UpdateLastLogin updates the last_login timestamp for an analyst.
func (r *AnalystRepository) UpdateLastLogin(ctx context.Context, id string) error {
	query := `
		UPDATE analysts
		SET last_login = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id)
	return err
}

// List fetches all analysts without their password hashes.
func (r *AnalystRepository) List(ctx context.Context) ([]model.Analyst, error) {
	query := `
		SELECT id, email, full_name, role, is_active, created_at, last_login
		FROM analysts
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var analysts []model.Analyst
	for rows.Next() {
		var a model.Analyst
		err := rows.Scan(
			&a.ID,
			&a.Email,
			&a.FullName,
			&a.Role,
			&a.IsActive,
			&a.CreatedAt,
			&a.LastLogin,
		)
		if err != nil {
			return nil, err
		}
		// Clear out PasswordHash just in case
		a.PasswordHash = ""
		analysts = append(analysts, a)
	}
	return analysts, nil
}

// UpdateRole updates the role of an analyst.
func (r *AnalystRepository) UpdateRole(ctx context.Context, id string, role string) error {
	query := `
		UPDATE analysts
		SET role = $2
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id, role)
	return err
}

// SetActive updates the active status of an analyst.
func (r *AnalystRepository) SetActive(ctx context.Context, id string, isActive bool) error {
	query := `
		UPDATE analysts
		SET is_active = $2
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id, isActive)
	return err
}
