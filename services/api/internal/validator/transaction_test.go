package validator_test

import (
	"testing"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/validator"
)

// validTransaction returns a minimal but fully valid Transaction for use in tests.
func validTransaction() *model.Transaction {
	deviceID := "DEV_12345"
	ip := "192.168.1.1"
	return &model.Transaction{
		ExternalID:       "EXT-001",
		AccountID:        "ACCT-123",
		MerchantID:       "MERCH-456",
		MerchantName:     "Test Merchant",
		MerchantCategory: "retail",
		Amount:           500.00,
		Currency:         "INR",
		CountryCode:      "IN",
		TransactionType:  "purchase",
		Channel:          "online",
		DeviceID:         &deviceID,
		IPAddress:        &ip,
		Timestamp:        time.Now().Add(-5 * time.Minute), // just in the past
	}
}

func TestValidate_ValidTransaction(t *testing.T) {
	tx := validTransaction()
	if err := validator.ValidateTransaction(tx); err != nil {
		t.Errorf("expected nil error for valid transaction, got: %v", err)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Required-field failures
// ──────────────────────────────────────────────────────────────────────────────

func TestValidate_MissingExternalID(t *testing.T) {
	tx := validTransaction()
	tx.ExternalID = ""
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for missing external_id")
	}
}

func TestValidate_WhitespaceExternalID(t *testing.T) {
	tx := validTransaction()
	tx.ExternalID = "   "
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for whitespace-only external_id")
	}
}

func TestValidate_MissingAccountID(t *testing.T) {
	tx := validTransaction()
	tx.AccountID = ""
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for missing account_id")
	}
}

func TestValidate_MissingMerchantID(t *testing.T) {
	tx := validTransaction()
	tx.MerchantID = ""
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for missing merchant_id")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Amount validation
// ──────────────────────────────────────────────────────────────────────────────

func TestValidate_ZeroAmount(t *testing.T) {
	tx := validTransaction()
	tx.Amount = 0
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for zero amount")
	}
}

func TestValidate_NegativeAmount(t *testing.T) {
	tx := validTransaction()
	tx.Amount = -100.00
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for negative amount")
	}
}

func TestValidate_SmallPositiveAmount(t *testing.T) {
	tx := validTransaction()
	tx.Amount = 0.01
	if err := validator.ValidateTransaction(tx); err != nil {
		t.Errorf("expected no error for small positive amount, got: %v", err)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Currency validation
// ──────────────────────────────────────────────────────────────────────────────

func TestValidate_BadCurrencyTooShort(t *testing.T) {
	tx := validTransaction()
	tx.Currency = "IN"
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for 2-char currency code")
	}
}

func TestValidate_BadCurrencyTooLong(t *testing.T) {
	tx := validTransaction()
	tx.Currency = "INRR"
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for 4-char currency code")
	}
}

func TestValidate_ValidCurrencyUSD(t *testing.T) {
	tx := validTransaction()
	tx.Currency = "USD"
	if err := validator.ValidateTransaction(tx); err != nil {
		t.Errorf("expected no error for valid 3-char currency, got: %v", err)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Country code validation
// ──────────────────────────────────────────────────────────────────────────────

func TestValidate_MissingCountryCode(t *testing.T) {
	tx := validTransaction()
	tx.CountryCode = ""
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for missing country_code")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Timestamp validation
// ──────────────────────────────────────────────────────────────────────────────

func TestValidate_ZeroTimestamp(t *testing.T) {
	tx := validTransaction()
	tx.Timestamp = time.Time{} // zero value
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for zero timestamp")
	}
}

func TestValidate_FutureTimestampBeyondSkewWindow(t *testing.T) {
	tx := validTransaction()
	tx.Timestamp = time.Now().Add(10 * time.Minute) // > 5 min in future
	if err := validator.ValidateTransaction(tx); err == nil {
		t.Error("expected error for timestamp far in the future")
	}
}

func TestValidate_TimestampJustWithinSkewWindow(t *testing.T) {
	tx := validTransaction()
	tx.Timestamp = time.Now().Add(3 * time.Minute) // within 5-min clock skew
	if err := validator.ValidateTransaction(tx); err != nil {
		t.Errorf("expected no error for timestamp within skew window, got: %v", err)
	}
}

func TestValidate_OldTimestamp(t *testing.T) {
	tx := validTransaction()
	tx.Timestamp = time.Now().Add(-24 * time.Hour) // yesterday
	if err := validator.ValidateTransaction(tx); err != nil {
		t.Errorf("expected no error for old timestamp, got: %v", err)
	}
}
