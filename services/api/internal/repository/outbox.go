package repository

import (
	"context"
	"encoding/json"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// OutboxRepository handles database operations for the outbox pattern.
type OutboxRepository struct {
	db *pgxpool.Pool
}

// NewOutboxRepository creates a new OutboxRepository.
func NewOutboxRepository(db *pgxpool.Pool) *OutboxRepository {
	return &OutboxRepository{db: db}
}

// CreateEvent inserts a new event into the outbox within an existing transaction.
func (r *OutboxRepository) CreateEvent(ctx context.Context, tx pgx.Tx, aggregateID, eventType string, payload []byte) error {
	query := `
		INSERT INTO outbox_events (aggregate_id, event_type, payload)
		VALUES ($1, $2, $3)
	`
	_, err := tx.Exec(ctx, query, aggregateID, eventType, payload)
	return err
}

// GetUnpublished retrieves a batch of unpublished events.
func (r *OutboxRepository) GetUnpublished(ctx context.Context, limit int) ([]model.OutboxEvent, error) {
	query := `
		SELECT id, aggregate_id, event_type, payload, published, published_at, created_at
		FROM outbox_events
		WHERE published = false
		ORDER BY created_at ASC
		LIMIT $1
	`

	rows, err := r.db.Query(ctx, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []model.OutboxEvent
	for rows.Next() {
		var e model.OutboxEvent
		// Notice that postgres jsonb maps perfectly to json.RawMessage ([]byte)
		var rawPayload []byte
		err := rows.Scan(
			&e.ID,
			&e.AggregateID,
			&e.EventType,
			&rawPayload,
			&e.Published,
			&e.PublishedAt,
			&e.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		e.Payload = json.RawMessage(rawPayload)
		events = append(events, e)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return events, nil
}

// MarkPublished updates the event to indicate it has been successfully published.
func (r *OutboxRepository) MarkPublished(ctx context.Context, id string) error {
	query := `
		UPDATE outbox_events
		SET published = true, published_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
