package repository

import (
	"context"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type StatsRepository struct {
	db *pgxpool.Pool
}

func NewStatsRepository(db *pgxpool.Pool) *StatsRepository {
	return &StatsRepository{db: db}
}

func (r *StatsRepository) TodayTotal(ctx context.Context) (int, error) {
	query := `
		SELECT COUNT(*) FROM transactions
		WHERE ingested_at >= CURRENT_DATE AND ingested_at < CURRENT_DATE + INTERVAL '1 day'
	`
	var count int
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("StatsRepository.TodayTotal: %w", err)
	}
	return count, nil
}

func (r *StatsRepository) TodayFlagged(ctx context.Context) (int, error) {
	query := `
		SELECT COUNT(*) FROM transactions t
		JOIN fraud_results fr ON fr.transaction_id = t.id
		WHERE t.ingested_at >= CURRENT_DATE
		AND fr.is_fraud = true
	`
	var count int
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("StatsRepository.TodayFlagged: %w", err)
	}
	return count, nil
}

func (r *StatsRepository) TodayAutoBlocked(ctx context.Context) (int, error) {
	query := `
		SELECT COUNT(*) FROM transactions
		WHERE status = 'auto_blocked'
		AND ingested_at >= CURRENT_DATE
	`
	var count int
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("StatsRepository.TodayAutoBlocked: %w", err)
	}
	return count, nil
}

func (r *StatsRepository) PendingReview(ctx context.Context) (int, error) {
	query := `
		SELECT COUNT(*) FROM transactions t
		LEFT JOIN reviews r ON r.transaction_id = t.id
		WHERE t.status IN ('scored', 'auto_blocked')
		AND r.id IS NULL
	`
	var count int
	err := r.db.QueryRow(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("StatsRepository.PendingReview: %w", err)
	}
	return count, nil
}

func (r *StatsRepository) FalsePositiveStats(ctx context.Context) (falsePositives int, totalReviewed int, err error) {
	query := `
		SELECT 
			COUNT(*) FILTER (WHERE r.decision = 'false_positive' AND fr.is_fraud = true) as false_positives,
			COUNT(*) FILTER (WHERE r.decision IS NOT NULL) as total_reviewed
		FROM transactions t
		JOIN fraud_results fr ON fr.transaction_id = t.id
		LEFT JOIN reviews r ON r.transaction_id = t.id
		WHERE t.ingested_at >= NOW() - INTERVAL '7 days'
	`
	err = r.db.QueryRow(ctx, query).Scan(&falsePositives, &totalReviewed)
	if err != nil {
		err = fmt.Errorf("StatsRepository.FalsePositiveStats: %w", err)
	}
	return
}

func (r *StatsRepository) Trends(ctx context.Context, granularity string, periodStr string) ([]model.TrendPoint, error) {
	query := `
		SELECT 
			date_trunc($1, t.ingested_at AT TIME ZONE 'UTC') as bucket,
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE fr.is_fraud = true) as flagged,
			COUNT(*) FILTER (WHERE t.status = 'auto_blocked') as auto_blocked,
			AVG(fr.fraud_score) as avg_fraud_score
		FROM transactions t
		LEFT JOIN fraud_results fr ON fr.transaction_id = t.id
		WHERE t.ingested_at >= NOW() - $2::INTERVAL
		GROUP BY bucket
		ORDER BY bucket ASC
	`
	rows, err := r.db.Query(ctx, query, granularity, periodStr)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.Trends: %w", err)
	}
	defer rows.Close()

	var trends []model.TrendPoint
	for rows.Next() {
		var tp model.TrendPoint
		if err := rows.Scan(&tp.Bucket, &tp.Total, &tp.Flagged, &tp.AutoBlocked, &tp.AvgFraudScore); err != nil {
			return nil, fmt.Errorf("StatsRepository.Trends scan: %w", err)
		}
		trends = append(trends, tp)
	}
	return trends, nil
}
