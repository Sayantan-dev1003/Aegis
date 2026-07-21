package repository

import (
	"context"
	"net"
	"time"

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
	if reqInfo, ok := ctx.Value(model.RequestInfoKey).(model.RequestInfo); ok {
		if logEntry.IPAddress == nil {
			logEntry.IPAddress = reqInfo.IPAddress
		}
		if logEntry.UserAgent == nil {
			logEntry.UserAgent = reqInfo.UserAgent
		}
	}

	// actor_id is NOT NULL uuid — skip if empty to avoid a silent cast failure
	if logEntry.ActorID == "" {
		logger.FromContext(ctx).Warn().Str("action", logEntry.Action).Msg("Audit log skipped: actor_id is empty")
		return
	}

	// ip_address column is type inet — strip port from RemoteAddr (e.g. "1.2.3.4:56789")
	if logEntry.IPAddress != nil {
		ip := *logEntry.IPAddress
		if host, _, err := net.SplitHostPort(ip); err == nil {
			// Successfully split host:port → use just the host
			ip = host
		}
		// Remove surrounding brackets from IPv6 like [::1]
		if len(ip) > 1 && ip[0] == '[' && ip[len(ip)-1] == ']' {
			ip = ip[1 : len(ip)-1]
		}
		logEntry.IPAddress = &ip
	}

	query := `
		INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, COALESCE(NULLIF($9, '0001-01-01 00:00:00+00'::timestamptz), NOW()))
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
			Str("actor_id", logEntry.ActorID).
			Msg("Failed to write audit log (best-effort)")
	}
}

func (r *AuditRepository) List(ctx context.Context, actorID, action, resourceType string, startDate, endDate time.Time, limit int, offset int) ([]model.AuditLog, int, error) {
	query := `
		SELECT id, actor_id, action, resource_type, resource_id, old_value, new_value, ip_address::text, user_agent, created_at, COUNT(*) OVER() AS total_count
		FROM audit_logs
		WHERE ($1::uuid IS NULL OR actor_id = $1)
		  AND ($2::text = '' OR action = $2)
		  AND ($3::text = '' OR resource_type = $3)
		  AND ($4::timestamptz IS NULL OR created_at >= $4)
		  AND ($5::timestamptz IS NULL OR created_at <= $5)
		ORDER BY created_at DESC
		LIMIT $6 OFFSET $7
	`

	var aID *string
	if actorID != "" {
		aID = &actorID
	}
	var sDate, eDate *time.Time
	if !startDate.IsZero() {
		sDate = &startDate
	}
	if !endDate.IsZero() {
		eDate = &endDate
	}

	rows, err := r.db.Query(ctx, query, aID, action, resourceType, sDate, eDate, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []model.AuditLog
	var totalCount int

	for rows.Next() {
		var log model.AuditLog
		err := rows.Scan(
			&log.ID, &log.ActorID, &log.Action, &log.ResourceType, &log.ResourceID,
			&log.OldValue, &log.NewValue, &log.IPAddress, &log.UserAgent, &log.CreatedAt, &totalCount,
		)
		if err != nil {
			return nil, 0, err
		}
		logs = append(logs, log)
	}

	return logs, totalCount, nil
}
