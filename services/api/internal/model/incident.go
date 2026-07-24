package model

import "time"

// Incident represents a system health incident or degradation.
type Incident struct {
	ID          string     `json:"id" db:"id"`
	Title       string     `json:"title" db:"title"`
	Description *string    `json:"description" db:"description"`
	Status      string     `json:"status" db:"status"`     // 'active' or 'resolved'
	Severity    string     `json:"severity" db:"severity"` // 'low', 'medium', 'high', 'critical'
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	ResolvedAt  *time.Time `json:"resolved_at" db:"resolved_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}
