package model

import (
	"time"
)

// AuditLog represents an action taken by an analyst.
type AuditLog struct {
	ID           string    `json:"id" db:"id"`
	ActorID      string    `json:"actor_id" db:"actor_id"`
	Action       string    `json:"action" db:"action"`
	ResourceType string    `json:"resource_type" db:"resource_type"`
	ResourceID   *string   `json:"resource_id" db:"resource_id"`
	OldValue     *string   `json:"old_value" db:"old_value"`
	NewValue     *string   `json:"new_value" db:"new_value"`
	IPAddress    *string   `json:"ip_address" db:"ip_address"`
	UserAgent    *string   `json:"user_agent" db:"user_agent"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
}

type contextKey string

const RequestInfoKey contextKey = "requestInfo"

type RequestInfo struct {
	IPAddress *string
	UserAgent *string
}
