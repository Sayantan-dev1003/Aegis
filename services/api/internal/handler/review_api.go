package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/go-chi/chi/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type ReviewHandler struct {
	reviewService *service.ReviewService
	tracer        trace.Tracer
}

func NewReviewHandler(reviewService *service.ReviewService) *ReviewHandler {
	return &ReviewHandler{
		reviewService: reviewService,
		tracer:        otel.Tracer("aegis/api/handler"),
	}
}

func (h *ReviewHandler) SubmitReview(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.submit_review")
	defer span.End()

	txID := chi.URLParam(r, "id")
	
	info, ok := r.Context().Value(middleware.AnalystInfoKey).(middleware.AnalystInfo)
	if !ok || (info.Role != "reviewer" && info.Role != "admin") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprintf(w, `{"error": "insufficient permissions"}`)
		return
	}

	var req model.SubmitReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"error": "invalid request payload"}`)
		return
	}
	defer r.Body.Close()

	if req.Decision != "legitimate" && req.Decision != "confirmed_fraud" && req.Decision != "escalate" {
		// Maps to DB values (escalate->escalated, false_positive, confirmed_fraud).
		// Wait, DB has 'confirmed_fraud', 'false_positive', 'escalated'. 
		// We'll adapt: legitimate = false_positive in DB.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"error": "invalid decision"}`)
		return
	}
	if len(req.Notes) > 1000 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintf(w, `{"error": "notes exceed 1000 characters"}`)
		return
	}

	// No need to map API terms to DB terms anymore


	span.SetAttributes(
		attribute.String("transaction_id", txID),
		attribute.String("decision", req.Decision),
		attribute.String("reviewer_id", info.ID),
	)

	ip := r.RemoteAddr
	ua := r.Header.Get("User-Agent")

	review, err := h.reviewService.SubmitReview(ctx, txID, info.ID, req, ip, ua)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		if err.Error() == "transaction not found" {
			w.WriteHeader(http.StatusNotFound)
		} else if err.Error() == "transaction already reviewed" { // custom error matching
			w.WriteHeader(http.StatusConflict)
		} else {
			// e.g. "transaction is not in a reviewable state"
			w.WriteHeader(http.StatusUnprocessableEntity)
		}
		fmt.Fprintf(w, `{"error": "%s"}`, err.Error())
		return
	}

	resp := map[string]any{
		"review_id":      review.ID,
		"transaction_id": review.TransactionID,
		"decision":       review.Decision,
		"status":         "reviewed", // or escalated based on actual DB update
		"reviewed_at":    review.ReviewedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}
