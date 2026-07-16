package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"crypto/rand"
	"encoding/hex"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/go-chi/chi/v5"
)

type IntegrationHandler struct {
	intRepo   *repository.IntegrationRepository
	auditRepo *repository.AuditRepository
}

func NewIntegrationHandler(intRepo *repository.IntegrationRepository, auditRepo *repository.AuditRepository) *IntegrationHandler {
	return &IntegrationHandler{intRepo: intRepo, auditRepo: auditRepo}
}

func (h *IntegrationHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *IntegrationHandler) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := h.intRepo.ListAPIKeys(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if keys == nil {
		keys = []model.APIKey{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

func (h *IntegrationHandler) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	var k model.APIKey
	if err := json.NewDecoder(r.Body).Decode(&k); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Generate key
	bytes := make([]byte, 32)
	rand.Read(bytes)
	plaintextKey := "sk_live_" + hex.EncodeToString(bytes)
	
	k.KeyHash = plaintextKey // In real app, hash this
	k.KeyPrefix = plaintextKey[:12] + "..." + plaintextKey[len(plaintextKey)-4:]
	
	if err := h.intRepo.CreateAPIKey(r.Context(), &k); err != nil {
		h.respondError(w, "failed to create api key", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "apikey.created",
			ResourceType: "apikey",
			ResourceID:   &k.ID,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	k.PlaintextKey = &plaintextKey

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(k)
}

func (h *IntegrationHandler) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.intRepo.RevokeAPIKey(r.Context(), id); err != nil {
		h.respondError(w, "failed to revoke api key", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "apikey.revoked",
			ResourceType: "apikey",
			ResourceID:   &id,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "API key revoked"}`))
}

func (h *IntegrationHandler) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	hooks, err := h.intRepo.ListWebhooks(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if hooks == nil {
		hooks = []model.Webhook{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(hooks)
}

func (h *IntegrationHandler) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	var hook model.Webhook
	if err := json.NewDecoder(r.Body).Decode(&hook); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.intRepo.CreateWebhook(r.Context(), &hook); err != nil {
		h.respondError(w, "failed to create webhook", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "webhook.created",
			ResourceType: "webhook",
			ResourceID:   &hook.ID,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(hook)
}

func (h *IntegrationHandler) UpdateWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	var payload struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.intRepo.UpdateWebhook(r.Context(), id, payload.Status); err != nil {
		h.respondError(w, "failed to update webhook", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "webhook.updated",
			ResourceType: "webhook",
			ResourceID:   &id,
			NewValue:     &payload.Status,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Webhook updated"}`))
}

func (h *IntegrationHandler) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.intRepo.DeleteWebhook(r.Context(), id); err != nil {
		h.respondError(w, "failed to delete webhook", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "webhook.deleted",
			ResourceType: "webhook",
			ResourceID:   &id,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Webhook deleted"}`))
}

func (h *IntegrationHandler) ListWebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	// Stub implementation as requested in the plan
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`[]`))
}
