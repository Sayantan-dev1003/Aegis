package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	aegismw "github.com/Sayantan-dev1003/aegis/api/internal/middleware"
)

// ──────────────────────────────────────────────────────────────────────────────
// RequireRole middleware
// ──────────────────────────────────────────────────────────────────────────────

func TestRequireRole_AllowedRole(t *testing.T) {
	called := false
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.RequireRole("admin")(handler)

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req = contextWithAnalystInfo(req, "admin-id", "admin")
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rr.Code)
	}
	if !called {
		t.Error("next handler should have been called")
	}
}

func TestRequireRole_ForbiddenRole(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.RequireRole("admin")(handler)

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req = contextWithAnalystInfo(req, "analyst-id", "analyst") // analyst, not admin
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rr.Code)
	}
}

func TestRequireRole_NoAnalystInfoInContext(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.RequireRole("admin")(handler)

	// Request with NO AnalystInfo in context
	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when no AnalystInfo in context, got %d", rr.Code)
	}
}

func TestRequireRole_MultipleAllowedRoles(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Allow both "admin" and "analyst"
	mw := aegismw.RequireRole("admin", "analyst")(handler)

	for _, role := range []string{"admin", "analyst"} {
		t.Run("role="+role, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/resource", nil)
			req = contextWithAnalystInfo(req, "user-id", role)
			rr := httptest.NewRecorder()
			mw.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Errorf("role %q should be allowed; expected 200, got %d", role, rr.Code)
			}
		})
	}
}

func TestRequireRole_UnknownRole_Forbidden(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.RequireRole("admin", "analyst")(handler)

	req := httptest.NewRequest(http.MethodGet, "/resource", nil)
	req = contextWithAnalystInfo(req, "viewer-id", "viewer") // not in allowed list
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Errorf("unknown role should get 403, got %d", rr.Code)
	}
}

func TestRequireRole_ContextValueWrongType(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	mw := aegismw.RequireRole("admin")(handler)

	// Put a wrong type in context under AnalystInfoKey
	ctx := context.WithValue(context.Background(), aegismw.AnalystInfoKey, "not-an-AnalystInfo-struct")
	req := httptest.NewRequest(http.MethodGet, "/admin", nil).WithContext(ctx)
	rr := httptest.NewRecorder()
	mw.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("wrong context type should give 401, got %d", rr.Code)
	}
}
