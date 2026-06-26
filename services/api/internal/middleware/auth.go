package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/Sayantan-dev1003/aegis/api/internal/service"
)

const AnalystInfoKey contextKey = "analystInfo"

type AnalystInfo struct {
	ID   string
	Role string
}

func Auth(authService *service.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			claims, err := authService.ValidateToken(tokenString)
			if err != nil {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			tokenType, ok := claims["type"].(string)
			if !ok || tokenType != "access" {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			analystID, okID := claims["sub"].(string)
			role, okRole := claims["role"].(string)

			if !okID || !okRole {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			info := AnalystInfo{
				ID:   analystID,
				Role: role,
			}

			ctx := context.WithValue(r.Context(), AnalystInfoKey, info)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
