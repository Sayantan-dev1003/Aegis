package model

import "time"

type APIKey struct {
	ID         string     `json:"id" db:"id"`
	Name       string     `json:"name" db:"name"`
	KeyHash    string     `json:"-" db:"key_hash"`
	KeyPrefix  string     `json:"key_prefix" db:"key_prefix"`
	Scopes     []string   `json:"scopes" db:"scopes"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at" db:"last_used_at"`
	RevokedAt  *time.Time `json:"revoked_at" db:"revoked_at"`
	
	// Returned only on creation
	PlaintextKey *string `json:"plaintext_key,omitempty" db:"-"`
}

type Webhook struct {
	ID               string    `json:"id" db:"id"`
	URL              string    `json:"url" db:"url"`
	SubscribedEvents []string  `json:"subscribed_events" db:"subscribed_events"`
	Status           string    `json:"status" db:"status"`
	SecretHash       *string   `json:"-" db:"secret_hash"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	
	// Computed for UI
	SuccessRate *float64 `json:"success_rate,omitempty" db:"-"`
}

type WebhookDelivery struct {
	ID           string    `json:"id" db:"id"`
	WebhookID    string    `json:"webhook_id" db:"webhook_id"`
	EventType    string    `json:"event_type" db:"event_type"`
	StatusCode   *int      `json:"status_code" db:"status_code"`
	Success      bool      `json:"success" db:"success"`
	DeliveredAt  time.Time `json:"delivered_at" db:"delivered_at"`
	ResponseBody *string   `json:"response_body" db:"response_body"`
}
