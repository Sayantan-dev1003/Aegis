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
	updateQuery := `
		UPDATE queues q SET
			total_cases = (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id)),
			open_cases = (SELECT COUNT(DISTINCT t.id) FROM transactions t WHERE t.ingested_at >= CURRENT_DATE AND t.queue_id = q.id AND t.status = 'escalated'),
			cases_breached = (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN reviews r ON r.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND ((t.queue_id = q.id AND ((r.reviewed_at IS NOT NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.ingested_at)) / 60.0 > q.sla_target_minutes) OR (r.reviewed_at IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.ingested_at)) / 60.0 > q.sla_target_minutes))) OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id = q.id AND sb.breached_at >= CURRENT_DATE))),
			breach_rate = CASE 
				WHEN (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id)) > 0 THEN
					((SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN reviews r ON r.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND ((t.queue_id = q.id AND ((r.reviewed_at IS NOT NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.ingested_at)) / 60.0 > q.sla_target_minutes) OR (r.reviewed_at IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.ingested_at)) / 60.0 > q.sla_target_minutes))) OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id = q.id AND sb.breached_at >= CURRENT_DATE)))::float / (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id))::float) * 100.0
				ELSE 0.0
			END
	`
	_, _ = r.db.Exec(ctx, updateQuery)

	query := `
		SELECT q.id, q.name, q.description, q.status, q.sla_target_minutes, 
		       q.coverage_start, q.coverage_end, q.timezone, q.created_at, q.updated_at,
		       COALESCE(q.open_cases, 0), COALESCE(q.total_cases, 0), COALESCE(q.cases_breached, 0), COALESCE(q.breach_rate, 0.0),
		       (SELECT string_agg(a.full_name, ', ') FROM analysts a WHERE a.queue_id = q.id AND a.role = 'reviewer' AND a.is_active = true) AS assigned_reviewer
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
		var openCases, totalCases, casesBreached int
		var breachRate float64
		var assignedReviewer *string
		err := rows.Scan(
			&q.ID, &q.Name, &q.Description, &q.Status, &q.SlaTargetMinutes,
			&q.CoverageStart, &q.CoverageEnd, &q.Timezone, &q.CreatedAt, &q.UpdatedAt,
			&openCases, &totalCases, &casesBreached, &breachRate, &assignedReviewer,
		)
		if err != nil {
			return nil, err
		}
		q.OpenCases = &openCases
		q.TotalCases = &totalCases
		q.CasesBreached = &casesBreached
		q.BreachRate = &breachRate
		q.AssignedReviewer = assignedReviewer
		queues = append(queues, q)
	}

	return queues, nil
}

func (r *QueueRepository) Create(ctx context.Context, q *model.Queue) error {
	query := `
		INSERT INTO queues (name, description, sla_target_minutes, coverage_start, coverage_end, timezone)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, status, created_at, updated_at
	`
	err := r.db.QueryRow(ctx, query,
		q.Name, q.Description, q.SlaTargetMinutes, q.CoverageStart, q.CoverageEnd, q.Timezone,
	).Scan(&q.ID, &q.Status, &q.CreatedAt, &q.UpdatedAt)
	if err == nil {
		open := 0
		total := 0
		breached := 0
		rate := 0.0
		q.OpenCases = &open
		q.TotalCases = &total
		q.CasesBreached = &breached
		q.BreachRate = &rate
	}
	return err
}

func (r *QueueRepository) GetByID(ctx context.Context, id string) (*model.Queue, error) {
	updateQuery := `
		UPDATE queues q SET
			total_cases = (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id)),
			open_cases = (SELECT COUNT(DISTINCT t.id) FROM transactions t WHERE t.ingested_at >= CURRENT_DATE AND t.queue_id = q.id AND t.status = 'escalated'),
			cases_breached = (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN reviews r ON r.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND ((t.queue_id = q.id AND ((r.reviewed_at IS NOT NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.ingested_at)) / 60.0 > q.sla_target_minutes) OR (r.reviewed_at IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.ingested_at)) / 60.0 > q.sla_target_minutes))) OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id = q.id AND sb.breached_at >= CURRENT_DATE))),
			breach_rate = CASE 
				WHEN (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id)) > 0 THEN
					((SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN reviews r ON r.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND ((t.queue_id = q.id AND ((r.reviewed_at IS NOT NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.ingested_at)) / 60.0 > q.sla_target_minutes) OR (r.reviewed_at IS NULL AND EXTRACT(EPOCH FROM (NOW() - t.ingested_at)) / 60.0 > q.sla_target_minutes))) OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id = q.id AND sb.breached_at >= CURRENT_DATE)))::float / (SELECT COUNT(DISTINCT t.id) FROM transactions t LEFT JOIN escalations e ON e.transaction_id = t.id LEFT JOIN sla_breaches sb ON sb.transaction_id = t.id WHERE t.ingested_at >= CURRENT_DATE AND (t.queue_id = q.id OR sb.original_queue_id = q.id OR sb.fallback_queue_id = q.id OR e.target_queue_id = q.id))::float) * 100.0
				ELSE 0.0
			END
		WHERE id = $1
	`
	_, _ = r.db.Exec(ctx, updateQuery, id)

	query := `
		SELECT q.id, q.name, q.description, q.status, q.sla_target_minutes, 
		       q.coverage_start, q.coverage_end, q.timezone, q.created_at, q.updated_at,
		       COALESCE(q.open_cases, 0), COALESCE(q.total_cases, 0), COALESCE(q.cases_breached, 0), COALESCE(q.breach_rate, 0.0),
		       (SELECT string_agg(a.full_name, ', ') FROM analysts a WHERE a.queue_id = q.id AND a.role = 'reviewer' AND a.is_active = true) AS assigned_reviewer
		FROM queues q
		WHERE q.id = $1
	`
	var q model.Queue
	var openCases, totalCases, casesBreached int
	var breachRate float64
	var assignedReviewer *string
	err := r.db.QueryRow(ctx, query, id).Scan(
		&q.ID, &q.Name, &q.Description, &q.Status, &q.SlaTargetMinutes,
		&q.CoverageStart, &q.CoverageEnd, &q.Timezone, &q.CreatedAt, &q.UpdatedAt,
		&openCases, &totalCases, &casesBreached, &breachRate, &assignedReviewer,
	)
	if err != nil {
		return nil, err
	}
	q.OpenCases = &openCases
	q.TotalCases = &totalCases
	q.CasesBreached = &casesBreached
	q.BreachRate = &breachRate
	q.AssignedReviewer = assignedReviewer
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

// FindByName retrieves a queue by its exact name.
func (r *QueueRepository) FindByName(ctx context.Context, name string) (*model.Queue, error) {
	query := `
		SELECT id, name, description, status, sla_target_minutes, 
		       coverage_start, coverage_end, timezone, created_at, updated_at
		FROM queues
		WHERE name = $1
	`
	var q model.Queue
	err := r.db.QueryRow(ctx, query, name).Scan(
		&q.ID, &q.Name, &q.Description, &q.Status, &q.SlaTargetMinutes,
		&q.CoverageStart, &q.CoverageEnd, &q.Timezone, &q.CreatedAt, &q.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &q, nil
}

// GetFallbackQueue returns the "Default Fallback Queue" if present, otherwise returns the oldest active queue as a safety net to guarantee zero dropped cases.
func (r *QueueRepository) GetFallbackQueue(ctx context.Context) (*model.Queue, error) {
	q, err := r.FindByName(ctx, "Default Fallback Queue")
	if err == nil && q != nil {
		return q, nil
	}
	query := `
		SELECT id, name, description, status, sla_target_minutes, 
		       coverage_start, coverage_end, timezone, created_at, updated_at
		FROM queues
		WHERE status = 'active'
		ORDER BY created_at ASC
		LIMIT 1
	`
	var fallback model.Queue
	err = r.db.QueryRow(ctx, query).Scan(
		&fallback.ID, &fallback.Name, &fallback.Description, &fallback.Status, &fallback.SlaTargetMinutes,
		&fallback.CoverageStart, &fallback.CoverageEnd, &fallback.Timezone, &fallback.CreatedAt, &fallback.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &fallback, nil
}

