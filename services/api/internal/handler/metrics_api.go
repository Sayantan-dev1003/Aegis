package handler

import (
	"encoding/json"
	"net/http"
)

type MetricsHandler struct {}

func NewMetricsHandler() *MetricsHandler {
	return &MetricsHandler{}
}

func (h *MetricsHandler) GetMetrics(w http.ResponseWriter, r *http.Request) {
	// Simple proxy or mocked structure for UI compatibility,
	// In a real app this would query Prometheus or the local Prometheus registry.
	
	metrics := map[string]interface{}{
		"consumer_lag": map[string]int{
			"transactions.raw": 5,
			"transactions.scored": 2,
		},
		"api_latency": map[string]string{
			"p50": "45ms",
			"p95": "120ms",
			"p99": "250ms",
		},
		"error_rate": "0.01%",
		"uptime": "99.9%",
		"redis_hit_rate": "95%",
		"services": []map[string]string{
			{"name": "Aegis API (Go)", "status": "healthy"},
			{"name": "ML Worker (Python)", "status": "healthy"},
			{"name": "PostgresDB", "status": "healthy"},
			{"name": "Redis Cache", "status": "healthy"},
			{"name": "Kafka Brokers", "status": "healthy"},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(metrics)
}
