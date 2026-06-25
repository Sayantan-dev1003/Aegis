package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// PostgreSQL
	PostgresHost     string
	PostgresPort     string
	PostgresDB       string
	PostgresUser     string
	PostgresPassword string

	// Redis
	RedisURL string

	// Kafka
	KafkaBrokers       string
	KafkaTopicRaw      string
	KafkaTopicScored   string
	KafkaTopicDLQ      string
	KafkaConsumerGroup string
	KafkaResultsGroup  string

	// API Server
	APIPort              string
	BankAPIKey           string
	IngestorRateLimitRPS int
	JWTSecret            string
	JWTAccessTTL         time.Duration
	JWTRefreshTTL        time.Duration
	CORSAllowedOrigins   string

	// Observability
	OtelExporterOTLPEndpoint string
	OtelServiceNameAPI       string
	// MetricsPort is the port this service exposes /metrics on for Prometheus to scrape.
	// This is NOT the Prometheus server's own port (9090) — that is a separate container.
	MetricsPort string

	// Runtime Config Defaults
	// These are the initial values seeded into the system_config DB table on first run.
	// At runtime, the service reads them from DB (with Redis cache). These env vars
	// allow overriding defaults without changing code.
	FraudThreshold       float64
	AutoBlockThreshold   float64
	FraudSpikeAlertRate  float64

	// Migrations
	MigrationsPath string
}

// Load loads config from environment variables and/or .env files.
// When running via Docker Compose, env vars are injected directly.
// When running locally (go run), it walks up from services/api to find the root .env.
func Load() *Config {
	_ = godotenv.Load()          // .env in current dir (services/api)
	_ = godotenv.Load("../../.env") // root .env (two levels up from services/api)

	cfg := &Config{
		PostgresHost:             getEnvRequired("POSTGRES_HOST"),
		PostgresPort:             getEnvRequired("POSTGRES_PORT"),
		PostgresDB:               getEnvRequired("POSTGRES_DB"),
		PostgresUser:             getEnvRequired("POSTGRES_USER"),
		PostgresPassword:         getEnvRequired("POSTGRES_PASSWORD"),
		RedisURL:                 getEnvRequired("REDIS_URL"),
		KafkaBrokers:             getEnvRequired("KAFKA_BROKERS"),
		KafkaTopicRaw:            getEnvRequired("KAFKA_TOPIC_RAW"),
		KafkaTopicScored:         getEnvRequired("KAFKA_TOPIC_SCORED"),
		KafkaTopicDLQ:            getEnvRequired("KAFKA_TOPIC_DLQ"),
		KafkaConsumerGroup:       getEnvRequired("KAFKA_CONSUMER_GROUP"),
		KafkaResultsGroup:        getEnvRequired("KAFKA_RESULTS_GROUP"),
		APIPort:                  getEnvRequired("API_PORT"),
		BankAPIKey:               getEnvRequired("BANK_API_KEY"),
		IngestorRateLimitRPS:     getEnvIntRequired("INGESTOR_RATE_LIMIT_RPS"),
		JWTSecret:                getEnvRequired("JWT_SECRET"),
		JWTAccessTTL:             getEnvDurationRequired("JWT_ACCESS_TTL"),
		JWTRefreshTTL:            getEnvDurationRequired("JWT_REFRESH_TTL"),
		CORSAllowedOrigins:       getEnvRequired("CORS_ALLOWED_ORIGINS"),
		OtelExporterOTLPEndpoint: getEnvRequired("OTEL_EXPORTER_OTLP_ENDPOINT"),
		OtelServiceNameAPI:       getEnvRequired("OTEL_SERVICE_NAME_API"),
		// The Go service exposes /metrics on a dedicated port so Prometheus can scrape it.
		// Defaults to 9091 to avoid conflicting with the Prometheus container (9090).
		MetricsPort:              getEnvDefault("METRICS_PORT", "9091"),
		FraudThreshold:           getEnvFloat64Default("FRAUD_THRESHOLD", 0.75),
		AutoBlockThreshold:       getEnvFloat64Default("AUTO_BLOCK_THRESHOLD", 0.92),
		FraudSpikeAlertRate:      getEnvFloat64Default("FRAUD_SPIKE_ALERT_RATE", 0.05),
		MigrationsPath:           getEnvDefault("MIGRATIONS_PATH", "../../migrations"),
	}

	return cfg
}

func getEnvRequired(key string) string {
	val, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(val) == "" {
		panic(fmt.Sprintf("FATAL: Required environment variable %s is missing", key))
	}
	return strings.TrimSpace(val)
}

// getEnvDefault returns the env var value or a fallback default if not set.
func getEnvDefault(key, defaultVal string) string {
	val, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(val) == "" {
		return defaultVal
	}
	return strings.TrimSpace(val)
}

func getEnvIntRequired(key string) int {
	valStr := getEnvRequired(key)
	val, err := strconv.Atoi(valStr)
	if err != nil {
		panic(fmt.Sprintf("FATAL: Environment variable %s must be a valid integer, got '%s'", key, valStr))
	}
	return val
}

func getEnvFloat64Default(key string, defaultVal float64) float64 {
	val, exists := os.LookupEnv(key)
	if !exists || strings.TrimSpace(val) == "" {
		return defaultVal
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(val), 64)
	if err != nil {
		panic(fmt.Sprintf("FATAL: Environment variable %s must be a valid float, got '%s'", key, val))
	}
	return f
}

func getEnvDurationRequired(key string) time.Duration {
	valStr := getEnvRequired(key)
	val, err := parseDuration(valStr)
	if err != nil {
		panic(fmt.Sprintf("FATAL: Environment variable %s must be a valid duration (e.g. 15m, 7d), got '%s': %v", key, valStr, err))
	}
	return val
}

func parseDuration(val string) (time.Duration, error) {
	val = strings.TrimSpace(val)
	if len(val) == 0 {
		return 0, fmt.Errorf("empty duration")
	}
	// Handle "d" suffix for days (not natively supported by time.ParseDuration)
	if val[len(val)-1] == 'd' {
		daysStr := val[:len(val)-1]
		days, err := strconv.Atoi(daysStr)
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(val)
}

