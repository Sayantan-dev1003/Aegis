package model

import "time"

// Incident represents a system health incident or degradation.
type Incident struct {
	ID          string     `json:"id" db:"id"`
	Title       string     `json:"title" db:"title"`
	Description *string    `json:"description" db:"description"`
	Status        string     `json:"status" db:"status"`     // 'active' or 'resolved'
	Severity      string     `json:"severity" db:"severity"` // 'low', 'medium', 'high', 'critical'
	TransactionID *string    `json:"transaction_id,omitempty" db:"transaction_id"`
	QueueID       *string    `json:"queue_id,omitempty" db:"queue_id"`
	ReviewerID    *string    `json:"reviewer_id,omitempty" db:"reviewer_id"`
	IncidentType  *string    `json:"incident_type,omitempty" db:"incident_type"` // sla_negligence, force_escalation, vip_unclaimed_warning, investigation_timeout
	SLABreachType string     `json:"sla_breach_type" db:"sla_breach_type"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`
	ResolvedAt    *time.Time `json:"resolved_at" db:"resolved_at"`
	UpdatedAt     time.Time  `json:"updated_at" db:"updated_at"`
}
