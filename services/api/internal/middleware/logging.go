package middleware

import (
	"context"
	"net/http"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/go-chi/chi/v5/middleware"
)

// RequestLogger is a middleware that logs details of incoming HTTP requests using Zerolog.
func RequestLogger() func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			t1 := time.Now()

			ip := r.Header.Get("X-Forwarded-For")
			if ip == "" {
				ip = r.RemoteAddr
			}
			ua := r.UserAgent()

			reqInfo := model.RequestInfo{}
			if ip != "" {
				reqInfo.IPAddress = &ip
			}
			if ua != "" {
				reqInfo.UserAgent = &ua
			}

			ctx := context.WithValue(r.Context(), model.RequestInfoKey, reqInfo)
			rWithCtx := r.WithContext(ctx)

			defer func() {
				duration := time.Since(t1)

				// Extract request ID from context if present
				reqID := GetRequestID(rWithCtx.Context())

				logger.FromContext(rWithCtx.Context()).Info().
					Str("request_id", reqID).
					Str("method", rWithCtx.Method).
					Str("path", rWithCtx.URL.Path).
					Int("status", ww.Status()).
					Dur("duration", duration).
					Msg("HTTP request processed")
			}()

			next.ServeHTTP(ww, rWithCtx)
		})
	}
}
