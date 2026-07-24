package repository

import (
	"context"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IncidentRepository struct {
	db *pgxpool.Pool
}

func NewIncidentRepository(db *pgxpool.Pool) *IncidentRepository {
	return &IncidentRepository{db: db}
}

// ListActive returns a list of incidents that have status = 'active'
func (r *IncidentRepository) ListActive(ctx context.Context) ([]model.Incident, error) {
	query := `
		SELECT id, title, description, status, severity, created_at, resolved_at, updated_at
		FROM incidents
		WHERE status = 'active'
		ORDER BY created_at DESC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("IncidentRepository.ListActive: failed to query incidents: %w", err)
	}
	defer rows.Close()

	var incidents []model.Incident
	for rows.Next() {
		var inc model.Incident
		if err := rows.Scan(
			&inc.ID, &inc.Title, &inc.Description, &inc.Status, &inc.Severity,
			&inc.CreatedAt, &inc.ResolvedAt, &inc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("IncidentRepository.ListActive: failed to scan row: %w", err)
		}
		incidents = append(incidents, inc)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("IncidentRepository.ListActive: rows error: %w", err)
	}

	return incidents, nil
}

func (r *IncidentRepository) Create(ctx context.Context, incident *model.Incident) error {
	query := `
		INSERT INTO incidents (title, description, status, severity, created_at, updated_at)
		VALUES ($1, $2, $3, $4, NOW(), NOW())
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRow(ctx, query,
		incident.Title,
		incident.Description,
		incident.Status,
		incident.Severity,
	).Scan(&incident.ID, &incident.CreatedAt, &incident.UpdatedAt)
	
	if err != nil {
		return fmt.Errorf("IncidentRepository.Create: failed to insert incident: %w", err)
	}
	return nil
}
