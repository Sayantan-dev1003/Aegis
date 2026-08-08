package model

import "time"

// ListTransactionsRequest represents the query parameters for listing transactions.
type ListTransactionsRequest struct {
	CursorID        string    `json:"-"`
	CursorDate      time.Time `json:"-"`
	Limit           int       `json:"limit"`
	Status          string    `json:"status"`
	QueueID         string    `json:"queue_id"`
	FromDate        time.Time `json:"from_date"`
	ToDate          time.Time `json:"to_date"`
	MinScore        float64   `json:"min_score"`
	IsFraud         *bool     `json:"is_fraud"`
	MinAmount       *float64  `json:"min_amount"`
	MaxAmount       *float64  `json:"max_amount"`
	Channel          string    `json:"channel"`
	TransactionType  string    `json:"transaction_type"`
	MerchantCategory string    `json:"merchant_category"`
	CountryCode      string    `json:"country_code"`
	Search          string    `json:"search"`
}

// PaginationCursor encodes the last seen row for keyset pagination.
type PaginationCursor struct {
	CreatedAt time.Time `json:"ca"`
	ID        string    `json:"id"`
}

// TransactionSummary represents a brief overview of a transaction.
type TransactionSummary struct {
	ID               string     `json:"id"`
	Amount           float64    `json:"amount"`
	Currency         string     `json:"currency"`
	AccountID        string     `json:"account_id"`
	MerchantID       string     `json:"merchant_id"`
	MerchantName     string     `json:"merchant_name"`
	MerchantCategory string     `json:"merchant_category"`
	TransactionType  string     `json:"transaction_type"`
	Channel          string     `json:"channel"`
	CountryCode      string     `json:"country_code"`
	IPAddress        *string    `json:"ip_address,omitempty"`
	Status           string     `json:"status"`
	ReviewDecision   *string    `json:"review_decision,omitempty"`
	FraudScore       *float64   `json:"fraud_score,omitempty"`
	IsFraud          *bool      `json:"is_fraud,omitempty"`
	QueueID             *string    `json:"queue_id,omitempty"`
	QueueName           *string    `json:"queue_name,omitempty"`
	OriginalQueueName   *string    `json:"original_queue_name,omitempty"`
	Assignee            *string    `json:"assignee,omitempty"`
	CreatedAt           time.Time  `json:"created_at"` // maps to ingested_at
	Timestamp           time.Time  `json:"timestamp"`
	ScoredAt            *time.Time `json:"scored_at,omitempty"`
	SLAStartAt          *time.Time `json:"sla_start_at,omitempty"`
	SLAPausedAt         *time.Time `json:"sla_paused_at,omitempty"`
	PriorityLevel       string     `json:"priority_level,omitempty"`
	RiskScore           *float64   `json:"risk_score,omitempty"`
	RiskBand            *string    `json:"risk_band,omitempty"`
	RiskSource          *string    `json:"risk_source,omitempty"`
	RejectCount         int        `json:"reject_count"`
	SLABreachType       string     `json:"sla_breach_type,omitempty"`
	RequiresAdminReview bool       `json:"requires_admin_review"`
	ClaimedAt           *time.Time `json:"claimed_at,omitempty"`
}

// ListTransactionsResponse represents the response for listing transactions.
type ListTransactionsResponse struct {
	Data       []TransactionSummary `json:"data"`
	NextCursor string               `json:"next_cursor,omitempty"`
	Total      int                  `json:"total,omitempty"`
}

// TransactionDetailResponse represents the detailed response for a single transaction.
type TransactionDetailResponse struct {
	Transaction TransactionDetail  `json:"transaction"`
	FraudResult *FraudResultDetail `json:"fraud_result,omitempty"`
	Review      *ReviewDetail      `json:"review,omitempty"`
}

// TransactionDetail provides full details of a transaction.
type TransactionDetail struct {
	ID               string     `json:"id"`
	ExternalID       string     `json:"external_id"`
	Amount           float64    `json:"amount"`
	Currency         string     `json:"currency"`
	MerchantID       string     `json:"merchant_id"`
	MerchantName     string     `json:"merchant_name"`
	MerchantCategory string     `json:"merchant_category"`
	CardID           string     `json:"card_id"` // mapped from DB account_id
	Status           string     `json:"status"`
	QueueID          *string    `json:"queue_id,omitempty"`
	QueueName        *string    `json:"queue_name,omitempty"`
	TransactionType  string     `json:"transaction_type"`
	Channel          string     `json:"channel"`
	CountryCode      string     `json:"country_code"`
	IPAddress        *string    `json:"ip_address,omitempty"`
	DeviceID         *string    `json:"device_id,omitempty"`
	Metadata            any        `json:"metadata"` // Raw metadata or standard fields
	CreatedAt           time.Time  `json:"created_at"` // maps to ingested_at
	Timestamp           time.Time  `json:"timestamp"`
	UpdatedAt           time.Time  `json:"updated_at"`
	PriorityLevel       string     `json:"priority_level,omitempty"`
	RiskScore           *float64   `json:"risk_score,omitempty"`
	RiskBand            *string    `json:"risk_band,omitempty"`
	RiskSource          *string    `json:"risk_source,omitempty"`
	RejectCount         int        `json:"reject_count"`
	SLABreachType       string     `json:"sla_breach_type,omitempty"`
	RequiresAdminReview bool       `json:"requires_admin_review"`
	ClaimedAt           *time.Time `json:"claimed_at,omitempty"`
	ClaimedByName       *string    `json:"claimed_by_name,omitempty"`
	SLAPausedAt         *time.Time `json:"sla_paused_at,omitempty"`
	BreachedAt          *time.Time `json:"breached_at,omitempty"`
	EscalatedAt         *time.Time `json:"escalated_at,omitempty"`
	EscalatedTo         *string    `json:"escalated_to,omitempty"`
}

// FeatureWeight represents the impact of a specific feature on the fraud score.
type FeatureWeight struct {
	Feature    string  `json:"feature"`
	Weight     float64 `json:"weight"`
	Importance float64 `json:"importance"` // abs(weight) normalized
}

// FraudResultDetail provides details of the fraud analysis.
type FraudResultDetail struct {
	FraudScore     float64         `json:"fraud_score"`
	IsFraud        bool            `json:"is_fraud"`
	ModelVersion   string          `json:"model_version"`
	FeatureWeights []FeatureWeight `json:"feature_weights"`
	ScoredAt       time.Time       `json:"scored_at"`
}

// ReviewDetail provides details of an analyst's review.
type ReviewDetail struct {
	ReviewerID string    `json:"reviewer_id"` // maps to analyst_id
	Decision   string    `json:"decision"`
	Notes      string    `json:"notes,omitempty"`
	ReviewedAt time.Time `json:"reviewed_at"`
}

// SubmitReviewRequest represents the payload for submitting a review.
type SubmitReviewRequest struct {
	Decision        string  `json:"decision"`
	ReasonCode      string  `json:"reason_code"`
	Notes           string  `json:"notes"`
	TargetQueueID   *string `json:"target_queue_id,omitempty"`
	TargetAnalystID *string `json:"target_analyst_id,omitempty"`
}

// StatsSummaryResponse represents the high-level statistics summary.
type StatsSummaryResponse struct {
	TodayTotal        int       `json:"today_total"`
	TodayFlagged      int       `json:"today_flagged"`
	TodayAutoBlocked  int       `json:"today_auto_blocked"`
	PendingReview     int       `json:"pending_review"`
	FalsePositiveRate *float64  `json:"false_positive_rate_7d"`
	ComputedAt        time.Time `json:"computed_at"`
}

// ExecutiveSummaryResponse represents the time-windowed executive overview metrics.
type ExecutiveSummaryResponse struct {
	TimeFrame           string    `json:"time_frame"`            // "12h", "24h", "7d", "30d", "90d"
	TotalFraudPrevented float64   `json:"total_fraud_prevented"` // Sum of amount in INR for auto_blocked / confirmed_fraud
	OverallFraudRate    float64   `json:"overall_fraud_rate"`    // Percentage 0.0 - 100.0
	TotalMonitoredTxns  int       `json:"total_monitored_txns"`  // Count of ingested txns
	QueueSlaAdherence   float64   `json:"queue_sla_adherence"`   // Avg % adherence across active queues
	FraudTxnsCount      int       `json:"fraud_txns_count"`      // Count of auto_blocked / confirmed_fraud txns
	AutoBlockedCount    int       `json:"auto_blocked_count"`    // Count of auto_blocked txns
	ConfirmedFraudCount int       `json:"confirmed_fraud_count"` // Count of confirmed_fraud txns
	LegitCount          int       `json:"legit_count"`           // Count of legit/clean txns
	ComputedAt          time.Time `json:"computed_at"`
}

// VerdictVelocityPoint represents a single interval bucket in the Verdict Velocity chart.
type VerdictVelocityPoint struct {
	Time     string `json:"time"`
	Approved int    `json:"approved"`
	Flagged  int    `json:"flagged"`
	Blocked  int    `json:"blocked"`
}

// MerchantRiskPoint represents a merchant category and its risk metrics.
type MerchantRiskPoint struct {
	Category     string  `json:"category"`
	TxnCount     int     `json:"txn_count"`
	Percentage   float64 `json:"percentage"`
	TotalINR     float64 `json:"total_inr"`
	BlockedCount int     `json:"blocked_count"`
	SavedINR     float64 `json:"saved_inr"`
	FraudRate    float64 `json:"fraud_rate"`
}

// ChannelPerformancePoint represents a payment channel's performance metrics.
type ChannelPerformancePoint struct {
	Channel      string  `json:"channel"`
	RawChannel   string  `json:"raw_channel"`
	Volume       int     `json:"volume"`
	FraudRate    float64 `json:"fraud_rate"`
	PreventedINR float64 `json:"prevented_inr"`
	SlaHealth    string  `json:"sla_health"`
	RiskIndex    int     `json:"risk_index"`
}

// OutcomeDistributionPoint represents the count and percentage of an analyst review decision or auto-block outcome.
type OutcomeDistributionPoint struct {
	Name       string  `json:"name"`
	Value      float64 `json:"value"`      // percentage (0-100) for PieChart rendering
	Count      int     `json:"count"`      // absolute count of transactions/reviews
	Color      string  `json:"color"`
	Percentage float64 `json:"percentage"` // same as Value
}

// TrendsRequest represents the query parameters for fetching trends.
type TrendsRequest struct {
	Period      string
	Granularity string
}

// TrendsResponse represents the statistical trends over a period.
type TrendsResponse struct {
	Period      string       `json:"period"`
	Granularity string       `json:"granularity"`
	Data        []TrendPoint `json:"data"`
}

// TrendPoint represents a single data point in a trend.
type TrendPoint struct {
	Bucket        time.Time `json:"bucket"`
	Total         int       `json:"total"`
	Flagged       int       `json:"flagged"`
	AutoBlocked   int       `json:"auto_blocked"`
	AvgFraudScore *float64  `json:"avg_fraud_score"`
}

// UpdateConfigRequest represents the payload for updating a config value.
type UpdateConfigRequest struct {
	Value string `json:"value"`
}

// RawTransactionEvent represents a transaction ready for the DLQ requeue.
type RawTransactionEvent struct {
	TransactionID string    `json:"transaction_id"`
	Amount        float64   `json:"amount"`
	MerchantID    string    `json:"merchant_id"`
	CardID        string    `json:"card_id"`
	Metadata      any       `json:"metadata"`
	Timestamp     time.Time `json:"timestamp"`
	IsRequeue     bool      `json:"is_requeue"`
	RequeueCount  int       `json:"requeue_count"`
}

// ListAuditLogsResponse represents the response for listing audit logs.
type ListAuditLogsResponse struct {
	Data  []AuditLog `json:"data"`
	Total int        `json:"total"`
}
