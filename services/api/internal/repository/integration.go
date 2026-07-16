package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IntegrationRepository struct {
	db *pgxpool.Pool
}

func NewIntegrationRepository(db *pgxpool.Pool) *IntegrationRepository {
	return &IntegrationRepository{db: db}
}

func (r *IntegrationRepository) ListAPIKeys(ctx context.Context) ([]model.APIKey, error) {
	query := `
		SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
		FROM api_keys
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []model.APIKey
	for rows.Next() {
		var k model.APIKey
		err := rows.Scan(
			&k.ID, &k.Name, &k.KeyPrefix, &k.Scopes, &k.CreatedAt, &k.LastUsedAt, &k.RevokedAt,
		)
		if err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (r *IntegrationRepository) CreateAPIKey(ctx context.Context, k *model.APIKey) error {
	query := `
		INSERT INTO api_keys (name, key_hash, key_prefix, scopes)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	return r.db.QueryRow(ctx, query,
		k.Name, k.KeyHash, k.KeyPrefix, k.Scopes,
	).Scan(&k.ID, &k.CreatedAt)
}

func (r *IntegrationRepository) RevokeAPIKey(ctx context.Context, id string) error {
	query := `UPDATE api_keys SET revoked_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}

func (r *IntegrationRepository) ListWebhooks(ctx context.Context) ([]model.Webhook, error) {
	query := `
		SELECT id, url, subscribed_events, status, created_at
		FROM webhooks
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var hooks []model.Webhook
	for rows.Next() {
		var w model.Webhook
		err := rows.Scan(
			&w.ID, &w.URL, &w.SubscribedEvents, &w.Status, &w.CreatedAt,
		)
		if err != nil {
			return nil, err
		}
		hooks = append(hooks, w)
	}
	return hooks, nil
}

func (r *IntegrationRepository) CreateWebhook(ctx context.Context, w *model.Webhook) error {
	query := `
		INSERT INTO webhooks (url, subscribed_events, secret_hash)
		VALUES ($1, $2, $3)
		RETURNING id, status, created_at
	`
	return r.db.QueryRow(ctx, query,
		w.URL, w.SubscribedEvents, w.SecretHash,
	).Scan(&w.ID, &w.Status, &w.CreatedAt)
}

func (r *IntegrationRepository) UpdateWebhook(ctx context.Context, id string, status string) error {
	query := `UPDATE webhooks SET status = $2 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, status)
	return err
}

func (r *IntegrationRepository) DeleteWebhook(ctx context.Context, id string) error {
	query := `DELETE FROM webhooks WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
