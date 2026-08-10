package model

import "time"

// Notification is the standardized notification envelope
type Notification struct {
	ID            string     `json:"id"`
	ReviewerID    string     `json:"reviewer_id"`
	EventType     string     `json:"event_type"` // "queue.case_escalated_out", "queue.case_received", etc.
	Priority      string     `json:"priority"`   // "critical" | "warning" | "info"
	Title         string     `json:"title"`
	Message       string     `json:"message"`
	TransactionID *string    `json:"transaction_id,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

// NotificationPush wraps a Notification for WebSocket delivery
type NotificationPush struct {
	EventType    string       `json:"event_type"` // always "notification"
	Notification Notification `json:"notification"`
}
