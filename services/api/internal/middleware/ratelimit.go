package middleware

import (
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimitMiddleware applies a fixed-window rate limit per API key per minute.
func RateLimitMiddleware(rdb *redis.Client, maxRequests int) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get("X-Bank-API-Key")
			if apiKey == "" {
				http.Error(w, `{"error": "X-Bank-API-Key header is missing"}`, http.StatusUnauthorized)
				return
			}

			// Use the current minute as part of the key
			currentMinute := time.Now().Unix() / 60
			key := fmt.Sprintf("ratelimit:%s:%d", apiKey, currentMinute)

			// Lua script: Increment and set expiry (60s) atomically
			script := `
				local count = redis.call("INCR", KEYS[1])
				if count == 1 then
					redis.call("EXPIRE", KEYS[1], 60)
				end
				return count
			`

			res, err := rdb.Eval(r.Context(), script, []string{key}).Result()
			if err != nil {
				// If redis fails, fail open or fail closed? Usually fail closed to protect DB,
				// but let's return 500 for now.
				http.Error(w, `{"error": "Internal Server Error"}`, http.StatusInternalServerError)
				return
			}

			count, ok := res.(int64)
			if !ok {
				http.Error(w, `{"error": "Internal Server Error"}`, http.StatusInternalServerError)
				return
			}

			if count > int64(maxRequests) {
				w.Header().Set("Retry-After", "60")
				http.Error(w, `{"error": "Too Many Requests"}`, http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
