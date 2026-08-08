package repository

import (
	"context"
	"fmt"
	"math"
	"time"

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
		WHERE (t.status IN ('scored', 'auto_blocked', 'breached') AND r.id IS NULL)
		   OR r.decision = 'escalated'
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

func (r *StatsRepository) GetExecutiveSummary(ctx context.Context, fromTime time.Time, timeFrame string) (*model.ExecutiveSummaryResponse, error) {
	txnsQuery := `
		SELECT 
			COUNT(t.id) AS total_monitored_txns,
			COUNT(t.id) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud') AS fraud_txns_count,
			COUNT(t.id) FILTER (WHERE t.status = 'auto_blocked') AS auto_blocked_count,
			COUNT(t.id) FILTER (WHERE r.decision = 'confirmed_fraud') AS confirmed_fraud_count,
			COUNT(t.id) FILTER (WHERE t.status != 'auto_blocked' AND (r.id IS NULL OR r.decision != 'confirmed_fraud')) AS legit_count,
			COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud'), 0.0) AS total_fraud_prevented
		FROM transactions t
		LEFT JOIN reviews r ON r.transaction_id = t.id
		WHERE t.ingested_at >= $1;
	`
	var totalMonitored, fraudCount, autoBlockedCount, confirmedFraudCount, legitCount int
	var totalPrevented float64
	err := r.db.QueryRow(ctx, txnsQuery, fromTime).Scan(&totalMonitored, &fraudCount, &autoBlockedCount, &confirmedFraudCount, &legitCount, &totalPrevented)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.GetExecutiveSummary txns: %w", err)
	}

	var overallFraudRate float64
	if totalMonitored > 0 {
		overallFraudRate = (float64(fraudCount) / float64(totalMonitored)) * 100.0
	}

	slaQuery := `
		SELECT 
			COALESCE(
				AVG(
					(in_sla_txns::float / NULLIF(total_txns, 0)::float) * 100.0
				) FILTER (WHERE total_txns > 0),
				0.0
			) AS avg_sla_adherence
		FROM (
			SELECT 
				q.id,
				COUNT(t.id) AS total_txns,
				COUNT(t.id) FILTER (
					WHERE r.reviewed_at IS NOT NULL 
					  AND EXTRACT(EPOCH FROM (r.reviewed_at - t.ingested_at)) / 60.0 <= q.sla_target_minutes
				) AS in_sla_txns
			FROM queues q
			LEFT JOIN transactions t ON t.queue_id = q.id AND t.ingested_at >= $1
			LEFT JOIN reviews r ON r.transaction_id = t.id
			WHERE q.status = 'active'
			GROUP BY q.id
		) queue_stats;
	`
	var queueSlaAdherence float64
	err = r.db.QueryRow(ctx, slaQuery, fromTime).Scan(&queueSlaAdherence)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.GetExecutiveSummary sla: %w", err)
	}

	return &model.ExecutiveSummaryResponse{
		TimeFrame:           timeFrame,
		TotalFraudPrevented: totalPrevented,
		OverallFraudRate:    overallFraudRate,
		TotalMonitoredTxns:  totalMonitored,
		QueueSlaAdherence:   queueSlaAdherence,
		FraudTxnsCount:      fraudCount,
		AutoBlockedCount:    autoBlockedCount,
		ConfirmedFraudCount: confirmedFraudCount,
		LegitCount:          legitCount,
		ComputedAt:          time.Now().UTC(),
	}, nil
}

func (r *StatsRepository) GetVerdictVelocity(ctx context.Context, timeFrame string) ([]model.VerdictVelocityPoint, error) {
	var numBuckets int
	var intervalSec int64
	var labelFmt string

	switch timeFrame {
	case "12h":
		numBuckets = 10
		intervalSec = 4320 // 72 minutes
		labelFmt = "03:04 PM"
	case "24h":
		numBuckets = 10
		intervalSec = 8640 // 144 minutes
		labelFmt = "03:04 PM"
	case "7d":
		numBuckets = 7
		intervalSec = 86400 // 24 hours
		labelFmt = "Jan 02"
	case "30d":
		numBuckets = 10
		intervalSec = 259200 // 3 days
		labelFmt = "Jan 02"
	case "90d":
		numBuckets = 12
		intervalSec = 604800 // 7 days (1 week each)
		labelFmt = "Jan 02"
	default:
		numBuckets = 10
		intervalSec = 4320
		labelFmt = "03:04 PM"
	}

	now := time.Now().UTC()
	startTime := now.Add(-time.Duration(int64(numBuckets)*intervalSec) * time.Second)

	query := `
		WITH buckets AS (
			SELECT 
				idx,
				$1::timestamptz + (idx * $2 * interval '1 second') AS bucket_start,
				$1::timestamptz + ((idx + 1) * $2 * interval '1 second') AS bucket_end
			FROM generate_series(0, $3 - 1) AS idx
		)
		SELECT 
			b.bucket_end,
			COUNT(t.id) FILTER (
				WHERE (t.status NOT IN ('auto_blocked', 'escalated') AND (r.id IS NULL OR r.decision != 'confirmed_fraud'))
				   OR r.decision IN ('false_positive', 'legitimate')
			) AS approved_count,
			COUNT(t.id) FILTER (
				WHERE t.status = 'escalated' OR r.id IS NOT NULL
			) AS flagged_count,
			COUNT(t.id) FILTER (
				WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud'
			) AS blocked_count
		FROM buckets b
		LEFT JOIN transactions t ON t.ingested_at >= b.bucket_start AND t.ingested_at < b.bucket_end
		LEFT JOIN reviews r ON r.transaction_id = t.id
		GROUP BY b.idx, b.bucket_end
		ORDER BY b.idx ASC;
	`

	rows, err := r.db.Query(ctx, query, startTime, intervalSec, numBuckets)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.GetVerdictVelocity: %w", err)
	}
	defer rows.Close()

	istLoc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil || istLoc == nil {
		istLoc = time.FixedZone("IST", 5*3600+1800) // UTC + 5:30
	}

	var points []model.VerdictVelocityPoint
	for rows.Next() {
		var bucketEnd time.Time
		var approved, flagged, blocked int
		if err := rows.Scan(&bucketEnd, &approved, &flagged, &blocked); err != nil {
			return nil, fmt.Errorf("StatsRepository.GetVerdictVelocity scan: %w", err)
		}
		label := bucketEnd.In(istLoc).Format(labelFmt)
		points = append(points, model.VerdictVelocityPoint{
			Time:     label,
			Approved: approved,
			Flagged:  flagged,
			Blocked:  blocked,
		})
	}
	return points, nil
}

func (r *StatsRepository) GetMerchantRisk(ctx context.Context, timeFrame string) ([]model.MerchantRiskPoint, error) {
	now := time.Now().UTC()
	var duration time.Duration
	switch timeFrame {
	case "12h":
		duration = 12 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	case "30d":
		duration = 30 * 24 * time.Hour
	case "90d":
		duration = 90 * 24 * time.Hour
	default:
		duration = 12 * time.Hour
	}
	startTime := now.Add(-duration)

	query := `
		SELECT 
			COALESCE(t.merchant_category, 'other') AS category,
			COUNT(t.id) AS txn_count,
			COALESCE(SUM(t.amount), 0) AS total_inr,
			COUNT(t.id) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud') AS blocked_count,
			COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud'), 0) AS saved_inr
		FROM transactions t
		LEFT JOIN reviews r ON r.transaction_id = t.id
		WHERE t.ingested_at >= $1
		GROUP BY t.merchant_category;
	`

	rows, err := r.db.Query(ctx, query, startTime)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.GetMerchantRisk: %w", err)
	}
	defer rows.Close()

	var points []model.MerchantRiskPoint
	var totalTxns int
	for rows.Next() {
		var pt model.MerchantRiskPoint
		if err := rows.Scan(&pt.Category, &pt.TxnCount, &pt.TotalINR, &pt.BlockedCount, &pt.SavedINR); err != nil {
			return nil, fmt.Errorf("StatsRepository.GetMerchantRisk scan: %w", err)
		}
		totalTxns += pt.TxnCount
		points = append(points, pt)
	}

	for i := range points {
		if totalTxns > 0 {
			points[i].Percentage = (float64(points[i].TxnCount) / float64(totalTxns)) * 100.0
		} else {
			points[i].Percentage = 0.0
		}
		if points[i].TxnCount > 0 {
			points[i].FraudRate = (float64(points[i].BlockedCount) / float64(points[i].TxnCount)) * 100.0
		} else {
			points[i].FraudRate = 0.0
		}
	}

	return points, nil
}

// GetChannelPerformance returns aggregated performance metrics for all 7 payment channels.
func (r *StatsRepository) GetChannelPerformance(ctx context.Context, timeFrame string) ([]model.ChannelPerformancePoint, error) {
	interval := "12 hours"
	switch timeFrame {
	case "24h":
		interval = "24 hours"
	case "7d":
		interval = "7 days"
	case "30d":
		interval = "30 days"
	case "90d":
		interval = "90 days"
	}

	query := fmt.Sprintf(`
		WITH all_channels(channel_code, channel_name) AS (
			VALUES 
				('online',        'Card (E-Commerce)'),
				('pos',           'POS Terminal (Retail)'),
				('atm',           'ATM Withdrawal'),
				('upi',           'UPI Instant Payment'),
				('ach_transfer',  'ACH / NEFT / RTGS'),
				('wire_transfer', 'Wire Transfer (SWIFT)'),
				('mobile_wallet', 'Mobile Wallet')
		)
		SELECT 
			c.channel_name,
			c.channel_code,
			COUNT(t.id) AS monitored_volume,
			ROUND(
				COALESCE(
					(COUNT(t.id) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud')::numeric / NULLIF(COUNT(t.id), 0)) * 100,
					0
				), 2
			) AS fraud_rate,
			COALESCE(
				SUM(t.amount) FILTER (WHERE t.status = 'auto_blocked' OR r.decision = 'confirmed_fraud'), 0
			) AS prevented_inr,
			COALESCE(AVG(t.requeue_count), 0) AS avg_requeues
		FROM all_channels c
		LEFT JOIN transactions t ON (t.channel = c.channel_code OR (c.channel_code = 'online' AND t.channel = 'card_ecommerce') OR (c.channel_code = 'ach_transfer' AND t.channel = 'neft_rtgs')) AND t.timestamp >= NOW() - INTERVAL '%s'
		LEFT JOIN reviews r ON r.transaction_id = t.id
		GROUP BY c.channel_name, c.channel_code
		ORDER BY monitored_volume DESC, fraud_rate DESC
	`, interval)

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query channel performance: %w", err)
	}
	defer rows.Close()

	var points []model.ChannelPerformancePoint
	for rows.Next() {
		var pt model.ChannelPerformancePoint
		var avgRequeues float64

		if err := rows.Scan(&pt.Channel, &pt.RawChannel, &pt.Volume, &pt.FraudRate, &pt.PreventedINR, &avgRequeues); err != nil {
			return nil, fmt.Errorf("failed to scan channel performance row: %w", err)
		}

		// Calculate RiskIndex (0-100)
		riskScore := int(math.Round((pt.FraudRate * 15.0) + (avgRequeues * 10.0)))
		if riskScore > 100 {
			riskScore = 100
		}
		if riskScore < 0 {
			riskScore = 0
		}
		pt.RiskIndex = riskScore

		// Determine SlaHealth
		pt.SlaHealth = "Nominal"
		if pt.RiskIndex >= 70 || avgRequeues >= 2.0 {
			pt.SlaHealth = "Critical"
		} else if pt.RiskIndex >= 35 || avgRequeues >= 1.0 {
			pt.SlaHealth = "Elevated"
		}

		points = append(points, pt)
	}

	return points, nil
}

func (r *StatsRepository) GetOutcomeDistribution(ctx context.Context, timeFrame string) ([]model.OutcomeDistributionPoint, error) {
	now := time.Now().UTC()
	var duration time.Duration
	switch timeFrame {
	case "12h":
		duration = 12 * time.Hour
	case "24h":
		duration = 24 * time.Hour
	case "7d":
		duration = 7 * 24 * time.Hour
	case "30d":
		duration = 30 * 24 * time.Hour
	case "90d":
		duration = 90 * 24 * time.Hour
	default:
		duration = 365 * 24 * time.Hour
	}
	startTime := now.Add(-duration)

	query := `
		SELECT
			COUNT(*) FILTER (WHERE decision = 'legitimate') AS approved_count,
			COUNT(*) FILTER (WHERE decision = 'confirmed_fraud') AS declined_count,
			(SELECT COUNT(*) FROM transactions WHERE status = 'auto_blocked' AND ingested_at >= $1) AS auto_blocked_count,
			COUNT(*) FILTER (WHERE decision = 'escalate') AS escalated_count
		FROM reviews
		WHERE reviewed_at >= $1;
	`
	var approved, declined, autoBlocked, escalated int
	err := r.db.QueryRow(ctx, query, startTime).Scan(&approved, &declined, &autoBlocked, &escalated)
	if err != nil {
		return nil, fmt.Errorf("StatsRepository.GetOutcomeDistribution: %w", err)
	}

	total := approved + declined + autoBlocked + escalated
	pct := func(val int) float64 {
		if total == 0 {
			return 0.0
		}
		return math.Round((float64(val)/float64(total))*1000.0) / 10.0
	}

	points := []model.OutcomeDistributionPoint{
		{Name: "Approved (Legitimate)", Value: pct(approved), Count: approved, Color: "#10B981", Percentage: pct(approved)},
		{Name: "Declined (Confirmed Fraud)", Value: pct(declined), Count: declined, Color: "#F43F5E", Percentage: pct(declined)},
		{Name: "Auto-Blocked by Velocity", Value: pct(autoBlocked), Count: autoBlocked, Color: "#8B5CF6", Percentage: pct(autoBlocked)},
		{Name: "Escalated to AML/PEP", Value: pct(escalated), Count: escalated, Color: "#F59E0B", Percentage: pct(escalated)},
	}
	return points, nil
}

