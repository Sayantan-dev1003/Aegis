package model

type ReviewerPerformanceSummary struct {
	Period                  string            `json:"period"`
	CasesReviewed           int               `json:"cases_reviewed"`
	ThroughputPerDay        *float64          `json:"throughput_per_day"`
	AvgHandlingTimeMinutes  *float64          `json:"avg_handling_time_minutes"`
	SLACompliancePct        float64           `json:"sla_compliance_pct"`
	DecisionBreakdown       DecisionBreakdown `json:"decision_breakdown"`
}

type DecisionBreakdown struct {
	Approved  int `json:"approved"`
	Declined  int `json:"declined"`
	Blocked   int `json:"blocked"`
	Escalated int `json:"escalated"`
}

type ReviewerPerformanceTrend struct {
	Metric           string                         `json:"metric"`
	Range            string                         `json:"range"`
	SLATargetMinutes *float64                       `json:"sla_target_minutes,omitempty"`
	Buckets          []ReviewerPerformanceTrendBucket `json:"buckets"`
}

type ReviewerPerformanceTrendBucket struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
}

type ReviewerLeaderboard struct {
	Period string                   `json:"period"`
	Sort   string                   `json:"sort"`
	Rows   []ReviewerLeaderboardRow `json:"rows"`
}

type ReviewerLeaderboardRow struct {
	ReviewerID             string  `json:"reviewer_id"`
	Name                   string  `json:"name"`
	Queue                  string  `json:"queue"`
	CasesReviewed          int     `json:"cases_reviewed"`
	SLACompliancePct       float64 `json:"sla_compliance_pct"`
	AvgHandlingTimeMinutes float64 `json:"avg_handling_time_minutes"`
	EscalationRatePct      float64 `json:"escalation_rate_pct"`
}
