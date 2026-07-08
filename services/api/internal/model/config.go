package model

import "time"

// SystemConfig represents a configuration value stored in the database.
type SystemConfig struct {
	Key         string     `json:"key" db:"key"`
	Value       string     `json:"value" db:"value"`
	Description string     `json:"description" db:"description"`
	UpdatedBy   *string    `json:"updated_by,omitempty" db:"updated_by"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty" db:"updated_at"`
}
