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
	ruleRepo      *repository.RuleRepository
	auditRepo     *repository.AuditRepository
	analyticsRepo *repository.RuleAnalyticsRepository
}

func NewRuleHandler(ruleRepo *repository.RuleRepository, auditRepo *repository.AuditRepository, analyticsRepo *repository.RuleAnalyticsRepository) *RuleHandler {
	return &RuleHandler{ruleRepo: ruleRepo, auditRepo: auditRepo, analyticsRepo: analyticsRepo}
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
	} else if h.analyticsRepo != nil {
		var ids []string
		for _, rule := range rules {
			ids = append(ids, rule.ID)
		}
		stats, err := h.analyticsRepo.GetTriggersBatch(r.Context(), ids)
		if err == nil {
			for i, rule := range rules {
				if count, ok := stats[rule.ID]; ok {
					c := count
					rules[i].Triggers24h = &c
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}

func (h *RuleHandler) Create(w http.ResponseWriter, r *http.Request) {
	var rule model.Rule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		fmt.Printf("Error decoding request payload: %v\n", err)
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.ruleRepo.Create(r.Context(), &rule); err != nil {
		fmt.Printf("Error creating rule in DB: %v\n", err)
		h.respondError(w, "failed to create rule", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	ctxWithInfo := auditContext(r)
	go func() {
		bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
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
	ctxWithInfo := auditContext(r)
	go func() {
		bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
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
	ctxWithInfo := auditContext(r)
	go func() {
		bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
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
