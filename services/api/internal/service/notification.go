package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
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
	buffer map[string]map[string][]model.Notification
}

func NewNotificationService(redisClient *redis.Client, hub WebSocketHub) *NotificationService {
	return &NotificationService{
		redis:  redisClient,
		hub:    hub,
		tracer: otel.Tracer("aegis/api/service/notification"),
		buffer: make(map[string]map[string][]model.Notification),
	}
}

// NotifyRole persists a notification for a role and delivers it real-time
func (s *NotificationService) NotifyRole(ctx context.Context, role string, n model.Notification) error {
	_, span := s.tracer.Start(ctx, "notification.notify_role")
	span.SetAttributes(
		attribute.String("target_role", role),
		attribute.String("event_type", n.EventType),
	)
	defer span.End()

	n.TargetRole = role
	if n.ID == "" {
		n.ID = uuid.NewString()
		n.CreatedAt = time.Now().UTC()
	}

	key := fmt.Sprintf("notif:role:%s:feed", role)
	data, err := json.Marshal(n)
	if err != nil {
		return err
	}

	pipe := s.redis.TxPipeline()
	pipe.LPush(ctx, key, data)
	pipe.LTrim(ctx, key, 0, 99) // Keep last 100 role notifications
	pipe.Expire(ctx, key, 7*24*time.Hour)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("redis write role notif: %w", err)
	}

	if s.hub != nil {
		push := model.NotificationPush{
			EventType:    "notification",
			Notification: n,
		}
		s.hub.SendToRole(role, push)
	}
	return nil
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
	if n.EventType == "queue.case_received" || n.EventType == "queue.case_escalated_out" {
		s.mu.Lock()
		if s.buffer[n.ReviewerID] == nil {
			s.buffer[n.ReviewerID] = make(map[string][]model.Notification)
		}
		s.buffer[n.ReviewerID][n.EventType] = append(s.buffer[n.ReviewerID][n.EventType], n)
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
	s.buffer = make(map[string]map[string][]model.Notification)
	s.mu.Unlock()

	for reviewerID, eventMap := range current {
		for eventType, items := range eventMap {
			if len(items) == 0 {
				continue
			}
			if len(items) == 1 {
				// Single notification, send as is
				s.sendImmediate(ctx, items)
			} else {
				// Determine highest priority in the bulk batch
				priority := "info"
				for _, item := range items {
					if item.Priority == "critical" {
						priority = "critical"
						break
					}
					if item.Priority == "warning" {
						priority = "warning"
					}
				}

				// Bulk collective notification
				if eventType == "queue.case_received" {
					bulkNotif := model.Notification{
						ID:         uuid.NewString(),
						ReviewerID: reviewerID,
						EventType:  "queue.case_received_bulk",
						Priority:   priority,
						Title:      "New Cases Assigned",
						Message:    fmt.Sprintf("%d new cases were assigned to your queue", len(items)),
						CreatedAt:  time.Now().UTC(),
					}
					s.sendImmediate(ctx, []model.Notification{bulkNotif})
				} else if eventType == "queue.case_escalated_out" {
					bulkNotif := model.Notification{
						ID:         uuid.NewString(),
						ReviewerID: reviewerID,
						EventType:  "queue.case_escalated_out_bulk",
						Priority:   priority,
						Title:      "Cases Escalated Out",
						Message:    fmt.Sprintf("%d cases breached SLA in your queue and were moved to Fallback", len(items)),
						CreatedAt:  time.Now().UTC(),
					}
					s.sendImmediate(ctx, []model.Notification{bulkNotif})
				}
			}
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

// GetFeed fetches notifications for a user and their role from Redis
func (s *NotificationService) GetFeed(ctx context.Context, reviewerID string, role string) ([]model.Notification, int, error) {
	_, span := s.tracer.Start(ctx, "notification.get_feed")
	span.SetAttributes(attribute.String("reviewer_id", reviewerID), attribute.String("role", role))
	defer span.End()

	feedKey := fmt.Sprintf("notif:%s:feed", reviewerID)
	roleFeedKey := fmt.Sprintf("notif:role:%s:feed", role)
	lastReadKey := fmt.Sprintf("notif:%s:last_read", reviewerID)

	// Fetch both feeds
	pipe := s.redis.Pipeline()
	userResultsCmd := pipe.LRange(ctx, feedKey, 0, -1)
	roleResultsCmd := pipe.LRange(ctx, roleFeedKey, 0, -1)
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, 0, fmt.Errorf("redis pipeline exec: %w", err)
	}

	var items []model.Notification
	
	for _, result := range userResultsCmd.Val() {
		var n model.Notification
		if err := json.Unmarshal([]byte(result), &n); err == nil {
			items = append(items, n)
		}
	}
	
	for _, result := range roleResultsCmd.Val() {
		var n model.Notification
		if err := json.Unmarshal([]byte(result), &n); err == nil {
			items = append(items, n)
		}
	}

	// Sort by CreatedAt descending
	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})

	// Limit to latest 100 combined
	if len(items) > 100 {
		items = items[:100]
	}

	// Fetch last_read timestamp
	lastReadStr, err := s.redis.Get(ctx, lastReadKey).Result()
	var lastRead time.Time
	if err == nil {
		lastRead, _ = time.Parse(time.RFC3339Nano, lastReadStr)
	}

	// Compute unread count, keep items for persistent feed
	unreadCount := 0
	for _, item := range items {
		if item.CreatedAt.After(lastRead) {
			unreadCount++
		}
	}

	return items, unreadCount, nil
}

// MarkAllRead updates the last_read timestamp to keep the UI clean
func (s *NotificationService) MarkAllRead(ctx context.Context, reviewerID string) error {
	_, span := s.tracer.Start(ctx, "notification.mark_all_read")
	span.SetAttributes(attribute.String("reviewer_id", reviewerID))
	defer span.End()

	lastReadKey := fmt.Sprintf("notif:%s:last_read", reviewerID)

	// We no longer delete the feed because role-based feeds are shared and shouldn't be deleted.
	// Relying entirely on last_read timestamp ensures feeds are persistent but badge counts are accurate.
	_, err := s.redis.Set(ctx, lastReadKey, time.Now().UTC().Format(time.RFC3339Nano), 7*24*time.Hour).Result()
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
