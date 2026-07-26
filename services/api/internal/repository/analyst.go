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
		SELECT a.id, a.email, a.password_hash, a.full_name, a.role, a.queue_id, COALESCE(q.name, ''), a.is_active, a.created_at, a.last_login
		FROM analysts a
		LEFT JOIN queues q ON a.queue_id = q.id
		WHERE a.email = $1
	`

	var a model.Analyst
	var qID *string
	var qName string
	err := r.db.QueryRow(ctx, query, email).Scan(
		&a.ID,
		&a.Email,
		&a.PasswordHash,
		&a.FullName,
		&a.Role,
		&qID,
		&qName,
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

	a.QueueID = qID
	a.QueueName = qName
	if qName != "" {
		a.Queues = []string{qName}
	} else {
		a.Queues = []string{}
	}

	return &a, nil
}

// FindByID fetches an analyst by their ID.
func (r *AnalystRepository) FindByID(ctx context.Context, id string) (*model.Analyst, error) {
	query := `
		SELECT a.id, a.email, a.password_hash, a.full_name, a.role, a.queue_id, COALESCE(q.name, ''), a.is_active, a.created_at, a.last_login
		FROM analysts a
		LEFT JOIN queues q ON a.queue_id = q.id
		WHERE a.id = $1
	`

	var a model.Analyst
	var qID *string
	var qName string
	err := r.db.QueryRow(ctx, query, id).Scan(
		&a.ID,
		&a.Email,
		&a.PasswordHash,
		&a.FullName,
		&a.Role,
		&qID,
		&qName,
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

	a.QueueID = qID
	a.QueueName = qName
	if qName != "" {
		a.Queues = []string{qName}
	} else {
		a.Queues = []string{}
	}

	return &a, nil
}

// FindByQueueID fetches an analyst by their assigned queue ID.
func (r *AnalystRepository) FindByQueueID(ctx context.Context, queueID string) (*model.Analyst, error) {
	query := `
		SELECT a.id, a.email, a.password_hash, a.full_name, a.role, a.queue_id, COALESCE(q.name, ''), a.is_active, a.created_at, a.last_login
		FROM analysts a
		LEFT JOIN queues q ON a.queue_id = q.id
		WHERE a.queue_id = $1
	`

	var a model.Analyst
	var qID *string
	var qName string
	err := r.db.QueryRow(ctx, query, queueID).Scan(
		&a.ID,
		&a.Email,
		&a.PasswordHash,
		&a.FullName,
		&a.Role,
		&qID,
		&qName,
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

	a.QueueID = qID
	a.QueueName = qName
	if qName != "" {
		a.Queues = []string{qName}
	} else {
		a.Queues = []string{}
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
		SELECT a.id, a.email, a.full_name, a.role, a.queue_id, COALESCE(q.name, ''), a.is_active, a.created_at, a.last_login
		FROM analysts a
		LEFT JOIN queues q ON a.queue_id = q.id
		ORDER BY a.created_at DESC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var analysts []model.Analyst
	for rows.Next() {
		var a model.Analyst
		var qID *string
		var qName string
		err := rows.Scan(
			&a.ID,
			&a.Email,
			&a.FullName,
			&a.Role,
			&qID,
			&qName,
			&a.IsActive,
			&a.CreatedAt,
			&a.LastLogin,
		)
		if err != nil {
			return nil, err
		}
		// Clear out PasswordHash just in case
		a.PasswordHash = ""
		a.QueueID = qID
		a.QueueName = qName
		if qName != "" {
			a.Queues = []string{qName}
		} else {
			a.Queues = []string{}
		}
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

// UpdateQueueID updates the assigned queue ID of an analyst.
func (r *AnalystRepository) UpdateQueueID(ctx context.Context, id string, queueID *string) error {
	query := `
		UPDATE analysts
		SET queue_id = $2
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id, queueID)
	return err
}

// Create inserts a new analyst into the database.
func (r *AnalystRepository) Create(ctx context.Context, email, passwordHash, fullName, role string, queueID *string) (*model.Analyst, error) {
	query := `
		INSERT INTO analysts (email, password_hash, full_name, role, queue_id, is_active, created_at)
		VALUES ($1, $2, $3, $4, $5, true, NOW())
		RETURNING id, email, full_name, role, queue_id, is_active, created_at, last_login
	`

	var a model.Analyst
	var qID *string
	err := r.db.QueryRow(ctx, query, email, passwordHash, fullName, role, queueID).Scan(
		&a.ID,
		&a.Email,
		&a.FullName,
		&a.Role,
		&qID,
		&a.IsActive,
		&a.CreatedAt,
		&a.LastLogin,
	)
	if err != nil {
		return nil, err
	}
	a.QueueID = qID
	if qID != nil {
		var qName string
		_ = r.db.QueryRow(ctx, "SELECT COALESCE(name, '') FROM queues WHERE id = $1", *qID).Scan(&qName)
		a.QueueName = qName
		if qName != "" {
			a.Queues = []string{qName}
		}
	} else {
		a.Queues = []string{}
	}
	return &a, nil
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
