package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/go-chi/chi/v5"
)

// CustomerHandler handles customer-related API endpoints.
type CustomerHandler struct {
	customerRepo *repository.CustomerRepository
	txRepo       *repository.TransactionRepository
}

// NewCustomerHandler creates a new CustomerHandler.
func NewCustomerHandler(customerRepo *repository.CustomerRepository, txRepo *repository.TransactionRepository) *CustomerHandler {
	return &CustomerHandler{
		customerRepo: customerRepo,
		txRepo:       txRepo,
	}
}

// GetCustomer retrieves a customer by account ID.
func (h *CustomerHandler) GetCustomer(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "account_id")
	if accountID == "" {
		http.Error(w, "account_id is required", http.StatusBadRequest)
		return
	}

	customer, err := h.customerRepo.FindByAccountID(r.Context(), accountID)
	if err != nil {
		http.Error(w, "failed to get customer", http.StatusInternalServerError)
		return
	}

	if customer == nil {
		http.Error(w, "customer not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(customer)
}

// GetCustomerTransactions retrieves paginated transactions for a customer.
func (h *CustomerHandler) GetCustomerTransactions(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "account_id")
	if accountID == "" {
		http.Error(w, "account_id is required", http.StatusBadRequest)
		return
	}

	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page := 1
	if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
		page = p
	}

	limit := 5
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	offset := (page - 1) * limit

	summaries, totalCount, err := h.txRepo.ListByAccountID(r.Context(), accountID, limit, offset)
	if err != nil {
		http.Error(w, "failed to get customer transactions", http.StatusInternalServerError)
		return
	}

	if summaries == nil {
		summaries = []model.TransactionSummary{}
	}

	response := map[string]interface{}{
		"transactions": summaries,
		"total":        totalCount,
		"page":         page,
		"limit":        limit,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
