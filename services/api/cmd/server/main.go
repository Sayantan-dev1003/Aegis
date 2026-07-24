package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
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
	"github.com/Sayantan-dev1003/aegis/api/internal/ws"
	"github.com/Sayantan-dev1003/aegis/api/internal/metrics"
	"github.com/Sayantan-dev1003/aegis/api/internal/tracing"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	// Initialize Zerolog (JSON output)
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()

	log.Info().Msg("Starting Aegis API Server...")

	// Load configuration
	cfg := config.Load()

	// Initialize OpenTelemetry Tracing
	shutdown, err := tracing.InitTracer(context.Background())
	if err != nil {
		log.Fatal().Err(err).Msg("failed to initialise tracer")
	}
	defer func() {
		if err := shutdown(context.Background()); err != nil {
			log.Error().Err(err).Msg("tracer shutdown error")
		}
	}()

	// Initialize Prometheus Metrics
	metrics.Init(nil)

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
	ruleRepo := repository.NewRuleRepository(pgPool)
	rulesEngine := service.NewRulesEngine(ruleRepo, txRepo)
	ingestService := service.NewIngestService(pgPool, txRepo, outboxRepo, rulesEngine)
	
	velocityStore := repository.NewVelocityStore(redisClient, &log.Logger)
	ingestHandler := handler.NewIngestHandler(ingestService, velocityStore)

	// Background context for graceful shutdown
	serverCtx, serverCancel := context.WithCancel(context.Background())
	defer serverCancel()

	var wg sync.WaitGroup

	// Initialize Kafka & Outbox Poller
	kafkaProducer := kafka.NewProducer(cfg.KafkaBrokers)
	defer kafkaProducer.Close()

	outboxPoller := outbox.NewPoller(outboxRepo, kafkaProducer)
	wg.Add(1)
	go func() {
		defer wg.Done()
		outboxPoller.Start(serverCtx)
	}()

	// Initialize WebSocket Hub
	wsHub := ws.NewHub()
	wg.Add(1)
	go func() {
		defer wg.Done()
		wsHub.Run(serverCtx)
	}()

	fraudResultRepo := repository.NewFraudResultRepository(pgPool)
	configRepo := repository.NewConfigRepository(pgPool)
	reviewRepo := repository.NewReviewRepository(pgPool)
	auditRepo := repository.NewAuditRepository(pgPool)
	statsRepo := repository.NewStatsRepository(pgPool)
	
	// Phase 2 Repositories
	queueRepo := repository.NewQueueRepository(pgPool)
	intRepo := repository.NewIntegrationRepository(pgPool)
	modelRepo := repository.NewModelRepository(pgPool)
	retrainRepo := repository.NewRetrainRepository(pgPool)

	// Cleanup any zombie retrain jobs left over from a previous crash
	if err := retrainRepo.CleanupZombieJobs(ctx); err != nil {
		log.Error().Err(err).Msg("Failed to clean up zombie retrain jobs")
	}

	configService := service.NewConfigService(configRepo, redisClient, &log.Logger)
	fraudService := service.NewFraudService(fraudResultRepo, txRepo, configService, wsHub)
	reviewService := service.NewReviewService(pgPool, txRepo, reviewRepo, auditRepo, wsHub)
	incidentRepo := repository.NewIncidentRepository(pgPool)
	incidentService := service.NewIncidentService(incidentRepo)

	wsHandler := handler.NewWebSocketHandler(wsHub, authService)
	txHandler := handler.NewTransactionHandler(txRepo, fraudResultRepo, reviewRepo)
	reviewHandler := handler.NewReviewHandler(reviewService)
	statsHandler := handler.NewStatsHandler(statsRepo, redisClient)
	incidentHandler := handler.NewIncidentHandler(incidentService)
	adminHandler := handler.NewAdminHandler(configRepo, txRepo, auditRepo, configService, kafkaProducer)
	analystHandler := handler.NewAnalystHandler(analystRepo, auditRepo, authService)
	
	// Phase 2 Handlers
	ruleHandler := handler.NewRuleHandler(ruleRepo, auditRepo)
	queueHandler := handler.NewQueueHandler(queueRepo, auditRepo)
	intHandler := handler.NewIntegrationHandler(intRepo, auditRepo)
	modelHandler := handler.NewModelHandler(modelRepo, auditRepo)
	retrainHandler := handler.NewRetrainHandler(retrainRepo, modelRepo, incidentRepo)

	resultsConsumer := kafka.NewResultsConsumer(cfg.KafkaBrokers, fraudService)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := resultsConsumer.Start(serverCtx); err != nil {
			log.Error().Err(err).Msg("results consumer exited")
		}
	}()

	dlqConsumer := kafka.NewDLQConsumer(cfg.KafkaBrokers, txRepo)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := dlqConsumer.Start(serverCtx); err != nil {
			log.Error().Err(err).Msg("dlq consumer exited")
		}
	}()

	log.Info().Msg("Aegis API Server dependencies initialized successfully.")

	// Set up Chi router
	r := chi.NewRouter()

	// Add CORS middleware
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSAllowedOrigins},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Bank-API-Key"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Add standard middleware and custom request logging middleware
	r.Use(middleware.Recoverer)
	r.Use(aegismw.RequestID)
	r.Use(aegismw.RequestLogger())

	// Expose Prometheus metrics on a separate port
	go func() {
		metricsMux := http.NewServeMux()
		metricsMux.Handle("/metrics", promhttp.Handler())
		metricsAddr := fmt.Sprintf(":%s", cfg.MetricsPort)
		log.Info().Str("addr", metricsAddr).Msg("Listening for metrics requests")
		if err := http.ListenAndServe(metricsAddr, metricsMux); err != nil {
			log.Error().Err(err).Msg("Metrics server failed")
		}
	}()

	// Health check endpoint
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// WebSocket Feed route
	r.Get("/ws/feed", wsHandler.ServeWS)

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
			r.Get("/admin/config", adminHandler.ListConfig)
			r.Patch("/admin/config/{key}", adminHandler.UpdateConfig)
			r.Get("/admin/dlq", adminHandler.ListDLQ)
			r.Post("/admin/dlq/{id}/requeue", adminHandler.RequeueDLQ)
			r.Get("/admin/audit", adminHandler.ListAuditLogs)
			r.Get("/admin/analysts", analystHandler.ListAnalysts)
			r.Post("/admin/analysts", analystHandler.CreateAnalyst)
			r.Patch("/admin/analysts/{id}", analystHandler.UpdateAnalyst)
			
			// Phase 2 Routes
			r.Get("/admin/rules", ruleHandler.List)
			r.Post("/admin/rules", ruleHandler.Create)
			r.Patch("/admin/rules/{id}/toggle", ruleHandler.ToggleActive)
			r.Delete("/admin/rules/{id}", ruleHandler.Delete)
			r.Post("/admin/rules/{id}/backtest", ruleHandler.Backtest)
			
			r.Get("/admin/queues", queueHandler.List)
			r.Post("/admin/queues", queueHandler.Create)
			r.Patch("/admin/queues/{id}", queueHandler.Update)
			r.Delete("/admin/queues/{id}", queueHandler.Delete)
			
			r.Get("/admin/api-keys", intHandler.ListAPIKeys)
			r.Post("/admin/api-keys", intHandler.CreateAPIKey)
			r.Delete("/admin/api-keys/{id}", intHandler.RevokeAPIKey)
			
			r.Get("/admin/webhooks", intHandler.ListWebhooks)
			r.Post("/admin/webhooks", intHandler.CreateWebhook)
			r.Patch("/admin/webhooks/{id}", intHandler.UpdateWebhook)
			r.Delete("/admin/webhooks/{id}", intHandler.DeleteWebhook)
			r.Get("/admin/webhooks/{id}/deliveries", intHandler.ListWebhookDeliveries)
			
			r.Get("/admin/models", modelHandler.List)
			r.Get("/admin/models/active/metrics", modelHandler.ActiveMetrics)
			r.Post("/admin/models/{id}/deploy", modelHandler.Deploy)
			r.Post("/admin/models/{id}/rollback", modelHandler.Rollback)
			
			r.Get("/admin/retrain-jobs", retrainHandler.List)
			r.Post("/admin/retrain-jobs", retrainHandler.Trigger)
			r.Get("/admin/ml-worker/status", retrainHandler.Status)
			
			// Phase 3 Route
			metricsAdminHandler := handler.NewMetricsHandler()
			r.Get("/admin/metrics", metricsAdminHandler.GetMetrics)
		})
		
		// API v1 routes (any authenticated role)
		r.Get("/api/v1/transactions", txHandler.List)
		r.Get("/api/v1/transactions/{id}", txHandler.GetByID)
		r.Post("/api/v1/transactions/{id}/review", reviewHandler.SubmitReview)
		r.Get("/api/v1/stats/summary", statsHandler.Summary)
		r.Get("/api/v1/stats/trends", statsHandler.Trends)
		r.Get("/api/v1/incidents", incidentHandler.GetActiveIncidents)
	})

	// Start server on configured API port
	serverAddr := fmt.Sprintf(":%s", cfg.APIPort)

	// Wrap chi router with otelhttp
	handler := otelhttp.NewHandler(r, cfg.OtelServiceNameAPI,
		otelhttp.WithTracerProvider(otel.GetTracerProvider()),
		otelhttp.WithPropagators(otel.GetTextMapPropagator()),
	)

	srv := &http.Server{Addr: serverAddr, Handler: handler}

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

	wg.Wait()

	log.Info().Msg("Server exiting")
}
