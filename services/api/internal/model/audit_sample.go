package model

import "time"

// BlockAuditSample represents an auto-blocked transaction sampled for human sanity-check.
type BlockAuditSample struct {
	ID            string     `json:"id" db:"id"`
	TransactionID string     `json:"transaction_id" db:"transaction_id"`
	SampledReason string     `json:"sampled_reason" db:"sampled_reason"` // random, low_score_despite_block, ml_auto_block
	ReviewedBy    *string    `json:"reviewed_by,omitempty" db:"reviewed_by"`
	Verdict       *string    `json:"verdict,omitempty" db:"verdict"` // false_positive, true_positive
	ReviewedAt    *time.Time `json:"reviewed_at,omitempty" db:"reviewed_at"`
	CreatedAt     time.Time  `json:"created_at" db:"created_at"`

	// Enriched transaction summary details for UI
	Amount       float64  `json:"amount,omitempty" db:"amount"`
	Currency     string   `json:"currency,omitempty" db:"currency"`
	MerchantName string   `json:"merchant_name,omitempty" db:"merchant_name"`
	RiskScore    *float64 `json:"risk_score,omitempty" db:"risk_score"`
	RiskBand     *string  `json:"risk_band,omitempty" db:"risk_band"`
}

// ListAuditSamplesRequest represents parameters for filtering block audit samples.
type ListAuditSamplesRequest struct {
	SampledReason string `json:"sampled_reason"`
	Limit         int    `json:"limit"`
	Offset        int    `json:"offset"`
}

// ReviewAuditSampleRequest represents payload for submitting a verdict on an audit sample.
type ReviewAuditSampleRequest struct {
	Verdict string `json:"verdict"` // false_positive or true_positive
}
