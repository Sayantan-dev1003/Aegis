package repository

import (
	"context"
	"encoding/json"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type VelocityConfigRepository struct {
	db *pgxpool.Pool
}

func NewVelocityConfigRepository(db *pgxpool.Pool) *VelocityConfigRepository {
	return &VelocityConfigRepository{db: db}
}

// List returns all velocity configurations.
// It automatically seeds default values if the table is entirely empty.
func (r *VelocityConfigRepository) List(ctx context.Context) ([]model.VelocityConfig, error) {
	query := `SELECT entity, windows FROM velocity_config`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var configs []model.VelocityConfig
	for rows.Next() {
		var cfg model.VelocityConfig
		if err := rows.Scan(&cfg.Entity, &cfg.Windows); err != nil {
			return nil, err
		}
		configs = append(configs, cfg)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Seed defaults if empty
	if len(configs) == 0 {
		defaults := []model.VelocityConfig{
			{Entity: "user", Windows: []string{"1h", "24h"}},
			{Entity: "device", Windows: []string{"1h", "24h"}},
			{Entity: "ip", Windows: []string{"1h", "24h"}},
		}
		for _, cfg := range defaults {
			if err := r.Upsert(ctx, &cfg); err == nil {
				configs = append(configs, cfg)
			}
		}
	}

	return configs, nil
}

func (r *VelocityConfigRepository) Upsert(ctx context.Context, cfg *model.VelocityConfig) error {
	query := `
		INSERT INTO velocity_config (entity, windows)
		VALUES ($1, $2)
		ON CONFLICT (entity) DO UPDATE SET windows = EXCLUDED.windows
	`
	windowsJSON, err := json.Marshal(cfg.Windows)
	if err != nil {
		return err
	}

	_, err = r.db.Exec(ctx, query, cfg.Entity, windowsJSON)
	return err
}
