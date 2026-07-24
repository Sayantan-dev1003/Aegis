package service

import (
	"context"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
)

type IncidentService struct {
	repo *repository.IncidentRepository
}

func NewIncidentService(repo *repository.IncidentRepository) *IncidentService {
	return &IncidentService{repo: repo}
}

// GetActiveIncidents retrieves all active incidents
func (s *IncidentService) GetActiveIncidents(ctx context.Context) ([]model.Incident, error) {
	return s.repo.ListActive(ctx)
}
