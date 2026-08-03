package repository

import (
	"context"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditSampleRepository struct {
	db *pgxpool.Pool
}

func NewAuditSampleRepository(db *pgxpool.Pool) *AuditSampleRepository {
	return &AuditSampleRepository{db: db}
}

// Create inserts a new block audit sample record.
func (r *AuditSampleRepository) Create(ctx context.Context, sample *model.BlockAuditSample) error {
	query := `
		INSERT INTO block_audit_samples (transaction_id, sampled_reason, created_at)
		VALUES ($1, $2, NOW())
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query,
		sample.TransactionID,
		sample.SampledReason,
	).Scan(&sample.ID, &sample.CreatedAt)

	if err != nil {
		return fmt.Errorf("AuditSampleRepository.Create: failed to insert audit sample: %w", err)
	}
	return nil
}

// List returns block audit samples along with enriched transaction summary details.
func (r *AuditSampleRepository) List(ctx context.Context, req model.ListAuditSamplesRequest) ([]model.BlockAuditSample, int, error) {
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := req.Offset
	if offset < 0 {
		offset = 0
	}

	whereClause := "WHERE 1=1"
	args := []any{}
	argIdx := 1

	if req.SampledReason != "" {
		whereClause += fmt.Sprintf(" AND b.sampled_reason = $%d", argIdx)
		args = append(args, req.SampledReason)
		argIdx++
	}

	countQuery := fmt.Sprintf(`SELECT COUNT(*) FROM block_audit_samples b %s`, whereClause)
	var total int
	if err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("AuditSampleRepository.List count error: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT b.id, b.transaction_id, b.sampled_reason, b.reviewed_by, b.verdict, b.reviewed_at, b.created_at,
		       COALESCE(t.amount, 0), COALESCE(t.currency, 'INR'), COALESCE(t.merchant_name, ''), t.risk_score, t.risk_band
		FROM block_audit_samples b
		JOIN transactions t ON t.id = b.transaction_id
		%s
		ORDER BY b.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("AuditSampleRepository.List query error: %w", err)
	}
	defer rows.Close()

	var samples []model.BlockAuditSample
	for rows.Next() {
		var s model.BlockAuditSample
		if err := rows.Scan(
			&s.ID, &s.TransactionID, &s.SampledReason, &s.ReviewedBy, &s.Verdict, &s.ReviewedAt, &s.CreatedAt,
			&s.Amount, &s.Currency, &s.MerchantName, &s.RiskScore, &s.RiskBand,
		); err != nil {
			return nil, 0, fmt.Errorf("AuditSampleRepository.List scan error: %w", err)
		}
		samples = append(samples, s)
	}
	return samples, total, nil
}

// UpdateVerdict sets the verdict and reviewer for an audit sample.
func (r *AuditSampleRepository) UpdateVerdict(ctx context.Context, id string, verdict string, reviewerID string) error {
	query := `
		UPDATE block_audit_samples
		SET verdict = $1, reviewed_by = $2, reviewed_at = NOW()
		WHERE id = $3
	`
	tag, err := r.db.Exec(ctx, query, verdict, reviewerID, id)
	if err != nil {
		return fmt.Errorf("AuditSampleRepository.UpdateVerdict error: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("AuditSampleRepository.UpdateVerdict: sample id %s not found", id)
	}
	return nil
}
