package model

import (
	"encoding/json"
	"time"
)

// ActionLog represents a lifecycle event for a transaction.
type ActionLog struct {
	ID            string          `json:"id" db:"id"`
	TransactionID string          `json:"transaction_id" db:"transaction_id"`
	ReviewerID    *string         `json:"reviewer_id,omitempty" db:"reviewer_id"`
	ActionType    string          `json:"action_type" db:"action_type"`
	ActionPayload json.RawMessage `json:"action_payload" db:"action_payload"`
	CreatedAt     time.Time       `json:"created_at" db:"created_at"`
}
