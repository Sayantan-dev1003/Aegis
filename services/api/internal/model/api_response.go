package model

import "time"

// ListTransactionsRequest represents the query parameters for listing transactions.
type ListTransactionsRequest struct {
	CursorID   string    `json:"-"`
	CursorDate time.Time `json:"-"`
	Limit      int       `json:"limit"`
	Status   string    `json:"status"`
	FromDate time.Time `json:"from_date"`
	ToDate   time.Time `json:"to_date"`
	MinScore float64   `json:"min_score"`
	IsFraud  *bool     `json:"is_fraud"`
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
	Currency         *string    `json:"currency"`
	AccountID        string     `json:"account_id"`
	MerchantID       string     `json:"merchant_id"`
	MerchantName     *string    `json:"merchant_name"`
	MerchantCategory *string    `json:"merchant_category"`
	TransactionType  *string    `json:"transaction_type"`
	Channel          *string    `json:"channel"`
	CountryCode      *string    `json:"country_code"`
	IPAddress        *string    `json:"ip_address,omitempty"`
	Status           string     `json:"status"`
	FraudScore       *float64   `json:"fraud_score,omitempty"`
	IsFraud          *bool      `json:"is_fraud,omitempty"`
	CreatedAt        time.Time  `json:"created_at"` // maps to ingested_at
	Timestamp        time.Time  `json:"timestamp"`
	ScoredAt         *time.Time `json:"scored_at,omitempty"`
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
	ID         string    `json:"id"`
	Amount     float64   `json:"amount"`
	MerchantID string    `json:"merchant_id"`
	CardID     string    `json:"card_id"` // mapped from DB account_id
	Status     string    `json:"status"`
	Metadata   any       `json:"metadata"` // Raw metadata or standard fields
	CreatedAt  time.Time `json:"created_at"` // maps to ingested_at
	UpdatedAt  time.Time `json:"updated_at"`
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
	Decision string `json:"decision"`
	Notes    string `json:"notes"`
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
