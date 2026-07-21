package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/go-chi/chi/v5"
)

type AnalystHandler struct {
	analystRepo *repository.AnalystRepository
	auditRepo   *repository.AuditRepository
	authService *service.AuthService
}

func NewAnalystHandler(
	analystRepo *repository.AnalystRepository,
	auditRepo *repository.AuditRepository,
	authService *service.AuthService,
) *AnalystHandler {
	return &AnalystHandler{
		analystRepo: analystRepo,
		auditRepo:   auditRepo,
		authService: authService,
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

// CreateAnalystRequest is the payload for creating a new analyst.
type CreateAnalystRequest struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (h *AnalystHandler) CreateAnalyst(w http.ResponseWriter, r *http.Request) {
	var req CreateAnalystRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Validate required fields
	if strings.TrimSpace(req.FullName) == "" {
		h.respondError(w, "full_name is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Email) == "" {
		h.respondError(w, "email is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Password) == "" {
		h.respondError(w, "password is required", http.StatusBadRequest)
		return
	}
	validRoles := map[string]bool{"admin": true, "reviewer": true, "viewer": true}
	role := strings.ToLower(strings.TrimSpace(req.Role))
	if !validRoles[role] {
		h.respondError(w, "role must be one of: admin, reviewer, viewer", http.StatusBadRequest)
		return
	}

	// Check for duplicate email
	existing, err := h.analystRepo.FindByEmail(r.Context(), req.Email)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if existing != nil {
		h.respondError(w, "an analyst with this email already exists", http.StatusConflict)
		return
	}

	// Hash the password
	passwordHash, err := h.authService.HashPassword(req.Password)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Persist the new analyst
	analyst, err := h.analystRepo.Create(r.Context(), req.Email, passwordHash, req.FullName, role)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// Audit log
	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	ctxWithInfo := auditContext(r)
	go func() {
		bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
		defer cancel()
		newVal := fmt.Sprintf(`{"email":"%s","role":"%s"}`, analyst.Email, analyst.Role)
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "analyst.created",
			ResourceType: "analyst",
			ResourceID:   &analyst.ID,
			NewValue:     &newVal,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(analyst)
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

		ctxWithInfo := auditContext(r)
		go func() {
			bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
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

		ctxWithInfo := auditContext(r)
		go func() {
			bgCtx, cancel := context.WithTimeout(ctxWithInfo, 5*time.Second)
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

