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

	"os/signal"
	"syscall"

	"github.com/Sayantan-dev1003/aegis/api/internal/config"
	"github.com/Sayantan-dev1003/aegis/api/internal/database"
	"github.com/Sayantan-dev1003/aegis/api/internal/handler"
	"github.com/Sayantan-dev1003/aegis/api/internal/kafka"
	aegismw "github.com/Sayantan-dev1003/aegis/api/internal/middleware"
	"github.com/Sayantan-dev1003/aegis/api/internal/outbox"
	"github.com/Sayantan-dev1003/aegis/api/internal/repository"
	"github.com/Sayantan-dev1003/aegis/api/internal/service"
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

	// Initialize Services & Repositories
	analystRepo := repository.NewAnalystRepository(pgPool)
	authService := service.NewAuthService(cfg.JWTSecret, cfg.JWTAccessTTL, cfg.JWTRefreshTTL)
	authHandler := handler.NewAuthHandler(analystRepo, authService, redisClient)

	// Initialize Ingest Services & Repositories
	txRepo := repository.NewTransactionRepository(pgPool)
	outboxRepo := repository.NewOutboxRepository(pgPool)
	ingestService := service.NewIngestService(pgPool, txRepo, outboxRepo)
	ingestHandler := handler.NewIngestHandler(ingestService)

	// Background context for graceful shutdown
	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	// Initialize Kafka & Outbox Poller
	kafkaProducer := kafka.NewProducer(cfg.KafkaBrokers)
	defer kafkaProducer.Close()

	outboxPoller := outbox.NewPoller(outboxRepo, kafkaProducer)
	go outboxPoller.Start(serverCtx)

	log.Info().Msg("Aegis API Server dependencies initialized successfully.")

	// Set up Chi router
	r := chi.NewRouter()

	// Add standard middleware and custom request logging middleware
	r.Use(middleware.Recoverer)
	r.Use(aegismw.RequestID)
	r.Use(aegismw.RequestLogger())

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth routes
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/refresh", authHandler.Refresh)
	r.Post("/auth/logout", authHandler.Logout)

	// Ingest routes (Bank API)
	r.Group(func(r chi.Router) {
		// Limit to 1000 requests per minute per API key
		r.Use(aegismw.RateLimitMiddleware(redisClient, 1000))
		r.Post("/api/v1/ingest/transactions", ingestHandler.IngestTransactions)
	})

	// Protected routes for testing
	r.Group(func(r chi.Router) {
		r.Use(aegismw.Auth(authService))
		
		r.Get("/auth/me", func(w http.ResponseWriter, req *http.Request) {
			info := req.Context().Value(aegismw.AnalystInfoKey).(aegismw.AnalystInfo)
			w.Write([]byte(fmt.Sprintf("Hello %s, role: %s", info.ID, info.Role)))
		})

		r.Group(func(r chi.Router) {
			r.Use(aegismw.RequireRole("admin"))
			r.Get("/auth/admin", func(w http.ResponseWriter, req *http.Request) {
				w.Write([]byte("Admin only area"))
			})
		})
	})

	// Start server on configured API port
	serverAddr := fmt.Sprintf(":%s", cfg.APIPort)
	srv := &http.Server{Addr: serverAddr, Handler: r}

	go func() {
		log.Info().Str("addr", serverAddr).Msg("Listening for HTTP requests")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("HTTP server failed")
		}
	}()

	// Graceful shutdown handling
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down server...")

	// Cancel the server context to stop background tasks like the outbox poller
	serverCancel()

	// Shutdown the HTTP server
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal().Err(err).Msg("Server forced to shutdown")
	}

	log.Info().Msg("Server exiting")
}
