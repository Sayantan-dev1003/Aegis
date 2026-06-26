package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
)

// IngestHandler handles HTTP requests for data ingestion.
type IngestHandler struct {
	ingestService *service.IngestService
}

// NewIngestHandler creates a new IngestHandler.
func NewIngestHandler(ingestService *service.IngestService) *IngestHandler {
	return &IngestHandler{
		ingestService: ingestService,
	}
}

// IngestTransactions handles POST /api/v1/ingest/transactions.
func (h *IngestHandler) IngestTransactions(w http.ResponseWriter, r *http.Request) {
	var tx model.Transaction

	// Parse JSON payload
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		http.Error(w, `{"error": "invalid json payload"}`, http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Service call handles validation, db insertion and outbox queuing
	txID, err := h.ingestService.IngestTransaction(r.Context(), &tx)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error": "%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)

	resp := map[string]string{
		"transaction_id": txID,
		"status":         "queued",
	}
	json.NewEncoder(w).Encode(resp)
}
