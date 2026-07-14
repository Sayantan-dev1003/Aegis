package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	aegismw "github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
)

// newTestAuthSvc returns an AuthService suitable for middleware tests.
func newTestAuthSvc() *service.AuthService {
	return service.NewAuthService("test-middleware-secret!!!!!!!!!!!", time.Hour, 24*time.Hour)
}

// okHandler is a trivial http.Handler that writes 200.
var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
})

// ──────────────────────────────────────────────────────────────────────────────
// Auth middleware
// ──────────────────────────────────────────────────────────────────────────────

func TestAuth_NoAuthorizationHeader(t *testing.T) {
	svc := newTestAuthSvc()
	mw := aegismw.Auth(svc)(okHandler)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestAuth_EmptyBearerPrefix(t *testing.T) {
	svc := newTestAuthSvc()
	mw := aegismw.Auth(svc)(okHandler)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Token sometoken")
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestAuth_InvalidToken(t *testing.T) {
	svc := newTestAuthSvc()
	mw := aegismw.Auth(svc)(okHandler)

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer not.a.valid.jwt")
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rr.Code)
	}
}

func TestAuth_ValidAccessToken_Returns200(t *testing.T) {
	svc := newTestAuthSvc()

	tokenStr, err := svc.GenerateAccessToken("analyst-uuid-abc", "analyst")
	if err != nil {
		t.Fatalf("GenerateAccessToken failed: %v", err)
	}

	// Handler that asserts context contains AnalystInfo
	assertHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info, ok := r.Context().Value(aegismw.AnalystInfoKey).(aegismw.AnalystInfo)
		if !ok {
			t.Error("AnalystInfo not in context")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if info.ID != "analyst-uuid-abc" {
			t.Errorf("AnalystInfo.ID: got %q, want %q", info.ID, "analyst-uuid-abc")
		}
		if info.Role != "analyst" {
			t.Errorf("AnalystInfo.Role: got %q, want %q", info.Role, "analyst")
		}
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.Auth(svc)(assertHandler)
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

func TestAuth_RefreshToken_IsRejected(t *testing.T) {
	svc := newTestAuthSvc()

	// Refresh tokens should NOT pass the access-only Auth middleware
	refreshToken, err := svc.GenerateRefreshToken("analyst-uuid-abc")
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	mw := aegismw.Auth(svc)(okHandler)
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+refreshToken)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("refresh token should be rejected with 401, got %d", rr.Code)
	}
}

func TestAuth_AdminToken_PassesThrough(t *testing.T) {
	svc := newTestAuthSvc()
	tokenStr, _ := svc.GenerateAccessToken("admin-uuid-xyz", "admin")

	assertHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info, ok := r.Context().Value(aegismw.AnalystInfoKey).(aegismw.AnalystInfo)
		if !ok {
			t.Error("AnalystInfo not in context for admin")
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if info.Role != "admin" {
			t.Errorf("Role: got %q, want %q", info.Role, "admin")
		}
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.Auth(svc)(assertHandler)
	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: inject AnalystInfo into context
// ──────────────────────────────────────────────────────────────────────────────

func contextWithAnalystInfo(r *http.Request, id, role string) *http.Request {
	info := aegismw.AnalystInfo{ID: id, Role: role}
	ctx := context.WithValue(r.Context(), aegismw.AnalystInfoKey, info)
	return r.WithContext(ctx)
}
