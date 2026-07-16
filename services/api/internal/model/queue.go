package model

import "time"

type Queue struct {
	ID                string    `json:"id" db:"id"`
	Name              string    `json:"name" db:"name"`
	Description       *string   `json:"description" db:"description"`
	Status            string    `json:"status" db:"status"`
	SlaTargetMinutes  int       `json:"sla_target_minutes" db:"sla_target_minutes"`
	AssignmentRule    *string   `json:"assignment_rule" db:"assignment_rule"`
	CoverageStart     *string   `json:"coverage_start" db:"coverage_start"`
	CoverageEnd       *string   `json:"coverage_end" db:"coverage_end"`
	Timezone          *string   `json:"timezone" db:"timezone"`
	CreatedAt         time.Time `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time `json:"updated_at" db:"updated_at"`
	
	// Computed fields for UI
	OpenCases  *int     `json:"open_cases,omitempty"`
	BreachRate *float64 `json:"breach_rate,omitempty"`
}
