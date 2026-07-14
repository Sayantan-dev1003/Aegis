package service_test

import (
	"testing"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/service"
)

// newTestAuthService returns an AuthService with short TTLs suitable for tests.
func newTestAuthService() *service.AuthService {
	return service.NewAuthService(
		"test-secret-key-32-bytes-minimum!!",
		15*time.Minute,  // access TTL
		7*24*time.Hour,  // refresh TTL
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// Password hashing
// ──────────────────────────────────────────────────────────────────────────────

func TestHashPassword_ReturnsBcryptHash(t *testing.T) {
	svc := newTestAuthService()
	hash, err := svc.HashPassword("mysecretpassword")
	if err != nil {
		t.Fatalf("HashPassword returned unexpected error: %v", err)
	}
	if len(hash) == 0 {
		t.Fatal("HashPassword returned empty hash")
	}
	// Bcrypt hashes start with $2a$ or $2b$
	if hash[:4] != "$2a$" && hash[:4] != "$2b$" {
		t.Errorf("hash does not look like bcrypt: %q", hash[:10])
	}
}

func TestCheckPassword_CorrectPassword(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("correct-horse-battery-staple")
	if err := svc.CheckPassword(hash, "correct-horse-battery-staple"); err != nil {
		t.Errorf("CheckPassword failed for correct password: %v", err)
	}
}

func TestCheckPassword_WrongPassword(t *testing.T) {
	svc := newTestAuthService()
	hash, _ := svc.HashPassword("the-real-password")
	if err := svc.CheckPassword(hash, "wrong-password"); err == nil {
		t.Error("CheckPassword should have returned an error for wrong password")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Access token
// ──────────────────────────────────────────────────────────────────────────────

func TestGenerateAccessToken_ValidClaims(t *testing.T) {
	svc := newTestAuthService()
	analystID := "analyst-uuid-123"
	role := "analyst"

	tokenStr, err := svc.GenerateAccessToken(analystID, role)
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}
	if tokenStr == "" {
		t.Fatal("GenerateAccessToken returned empty token")
	}

	claims, err := svc.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateToken failed on freshly minted access token: %v", err)
	}

	if sub, _ := claims["sub"].(string); sub != analystID {
		t.Errorf("sub claim: got %q, want %q", sub, analystID)
	}
	if r, _ := claims["role"].(string); r != role {
		t.Errorf("role claim: got %q, want %q", r, role)
	}
	if typ, _ := claims["type"].(string); typ != "access" {
		t.Errorf("type claim: got %q, want %q", typ, "access")
	}
}

func TestGenerateAccessToken_AdminRole(t *testing.T) {
	svc := newTestAuthService()
	tokenStr, err := svc.GenerateAccessToken("admin-id", "admin")
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}
	claims, err := svc.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}
	if r, _ := claims["role"].(string); r != "admin" {
		t.Errorf("role claim: got %q, want %q", r, "admin")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Refresh token
// ──────────────────────────────────────────────────────────────────────────────

func TestGenerateRefreshToken_TypeIsRefresh(t *testing.T) {
	svc := newTestAuthService()
	tokenStr, err := svc.GenerateRefreshToken("some-analyst-id")
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	claims, err := svc.ValidateToken(tokenStr)
	if err != nil {
		t.Fatalf("ValidateToken failed on refresh token: %v", err)
	}
	if typ, _ := claims["type"].(string); typ != "refresh" {
		t.Errorf("type claim: got %q, want %q", typ, "refresh")
	}
}

func TestGenerateRefreshToken_NoRoleClaim(t *testing.T) {
	svc := newTestAuthService()
	tokenStr, _ := svc.GenerateRefreshToken("some-analyst-id")
	claims, _ := svc.ValidateToken(tokenStr)

	if _, exists := claims["role"]; exists {
		t.Error("refresh token should not contain a role claim")
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Token validation failure paths
// ──────────────────────────────────────────────────────────────────────────────

func TestValidateToken_ExpiredToken(t *testing.T) {
	// Use a very short-lived service to simulate expiry
	svc := service.NewAuthService("test-secret-key-32-bytes-minimum!!", -1*time.Second, time.Hour)
	tokenStr, err := svc.GenerateAccessToken("analyst-id", "analyst")
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	// The token was already expired at creation (negative TTL means exp = now-1s)
	_, err = svc.ValidateToken(tokenStr)
	if err == nil {
		t.Error("ValidateToken should fail for an expired token")
	}
}

func TestValidateToken_WrongSignature(t *testing.T) {
	svc1 := service.NewAuthService("secret-key-service-one!!!!!!!!!!!", time.Hour, time.Hour)
	svc2 := service.NewAuthService("secret-key-service-two!!!!!!!!!!!", time.Hour, time.Hour)

	tokenStr, _ := svc1.GenerateAccessToken("analyst-id", "analyst")
	_, err := svc2.ValidateToken(tokenStr)
	if err == nil {
		t.Error("ValidateToken should fail when token was signed with a different secret")
	}
}

func TestValidateToken_Malformed(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.ValidateToken("this.is.not.a.jwt")
	if err == nil {
		t.Error("ValidateToken should fail for a malformed token string")
	}
}

func TestValidateToken_Empty(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.ValidateToken("")
	if err == nil {
		t.Error("ValidateToken should fail for an empty token string")
	}
}
