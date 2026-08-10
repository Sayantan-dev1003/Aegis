package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type NotificationHandler struct {
	notifService *service.NotificationService
	tracer       trace.Tracer
}

func NewNotificationHandler(notifService *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{
		notifService: notifService,
		tracer:       otel.Tracer("aegis/api/handler"),
	}
}

// GetNotifications returns the reviewer's notification feed + unread count
func (h *NotificationHandler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.get_notifications")
	defer span.End()

	info, ok := ctx.Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	if !ok {
		h.respondError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	reviewerID := info.ID
	span.SetAttributes(attribute.String("reviewer_id", reviewerID))

	items, unreadCount, err := h.notifService.GetFeed(ctx, reviewerID)
	if err != nil {
		h.respondError(w, fmt.Sprintf("failed to fetch notifications: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if items == nil {
		items = make([]model.Notification, 0) // ensure non-null json array
	}
	json.NewEncoder(w).Encode(map[string]any{
		"items":        items,
		"unread_count": unreadCount,
		"total_count":  len(items),
	})
}

// MarkNotificationsRead marks all notifications as read for the reviewer
func (h *NotificationHandler) MarkNotificationsRead(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.mark_notifications_read")
	defer span.End()

	info, ok := ctx.Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	if !ok {
		h.respondError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	reviewerID := info.ID
	span.SetAttributes(attribute.String("reviewer_id", reviewerID))

	if err := h.notifService.MarkAllRead(ctx, reviewerID); err != nil {
		h.respondError(w, fmt.Sprintf("failed to mark read: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"success": true})
}

func (h *NotificationHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}
