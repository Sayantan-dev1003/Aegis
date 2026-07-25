package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/Sayantan-dev1003/aegis/api/internal/model"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

func hashString(s string) string {
	h := sha256.New()
	h.Write([]byte(s))
	return hex.EncodeToString(h.Sum(nil))[:8]
}

func parseDuration(window string) (time.Duration, error) {
	if strings.HasSuffix(window, "d") {
		daysStr := strings.TrimSuffix(window, "d")
		days, err := strconv.Atoi(daysStr)
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(window)
}

// VelocityStore handles Redis velocity data structures.
type VelocityStore struct {
	rdb        *redis.Client
	configRepo *VelocityConfigRepository
	logger     *zerolog.Logger
	tracer     trace.Tracer

	mu      sync.RWMutex
	configs map[string][]time.Duration
}

// NewVelocityStore creates a new VelocityStore and starts background sync.
func NewVelocityStore(rdb *redis.Client, configRepo *VelocityConfigRepository, logger *zerolog.Logger) *VelocityStore {
	store := &VelocityStore{
		rdb:        rdb,
		configRepo: configRepo,
		logger:     logger,
		tracer:     otel.Tracer("aegis/api/repository"),
		configs:    make(map[string][]time.Duration),
	}
	
	// Initial load
	store.ReloadConfigs(context.Background())
	
	// Redis Pub/Sub for instant updates
	pubsub := rdb.Subscribe(context.Background(), "velocity_config_updates")
	go func() {
		ch := pubsub.Channel()
		for msg := range ch {
			store.logger.Debug().Str("channel", msg.Channel).Msg("Received velocity config update event")
			store.ReloadConfigs(context.Background())
		}
	}()
	
	// Background sync as fallback
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			store.ReloadConfigs(context.Background())
		}
	}()
	
	return store
}

func (v *VelocityStore) ReloadConfigs(ctx context.Context) {
	configs, err := v.configRepo.List(ctx)
	if err != nil {
		v.logger.Error().Err(err).Msg("Failed to reload velocity configs")
		return
	}

	newConfigs := make(map[string][]time.Duration)
	for _, cfg := range configs {
		var durations []time.Duration
		for _, w := range cfg.Windows {
			d, err := parseDuration(w)
			if err == nil {
				durations = append(durations, d)
			}
		}
		newConfigs[cfg.Entity] = durations
	}

	v.mu.Lock()
	v.configs = newConfigs
	v.mu.Unlock()
}

func (v *VelocityStore) getMaxDuration(entity string) time.Duration {
	v.mu.RLock()
	defer v.mu.RUnlock()
	
	durations := v.configs[entity]
	if len(durations) == 0 {
		return 0
	}
	
	maxD := durations[0]
	for _, d := range durations {
		if d > maxD {
			maxD = d
		}
	}
	return maxD
}

// RecordTransactionAndDevice records the transaction in configured entities' sorted sets.
func (v *VelocityStore) RecordTransactionAndDevice(ctx context.Context, tx *model.Transaction) error {
	ctx, span := v.tracer.Start(ctx, "velocity.record_transaction")
	span.SetAttributes(
		attribute.String("account_id", hashString(tx.AccountID)),
		attribute.String("operation", "zadd"),
	)
	defer span.End()

	timer := prometheus.NewTimer(metrics.RedisOperationDuration.WithLabelValues("zadd"))
	defer timer.ObserveDuration()

	pipe := v.rdb.Pipeline()
	recordedAny := false

	// user entity
	userMaxD := v.getMaxDuration("user")
	if userMaxD > 0 {
		key := fmt.Sprintf("velocity:user:%s:txns", tx.AccountID)
		minValidScore := fmt.Sprintf("%d", tx.Timestamp.Add(-userMaxD).Unix())
		pipe.ZRemRangeByScore(ctx, key, "-inf", minValidScore)
		pipe.ZAdd(ctx, key, redis.Z{
			Score:  float64(tx.Timestamp.Unix()),
			Member: tx.ID,
		})
		pipe.Expire(ctx, key, userMaxD)
		recordedAny = true
	}

	// device entity
	if tx.DeviceID != nil {
		deviceID := *tx.DeviceID
		deviceMaxD := v.getMaxDuration("device")
		if deviceMaxD > 0 {
			key := fmt.Sprintf("velocity:device:%s:txns", deviceID)
			minValidScore := fmt.Sprintf("%d", tx.Timestamp.Add(-deviceMaxD).Unix())
			pipe.ZRemRangeByScore(ctx, key, "-inf", minValidScore)
			pipe.ZAdd(ctx, key, redis.Z{
				Score:  float64(tx.Timestamp.Unix()),
				Member: tx.ID,
			})
			pipe.Expire(ctx, key, deviceMaxD)
			recordedAny = true
		}
		
		// Legacy device seen tracker for backwards compatibility with CheckDeviceSeen
		deviceKey := fmt.Sprintf("acct:%s:devices", tx.AccountID)
		pipe.SAdd(ctx, deviceKey, deviceID)
		pipe.Expire(ctx, deviceKey, 30*24*time.Hour)
	}

	// ip entity
	if tx.IPAddress != nil {
		ipAddr := *tx.IPAddress
		ipMaxD := v.getMaxDuration("ip")
		if ipMaxD > 0 {
			key := fmt.Sprintf("velocity:ip:%s:txns", ipAddr)
			minValidScore := fmt.Sprintf("%d", tx.Timestamp.Add(-ipMaxD).Unix())
			pipe.ZRemRangeByScore(ctx, key, "-inf", minValidScore)
			pipe.ZAdd(ctx, key, redis.Z{
				Score:  float64(tx.Timestamp.Unix()),
				Member: tx.ID,
			})
			pipe.Expire(ctx, key, ipMaxD)
			recordedAny = true
		}
	}

	if !recordedAny {
		return nil // nothing configured
	}

	_, err := pipe.Exec(ctx)
	if err != nil {
		metrics.VelocityRecordTotal.WithLabelValues("zadd", "error").Inc()
		v.logger.Warn().
			Err(err).
			Str("transaction_id", tx.ID).
			Msg("Redis velocity record failed")
		return err
	}

	metrics.VelocityRecordTotal.WithLabelValues("zadd", "success").Inc()
	return nil
}

// CheckDeviceSeen checks if a device has been seen for the given account.
func (v *VelocityStore) CheckDeviceSeen(ctx context.Context, accountID, deviceID string) (bool, error) {
	key := fmt.Sprintf("acct:%s:devices", accountID)
	return v.rdb.SIsMember(ctx, key, deviceID).Result()
}

// Count returns the number of transactions for a specific entity within a sliding window.
func (v *VelocityStore) Count(ctx context.Context, entity, entityID string, duration time.Duration) (int, error) {
	key := fmt.Sprintf("velocity:%s:%s:txns", entity, entityID)
	minScore := fmt.Sprintf("%d", time.Now().UTC().Add(-duration).Unix())
	maxScore := "+inf"
	
	count, err := v.rdb.ZCount(ctx, key, minScore, maxScore).Result()
	if err != nil {
		return 0, err
	}
	return int(count), nil
}
