package handler

import (
	"encoding/json"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
)

type ReviewerPerformanceHandler struct {
	repo *repository.ReviewerPerformanceRepository
}

func NewReviewerPerformanceHandler(repo *repository.ReviewerPerformanceRepository) *ReviewerPerformanceHandler {
	return &ReviewerPerformanceHandler{repo: repo}
}

func (h *ReviewerPerformanceHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (h *ReviewerPerformanceHandler) Summary(w http.ResponseWriter, r *http.Request) {
	info, ok := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	if !ok {
		h.respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	period := r.URL.Query().Get("period")
	if period == "" {
		period = "today"
	}

	summary, err := h.repo.GetSummary(r.Context(), info.ID, period)
	if err != nil {
		h.respondError(w, "Failed to get performance summary", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

func (h *ReviewerPerformanceHandler) Trend(w http.ResponseWriter, r *http.Request) {
	info, ok := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	if !ok {
		h.respondError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	metric := r.URL.Query().Get("metric")
	rangeStr := r.URL.Query().Get("range")
	if rangeStr == "" {
		rangeStr = "week"
	}

	var data interface{}
	var err error

	if metric == "throughput" {
		data, err = h.repo.GetThroughputTrend(r.Context(), info.ID, rangeStr)
	} else if metric == "aht" {
		buckets, slaTarget, errAht := h.repo.GetAHTTrend(r.Context(), info.ID, rangeStr)
		err = errAht
		if err == nil {
			data = map[string]interface{}{
				"metric":             "aht",
				"range":              rangeStr,
				"sla_target_minutes": slaTarget,
				"buckets":            buckets,
			}
		}
	} else {
		h.respondError(w, "Invalid metric", http.StatusBadRequest)
		return
	}

	if err != nil {
		h.respondError(w, "Failed to get trend data", http.StatusInternalServerError)
		return
	}

	// For throughput, wrap it if not wrapped
	if metric == "throughput" {
		data = map[string]interface{}{
			"metric":  "throughput",
			"range":   rangeStr,
			"buckets": data,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func (h *ReviewerPerformanceHandler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "month"
	}
	sort := r.URL.Query().Get("sort")
	if sort == "" {
		sort = "sla"
	}

	rows, err := h.repo.GetLeaderboard(r.Context(), period, sort)
	if err != nil {
		h.respondError(w, "Failed to get leaderboard", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"period": period,
		"sort":   sort,
		"rows":   rows,
	})
}
