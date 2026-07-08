package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/sync/errgroup"
)

type StatsHandler struct {
	statsRepo   *repository.StatsRepository
	redisClient *redis.Client
	tracer      trace.Tracer
}

func NewStatsHandler(statsRepo *repository.StatsRepository, redisClient *redis.Client) *StatsHandler {
	return &StatsHandler{
		statsRepo:   statsRepo,
		redisClient: redisClient,
		tracer:      otel.Tracer("aegis/api/handler"),
	}
}

func (h *StatsHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *StatsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.stats_summary")
	defer span.End()

	cacheKey := "aegis:stats:summary"
	cached, err := h.redisClient.Get(ctx, cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		span.SetAttributes(attribute.Bool("cache.hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	span.SetAttributes(attribute.Bool("cache.hit", false))

	g, gCtx := errgroup.WithContext(ctx)

	var resp model.StatsSummaryResponse
	var total, flagged, auto, pending, fp, totalReviewed int

	g.Go(func() error {
		var e error
		total, e = h.statsRepo.TodayTotal(gCtx)
		return e
	})
	g.Go(func() error {
		var e error
		flagged, e = h.statsRepo.TodayFlagged(gCtx)
		return e
	})
	g.Go(func() error {
		var e error
		auto, e = h.statsRepo.TodayAutoBlocked(gCtx)
		return e
	})
	g.Go(func() error {
		var e error
		pending, e = h.statsRepo.PendingReview(gCtx)
		return e
	})
	g.Go(func() error {
		var e error
		fp, totalReviewed, e = h.statsRepo.FalsePositiveStats(gCtx)
		return e
	})

	if err := g.Wait(); err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	resp.TodayTotal = total
	resp.TodayFlagged = flagged
	resp.TodayAutoBlocked = auto
	resp.PendingReview = pending
	resp.ComputedAt = time.Now().UTC()

	if totalReviewed > 0 {
		rate := float64(fp) / float64(totalReviewed)
		resp.FalsePositiveRate = &rate
	}

	respBytes, _ := json.Marshal(resp)
	
	// Cache for 60 seconds
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, 60*time.Second)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}

func (h *StatsHandler) Trends(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	period := q.Get("period")
	if period == "" {
		period = "7d"
	}
	granularity := q.Get("granularity")
	if granularity == "" {
		granularity = "day"
	}

	if period != "7d" && period != "30d" && period != "90d" {
		h.respondError(w, "invalid period", http.StatusBadRequest)
		return
	}
	if granularity != "hour" && granularity != "day" && granularity != "week" {
		h.respondError(w, "invalid granularity", http.StatusBadRequest)
		return
	}
	
	if (period == "7d" && granularity == "week") {
		h.respondError(w, "granularity too coarse for selected period", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("aegis:stats:trends:%s:%s", period, granularity)
	cached, err := h.redisClient.Get(r.Context(), cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	periodMap := map[string]string{
		"7d":  "7 days",
		"30d": "30 days",
		"90d": "90 days",
	}

	trends, err := h.statsRepo.Trends(r.Context(), granularity, periodMap[period])
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	var start time.Time
	now := time.Now().UTC()
	
	switch period {
	case "7d":
		start = now.Add(-7 * 24 * time.Hour)
	case "30d":
		start = now.Add(-30 * 24 * time.Hour)
	case "90d":
		start = now.Add(-90 * 24 * time.Hour)
	}

	switch granularity {
	case "hour":
		start = start.Truncate(time.Hour)
	case "day":
		start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	case "week":
		offset := int(time.Monday - start.Weekday())
		if offset > 0 {
			offset -= 7
		}
		start = time.Date(start.Year(), start.Month(), start.Day()+offset, 0, 0, 0, 0, time.UTC)
	}

	trendMap := make(map[time.Time]model.TrendPoint)
	for _, t := range trends {
		trendMap[t.Bucket.UTC()] = t
	}

	var filledTrends []model.TrendPoint
	curr := start
	for curr.Before(now) || curr.Equal(now) {
		if tp, ok := trendMap[curr]; ok {
			filledTrends = append(filledTrends, tp)
		} else {
			filledTrends = append(filledTrends, model.TrendPoint{
				Bucket:        curr,
				Total:         0,
				Flagged:       0,
				AutoBlocked:   0,
				AvgFraudScore: nil,
			})
		}

		switch granularity {
		case "hour":
			curr = curr.Add(time.Hour)
		case "day":
			curr = curr.AddDate(0, 0, 1)
		case "week":
			curr = curr.AddDate(0, 0, 7)
		}
	}

	resp := model.TrendsResponse{
		Period:      period,
		Granularity: granularity,
		Data:        filledTrends,
	}

	respBytes, _ := json.Marshal(resp)
	ttl := 15 * time.Minute
	if granularity == "hour" {
		ttl = 5 * time.Minute
	} else if granularity == "week" {
		ttl = 60 * time.Minute
	}
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, ttl)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}
