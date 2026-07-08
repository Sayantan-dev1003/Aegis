package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	db *pgxpool.Pool
}

func NewAuditRepository(db *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{db: db}
}

// Create inserts an audit log. Best effort, does not fail requests.
func (r *AuditRepository) Create(ctx context.Context, logEntry *model.AuditLog) {
	query := `
		INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE(NULLIF($9, '0001-01-01 00:00:00+00'::timestamptz), NOW()))
	`
	
	_, err := r.db.Exec(ctx, query,
		logEntry.ActorID,
		logEntry.Action,
		logEntry.ResourceType,
		logEntry.ResourceID,
		logEntry.OldValue,
		logEntry.NewValue,
		logEntry.IPAddress,
		logEntry.UserAgent,
		logEntry.CreatedAt,
	)

	if err != nil {
		logger.FromContext(ctx).Error().Err(err).
			Str("action", logEntry.Action).
			Msg("Failed to write audit log (best-effort)")
	}
}
