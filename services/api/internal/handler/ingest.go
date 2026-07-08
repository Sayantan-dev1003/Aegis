package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/Sayantan-dev1003/aegis/api/internal/tracing"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

// IngestHandler handles HTTP requests for data ingestion.
type IngestHandler struct {
	ingestService *service.IngestService
	velocityStore *repository.VelocityStore
}

// NewIngestHandler creates a new IngestHandler.
func NewIngestHandler(ingestService *service.IngestService, velocityStore *repository.VelocityStore) *IngestHandler {
	return &IngestHandler{
		ingestService: ingestService,
		velocityStore: velocityStore,
	}
}

// IngestTransactions handles POST /api/v1/ingest/transactions.
func (h *IngestHandler) IngestTransactions(w http.ResponseWriter, r *http.Request) {
	tracer := tracing.Tracer("aegis/handler")
	ctx, span := tracer.Start(r.Context(), "handler.ingest_transaction",
		trace.WithSpanKind(trace.SpanKindServer),
	)
	defer span.End()

	var tx model.Transaction

	// Parse JSON payload
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "invalid json payload")
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	span.SetAttributes(
		attribute.String("transaction.id", tx.ID),
		attribute.String("transaction.account_id", tx.AccountID),
		attribute.Float64("transaction.amount", tx.Amount),
		attribute.String("transaction.merchant_id", tx.MerchantID),
		attribute.String("http.method", r.Method),
		attribute.String("http.route", "/api/v1/ingest/transactions"),
		attribute.String("http.client_ip", r.RemoteAddr),
	)

	// Set logger
	log := logger.FromContext(ctx)
	if tx.ID != "" {
		log = logger.WithTransaction(log, tx.ID)
	}
	log.Info().Float64("amount", tx.Amount).Msg("transaction ingested")

	// Service call handles validation, db insertion and outbox queuing
	_, dbSpan := tracer.Start(ctx, "db.create_transaction")
	txID, err := h.ingestService.IngestTransaction(ctx, &tx)
	dbSpan.End()

	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, "failed to persist transaction")
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusBadRequest)
		return
	}
	span.SetStatus(codes.Ok, "")

	// Record velocity signal (fire-and-forget style logging error if it fails)
	deviceID := ""
	if tx.DeviceID != nil {
		deviceID = *tx.DeviceID
	}
	// We don't fail the request if velocity recording fails
	_, velSpan := tracer.Start(ctx, "redis.record_velocity")
	_ = h.velocityStore.RecordTransactionAndDevice(ctx, tx.AccountID, txID, tx.Timestamp, deviceID)
	velSpan.End()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)

	resp := map[string]string{
		"transaction_id": txID,
		"status":         "queued",
	}
	json.NewEncoder(w).Encode(resp)
}
