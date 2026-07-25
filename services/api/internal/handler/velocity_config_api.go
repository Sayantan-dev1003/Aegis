package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"
)

type VelocityConfigHandler struct {
	configRepo *repository.VelocityConfigRepository
	rdb        *redis.Client
}

func NewVelocityConfigHandler(configRepo *repository.VelocityConfigRepository, rdb *redis.Client) *VelocityConfigHandler {
	return &VelocityConfigHandler{configRepo: configRepo, rdb: rdb}
}

func (h *VelocityConfigHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *VelocityConfigHandler) List(w http.ResponseWriter, r *http.Request) {
	configs, err := h.configRepo.List(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if configs == nil {
		configs = []model.VelocityConfig{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func (h *VelocityConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	entity := chi.URLParam(r, "entity")
	if entity == "" {
		h.respondError(w, "entity is required", http.StatusBadRequest)
		return
	}

	var payload struct {
		Windows []string `json:"windows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if len(payload.Windows) == 0 {
		h.respondError(w, "cannot save empty windows array, at least one window is required", http.StatusBadRequest)
		return
	}

	cfg := &model.VelocityConfig{
		Entity:  entity,
		Windows: payload.Windows,
	}

	if err := h.configRepo.Upsert(r.Context(), cfg); err != nil {
		h.respondError(w, "failed to update configuration", http.StatusInternalServerError)
		return
	}

	// Publish update event via Redis Pub/Sub
	h.rdb.Publish(r.Context(), "velocity_config_updates", "updated")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(cfg)
}
