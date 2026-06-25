package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/Sayantan-dev1003/aegis/api/internal/config"
	"github.com/Sayantan-dev1003/aegis/api/internal/database"
	loggingmw "github.com/Sayantan-dev1003/aegis/api/internal/middleware"
)

func main() {
	// Initialize Zerolog (JSON output)
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	log.Info().Msg("Starting Aegis API Server...")

	// Load configuration
	cfg := config.Load()

	log.Info().Msg("Configuration loaded successfully!")
	log.Info().
		Str("api_port", cfg.APIPort).
		Str("metrics_port", cfg.MetricsPort).
		Str("postgres_host", cfg.PostgresHost).
		Str("postgres_db", cfg.PostgresDB).
		Str("postgres_user", cfg.PostgresUser).
		Str("redis_url", cfg.RedisURL).
		Str("kafka_brokers", cfg.KafkaBrokers).
		Str("otel_service_name", cfg.OtelServiceNameAPI).
		Str("otel_endpoint", cfg.OtelExporterOTLPEndpoint).
		Msg("Configuration details")

	// Create context for database connections
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Run database migrations on startup
	if err := database.RunMigrations(cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresDB, cfg.MigrationsPath); err != nil {
		log.Fatal().Err(err).Msg("Failed to run database migrations")
	}

	// Initialize PostgreSQL pool
	pgPool, err := database.ConnectPostgres(ctx, cfg.PostgresHost, cfg.PostgresPort, cfg.PostgresUser, cfg.PostgresPassword, cfg.PostgresDB)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to PostgreSQL")
	}
	defer pgPool.Close()

	// Initialize Redis client
	redisClient, err := database.ConnectRedis(ctx, cfg.RedisURL)
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to Redis")
	}
	defer redisClient.Close()

	log.Info().Msg("Aegis API Server dependencies initialized successfully.")

	// Set up Chi router
	r := chi.NewRouter()

	// Add standard middleware and custom request logging middleware
	r.Use(middleware.Recoverer)
	r.Use(loggingmw.RequestID)
	r.Use(loggingmw.RequestLogger())

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Start server on configured API port
	serverAddr := fmt.Sprintf(":%s", cfg.APIPort)
	log.Info().Str("addr", serverAddr).Msg("Listening for HTTP requests")
	if err := http.ListenAndServe(serverAddr, r); err != nil {
		log.Fatal().Err(err).Msg("HTTP server failed")
	}
}
