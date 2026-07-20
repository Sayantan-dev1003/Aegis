package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RetrainRepository struct {
	db *pgxpool.Pool
}

func NewRetrainRepository(db *pgxpool.Pool) *RetrainRepository {
	return &RetrainRepository{db: db}
}

func (r *RetrainRepository) Create(ctx context.Context, job model.RetrainJob) error {
	query := `
		INSERT INTO retrain_jobs (id, status, triggered_by, started_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err := r.db.Exec(ctx, query, job.ID, job.Status, job.TriggeredBy, job.StartedAt)
	return err
}

func (r *RetrainRepository) UpdateStatus(ctx context.Context, id string, status string, durationSec *int) error {
	query := `
		UPDATE retrain_jobs 
		SET status = $2, completed_at = NOW(), duration_sec = $3
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id, status, durationSec)
	return err
}

func (r *RetrainRepository) List(ctx context.Context) ([]model.RetrainJob, error) {
	query := `
		SELECT id, status, started_at, completed_at, duration_sec, triggered_by
		FROM retrain_jobs
		ORDER BY started_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []model.RetrainJob
	for rows.Next() {
		var j model.RetrainJob
		err := rows.Scan(
			&j.ID, &j.Status, &j.StartedAt, &j.CompletedAt, &j.DurationSec, &j.TriggeredBy,
		)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (r *RetrainRepository) HasPendingJob(ctx context.Context) (bool, error) {
	query := `SELECT COUNT(*) FROM retrain_jobs WHERE status = 'pending'`
	var count int
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *RetrainRepository) CleanupZombieJobs(ctx context.Context) error {
	query := `
		UPDATE retrain_jobs 
		SET status = 'failed', duration_sec = 0 
		WHERE status = 'pending'
	`
	_, err := r.db.Exec(ctx, query)
	return err
}
