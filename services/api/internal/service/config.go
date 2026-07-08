package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/google/uuid"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)



// ConfigService handles system configuration caching and retrieval.
type ConfigService struct {
	configRepo *repository.ConfigRepository
	rdb        *redis.Client
	logger     *zerolog.Logger
	defaultTTL time.Duration
}

// NewConfigService creates a new ConfigService.
func NewConfigService(repo *repository.ConfigRepository, rdb *redis.Client, logger *zerolog.Logger) *ConfigService {
	return &ConfigService{
		configRepo: repo,
		rdb:        rdb,
		logger:     logger,
		defaultTTL: 60 * time.Second, // 60 seconds
	}
}

// GetConfig fetches a config value, preferring Redis cache and falling back to DB.
func (s *ConfigService) GetConfig(ctx context.Context, key string) (string, error) {
	cacheKey := fmt.Sprintf("aegis:config:%s", key)

	// 1. Try Redis cache
	val, err := s.rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		metrics.ConfigCacheHitTotal.WithLabelValues(key, "hit").Inc()
		return val, nil
	}
	metrics.ConfigCacheHitTotal.WithLabelValues(key, "miss").Inc()

	if !errors.Is(err, redis.Nil) {
		// Redis error (not a cache miss) — log warn, fall through to DB
		s.logger.Warn().
			Err(err).
			Str("key", key).
			Msg("redis get failed for config, falling through to DB")
	}

	// 2. Cache miss or Redis error — read from DB
	dbVal, err := s.configRepo.GetValue(ctx, key)
	if err != nil {
		metrics.ConfigDbReadTotal.WithLabelValues(key, "error").Inc()
		return "", fmt.Errorf("config.GetConfig: %w", err)
	}
	metrics.ConfigDbReadTotal.WithLabelValues(key, "success").Inc()

	// 3. Populate cache (best-effort — don't fail if Redis write fails)
	if setErr := s.rdb.Set(ctx, cacheKey, dbVal, s.defaultTTL).Err(); setErr != nil {
		s.logger.Warn().
			Err(setErr).
			Str("key", key).
			Msg("failed to cache config value")
	}

	return dbVal, nil
}

// GetConfigFloat is a convenience wrapper for float configs.
func (s *ConfigService) GetConfigFloat(ctx context.Context, key string, defaultVal float64) float64 {
	val, err := s.GetConfig(ctx, key)
	if err != nil {
		s.logger.Warn().
			Str("key", key).
			Float64("default", defaultVal).
			Msg("config key not found, using default")
		return defaultVal
	}
	f, err := strconv.ParseFloat(val, 64)
	if err != nil {
		s.logger.Error().
			Str("key", key).
			Str("value", val).
			Msg("config value not parseable as float64")
		return defaultVal
	}
	return f
}

// GetConfigInt is a convenience wrapper for integer configs.
func (s *ConfigService) GetConfigInt(ctx context.Context, key string, defaultVal int) int {
	val, err := s.GetConfig(ctx, key)
	if err != nil {
		s.logger.Warn().
			Str("key", key).
			Int("default", defaultVal).
			Msg("config key not found, using default")
		return defaultVal
	}
	i, err := strconv.Atoi(val)
	if err != nil {
		s.logger.Error().
			Str("key", key).
			Str("value", val).
			Msg("config value not parseable as int")
		return defaultVal
	}
	return i
}

// UpdateConfig updates a configuration value in the DB and invalidates the Redis cache.
func (s *ConfigService) UpdateConfig(ctx context.Context, key, value string, updatedBy uuid.UUID) error {
	// 1. Write to DB
	if err := s.configRepo.Update(ctx, key, value, updatedBy.String()); err != nil {
		return fmt.Errorf("config.UpdateConfig: %w", err)
	}

	// 2. Invalidate Redis cache
	cacheKey := fmt.Sprintf("aegis:config:%s", key)
	if err := s.rdb.Del(ctx, cacheKey).Err(); err != nil {
		// Log but don't fail — cache will expire naturally within TTL
		s.logger.Warn().
			Err(err).
			Str("key", key).
			Msg("failed to invalidate config cache")
	}

	return nil
}
