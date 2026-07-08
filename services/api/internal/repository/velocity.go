package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
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

// VelocityStore handles Redis velocity data structures.
type VelocityStore struct {
	rdb    *redis.Client
	logger *zerolog.Logger
	tracer trace.Tracer
}

// NewVelocityStore creates a new VelocityStore.
func NewVelocityStore(rdb *redis.Client, logger *zerolog.Logger) *VelocityStore {
	return &VelocityStore{
		rdb:    rdb,
		logger: logger,
		tracer: otel.Tracer("aegis/api/repository"),
	}
}

// RecordTransactionAndDevice records the transaction timestamp and optionally the device ID.
func (v *VelocityStore) RecordTransactionAndDevice(ctx context.Context, accountID, transactionID string, timestamp time.Time, deviceID string) error {
	ctx, span := v.tracer.Start(ctx, "velocity.record_transaction")
	
	span.SetAttributes(
		attribute.String("account_id", hashString(accountID)), 
		attribute.String("operation", "zadd"),
	)
	defer span.End()

	timer := prometheus.NewTimer(metrics.RedisOperationDuration.WithLabelValues("zadd"))
	defer timer.ObserveDuration()

	txnKey := fmt.Sprintf("acct:%s:txns", accountID)
	
	pipe := v.rdb.Pipeline()
	pipe.ZAdd(ctx, txnKey, redis.Z{
		Score:  float64(timestamp.Unix()),
		Member: transactionID,
	})
	pipe.Expire(ctx, txnKey, 48*time.Hour) // 172800 seconds

	if deviceID != "" {
		deviceKey := fmt.Sprintf("acct:%s:devices", accountID)
		pipe.SAdd(ctx, deviceKey, deviceID)
		pipe.Expire(ctx, deviceKey, 30*24*time.Hour) // 30 days
	} else {
		v.logger.Debug().Msg("device_id absent from ingest payload, skipping device tracking")
	}

	_, err := pipe.Exec(ctx)
	if err != nil {
		metrics.VelocityRecordTotal.WithLabelValues("zadd", "error").Inc()
		v.logger.Warn().
			Err(err).
			Str("account_id", hashString(accountID)).
			Str("transaction_id", transactionID).
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
