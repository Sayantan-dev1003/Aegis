package model

import "time"

type Queue struct {
	ID               string    `json:"id" db:"id"`
	Name             string    `json:"name" db:"name"`
	Description      *string   `json:"description" db:"description"`
	Status           string    `json:"status" db:"status"`
	SlaTargetMinutes int       `json:"sla_target_minutes" db:"sla_target_minutes"`
	CoverageStart    *string   `json:"coverage_start" db:"coverage_start"`
	CoverageEnd      *string   `json:"coverage_end" db:"coverage_end"`
	Timezone         *string   `json:"timezone" db:"timezone"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time `json:"updated_at" db:"updated_at"`
	
	// 24hr daily window metrics stored in DB (00:00 to 23:59)
	OpenCases        *int     `json:"open_cases" db:"open_cases"`
	TotalCases       *int     `json:"total_cases" db:"total_cases"`
	CasesBreached    *int     `json:"cases_breached" db:"cases_breached"`
	BreachRate       *float64 `json:"breach_rate" db:"breach_rate"`
	AssignedReviewer *string  `json:"assigned_reviewer,omitempty"`
}

