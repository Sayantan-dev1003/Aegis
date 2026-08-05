package model

import (
	"encoding/json"
	"time"
)

// Transaction represents a financial transaction ingested from the bank.
type Transaction struct {
	ID               string    `json:"id" db:"id"`
	ExternalID       string    `json:"external_id" db:"external_id"`
	AccountID        string    `json:"account_id" db:"account_id"`
	MerchantID       string    `json:"merchant_id" db:"merchant_id"`
	MerchantName     string    `json:"merchant_name" db:"merchant_name"`
	MerchantCategory string    `json:"merchant_category" db:"merchant_category"` // MCC code label
	Amount           float64   `json:"amount" db:"amount"`
	Currency         string    `json:"currency" db:"currency"` // Default 'INR'
	CountryCode      string    `json:"country_code" db:"country_code"`
	TransactionType  string    `json:"transaction_type" db:"transaction_type"` // purchase / withdrawal / transfer
	Channel          string    `json:"channel" db:"channel"`                   // online / pos / atm
	DeviceID         *string   `json:"device_id,omitempty" db:"device_id"`
	IPAddress        *string   `json:"ip_address,omitempty" db:"ip_address"`
	Timestamp        time.Time  `json:"timestamp" db:"timestamp"`     // when bank says txn happened
	IngestedAt       time.Time  `json:"ingested_at" db:"ingested_at"` // Defaults to NOW()
	Status              string     `json:"status" db:"status"`           // pending, scored, auto_blocked, reviewed, scoring_failed
	QueueID             *string    `json:"queue_id,omitempty" db:"queue_id"`
	ClaimedBy           *string    `json:"claimed_by,omitempty" db:"claimed_by"`
	ClaimedAt           *time.Time `json:"claimed_at,omitempty" db:"claimed_at"`
	SLAStartAt          *time.Time `json:"sla_start_at,omitempty" db:"sla_start_at"`
	SLARemainingSeconds *int       `json:"sla_remaining_seconds,omitempty" db:"sla_remaining_seconds"`
	SLAPausedAt         *time.Time `json:"sla_paused_at,omitempty" db:"sla_paused_at"`
	PriorityLevel       string     `json:"priority_level" db:"priority_level"` // normal, high_risk, urgent
	RiskScore           *float64   `json:"risk_score,omitempty" db:"risk_score"`
	RiskBand            *string    `json:"risk_band,omitempty" db:"risk_band"`     // low, medium, high
	RiskSource          *string    `json:"risk_source,omitempty" db:"risk_source"` // rule, ml, hybrid
	RejectCount         int        `json:"reject_count" db:"reject_count"`
	SLABreachType       string     `json:"sla_breach_type" db:"sla_breach_type"`
	RequiresAdminReview bool       `json:"requires_admin_review" db:"requires_admin_review"`
	RequeueCount        int        `json:"requeue_count" db:"requeue_count"`
	LastRequeuedAt      *time.Time `json:"last_requeued_at,omitempty" db:"last_requeued_at"`
	UpdatedAt           time.Time  `json:"updated_at" db:"updated_at"`
}

// OutboxEvent represents an event to be processed asynchronously.
type OutboxEvent struct {
	ID          string          `json:"id" db:"id"`
	AggregateID string          `json:"aggregate_id" db:"aggregate_id"`
	EventType   string          `json:"event_type" db:"event_type"`
	Payload     json.RawMessage `json:"payload" db:"payload"`
	Published   bool            `json:"published" db:"published"`
	PublishedAt *time.Time      `json:"published_at,omitempty" db:"published_at"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
}
