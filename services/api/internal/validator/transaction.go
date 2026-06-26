package validator

import (
	"errors"
	"strings"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
)

// ValidateTransaction validates the incoming transaction payload.
func ValidateTransaction(t *model.Transaction) error {
	if strings.TrimSpace(t.ExternalID) == "" {
		return errors.New("external_id is required")
	}
	if strings.TrimSpace(t.AccountID) == "" {
		return errors.New("account_id is required")
	}
	if strings.TrimSpace(t.MerchantID) == "" {
		return errors.New("merchant_id is required")
	}
	if t.Amount <= 0 {
		return errors.New("amount must be greater than zero")
	}
	if len(strings.TrimSpace(t.Currency)) != 3 {
		return errors.New("currency must be exactly 3 characters")
	}
	if strings.TrimSpace(t.CountryCode) == "" {
		return errors.New("country_code is required")
	}
	if t.Timestamp.IsZero() {
		return errors.New("timestamp is required")
	}
	// Allow a small clock skew window
	if t.Timestamp.After(time.Now().Add(5 * time.Minute)) {
		return errors.New("timestamp cannot be in the future")
	}

	return nil
}
