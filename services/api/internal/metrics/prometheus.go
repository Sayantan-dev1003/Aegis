package metrics

import (
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	once sync.Once

	TransactionsIngestedTotal  *prometheus.CounterVec
	FraudScoreHistogram        *prometheus.HistogramVec
	MLInferenceDuration        *prometheus.HistogramVec
	WebSocketConnectionsActive prometheus.Gauge
	AutoBlockedTotal           *prometheus.CounterVec
	KafkaMessagesConsumedTotal *prometheus.CounterVec
	KafkaPublishDuration       *prometheus.HistogramVec
	DBQueryDuration            *prometheus.HistogramVec
	RedisOperationDuration     *prometheus.HistogramVec
	HTTPRequestDuration        *prometheus.HistogramVec
	VelocityRecordTotal        *prometheus.CounterVec
	ConfigCacheHitTotal        *prometheus.CounterVec
	ReviewsSubmittedTotal      *prometheus.CounterVec
	DLQMessagesProcessedTotal  prometheus.Counter
	ResultsConsumedTotal       *prometheus.CounterVec

	WSMessagesBroadcastTotal        prometheus.Counter
	WSSlowClientDisconnectedTotal   prometheus.Counter
	WSBroadcastChannelFullTotal     prometheus.Counter
	WSUnexpectedDisconnectTotal     prometheus.Counter
	WSMessagesSentTotal             prometheus.Counter
	WSUpgradeFailedTotal            prometheus.Counter
	DuplicateFraudResultTotal       prometheus.Counter
	ConfigDbReadTotal               *prometheus.CounterVec
)

func Init(registry prometheus.Registerer) {
	once.Do(func() {
		if registry == nil {
			registry = prometheus.DefaultRegisterer
		}
		factory := promauto.With(registry)

		TransactionsIngestedTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "transactions_ingested_total",
				Help:      "Total number of transactions ingested via the API",
			},
			[]string{"status"},
		)

		FraudScoreHistogram = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "fraud_score",
				Help:      "Distribution of fraud scores from ML model",
				Buckets:   []float64{0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1.0},
			},
			[]string{"is_fraud"},
		)

		MLInferenceDuration = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "ml_inference_duration_seconds",
				Help:      "Time between transaction ingest and fraud score available in DB",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"model_version"},
		)

		WebSocketConnectionsActive = factory.NewGauge(
			prometheus.GaugeOpts{
				Namespace: "aegis",
				Name:      "websocket_connections_active",
				Help:      "Current number of active WebSocket connections",
			},
		)

		AutoBlockedTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "auto_blocked_total",
				Help:      "Total number of transactions automatically blocked",
			},
			[]string{"model_version"},
		)

		KafkaMessagesConsumedTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "kafka_messages_consumed_total",
				Help:      "Total Kafka messages consumed by consumer group",
			},
			[]string{"topic", "consumer_group", "status"},
		)

		KafkaPublishDuration = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "kafka_publish_duration_seconds",
				Help:      "Time to publish a message to Kafka",
				Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5},
			},
			[]string{"topic"},
		)

		DBQueryDuration = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "db_query_duration_seconds",
				Help:      "PostgreSQL query execution time",
				Buckets:   []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1.0},
			},
			[]string{"operation", "table"},
		)

		RedisOperationDuration = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "redis_operation_duration_seconds",
				Help:      "Redis command execution time",
				Buckets:   []float64{0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05},
			},
			[]string{"command"},
		)

		HTTPRequestDuration = factory.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: "aegis",
				Name:      "http_request_duration_seconds",
				Help:      "HTTP request latency by endpoint",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"method", "route", "status_code"},
		)

		VelocityRecordTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "velocity_record_total",
				Help:      "Velocity ZADD/SADD operations",
			},
			[]string{"operation", "status"},
		)

		ConfigCacheHitTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "config_cache_total",
				Help:      "Config Redis cache hits and misses",
			},
			[]string{"key", "result"},
		)

		ReviewsSubmittedTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "reviews_submitted_total",
				Help:      "Manual review decisions submitted",
			},
			[]string{"decision"},
		)

		DLQMessagesProcessedTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "dlq_messages_processed_total",
				Help:      "Total messages processed from DLQ topic",
			},
		)

		ResultsConsumedTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "results_consumed_total",
				Help:      "Total scored results consumed from transactions.scored",
			},
			[]string{"status"},
		)

		WSMessagesBroadcastTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_messages_broadcast_total",
				Help:      "Total number of WebSocket messages broadcasted",
			},
		)

		WSSlowClientDisconnectedTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_slow_client_disconnected_total",
				Help:      "Total number of slow clients evicted",
			},
		)

		WSBroadcastChannelFullTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_broadcast_channel_full_total",
				Help:      "Total number of times the broadcast channel was full",
			},
		)

		WSUnexpectedDisconnectTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_unexpected_disconnect_total",
				Help:      "Total number of unexpected WebSocket disconnects",
			},
		)

		WSMessagesSentTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_messages_sent_total",
				Help:      "Total number of WebSocket messages sent to clients",
			},
		)

		WSUpgradeFailedTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "ws_upgrade_failed_total",
				Help:      "Total number of failed WebSocket upgrades",
			},
		)

		DuplicateFraudResultTotal = factory.NewCounter(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "fraud_result_duplicate_total",
				Help:      "Total number of duplicate fraud results ignored idempotently",
			},
		)

		ConfigDbReadTotal = factory.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: "aegis",
				Name:      "config_db_read_total",
				Help:      "Total number of config DB reads",
			},
			[]string{"key", "status"},
		)
	})
}
