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

type QueueHandler struct {
	queueRepo *repository.QueueRepository
	auditRepo *repository.AuditRepository
}

func NewQueueHandler(queueRepo *repository.QueueRepository, auditRepo *repository.AuditRepository) *QueueHandler {
	return &QueueHandler{queueRepo: queueRepo, auditRepo: auditRepo}
}

func (h *QueueHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *QueueHandler) List(w http.ResponseWriter, r *http.Request) {
	queues, err := h.queueRepo.List(r.Context())
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if queues == nil {
		queues = []model.Queue{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(queues)
}

func (h *QueueHandler) Create(w http.ResponseWriter, r *http.Request) {
	var q model.Queue
	if err := json.NewDecoder(r.Body).Decode(&q); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.queueRepo.Create(r.Context(), &q); err != nil {
		h.respondError(w, "failed to create queue", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "queue.created",
			ResourceType: "queue",
			ResourceID:   &q.ID,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(q)
}

func (h *QueueHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	
	var payload struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		h.respondError(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if err := h.queueRepo.Update(r.Context(), id, payload.Status); err != nil {
		h.respondError(w, "failed to update queue", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "queue.updated",
			ResourceType: "queue",
			ResourceID:   &id,
			NewValue:     &payload.Status,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Queue updated"}`))
}

func (h *QueueHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.queueRepo.Delete(r.Context(), id); err != nil {
		h.respondError(w, "failed to delete queue", http.StatusInternalServerError)
		return
	}

	info, _ := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		h.auditRepo.Create(bgCtx, &model.AuditLog{
			ActorID:      info.ID,
			Action:       "queue.deleted",
			ResourceType: "queue",
			ResourceID:   &id,
			CreatedAt:    time.Now().UTC(),
		})
	}()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Queue deleted"}`))
}
