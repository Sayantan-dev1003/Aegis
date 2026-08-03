package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TransactionRepository handles database operations for transactions.
type TransactionRepository struct {
	db *pgxpool.Pool
}

// NewTransactionRepository creates a new TransactionRepository.
func NewTransactionRepository(db *pgxpool.Pool) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create inserts a new transaction into the database within an existing transaction block.
func (r *TransactionRepository) Create(ctx context.Context, tx pgx.Tx, t *model.Transaction) error {
	if t.PriorityLevel == "" {
		t.PriorityLevel = "normal"
	}
	if t.SLABreachType == "" {
		t.SLABreachType = "none"
	}
	query := `
		INSERT INTO transactions (
			external_id, account_id, merchant_id, merchant_name, merchant_category,
			amount, currency, country_code, transaction_type, channel, device_id,
			ip_address, timestamp, status, queue_id, sla_start_at, priority_level,
			risk_score, risk_band, risk_source, reject_count, step_up_result,
			sla_breach_type, requires_admin_review, sla_paused_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			COALESCE($16, NOW()), $17,
			$18, $19, $20, COALESCE($21, 0), $22,
			$23, COALESCE($24, FALSE), $25
		) RETURNING id, ingested_at
	`

	err := tx.QueryRow(ctx, query,
		t.ExternalID,
		t.AccountID,
		t.MerchantID,
		t.MerchantName,
		t.MerchantCategory,
		t.Amount,
		t.Currency,
		t.CountryCode,
		t.TransactionType,
		t.Channel,
		t.DeviceID,
		t.IPAddress,
		t.Timestamp,
		t.Status,
		t.QueueID,
		t.SLAStartAt,
		t.PriorityLevel,
		t.RiskScore,
		t.RiskBand,
		t.RiskSource,
		t.RejectCount,
		t.StepUpResult,
		t.SLABreachType,
		t.RequiresAdminReview,
		t.SLAPausedAt,
	).Scan(&t.ID, &t.IngestedAt)

	return err
}

// UpdateStatus updates the status of an existing transaction.
func (r *TransactionRepository) UpdateStatus(ctx context.Context, id string, status string) error {
	query := `
		UPDATE transactions
		SET status = $1
		WHERE id = $2
	`
	_, err := r.db.Exec(ctx, query, status, id)
	return err
}

// UpdateStatusAndQueue updates the status and target queue of an existing transaction.
func (r *TransactionRepository) UpdateStatusAndQueue(ctx context.Context, id string, status string, queueID *string) error {
	query := `
		UPDATE transactions
		SET status = $1, queue_id = $2
		WHERE id = $3
	`
	_, err := r.db.Exec(ctx, query, status, queueID, id)
	return err
}

// UpdateRiskEnrichment updates the risk score, risk band, and risk source of a transaction without changing status.
func (r *TransactionRepository) UpdateRiskEnrichment(ctx context.Context, id string, riskScore float64, riskBand string, riskSource string) error {
	query := `
		UPDATE transactions
		SET risk_score = $1, risk_band = $2, risk_source = $3, updated_at = NOW()
		WHERE id = $4
	`
	_, err := r.db.Exec(ctx, query, riskScore, riskBand, riskSource, id)
	return err
}

// UpdateStatusRiskAndQueue updates status, queue, and risk fields of a transaction.
func (r *TransactionRepository) UpdateStatusRiskAndQueue(ctx context.Context, id string, status string, queueID *string, riskScore float64, riskBand string, riskSource string) error {
	query := `
		UPDATE transactions
		SET status = $1, queue_id = $2, risk_score = $3, risk_band = $4, risk_source = $5, updated_at = NOW()
		WHERE id = $6
	`
	_, err := r.db.Exec(ctx, query, status, queueID, riskScore, riskBand, riskSource, id)
	return err
}

// UpdateStatusAndRisk updates status and risk fields of a transaction.
func (r *TransactionRepository) UpdateStatusAndRisk(ctx context.Context, id string, status string, riskScore float64, riskBand string, riskSource string) error {
	query := `
		UPDATE transactions
		SET status = $1, risk_score = $2, risk_band = $3, risk_source = $4, updated_at = NOW()
		WHERE id = $5
	`
	_, err := r.db.Exec(ctx, query, status, riskScore, riskBand, riskSource, id)
	return err
}

// FindByID retrieves a transaction by its internal ID.
func (r *TransactionRepository) FindByID(ctx context.Context, id string) (*model.Transaction, error) {
	query := `
		SELECT 
			id, external_id, account_id, merchant_id, merchant_name, merchant_category,
			amount, currency, country_code, transaction_type, channel, device_id,
			ip_address::text, timestamp, ingested_at, status, queue_id,
			claimed_by, claimed_at, sla_start_at, sla_remaining_seconds, COALESCE(priority_level, 'normal'),
			risk_score, risk_band, risk_source, COALESCE(reject_count, 0), step_up_result,
			COALESCE(sla_breach_type, 'none'), COALESCE(requires_admin_review, FALSE), sla_paused_at
		FROM transactions
		WHERE id = $1
	`

	var t model.Transaction
	err := r.db.QueryRow(ctx, query, id).Scan(
		&t.ID,
		&t.ExternalID,
		&t.AccountID,
		&t.MerchantID,
		&t.MerchantName,
		&t.MerchantCategory,
		&t.Amount,
		&t.Currency,
		&t.CountryCode,
		&t.TransactionType,
		&t.Channel,
		&t.DeviceID,
		&t.IPAddress,
		&t.Timestamp,
		&t.IngestedAt,
		&t.Status,
		&t.QueueID,
		&t.ClaimedBy,
		&t.ClaimedAt,
		&t.SLAStartAt,
		&t.SLARemainingSeconds,
		&t.PriorityLevel,
		&t.RiskScore,
		&t.RiskBand,
		&t.RiskSource,
		&t.RejectCount,
		&t.StepUpResult,
		&t.SLABreachType,
		&t.RequiresAdminReview,
		&t.SLAPausedAt,
	)

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil // Return nil, nil if not found
		}
		return nil, fmt.Errorf("TransactionRepository.FindByID: %w", err)
	}

	return &t, nil
}

// GetByID retrieves a transaction by ID. Identical to FindByID but added to fulfill requirements.
func (r *TransactionRepository) GetByID(ctx context.Context, id string) (*model.Transaction, error) {
	return r.FindByID(ctx, id)
}

// List transactions with keyset pagination and dynamic filters.
func (r *TransactionRepository) List(ctx context.Context, req model.ListTransactionsRequest) ([]model.TransactionSummary, string, error) {
	args := []interface{}{req.QueueID} // $1 is always req.QueueID (or "" if not set)
	argIdx := 2
	where := "WHERE 1=1"

	if req.Status != "" && !strings.EqualFold(req.Status, "all") {
		if strings.EqualFold(req.Status, "breached") {
			where += " AND EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.status = 'breached' AND ($1 = '' OR sb.original_queue_id::text = $1))"
		} else if strings.EqualFold(req.Status, "escalated") {
			where += " AND ((t.status = 'escalated' AND NOT EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.status = 'breached')) OR (t.status = 'breached' AND EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.status = 'breached' AND ($1 = '' OR sb.fallback_queue_id::text = $1))))"
		} else if strings.EqualFold(req.Status, "reviewed") {
			where += fmt.Sprintf(" AND (t.status = $%d OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.status = 'reviewed' AND ($1 = '' OR sb.fallback_queue_id::text = $1)))", argIdx)
			args = append(args, req.Status)
			argIdx++
		} else {
			where += fmt.Sprintf(" AND t.status = $%d", argIdx)
			args = append(args, req.Status)
			argIdx++
		}
	}

	if !req.FromDate.IsZero() {
		where += fmt.Sprintf(" AND t.timestamp >= $%d", argIdx)
		args = append(args, req.FromDate)
		argIdx++
	}

	if !req.ToDate.IsZero() {
		where += fmt.Sprintf(" AND t.timestamp <= $%d", argIdx)
		args = append(args, req.ToDate)
		argIdx++
	}

	if req.MinScore > 0 {
		where += fmt.Sprintf(" AND fr.fraud_score >= $%d", argIdx)
		args = append(args, req.MinScore)
		argIdx++
	}

	if req.IsFraud != nil {
		where += fmt.Sprintf(" AND fr.is_fraud = $%d", argIdx)
		args = append(args, *req.IsFraud)
		argIdx++
	}

	if req.MinAmount != nil {
		where += fmt.Sprintf(" AND t.amount >= $%d", argIdx)
		args = append(args, *req.MinAmount)
		argIdx++
	}

	if req.MaxAmount != nil {
		where += fmt.Sprintf(" AND t.amount <= $%d", argIdx)
		args = append(args, *req.MaxAmount)
		argIdx++
	}

	if req.Channel != "" {
		where += fmt.Sprintf(" AND t.channel ILIKE $%d", argIdx)
		args = append(args, req.Channel)
		argIdx++
	}

	if req.TransactionType != "" {
		where += fmt.Sprintf(" AND t.transaction_type ILIKE $%d", argIdx)
		args = append(args, req.TransactionType)
		argIdx++
	}

	if req.CountryCode != "" {
		where += fmt.Sprintf(" AND t.country_code ILIKE $%d", argIdx)
		args = append(args, req.CountryCode)
		argIdx++
	}

	if req.Search != "" {
		searchStr := req.Search
		if strings.HasPrefix(strings.ToUpper(searchStr), "ACCT_") {
			where += fmt.Sprintf(" AND t.account_id ILIKE $%d", argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		} else if len(searchStr) >= 8 && !strings.Contains(searchStr, " ") {
			where += fmt.Sprintf(" AND (t.id::text ILIKE $%d OR t.merchant_name ILIKE $%d)", argIdx, argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		} else {
			where += fmt.Sprintf(" AND t.merchant_name ILIKE $%d", argIdx)
			args = append(args, "%"+searchStr+"%")
			argIdx++
		}
	}

	if req.QueueID != "" {
		if strings.EqualFold(req.Status, "breached") {
			where += " AND EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id::text = $1)"
		} else if strings.EqualFold(req.Status, "escalated") {
			where += " AND ((t.queue_id::text = $1 AND NOT EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.original_queue_id::text = $1)) OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.fallback_queue_id::text = $1 AND sb.status = 'breached'))"
		} else if strings.EqualFold(req.Status, "reviewed") {
			where += " AND (t.queue_id::text = $1 OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND sb.fallback_queue_id::text = $1 AND sb.status = 'reviewed'))"
		} else if req.Status != "" && !strings.EqualFold(req.Status, "all") {
			where += " AND t.queue_id::text = $1"
		} else {
			where += " AND (t.queue_id::text = $1 OR EXISTS (SELECT 1 FROM sla_breaches sb WHERE sb.transaction_id = t.id AND (sb.original_queue_id::text = $1 OR sb.fallback_queue_id::text = $1)))"
		}
	}

	if req.CursorID != "" && !req.CursorDate.IsZero() {
		where += fmt.Sprintf(" AND (t.ingested_at, t.id) < ($%d, $%d)", argIdx, argIdx+1)
		args = append(args, req.CursorDate, req.CursorID)
		argIdx += 2
	}

	query := `
		SELECT 
			t.id, t.amount, t.currency, t.account_id, t.merchant_id, t.merchant_name, t.merchant_category, t.transaction_type, t.channel, t.country_code, t.ip_address::text,
			CASE 
				WHEN EXISTS (
					SELECT 1 FROM sla_breaches sb 
					WHERE sb.transaction_id = t.id 
					  AND (($1 != '' AND sb.original_queue_id::text = $1) OR ($1 = '' AND sb.status = 'breached'))
				) THEN 'breached'
				WHEN EXISTS (
					SELECT 1 FROM sla_breaches sb 
					WHERE sb.transaction_id = t.id 
					  AND $1 != '' AND sb.fallback_queue_id::text = $1 AND sb.status = 'breached'
				) THEN 'escalated'
				WHEN EXISTS (
					SELECT 1 FROM sla_breaches sb 
					WHERE sb.transaction_id = t.id 
					  AND $1 != '' AND sb.fallback_queue_id::text = $1 AND sb.status = 'reviewed'
				) THEN 'reviewed'
				ELSE t.status
			END as status,
			t.ingested_at, t.timestamp,
			fr.fraud_score, fr.is_fraud, fr.created_at as scored_at,
			r.decision,
			CASE 
				WHEN EXISTS (
					SELECT 1 FROM sla_breaches sb 
					WHERE sb.transaction_id = t.id 
					  AND $1 != '' AND sb.fallback_queue_id::text = $1
				) THEN $1
				ELSE t.queue_id::text
			END as queue_id,
			CASE 
				WHEN EXISTS (
					SELECT 1 FROM sla_breaches sb 
					WHERE sb.transaction_id = t.id 
					  AND $1 != '' AND sb.fallback_queue_id::text = $1
				) THEN (SELECT name FROM queues WHERE id::text = $1)
				ELSE COALESCE(q.name, '')
			END as queue_name,
			(SELECT a.full_name FROM analysts a WHERE a.queue_id = t.queue_id AND a.role = 'reviewer' LIMIT 1) as assignee,
			t.sla_start_at,
			t.sla_paused_at,
			COALESCE(t.priority_level, 'normal') as priority_level,
			t.risk_score,
			t.risk_band,
			t.risk_source,
			COALESCE(t.reject_count, 0) as reject_count,
			t.step_up_result,
			COALESCE(t.sla_breach_type, 'none') as sla_breach_type,
			COALESCE(t.requires_admin_review, FALSE) as requires_admin_review,
			t.claimed_at
		FROM transactions t
		LEFT JOIN fraud_results fr ON fr.transaction_id = t.id
		LEFT JOIN reviews r ON r.transaction_id = t.id
		LEFT JOIN queues q ON t.queue_id = q.id
		` + where + `
		ORDER BY t.risk_score DESC NULLS LAST, t.ingested_at DESC, t.id DESC
		LIMIT $` + fmt.Sprintf("%d", argIdx)

	args = append(args, req.Limit)
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("TransactionRepository.List: %w", err)
	}
	defer rows.Close()

	var results []model.TransactionSummary
	for rows.Next() {
		var summary model.TransactionSummary
		err := rows.Scan(
			&summary.ID, &summary.Amount, &summary.Currency, &summary.AccountID, &summary.MerchantID, &summary.MerchantName, &summary.MerchantCategory, &summary.TransactionType, &summary.Channel, &summary.CountryCode, &summary.IPAddress, &summary.Status, &summary.CreatedAt, &summary.Timestamp,
			&summary.FraudScore, &summary.IsFraud, &summary.ScoredAt,
			&summary.ReviewDecision,
			&summary.QueueID, &summary.QueueName, &summary.Assignee,
			&summary.SLAStartAt,
			&summary.SLAPausedAt,
			&summary.PriorityLevel,
			&summary.RiskScore,
			&summary.RiskBand,
			&summary.RiskSource,
			&summary.RejectCount,
			&summary.StepUpResult,
			&summary.SLABreachType,
			&summary.RequiresAdminReview,
			&summary.ClaimedAt,
		)
		if err != nil {
			return nil, "", fmt.Errorf("TransactionRepository.List scan: %w", err)
		}
		results = append(results, summary)
	}

	// Calculate next cursor
	nextCursor := ""
	// Handler will generate it from the last item.

	return results, nextCursor, nil
}

// ListDLQ lists scoring failed transactions for DLQ with keyset pagination.
func (r *TransactionRepository) ListDLQ(ctx context.Context, limit int, cursorID string, cursorDate time.Time) ([]model.Transaction, string, error) {
	args := []interface{}{limit}
	where := "WHERE status = 'scoring_failed'"
	
	if cursorID != "" && !cursorDate.IsZero() {
		where += " AND (ingested_at, id) < ($2, $3)"
		args = append(args, cursorDate, cursorID)
	}

	query := `
		SELECT id, amount, merchant_id, account_id, status, requeue_count, last_requeued_at, ingested_at, updated_at, external_id, timestamp
		FROM transactions
		` + where + `
		ORDER BY ingested_at DESC, id DESC
		LIMIT $1
	`
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, "", fmt.Errorf("TransactionRepository.ListDLQ: %w", err)
	}
	defer rows.Close()

	var results []model.Transaction
	for rows.Next() {
		var t model.Transaction
		err := rows.Scan(&t.ID, &t.Amount, &t.MerchantID, &t.AccountID, &t.Status, &t.RequeueCount, &t.LastRequeuedAt, &t.IngestedAt, &t.UpdatedAt, &t.ExternalID, &t.Timestamp)
		if err != nil {
			return nil, "", fmt.Errorf("TransactionRepository.ListDLQ scan: %w", err)
		}
		results = append(results, t)
	}
	return results, "", nil
}

// IncrementRequeue increments requeue count and status.
func (r *TransactionRepository) IncrementRequeue(ctx context.Context, id string) error {
	query := `
		UPDATE transactions 
		SET status = 'processing', 
			requeue_count = requeue_count + 1,
			last_requeued_at = NOW(),
			updated_at = NOW()
		WHERE id = $1
	`
	res, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("TransactionRepository.IncrementRequeue: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("TransactionRepository.IncrementRequeue: %w", pgx.ErrNoRows)
	}
	return nil
}

// CountByAccount gets the number of transactions for an account since a given time.
func (r *TransactionRepository) CountByAccount(ctx context.Context, accountID string, since time.Time) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM transactions
		WHERE account_id = $1 AND timestamp >= $2
	`
	var count int
	err := r.db.QueryRow(ctx, query, accountID, since).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("TransactionRepository.CountByAccount: %w", err)
	}
	return count, nil
}
