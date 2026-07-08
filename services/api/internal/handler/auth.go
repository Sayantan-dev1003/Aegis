package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
	"github.com/redis/go-redis/v9"
	"github.com/Sayantan-dev1003/aegis/api/internal/logger"
)

type AuthHandler struct {
	repo        *repository.AnalystRepository
	authService *service.AuthService
	redisClient *redis.Client
}

func NewAuthHandler(repo *repository.AnalystRepository, authService *service.AuthService, redisClient *redis.Client) *AuthHandler {
	return &AuthHandler{
		repo:        repo,
		authService: authService,
		redisClient: redisClient,
	}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req model.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	analyst, err := h.repo.FindByEmail(r.Context(), req.Email)
	if err != nil {
		logger.FromContext(r.Context()).Error().Err(err).Msg("Database error during login")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if analyst == nil || !analyst.IsActive {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if err := h.authService.CheckPassword(analyst.PasswordHash, req.Password); err != nil {
		http.Error(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	accessToken, err := h.authService.GenerateAccessToken(analyst.ID, analyst.Role)
	if err != nil {
		logger.FromContext(r.Context()).Error().Err(err).Msg("Failed to generate access token")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	refreshToken, err := h.authService.GenerateRefreshToken(analyst.ID)
	if err != nil {
		logger.FromContext(r.Context()).Error().Err(err).Msg("Failed to generate refresh token")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Update last login asynchronously
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = h.repo.UpdateLastLogin(ctx, analyst.ID)
	}()

	res := model.LoginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req model.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Check if token is blacklisted in Redis
	isBlacklisted, err := h.redisClient.Get(r.Context(), "bl_"+req.RefreshToken).Result()
	if err != redis.Nil && isBlacklisted != "" {
		http.Error(w, "Token is blacklisted", http.StatusUnauthorized)
		return
	}

	claims, err := h.authService.ValidateToken(req.RefreshToken)
	if err != nil {
		http.Error(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

	tokenType, ok := claims["type"].(string)
	if !ok || tokenType != "refresh" {
		http.Error(w, "Invalid token type", http.StatusUnauthorized)
		return
	}

	analystID, ok := claims["sub"].(string)
	if !ok {
		http.Error(w, "Invalid token claims", http.StatusUnauthorized)
		return
	}

	analyst, err := h.repo.FindByID(r.Context(), analystID)
	if err != nil || analyst == nil || !analyst.IsActive {
		http.Error(w, "User not found or inactive", http.StatusUnauthorized)
		return
	}

	newAccessToken, err := h.authService.GenerateAccessToken(analystID, analyst.Role)
	if err != nil {
		logger.FromContext(r.Context()).Error().Err(err).Msg("Failed to generate new access token")
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	res := model.LoginResponse{
		AccessToken:  newAccessToken,
		RefreshToken: req.RefreshToken,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req model.RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	claims, err := h.authService.ValidateToken(req.RefreshToken)
	if err != nil {
		http.Error(w, "Invalid refresh token", http.StatusUnauthorized)
		return
	}

	expFloat, ok := claims["exp"].(float64)
	if !ok {
		http.Error(w, "Invalid token expiration", http.StatusUnauthorized)
		return
	}

	expTime := time.Unix(int64(expFloat), 0)
	ttl := time.Until(expTime)

	if ttl > 0 {
		err = h.redisClient.Set(r.Context(), "bl_"+req.RefreshToken, "true", ttl).Err()
		if err != nil {
			logger.FromContext(r.Context()).Error().Err(err).Msg("Failed to blacklist token in redis")
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Logged out successfully"}`))
}
