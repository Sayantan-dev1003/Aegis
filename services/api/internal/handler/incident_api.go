package handler

import (
	"encoding/json"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
)

type IncidentHandler struct {
	incidentService *service.IncidentService
}

func NewIncidentHandler(incidentService *service.IncidentService) *IncidentHandler {
	return &IncidentHandler{incidentService: incidentService}
}

// GetActiveIncidents returns a list of active incidents
func (h *IncidentHandler) GetActiveIncidents(w http.ResponseWriter, r *http.Request) {
	incidents, err := h.incidentService.GetActiveIncidents(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Failed to fetch incidents"})
		return
	}

	// Always return an array (even if empty) to the frontend
	if incidents == nil {
		incidents = make([]model.Incident, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(incidents)
}
