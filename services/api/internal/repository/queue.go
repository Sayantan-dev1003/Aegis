package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QueueRepository struct {
	db *pgxpool.Pool
}

func NewQueueRepository(db *pgxpool.Pool) *QueueRepository {
	return &QueueRepository{db: db}
}

func (r *QueueRepository) List(ctx context.Context) ([]model.Queue, error) {
	query := `
		SELECT q.id, q.name, q.description, q.status, q.sla_target_minutes, q.assignment_rule, 
		       q.coverage_start, q.coverage_end, q.timezone, q.created_at, q.updated_at,
		       0 AS open_cases
		FROM queues q
		ORDER BY q.created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var queues []model.Queue
	for rows.Next() {
		var q model.Queue
		var openCases int
		err := rows.Scan(
			&q.ID, &q.Name, &q.Description, &q.Status, &q.SlaTargetMinutes, &q.AssignmentRule,
			&q.CoverageStart, &q.CoverageEnd, &q.Timezone, &q.CreatedAt, &q.UpdatedAt,
			&openCases,
		)
		if err != nil {
			return nil, err
		}
		q.OpenCases = &openCases
		queues = append(queues, q)
	}
	return queues, nil
}

func (r *QueueRepository) Create(ctx context.Context, q *model.Queue) error {
	query := `
		INSERT INTO queues (name, description, sla_target_minutes, assignment_rule, coverage_start, coverage_end, timezone)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, status, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		q.Name, q.Description, q.SlaTargetMinutes, q.AssignmentRule, q.CoverageStart, q.CoverageEnd, q.Timezone,
	).Scan(&q.ID, &q.Status, &q.CreatedAt, &q.UpdatedAt)
}

func (r *QueueRepository) GetByID(ctx context.Context, id string) (*model.Queue, error) {
	query := `
		SELECT id, name, description, status, sla_target_minutes, assignment_rule, 
		       coverage_start, coverage_end, timezone, created_at, updated_at
		FROM queues
		WHERE id = $1
	`
	var q model.Queue
	err := r.db.QueryRow(ctx, query, id).Scan(
		&q.ID, &q.Name, &q.Description, &q.Status, &q.SlaTargetMinutes, &q.AssignmentRule,
		&q.CoverageStart, &q.CoverageEnd, &q.Timezone, &q.CreatedAt, &q.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &q, nil
}

func (r *QueueRepository) Update(ctx context.Context, id string, status string) error {
	query := `UPDATE queues SET status = $2 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, status)
	return err
}

func (r *QueueRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM queues WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
