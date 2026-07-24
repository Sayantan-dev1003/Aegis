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

type ModelHandler struct {
	modelRepo *repository.ModelRepository
	auditRepo *repository.AuditRepository
}

func NewModelHandler(modelRepo *repository.ModelRepository, auditRepo *repository.AuditRepository) *ModelHandler {
	return &ModelHandler{modelRepo: modelRepo, auditRepo: auditRepo}
}

func (h *ModelHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *ModelHandler) List(w http.ResponseWriter, r *http.Request) {
	models, err := h.modelRepo.List(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if models == nil {
		models = []model.ModelVersion{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(models)
}

func (h *ModelHandler) Deploy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	targetModel, err := h.modelRepo.GetByID(r.Context(), id)
	if err != nil || targetModel == nil {
		h.respondError(w, "model not found", http.StatusNotFound)
		return
	}

	if err := h.modelRepo.Deploy(r.Context(), id); err != nil {
		h.respondError(w, "failed to deploy model", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "model.deployed",
			ResourceType: "model_version",
			ResourceID:   &id,
			NewValue:     &targetModel.Version,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf(`{"message": "Model %s deployed successfully"}`, targetModel.Version)))
}

func (h *ModelHandler) Rollback(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	targetModel, err := h.modelRepo.GetByID(r.Context(), id)
	if err != nil || targetModel == nil {
		h.respondError(w, "model not found", http.StatusNotFound)
		return
	}

	if err := h.modelRepo.Rollback(r.Context(), id); err != nil {
		h.respondError(w, "failed to rollback model", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "model.rolled_back",
			ResourceType: "model_version",
			ResourceID:   &id,
			NewValue:     &targetModel.Version,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf(`{"message": "Rolled back to model %s successfully"}`, targetModel.Version)))
}

func (h *ModelHandler) ActiveMetrics(w http.ResponseWriter, r *http.Request) {
	activeMetrics, err := h.modelRepo.GetActiveMetrics(r.Context())
	if err != nil {
		h.respondError(w, "active model metrics not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(activeMetrics)
}

