package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReviewerPerformanceRepository struct {
	db *pgxpool.Pool
}

func NewReviewerPerformanceRepository(db *pgxpool.Pool) *ReviewerPerformanceRepository {
	return &ReviewerPerformanceRepository{db: db}
}

func (r *ReviewerPerformanceRepository) GetSummary(ctx context.Context, reviewerID string, periodStr string) (*model.ReviewerPerformanceSummary, error) {
	// periodStr is "today", "week", or "month"
	var dateTrunc string
	switch periodStr {
	case "today":
		dateTrunc = "day"
	case "week":
		dateTrunc = "week"
	case "month":
		dateTrunc = "month"
	default:
		dateTrunc = "month"
	}

	query := `
		WITH review_stats AS (
			SELECT 
				r.decision,
				r.reviewed_at,
				t.claimed_at,
				t.sla_start_at,
				q.sla_target_minutes,
				t.sla_remaining_seconds
			FROM reviews r
			JOIN transactions t ON t.id = r.transaction_id
			LEFT JOIN queues q ON q.id = t.queue_id
			WHERE r.reviewer_id = $1
			  AND r.reviewed_at >= date_trunc($2, NOW() AT TIME ZONE 'UTC')
		)
		SELECT 
			COUNT(*) as cases_reviewed,
			COALESCE(AVG(EXTRACT(EPOCH FROM (reviewed_at - claimed_at)) / 60.0), 0) as avg_handling_time_minutes,
			COUNT(*) FILTER (
				WHERE (sla_remaining_seconds IS NOT NULL AND EXTRACT(EPOCH FROM (reviewed_at - sla_start_at)) <= sla_remaining_seconds)
				   OR (sla_remaining_seconds IS NULL AND EXTRACT(EPOCH FROM (reviewed_at - sla_start_at)) <= sla_target_minutes * 60)
			) as sla_compliant_cases,
			COUNT(*) FILTER (WHERE decision = 'legitimate' OR decision = 'false_positive' OR decision = 'approved') as approved,
			COUNT(*) FILTER (WHERE decision = 'confirmed_fraud' OR decision = 'declined') as declined,
			COUNT(*) FILTER (WHERE decision = 'blocked' OR decision = 'block') as blocked,
			COUNT(*) FILTER (WHERE decision = 'escalated' OR decision = 'escalate') as escalated
		FROM review_stats
	`

	var casesReviewed, slaCompliantCases, approved, declined, blocked, escalated int
	var avgHandlingTimeMinutes float64

	err := r.db.QueryRow(ctx, query, reviewerID, dateTrunc).Scan(
		&casesReviewed,
		&avgHandlingTimeMinutes,
		&slaCompliantCases,
		&approved,
		&declined,
		&blocked,
		&escalated,
	)
	if err != nil {
		return nil, fmt.Errorf("ReviewerPerformanceRepository.GetSummary: %w", err)
	}

	var slaCompliancePct float64
	if casesReviewed > 0 {
		slaCompliancePct = (float64(slaCompliantCases) / float64(casesReviewed)) * 100.0
	}

	var throughputPerDay float64
	var avgAht float64 = avgHandlingTimeMinutes

	if periodStr != "today" {
		var elapsedDays float64
		now := time.Now().UTC()
		if periodStr == "week" {
			// Assuming week starts on Monday
			wd := int(now.Weekday())
			if wd == 0 {
				wd = 7 // Sunday is the 7th day
			}
			elapsedDays = float64(wd)
		} else {
			elapsedDays = float64(now.Day())
		}
		
		if elapsedDays > 0 {
			throughputPerDay = float64(casesReviewed) / elapsedDays
		}
	} else {
		throughputPerDay = float64(casesReviewed)
	}

	return &model.ReviewerPerformanceSummary{
		Period:                 periodStr,
		CasesReviewed:          casesReviewed,
		ThroughputPerDay:       throughputPerDay,
		AvgHandlingTimeMinutes: avgAht,
		SLACompliancePct:       slaCompliancePct,
		DecisionBreakdown: model.DecisionBreakdown{
			Approved:  approved,
			Declined:  declined,
			Blocked:   blocked,
			Escalated: escalated,
		},
	}, nil
}

func (r *ReviewerPerformanceRepository) GetThroughputTrend(ctx context.Context, reviewerID string, rangeStr string) ([]model.ReviewerPerformanceTrendBucket, error) {
	var dateTrunc string
	var startDate, endDate time.Time
	now := time.Now().UTC()

	switch rangeStr {
	case "week":
		dateTrunc = "day"
		wd := int(now.Weekday())
		if wd == 0 { wd = 7 }
		startDate = time.Date(now.Year(), now.Month(), now.Day()-wd+1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 0, 6)
	case "month":
		dateTrunc = "week"
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		wd := int(startDate.Weekday())
		if wd == 0 { wd = 7 }
		startDate = startDate.AddDate(0, 0, -wd+1)
		lastDay := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC)
		wdLast := int(lastDay.Weekday())
		if wdLast == 0 { wdLast = 7 }
		endDate = lastDay.AddDate(0, 0, -wdLast+1)
	case "year":
		dateTrunc = "month"
		startDate = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		endDate = time.Date(now.Year(), 12, 1, 0, 0, 0, 0, time.UTC)
	default:
		dateTrunc = "day"
		wd := int(now.Weekday())
		if wd == 0 { wd = 7 }
		startDate = time.Date(now.Year(), now.Month(), now.Day()-wd+1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 0, 6)
	}

	query := `
		WITH dates AS (
			SELECT generate_series(
				$3::timestamp,
				$4::timestamp,
				('1 ' || $1)::interval
			) as bucket
		)
		SELECT 
			d.bucket,
			COUNT(r.id) as value
		FROM dates d
		LEFT JOIN reviews r ON date_trunc($1, r.reviewed_at AT TIME ZONE 'UTC') = d.bucket AND r.reviewer_id = $2
		GROUP BY d.bucket
		ORDER BY d.bucket ASC
	`
	rows, err := r.db.Query(ctx, query, dateTrunc, reviewerID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("ReviewerPerformanceRepository.GetThroughputTrend: %w", err)
	}
	defer rows.Close()

	var buckets []model.ReviewerPerformanceTrendBucket
	for rows.Next() {
		var bucket time.Time
		var value float64
		if err := rows.Scan(&bucket, &value); err != nil {
			return nil, fmt.Errorf("ReviewerPerformanceRepository.GetThroughputTrend scan: %w", err)
		}
		
		label := formatBucketLabel(bucket, dateTrunc)
		buckets = append(buckets, model.ReviewerPerformanceTrendBucket{
			Label: label,
			Value: value,
		})
	}
	return buckets, nil
}

func (r *ReviewerPerformanceRepository) GetAHTTrend(ctx context.Context, reviewerID string, rangeStr string) ([]model.ReviewerPerformanceTrendBucket, *float64, error) {
	var dateTrunc string
	var startDate, endDate time.Time
	now := time.Now().UTC()

	switch rangeStr {
	case "week":
		dateTrunc = "day"
		wd := int(now.Weekday())
		if wd == 0 { wd = 7 }
		startDate = time.Date(now.Year(), now.Month(), now.Day()-wd+1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 0, 6)
	case "month":
		dateTrunc = "week"
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		wd := int(startDate.Weekday())
		if wd == 0 { wd = 7 }
		startDate = startDate.AddDate(0, 0, -wd+1)
		lastDay := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, time.UTC)
		wdLast := int(lastDay.Weekday())
		if wdLast == 0 { wdLast = 7 }
		endDate = lastDay.AddDate(0, 0, -wdLast+1)
	case "year":
		dateTrunc = "month"
		startDate = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		endDate = time.Date(now.Year(), 12, 1, 0, 0, 0, 0, time.UTC)
	default:
		dateTrunc = "day"
		wd := int(now.Weekday())
		if wd == 0 { wd = 7 }
		startDate = time.Date(now.Year(), now.Month(), now.Day()-wd+1, 0, 0, 0, 0, time.UTC)
		endDate = startDate.AddDate(0, 0, 6)
	}

	query := `
		WITH dates AS (
			SELECT generate_series(
				$3::timestamp,
				$4::timestamp,
				('1 ' || $1)::interval
			) as bucket
		)
		SELECT 
			d.bucket,
			COALESCE(AVG(EXTRACT(EPOCH FROM (r.reviewed_at - t.claimed_at)) / 60.0), 0) as value
		FROM dates d
		LEFT JOIN reviews r ON date_trunc($1, r.reviewed_at AT TIME ZONE 'UTC') = d.bucket AND r.reviewer_id = $2
		LEFT JOIN transactions t ON t.id = r.transaction_id
		GROUP BY d.bucket
		ORDER BY d.bucket ASC
	`
	rows, err := r.db.Query(ctx, query, dateTrunc, reviewerID, startDate, endDate)
	if err != nil {
		return nil, nil, fmt.Errorf("ReviewerPerformanceRepository.GetAHTTrend: %w", err)
	}
	defer rows.Close()

	var buckets []model.ReviewerPerformanceTrendBucket
	for rows.Next() {
		var bucket time.Time
		var value float64
		if err := rows.Scan(&bucket, &value); err != nil {
			return nil, nil, fmt.Errorf("ReviewerPerformanceRepository.GetAHTTrend scan: %w", err)
		}
		
		label := formatBucketLabel(bucket, dateTrunc)
		buckets = append(buckets, model.ReviewerPerformanceTrendBucket{
			Label: label,
			Value: value,
		})
	}

	// Fetch SLA Target for this reviewer's queue
	var slaTarget float64
	slaQuery := `
		SELECT q.sla_target_minutes
		FROM analysts a
		LEFT JOIN queues q ON q.id = a.queue_id
		WHERE a.id = $1 AND q.id IS NOT NULL
	`
	err = r.db.QueryRow(ctx, slaQuery, reviewerID).Scan(&slaTarget)
	if err != nil {
		// It's possible they don't have a queue assigned
		return buckets, nil, nil
	}

	return buckets, &slaTarget, nil
}

func (r *ReviewerPerformanceRepository) GetLeaderboard(ctx context.Context, periodStr string, sortBy string) ([]model.ReviewerLeaderboardRow, error) {
	var dateTrunc string
	switch periodStr {
	case "today":
		dateTrunc = "day"
	case "week":
		dateTrunc = "week"
	case "month":
		dateTrunc = "month"
	default:
		dateTrunc = "month"
	}

	query := `
		WITH analyst_stats AS (
			SELECT 
				a.id as reviewer_id,
				a.full_name as name,
				q.name as queue,
				COUNT(r.id) as cases_reviewed,
				COALESCE(AVG(EXTRACT(EPOCH FROM (r.reviewed_at - t.claimed_at)) / 60.0), 0) as avg_handling_time_minutes,
				COUNT(r.id) FILTER (
					WHERE (t.sla_remaining_seconds IS NOT NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.sla_start_at)) <= t.sla_remaining_seconds)
					   OR (t.sla_remaining_seconds IS NULL AND EXTRACT(EPOCH FROM (r.reviewed_at - t.sla_start_at)) <= q.sla_target_minutes * 60)
				) as sla_compliant_cases,
				COUNT(r.id) FILTER (WHERE r.decision = 'escalated' OR r.decision = 'escalate') as escalated_cases
			FROM analysts a
			LEFT JOIN queues q ON q.id = a.queue_id
			JOIN reviews r ON r.reviewer_id = a.id
			JOIN transactions t ON t.id = r.transaction_id
			WHERE r.reviewed_at >= date_trunc($1, NOW() AT TIME ZONE 'UTC')
			GROUP BY a.id, a.full_name, q.name
		)
		SELECT 
			reviewer_id,
			name,
			COALESCE(queue, 'Unassigned') as queue,
			cases_reviewed,
			CASE WHEN cases_reviewed > 0 THEN (sla_compliant_cases::float / cases_reviewed::float) * 100.0 ELSE 0.0 END as sla_compliance_pct,
			avg_handling_time_minutes,
			CASE WHEN cases_reviewed > 0 THEN (escalated_cases::float / cases_reviewed::float) * 100.0 ELSE 0.0 END as escalation_rate_pct
		FROM analyst_stats
	`

	if sortBy == "escalation" {
		query += " ORDER BY escalation_rate_pct ASC, cases_reviewed DESC"
	} else {
		query += " ORDER BY sla_compliance_pct DESC, cases_reviewed DESC"
	}

	rows, err := r.db.Query(ctx, query, dateTrunc)
	if err != nil {
		return nil, fmt.Errorf("ReviewerPerformanceRepository.GetLeaderboard: %w", err)
	}
	defer rows.Close()

	var leaderboard []model.ReviewerLeaderboardRow
	for rows.Next() {
		var row model.ReviewerLeaderboardRow
		if err := rows.Scan(
			&row.ReviewerID,
			&row.Name,
			&row.Queue,
			&row.CasesReviewed,
			&row.SLACompliancePct,
			&row.AvgHandlingTimeMinutes,
			&row.EscalationRatePct,
		); err != nil {
			return nil, fmt.Errorf("ReviewerPerformanceRepository.GetLeaderboard scan: %w", err)
		}
		leaderboard = append(leaderboard, row)
	}
	return leaderboard, nil
}

func formatBucketLabel(t time.Time, trunc string) string {
	switch trunc {
	case "day":
		return t.Format("Mon")
	case "week":
		return "W" + t.Format("02 Jan")
	case "month":
		return t.Format("Jan")
	default:
		return t.Format("Mon")
	}
}
