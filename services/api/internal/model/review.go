package model

import "time"

// Review represents an analyst's review of a flagged transaction.
type Review struct {
	ID            string    `json:"id" db:"id"`
	TransactionID string    `json:"transaction_id" db:"transaction_id"`
	ReviewerID    string    `json:"reviewer_id" db:"reviewer_id"`
	Decision      string    `json:"decision" db:"decision"`
	Notes         string    `json:"notes" db:"notes"`
	ReviewedAt    time.Time `json:"reviewed_at" db:"reviewed_at"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
}

// TransactionReviewedEvent represents the event payload broadcasted when a transaction is reviewed.
type TransactionReviewedEvent struct {
	EventType     string    `json:"event_type"`
	TransactionID string    `json:"transaction_id"`
	Decision      string    `json:"decision"`
	ReviewerID    string    `json:"reviewer_id"`
	Status        string    `json:"status"`
	Timestamp     time.Time `json:"timestamp"`
}
