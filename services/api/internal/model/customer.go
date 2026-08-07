package model

import "time"

// Customer represents a customer profile in the system.
type Customer struct {
	AccountID string    `json:"account_id" db:"account_id"`
	FullName  string    `json:"full_name" db:"full_name"`
	Email     string    `json:"email" db:"email"`
	KYCStatus string    `json:"kyc_status" db:"kyc_status"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
