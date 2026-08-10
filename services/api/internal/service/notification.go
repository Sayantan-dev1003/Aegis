package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type NotificationService struct {
	redis  *redis.Client
	hub    WebSocketHub
	tracer trace.Tracer

	mu     sync.Mutex
	buffer map[string][]model.Notification
}

func NewNotificationService(redisClient *redis.Client, hub WebSocketHub) *NotificationService {
	return &NotificationService{
		redis:  redisClient,
		hub:    hub,
		tracer: otel.Tracer("aegis/api/service/notification"),
		buffer: make(map[string][]model.Notification),
	}
}

// Notify persists a notification to Redis and delivers it real-time via WebSocket
func (s *NotificationService) Notify(ctx context.Context, n model.Notification) error {
	_, span := s.tracer.Start(ctx, "notification.notify")
	span.SetAttributes(
		attribute.String("reviewer_id", n.ReviewerID),
		attribute.String("event_type", n.EventType),
		attribute.String("priority", n.Priority),
	)
	defer span.End()

	// For high volume events, buffer them to prevent UI spam
	if n.EventType == "queue.case_received" {
		s.mu.Lock()
		s.buffer[n.ReviewerID] = append(s.buffer[n.ReviewerID], n)
		s.mu.Unlock()
		return nil
	}

	return s.sendImmediate(ctx, []model.Notification{n})
}

// StartBatcher runs a background worker to flush the notification buffer periodically
func (s *NotificationService) StartBatcher(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			s.flushBuffer(context.Background())
			return
		case <-ticker.C:
			s.flushBuffer(ctx)
		}
	}
}

func (s *NotificationService) flushBuffer(ctx context.Context) {
	s.mu.Lock()
	current := s.buffer
	s.buffer = make(map[string][]model.Notification)
	s.mu.Unlock()

	for reviewerID, items := range current {
		if len(items) == 0 {
			continue
		}
		if len(items) == 1 {
			// Single notification, send as is
			s.sendImmediate(ctx, items)
		} else {
			// Bulk collective notification
			bulkNotif := model.Notification{
				ID:         uuid.NewString(),
				ReviewerID: reviewerID,
				EventType:  "queue.case_received_bulk",
				Priority:   "info",
				Title:      "New Cases Assigned",
				Message:    fmt.Sprintf("%d new cases were assigned to your queue", len(items)),
				CreatedAt:  time.Now().UTC(),
			}
			s.sendImmediate(ctx, []model.Notification{bulkNotif})
		}
	}
}

func (s *NotificationService) sendImmediate(ctx context.Context, notifs []model.Notification) error {
	if len(notifs) == 0 {
		return nil
	}

	pipe := s.redis.TxPipeline()
	reviewerID := notifs[0].ReviewerID
	key := fmt.Sprintf("notif:%s:feed", reviewerID)

	for _, n := range notifs {
		if n.ID == "" {
			n.ID = uuid.NewString()
			n.CreatedAt = time.Now().UTC()
		}

		data, err := json.Marshal(n)
		if err != nil {
			logger.FromContext(ctx).Error().Err(err).Msg("failed to marshal notification")
			continue
		}
		pipe.LPush(ctx, key, data)
	}

	pipe.LTrim(ctx, key, 0, 49) // Keep last 50
	pipe.Expire(ctx, key, 7*24*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		logger.FromContext(ctx).Error().Err(err).Msg("failed to write notification to redis")
		return fmt.Errorf("redis write: %w", err)
	}

	// Real-time delivery via WebSocket
	if s.hub != nil {
		for _, n := range notifs {
			push := model.NotificationPush{
				EventType:    "notification",
				Notification: n,
			}
			s.hub.SendToUser(n.ReviewerID, push)
		}
	}

	return nil
}

// GetFeed fetches notifications for a reviewer from Redis
func (s *NotificationService) GetFeed(ctx context.Context, reviewerID string) ([]model.Notification, int, error) {
	_, span := s.tracer.Start(ctx, "notification.get_feed")
	span.SetAttributes(attribute.String("reviewer_id", reviewerID))
	defer span.End()

	feedKey := fmt.Sprintf("notif:%s:feed", reviewerID)
	lastReadKey := fmt.Sprintf("notif:%s:last_read", reviewerID)

	// Fetch feed
	results, err := s.redis.LRange(ctx, feedKey, 0, -1).Result()
	if err != nil && err != redis.Nil {
		return nil, 0, fmt.Errorf("redis lrange: %w", err)
	}

	var items []model.Notification
	for _, result := range results {
		var n model.Notification
		if err := json.Unmarshal([]byte(result), &n); err == nil {
			items = append(items, n)
		}
	}

	// Fetch last_read timestamp
	lastReadStr, err := s.redis.Get(ctx, lastReadKey).Result()
	var lastRead time.Time
	if err == nil {
		lastRead, _ = time.Parse(time.RFC3339, lastReadStr)
	}

	// Compute unread count
	unreadCount := 0
	for _, item := range items {
		if item.CreatedAt.After(lastRead) {
			unreadCount++
		}
	}

	return items, unreadCount, nil
}

// MarkAllRead updates the last_read timestamp and clears the feed to keep the UI clean
func (s *NotificationService) MarkAllRead(ctx context.Context, reviewerID string) error {
	_, span := s.tracer.Start(ctx, "notification.mark_all_read")
	span.SetAttributes(attribute.String("reviewer_id", reviewerID))
	defer span.End()

	lastReadKey := fmt.Sprintf("notif:%s:last_read", reviewerID)
	feedKey := fmt.Sprintf("notif:%s:feed", reviewerID)

	pipe := s.redis.TxPipeline()
	pipe.Set(ctx, lastReadKey, time.Now().UTC().Format(time.RFC3339), 7*24*time.Hour)
	pipe.Del(ctx, feedKey)
	_, err := pipe.Exec(ctx)
	return err
}

// NotifyAdminEscalation remains unchanged (kept for compatibility)
func (s *NotificationService) NotifyAdminEscalation(ctx context.Context, queue *model.Queue, transaction *model.Transaction, reason string) {
	_, span := s.tracer.Start(ctx, "notification.notify_admin_escalation")
	defer span.End()

	queueName := "Unknown"
	if queue != nil {
		queueName = queue.Name
	}

	msg := fmt.Sprintf("[ADMIN ESCALATION] Transaction %s in Queue '%s': %s", transaction.ID, queueName, reason)
	logger.FromContext(ctx).Error().
		Str("transaction_id", transaction.ID).
		Str("queue_name", queueName).
		Str("reason", reason).
		Msg(msg)
}
