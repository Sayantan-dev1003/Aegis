package logger

import (
	"context"
	"os"

	"github.com/rs/zerolog"
	"go.opentelemetry.io/otel/trace"
)

var globalLogger zerolog.Logger

// Init initializes the global logger
func Init() *zerolog.Logger {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	serviceName := os.Getenv("OTEL_SERVICE_NAME")
	if serviceName == "" {
		serviceName = "aegis-api"
	}

	globalLogger = zerolog.New(os.Stdout).With().
		Timestamp().
		Str("service", serviceName).
		Logger()
	return &globalLogger
}

// FromContext extracts the current OTel span and attaches trace_id and span_id as log fields
func FromContext(ctx context.Context) *zerolog.Logger {
	spanCtx := trace.SpanFromContext(ctx).SpanContext()
	if !spanCtx.IsValid() {
		return &globalLogger
	}
	l := globalLogger.With().
		Str("trace_id", spanCtx.TraceID().String()).
		Str("span_id", spanCtx.SpanID().String()).
		Logger()
	return &l
}

// WithTransaction adds transaction_id to the logger
func WithTransaction(l *zerolog.Logger, transactionID string) *zerolog.Logger {
	nl := l.With().Str("transaction_id", transactionID).Logger()
	return &nl
}

// Get returns the base global logger for places without context
func Get() *zerolog.Logger {
	return &globalLogger
}
