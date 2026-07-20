package repository

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RuleRepository struct {
	db *pgxpool.Pool
}

func NewRuleRepository(db *pgxpool.Pool) *RuleRepository {
	return &RuleRepository{db: db}
}

func (r *RuleRepository) List(ctx context.Context) ([]model.Rule, error) {
	query := `
		SELECT id, name, entity, metric, operator, value, "window", action, is_active, created_at, updated_at
		FROM rules
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []model.Rule
	for rows.Next() {
		var rule model.Rule
		err := rows.Scan(
			&rule.ID, &rule.Name, &rule.Entity, &rule.Metric, &rule.Operator,
			&rule.Value, &rule.Window, &rule.Action, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

func (r *RuleRepository) Create(ctx context.Context, rule *model.Rule) error {
	query := `
		INSERT INTO rules (name, entity, metric, operator, value, "window", action)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, is_active, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query,
		rule.Name, rule.Entity, rule.Metric, rule.Operator, rule.Value, rule.Window, rule.Action,
	).Scan(&rule.ID, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt)
}

func (r *RuleRepository) GetByID(ctx context.Context, id string) (*model.Rule, error) {
	query := `
		SELECT id, name, entity, metric, operator, value, "window", action, is_active, created_at, updated_at
		FROM rules
		WHERE id = $1
	`
	var rule model.Rule
	err := r.db.QueryRow(ctx, query, id).Scan(
		&rule.ID, &rule.Name, &rule.Entity, &rule.Metric, &rule.Operator,
		&rule.Value, &rule.Window, &rule.Action, &rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

func (r *RuleRepository) ToggleActive(ctx context.Context, id string, isActive bool) error {
	query := `UPDATE rules SET is_active = $2 WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id, isActive)
	return err
}

func (r *RuleRepository) Delete(ctx context.Context, id string) error {
	query := `DELETE FROM rules WHERE id = $1`
	_, err := r.db.Exec(ctx, query, id)
	return err
}
