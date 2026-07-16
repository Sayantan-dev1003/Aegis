package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/go-chi/chi/v5"
)

type AnalystHandler struct {
	analystRepo *repository.AnalystRepository
	auditRepo   *repository.AuditRepository
}

func NewAnalystHandler(
	analystRepo *repository.AnalystRepository,
	auditRepo *repository.AuditRepository,
) *AnalystHandler {
	return &AnalystHandler{
		analystRepo: analystRepo,
		auditRepo:   auditRepo,
	}
}

func (h *AnalystHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *AnalystHandler) ListAnalysts(w http.ResponseWriter, r *http.Request) {
	analysts, err := h.analystRepo.List(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if analysts == nil {
		analysts = []model.Analyst{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analysts)
}

type UpdateAnalystRequest struct {
	Role     *string `json:"role"`
	IsActive *bool   `json:"is_active"`
}

func (h *AnalystHandler) UpdateAnalyst(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	var req UpdateAnalystRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.Role == nil && req.IsActive == nil {
		h.respondError(w, "nothing to update", http.StatusBadRequest)
		return
	}

	analyst, err := h.analystRepo.FindByID(r.Context(), id)
	if err != nil || analyst == nil {
		h.respondError(w, "analyst not found", http.StatusNotFound)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)

	if req.Role != nil {
		if err := h.analystRepo.UpdateRole(r.Context(), id, *req.Role); err != nil {
			h.respondError(w, "internal server error", http.StatusInternalServerError)
			return
		}
		
		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			oldVal := analyst.Role
			newVal := *req.Role
			h.auditRepo.Create(bgCtx, &model.AuditLog{
				ActorID:      info.ID,
				Action:       "analyst.updated",
				ResourceType: "analyst",
				ResourceID:   &id,
				OldValue:     &oldVal,
				NewValue:     &newVal,
				CreatedAt:    time.Now().UTC(),
			})
		}()
	}

	if req.IsActive != nil {
		if err := h.analystRepo.SetActive(r.Context(), id, *req.IsActive); err != nil {
			h.respondError(w, "internal server error", http.StatusInternalServerError)
			return
		}

		go func() {
			bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			oldVal := fmt.Sprintf("%t", analyst.IsActive)
			newVal := fmt.Sprintf("%t", *req.IsActive)
			h.auditRepo.Create(bgCtx, &model.AuditLog{
				ActorID:      info.ID,
				Action:       "analyst.updated",
				ResourceType: "analyst",
				ResourceID:   &id,
				OldValue:     &oldVal,
				NewValue:     &newVal,
				CreatedAt:    time.Now().UTC(),
			})
		}()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Analyst updated successfully"}`))
}
