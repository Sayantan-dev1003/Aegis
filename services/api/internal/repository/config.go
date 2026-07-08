package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ConfigRepository struct {
	db *pgxpool.Pool
}

func NewConfigRepository(db *pgxpool.Pool) *ConfigRepository {
	return &ConfigRepository{db: db}
}

// GetAll retrieves all configuration keys and values.
func (r *ConfigRepository) GetAll(ctx context.Context) ([]model.SystemConfig, error) {
	query := `
		SELECT key, value, description, updated_by, updated_at
		FROM system_config
		ORDER BY key ASC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("ConfigRepository.GetAll: %w", err)
	}
	defer rows.Close()

	var configs []model.SystemConfig
	for rows.Next() {
		var c model.SystemConfig
		if err := rows.Scan(&c.Key, &c.Value, &c.Description, &c.UpdatedBy, &c.UpdatedAt); err != nil {
			return nil, fmt.Errorf("ConfigRepository.GetAll scan: %w", err)
		}
		configs = append(configs, c)
	}
	return configs, nil
}

// GetValue retrieves a specific config value.
func (r *ConfigRepository) GetValue(ctx context.Context, key string) (string, error) {
	query := `SELECT value FROM system_config WHERE key = $1`
	var val string
	err := r.db.QueryRow(ctx, query, key).Scan(&val)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil // config not found
		}
		return "", fmt.Errorf("ConfigRepository.GetValue: %w", err)
	}
	return val, nil
}

// Update modifies a configuration value.
func (r *ConfigRepository) Update(ctx context.Context, key, value string, updatedBy string) error {
	query := `
		UPDATE system_config 
		SET value = $1, updated_by = $2, updated_at = NOW()
		WHERE key = $3
	`
	res, err := r.db.Exec(ctx, query, value, updatedBy, key)
	if err != nil {
		return fmt.Errorf("ConfigRepository.Update: %w", err)
	}
	
	if res.RowsAffected() == 0 {
		return fmt.Errorf("ConfigRepository.Update: %w", pgx.ErrNoRows)
	}
	return nil
}
