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
	Timestamp        time.Time `json:"timestamp" db:"timestamp"`     // when bank says txn happened
	IngestedAt       time.Time `json:"ingested_at" db:"ingested_at"` // Defaults to NOW()
	Status           string    `json:"status" db:"status"`           // pending, scored, auto_blocked, reviewed, scoring_failed
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
