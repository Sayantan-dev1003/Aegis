package model

import "time"

type Rule struct {
	ID        string    `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	Entity    string    `json:"entity" db:"entity"`
	Metric    string    `json:"metric" db:"metric"`
	Operator  string    `json:"operator" db:"operator"`
	Value     float64   `json:"value" db:"value"`
	Window    *string   `json:"window" db:"window"`
	Action    string    `json:"action" db:"action"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
	
	// Computed fields for UI
	Triggers24h *int     `json:"triggers_24h,omitempty"`
	Precision   *float64 `json:"precision,omitempty"`
}

type VelocityConfig struct {
	Entity  string   `json:"entity" db:"entity"`
	Windows []string `json:"windows" db:"windows"`
}
