package middleware

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog/log"
)

// RequestLogger is a middleware that logs details of incoming HTTP requests using Zerolog.
func RequestLogger() func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			t1 := time.Now()

			defer func() {
				duration := time.Since(t1)

				// Extract request ID from context if present
				reqID := GetRequestID(r.Context())

				log.Info().
					Str("request_id", reqID).
					Str("method", r.Method).
					Str("path", r.URL.Path).
					Int("status", ww.Status()).
					Dur("duration", duration).
					Msg("HTTP request processed")
			}()

			next.ServeHTTP(ww, r)
		})
	}
}
