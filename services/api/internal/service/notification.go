package service

import (
	"context"
	"fmt"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/rs/zerolog/log"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

type NotificationService struct {
	tracer trace.Tracer
}

func NewNotificationService() *NotificationService {
	return &NotificationService{
		tracer: otel.Tracer("aegis/api/service/notification"),
	}
}

// NotifyQueueEntry sends a real-time push notification when a transaction enters a VIP queue (SLA <= 15 min).
func (s *NotificationService) NotifyQueueEntry(ctx context.Context, queue *model.Queue, transaction *model.Transaction) {
	_, span := s.tracer.Start(ctx, "notification.notify_queue_entry")
	defer span.End()

	msg := fmt.Sprintf("[VIP ALERT] Transaction %s entered High-Priority Queue '%s' (SLA: %d mins). Immediate attention required.",
		transaction.ID, queue.Name, queue.SlaTargetMinutes)
	log.Warn().
		Str("transaction_id", transaction.ID).
		Str("queue_id", queue.ID).
		Str("queue_name", queue.Name).
		Int("sla_minutes", queue.SlaTargetMinutes).
		Msg(msg)
}

// NotifyAdminEscalation sends a high-priority notification to Admins for SLA warnings, reject-cap hits, or timeouts.
func (s *NotificationService) NotifyAdminEscalation(ctx context.Context, queue *model.Queue, transaction *model.Transaction, reason string) {
	_, span := s.tracer.Start(ctx, "notification.notify_admin_escalation")
	defer span.End()

	queueName := "Unknown"
	if queue != nil {
		queueName = queue.Name
	}

	msg := fmt.Sprintf("[ADMIN ESCALATION] Transaction %s in Queue '%s': %s", transaction.ID, queueName, reason)
	log.Error().
		Str("transaction_id", transaction.ID).
		Str("queue_name", queueName).
		Str("reason", reason).
		Msg(msg)
}
