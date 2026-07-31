package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
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

func (h *StatsHandler) ExecutiveSummary(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.stats_executive_summary")
	defer span.End()

	q := r.URL.Query()
	timeFrame := q.Get("time_frame")
	if timeFrame == "" {
		timeFrame = "12h"
	}

	validFrames := map[string]bool{
		"12h": true,
		"24h": true,
		"7d":  true,
		"30d": true,
		"90d": true,
	}
	if !validFrames[timeFrame] {
		h.respondError(w, "invalid time_frame", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("aegis:stats:executive:%s", timeFrame)
	cached, err := h.redisClient.Get(ctx, cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		span.SetAttributes(attribute.Bool("cache.hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	span.SetAttributes(attribute.Bool("cache.hit", false))

	now := time.Now().UTC()
	var fromTime time.Time
	switch timeFrame {
	case "12h":
		fromTime = now.Add(-12 * time.Hour)
	case "24h":
		fromTime = now.Add(-24 * time.Hour)
	case "7d":
		fromTime = now.Add(-7 * 24 * time.Hour)
	case "30d":
		fromTime = now.Add(-30 * 24 * time.Hour)
	case "90d":
		fromTime = now.Add(-90 * 24 * time.Hour)
	default:
		fromTime = now.Add(-12 * time.Hour)
	}

	resp, err := h.statsRepo.GetExecutiveSummary(ctx, fromTime, timeFrame)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	respBytes, _ := json.Marshal(resp)
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, 15*time.Second)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}

func (h *StatsHandler) VerdictVelocity(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.stats_verdict_velocity")
	defer span.End()

	q := r.URL.Query()
	timeFrame := q.Get("time_frame")
	if timeFrame == "" {
		timeFrame = "12h"
	}

	validFrames := map[string]bool{
		"12h": true,
		"24h": true,
		"7d":  true,
		"30d": true,
		"90d": true,
	}
	if !validFrames[timeFrame] {
		h.respondError(w, "invalid time_frame", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("aegis:stats:velocity:%s", timeFrame)
	cached, err := h.redisClient.Get(ctx, cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		span.SetAttributes(attribute.Bool("cache.hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	span.SetAttributes(attribute.Bool("cache.hit", false))

	resp, err := h.statsRepo.GetVerdictVelocity(ctx, timeFrame)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	respBytes, _ := json.Marshal(resp)
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, 15*time.Second)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}

func (h *StatsHandler) MerchantRisk(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "StatsHandler.MerchantRisk")
	defer span.End()

	q := r.URL.Query()
	timeFrame := q.Get("time_frame")
	if timeFrame == "" {
		timeFrame = "12h"
	}

	validFrames := map[string]bool{
		"12h": true,
		"24h": true,
		"7d":  true,
		"30d": true,
		"90d": true,
	}
	if !validFrames[timeFrame] {
		h.respondError(w, "invalid time_frame", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("aegis:stats:merchant_risk:%s", timeFrame)
	cached, err := h.redisClient.Get(ctx, cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		span.SetAttributes(attribute.Bool("cache.hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	span.SetAttributes(attribute.Bool("cache.hit", false))

	resp, err := h.statsRepo.GetMerchantRisk(ctx, timeFrame)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	respBytes, _ := json.Marshal(resp)
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, 15*time.Second)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}

func (h *StatsHandler) ChannelPerformance(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "StatsHandler.ChannelPerformance")
	defer span.End()

	q := r.URL.Query()
	timeFrame := q.Get("time_frame")
	if timeFrame == "" {
		timeFrame = "12h"
	}

	validFrames := map[string]bool{
		"12h": true,
		"24h": true,
		"7d":  true,
		"30d": true,
		"90d": true,
	}
	if !validFrames[timeFrame] {
		h.respondError(w, "invalid time_frame", http.StatusBadRequest)
		return
	}

	cacheKey := fmt.Sprintf("aegis:stats:channel_performance:%s", timeFrame)
	cached, err := h.redisClient.Get(ctx, cacheKey).Bytes()
	if err == nil && len(cached) > 0 {
		span.SetAttributes(attribute.Bool("cache.hit", true))
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}
	span.SetAttributes(attribute.Bool("cache.hit", false))

	resp, err := h.statsRepo.GetChannelPerformance(ctx, timeFrame)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	respBytes, _ := json.Marshal(resp)
	go h.redisClient.Set(context.Background(), cacheKey, respBytes, 15*time.Second)

	w.Header().Set("Content-Type", "application/json")
	w.Write(respBytes)
}

func (h *StatsHandler) OutcomeDistribution(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.stats_outcome_distribution")
	defer span.End()

	timeFrame := r.URL.Query().Get("timeFrame")
	if timeFrame == "" {
		timeFrame = "30d"
	}

	points, err := h.statsRepo.GetOutcomeDistribution(ctx, timeFrame)
	if err != nil {
		h.respondError(w, "Failed to get outcome distribution", http.StatusInternalServerError)
		return
	}

	total := 0
	for _, p := range points {
		total += p.Count
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"timeFrame": timeFrame,
		"data":      points,
		"total":     total,
	})
}

func (h *StatsHandler) ExportReportPDF(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.stats_export_report_pdf")
	defer span.End()

	reportName := r.URL.Query().Get("report")
	if reportName == "" {
		reportName = "Compliance_Audit_Report"
	}
	timeFrame := r.URL.Query().Get("timeFrame")
	if timeFrame == "" {
		timeFrame = "30d"
	}

	outcomes, _ := h.statsRepo.GetOutcomeDistribution(ctx, timeFrame)
	todayTotal, _ := h.statsRepo.TodayTotal(ctx)
	todayFlagged, _ := h.statsRepo.TodayFlagged(ctx)
	todayAutoBlocked, _ := h.statsRepo.TodayAutoBlocked(ctx)
	pendingReview, _ := h.statsRepo.PendingReview(ctx)
	falsePositives, totalReviewed, _ := h.statsRepo.FalsePositiveStats(ctx)
	channels, _ := h.statsRepo.GetChannelPerformance(ctx, timeFrame)

	pdfBytes := service.GenerateAuditReportPDF(
		reportName,
		todayTotal, todayFlagged, todayAutoBlocked, pendingReview, falsePositives, totalReviewed,
		outcomes,
		channels,
	)

	filename := fmt.Sprintf("%s_%s.pdf", strings.ReplaceAll(strings.ToLower(reportName), " ", "_"), time.Now().Format("20060102"))
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(pdfBytes)))
	w.Write(pdfBytes)
}


