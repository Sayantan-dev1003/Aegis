package model

import (
	"encoding/json"
	"time"
)

// FraudResult represents the output of the ML scoring model.
type FraudResult struct {
	ID            string          `json:"id,omitempty"`
	TransactionID string          `json:"transaction_id"`
	FraudScore    float64         `json:"fraud_score"`
	IsFraud       bool            `json:"is_fraud"`
	ModelVersion  *string         `json:"model_version,omitempty"`
	SHAPValues    json.RawMessage `json:"shap_values,omitempty"`
	ThresholdUsed *float64        `json:"threshold_used,omitempty"`
	CreatedAt     time.Time       `json:"created_at,omitempty"`
}

type TransactionScoredEvent struct {
	EventType     string    `json:"event_type"` // "transaction.scored"
	TransactionID string    `json:"transaction_id"`
	FraudScore    float64   `json:"fraud_score"`
	IsFraud       bool      `json:"is_fraud"`
	Status        string    `json:"status"` // "scored" or "auto_blocked"
	ModelVersion  string    `json:"model_version"`
	Timestamp     time.Time `json:"timestamp"`
}
