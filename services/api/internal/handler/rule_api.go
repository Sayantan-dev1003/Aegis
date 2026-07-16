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

type RuleHandler struct {
	ruleRepo  *repository.RuleRepository
	auditRepo *repository.AuditRepository
}

func NewRuleHandler(ruleRepo *repository.RuleRepository, auditRepo *repository.AuditRepository) *RuleHandler {
	return &RuleHandler{ruleRepo: ruleRepo, auditRepo: auditRepo}
}

func (h *RuleHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *RuleHandler) List(w http.ResponseWriter, r *http.Request) {
	rules, err := h.ruleRepo.List(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if rules == nil {
		rules = []model.Rule{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}

func (h *RuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var rule model.Rule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.ruleRepo.Create(r.Context(), &rule); err != nil {
		h.respondError(w, "failed to create rule", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "rule.created",
			ResourceType: "rule",
			ResourceID:   &rule.ID,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rule)
}

func (h *RuleHandler) ToggleActive(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	var payload struct {
		IsActive bool `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.ruleRepo.ToggleActive(r.Context(), id, payload.IsActive); err != nil {
		h.respondError(w, "failed to update rule", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		newVal := fmt.Sprintf("%t", payload.IsActive)
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "rule.updated",
			ResourceType: "rule",
			ResourceID:   &id,
			NewValue:     &newVal,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Rule status updated"}`))
}

func (h *RuleHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.ruleRepo.Delete(r.Context(), id); err != nil {
		h.respondError(w, "failed to delete rule", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "rule.deleted",
			ResourceType: "rule",
			ResourceID:   &id,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Rule deleted"}`))
}

func (h *RuleHandler) Backtest(w http.ResponseWriter, r *http.Request) {
	// Stub implementation as requested in the plan
	id := chi.URLParam(r, "id")
	
	// Simulate delay
	time.Sleep(1 * time.Second)
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(fmt.Sprintf(`{"rule_id": "%s", "match_count": 42, "precision": 0.85, "message": "Backtest completed (stub)"}`, id)))
}
