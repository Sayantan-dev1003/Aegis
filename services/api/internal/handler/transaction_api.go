package handler

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

type TransactionHandler struct {
	txRepo     *repository.TransactionRepository
	fraudRepo  *repository.FraudResultRepository
	reviewRepo *repository.ReviewRepository
	tracer     trace.Tracer
}

func NewTransactionHandler(
	txRepo *repository.TransactionRepository,
	fraudRepo *repository.FraudResultRepository,
	reviewRepo *repository.ReviewRepository,
) *TransactionHandler {
	return &TransactionHandler{
		txRepo:     txRepo,
		fraudRepo:  fraudRepo,
		reviewRepo: reviewRepo,
		tracer:     otel.Tracer("aegis/api/handler"),
	}
}

func (h *TransactionHandler) respondError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	fmt.Fprintf(w, `{"error": "%s"}`, msg)
}

func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx, span := h.tracer.Start(r.Context(), "handler.list_transactions")
	defer span.End()

	q := r.URL.Query()
	limitStr := q.Get("limit")
	limit := 20
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	req := model.ListTransactionsRequest{
		Limit: limit,
	}

	if status := q.Get("status"); status != "" {
		validStatuses := map[string]bool{"pending": true, "processing": true, "scored": true, "auto_blocked": true, "scoring_failed": true, "reviewed": true, "escalated": true}
		if !validStatuses[status] {
			h.respondError(w, "invalid status", http.StatusBadRequest)
			return
		}
		req.Status = status
	}

	if from := q.Get("from_date"); from != "" {
		t, err := time.Parse(time.RFC3339, from)
		if err != nil {
			h.respondError(w, "invalid from_date format", http.StatusBadRequest)
			return
		}
		req.FromDate = t
	}

	if to := q.Get("to_date"); to != "" {
		t, err := time.Parse(time.RFC3339, to)
		if err != nil {
			h.respondError(w, "invalid to_date format", http.StatusBadRequest)
			return
		}
		req.ToDate = t
	}

	if minScore := q.Get("min_score"); minScore != "" {
		s, err := strconv.ParseFloat(minScore, 64)
		if err != nil || s < 0.0 || s > 1.0 {
			h.respondError(w, "invalid min_score", http.StatusBadRequest)
			return
		}
		req.MinScore = s
	}

	if isFraudStr := q.Get("is_fraud"); isFraudStr != "" {
		b, err := strconv.ParseBool(isFraudStr)
		if err == nil {
			req.IsFraud = &b
		}
	}

	span.SetAttributes(
		attribute.String("filter.status", req.Status),
		attribute.Int("pagination.limit", req.Limit),
	)

	// Since we handled cursor inside the handler in DB...
	// wait, we need to pass cursor CA and ID to DB. The prompt suggested encoding/decoding.
	// Actually, let's just do it directly. If cursor is provided:
	cursor := q.Get("cursor")
	if cursor != "" {
		span.SetAttributes(attribute.Bool("pagination.has_cursor", true))

		b, err := base64.URLEncoding.DecodeString(cursor)
		if err != nil {
			h.respondError(w, "invalid cursor format", http.StatusBadRequest)
			return
		}

		var c model.PaginationCursor
		if err := json.Unmarshal(b, &c); err != nil {
			h.respondError(w, "invalid cursor payload", http.StatusBadRequest)
			return
		}

		req.CursorID = c.ID
		req.CursorDate = c.CreatedAt
	} else {
		span.SetAttributes(attribute.Bool("pagination.has_cursor", false))
	}

	results, _, err := h.txRepo.List(ctx, req)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}

	// generate next cursor
	nextCursor := ""
	if len(results) == limit {
		last := results[len(results)-1]
		c := model.PaginationCursor{CreatedAt: last.CreatedAt, ID: last.ID}
		b, _ := json.Marshal(c)
		nextCursor = base64.URLEncoding.EncodeToString(b)
	}

	resp := model.ListTransactionsResponse{
		Data:       results,
		NextCursor: nextCursor,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *TransactionHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	if _, err := uuid.Parse(idStr); err != nil {
		h.respondError(w, "invalid transaction id format", http.StatusBadRequest)
		return
	}

	ctx, span := h.tracer.Start(r.Context(), "handler.get_transaction")
	span.SetAttributes(attribute.String("transaction_id", idStr))
	defer span.End()

	tx, err := h.txRepo.GetByID(ctx, idStr)
	if err != nil {
		h.respondError(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if tx == nil {
		h.respondError(w, "transaction not found", http.StatusNotFound)
		return
	}

	resp := model.TransactionDetailResponse{
		Transaction: model.TransactionDetail{
			ID:         tx.ID,
			Amount:     tx.Amount,
			MerchantID: tx.MerchantID,
			CardID:     tx.AccountID,
			Status:     tx.Status,
			CreatedAt:  tx.IngestedAt,
			UpdatedAt:  tx.UpdatedAt,
		},
	}

	fr, _ := h.fraudRepo.GetByTransactionID(ctx, tx.ID)
	if fr != nil {
		var weights []model.FeatureWeight
		var shapMap map[string]float64
		if err := json.Unmarshal(fr.SHAPValues, &shapMap); err == nil {
			for k, v := range shapMap {
				weights = append(weights, model.FeatureWeight{
					Feature:    k,
					Weight:     v,
					Importance: math.Abs(v),
				})
			}
			sort.Slice(weights, func(i, j int) bool {
				return weights[i].Importance > weights[j].Importance
			})
			if len(weights) > 10 {
				weights = weights[:10]
			}
		}

		mv := ""
		if fr.ModelVersion != nil {
			mv = *fr.ModelVersion
		}

		resp.FraudResult = &model.FraudResultDetail{
			FraudScore:     fr.FraudScore,
			IsFraud:        fr.IsFraud,
			ModelVersion:   mv,
			FeatureWeights: weights,
			ScoredAt:       fr.CreatedAt,
		}
	}

	rev, _ := h.reviewRepo.GetByTransactionID(ctx, tx.ID)
	if rev != nil {
		resp.Review = &model.ReviewDetail{
			ReviewerID: rev.ReviewerID,
			Decision:   rev.Decision,
			Notes:      rev.Notes,
			ReviewedAt: rev.ReviewedAt,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
