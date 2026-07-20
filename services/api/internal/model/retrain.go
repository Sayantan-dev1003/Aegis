package model

import "time"

type RetrainJob struct {
	ID          string     `json:"id"`
	Status      string     `json:"status"`
	StartedAt   time.Time  `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
	DurationSec *int       `json:"durationSec,omitempty"`
	TriggeredBy string     `json:"triggeredBy"`
}
