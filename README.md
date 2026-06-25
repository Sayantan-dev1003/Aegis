# Aegis — Real-Time Fraud Detection System

> **Production-grade event-driven fraud detection pipeline** built with Go + Python + Next.js. Every transaction flows through a durable Kafka pipeline, gets scored by an XGBoost ML model with SHAP explainability, and surfaces on a live analyst dashboard in real time via WebSocket — with end-to-end distributed tracing across all services.

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22-00ADD8?style=for-the-badge&logo=go&logoColor=white" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Apache_Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/XGBoost-ML-FF6600?style=for-the-badge" />
</p>

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Features](#3-features)
4. [Tech Stack](#4-tech-stack)
5. [System Architecture](#5-system-architecture)
6. [Folder Structure](#6-folder-structure)
7. [Environment Variables](#7-environment-variables)
8. [Database Schema](#8-database-schema)
9. [API Documentation](#9-api-documentation)
10. [Real-Time Events (WebSocket)](#10-real-time-events-websocket)
11. [System Design Deep-Dive](#11-system-design-deep-dive)
12. [Challenges & Solutions](#12-challenges--solutions)
13. [Architecture Decision Records (ADRs)](#13-architecture-decision-records-adrs)
14. [Observability](#14-observability)
15. [Bonus / Production Features](#15-bonus--production-features)
16. [Running Locally](#16-running-locally)

---

## 1. Problem Statement

Financial institutions process millions of transactions per second across card networks, UPI rails, and net-banking channels. Traditional fraud detection operates in one of two broken modes.

### Why Rule Engines Fail

- Produce enormous false-positive rates — legitimate customers get blocked at checkout.
- Cannot generalise to novel attack patterns not anticipated when rules were written.
- Maintained manually by risk teams; every new fraud vector requires a deployment.
- Zero contextual awareness — a ₹50,000 purchase is normal for one customer, anomalous for another.

### Why Batch ML Fails

- Fraud is detected hours or days after the transaction — the money is already gone.
- Cannot trigger real-time auto-blocking or analyst alerts.
- Stale predictions on fresh attack campaigns that evolved after the last training run.

### The Real Engineering Problem

> Detect anomalous transaction sequences in **real-time (sub-100ms end-to-end)**, with calibrated confidence scores and per-prediction explainability, while maintaining a false-positive rate low enough that legitimate customers are not disrupted — all in a system that survives service failures **without losing a single event**.

---

## 2. Solution Overview

An event-driven, three-service architecture where every transaction flows through a durable Kafka pipeline, gets scored by a machine-learning worker, and surfaces on an analyst dashboard in real time via WebSocket — with end-to-end distributed tracing propagated through Kafka message headers so any latency bottleneck is immediately observable.

| Service | Role |
|---|---|
| **Go API Server** | Receives transaction events via REST (ingestor endpoint), writes to PostgreSQL + outbox table atomically, publishes to Kafka via the Outbox Pattern. Also serves the analyst REST API and WebSocket hub. |
| **Python ML Worker** | Consumes from `transactions.raw`, engineers features, runs XGBoost inference, computes SHAP values, publishes scored result to `transactions.scored`. |
| **Next.js Dashboard** | Analyst-facing UI. Connects via WebSocket for live flagged transaction feed, displays SHAP feature-weight charts, supports manual review actions with RBAC. |

**Key design guarantee:** The ingestor endpoint always responds in under **5ms** — it never blocks on ML inference. The scored result arrives asynchronously via the Kafka pipeline and is pushed to connected analysts via WebSocket. The Outbox Pattern ensures **zero event loss** even if the API server crashes immediately after writing to the database.

---

## 3. Features

### Core Features

| Feature | Description |
|---|---|
| Transaction ingestion | REST webhook endpoint simulating bank core system pushing events |
| Real-time fraud scoring | XGBoost classifier with engineered velocity and behavioural features |
| Outbox Pattern | Transactional guarantee: transaction write + Kafka publish are atomic via DB outbox |
| SHAP explainability | Every flagged transaction shows per-feature contribution weights to analyst |
| Auto-block threshold | Transactions scoring above `0.92` are auto-blocked without analyst review |
| Live analyst dashboard | WebSocket feed of flagged transactions updates in real time |
| Manual review actions | Analyst marks `confirmed_fraud`, `false_positive`, or `escalated` |
| Model versioning | Each `fraud_result` stores the model version that scored it; enables A/B testing |
| Confidence display | Fraud score shown as probability `0.00–1.00`, not binary |

### Operational / Bonus Features

| Feature | Description |
|---|---|
| Runtime-configurable thresholds | `fraud_threshold` and `auto_block_threshold` stored in DB + Redis cache; admin can update without redeployment |
| OpenTelemetry distributed tracing | `trace_id` propagated through Kafka headers across Go and Python services; visualised in Jaeger |
| Prometheus + Grafana | Metrics: `transactions_ingested_total`, `fraud_score_histogram`, `ml_inference_duration_seconds`, `kafka_consumer_lag`, `websocket_connections_active` |
| Dead Letter Queue (DLQ) | Failed ML scoring after 3 retries publishes to `transactions.dlq`; DLQ viewer in admin dashboard |
| Redis token-bucket rate limiting | Per-API-key rate limiter on the ingestor; returns `429` with `Retry-After` header |
| Structured JSON logging | zerolog in Go, structlog in Python; every log carries `trace_id`, `transaction_id`, `service`, `level` |
| API versioning | All routes under `/api/v1/`; graceful shutdown handles SIGTERM with 30s drain window |
| Fraud spike alerting | If fraud rate exceeds 5% in 15-min rolling window, all connected analysts receive a WebSocket alert |
| Audit log | Every analyst action recorded with timestamp, analyst ID, IP address |
| Historical trend charts | Fraud rate over time, false-positive rate, top flagged merchant categories |

---

## 4. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **API Server** | Go 1.22 | chi router, pgx/v5, go-redis/v9, confluent-kafka-go, golang-jwt, zerolog, prometheus/client_golang, go.opentelemetry.io/otel |
| **ML Worker** | Python 3.11 | FastAPI (health endpoint), scikit-learn Pipeline, XGBoost, SHAP (TreeExplainer), joblib, confluent-kafka-python, structlog, opentelemetry-sdk |
| **Frontend** | Next.js 14 (TypeScript) | App Router, Tailwind CSS, shadcn/ui, React Query, Recharts, native WebSocket |
| **Message Broker** | Apache Kafka | Topics: `transactions.raw`, `transactions.scored`, `transactions.dlq`. Consumer groups for horizontal ML worker scaling |
| **Primary DB** | PostgreSQL 15 | Transactions, fraud results, analyst actions, outbox events, audit logs, model versions, system config |
| **Cache / Ephemeral** | Redis 7 | Rate limiting (token bucket), session store, account velocity counters (sorted sets), runtime config cache |
| **Tracing** | OpenTelemetry + Jaeger | Distributed tracing across Go + Python; trace context propagated via Kafka message headers |
| **Metrics** | Prometheus + Grafana | Metrics scraping and visualisation; pre-built Grafana dashboard JSON in repo |
| **Containerisation** | Docker + Docker Compose | Full local stack: postgres, redis, zookeeper, kafka, kafka-ui, jaeger, prometheus, grafana, api-server, ml-worker, dashboard |
| **Dev Tools** | Kafka UI (Provectus) | Visual topic browser and consumer lag monitor for demo |

---

## 5. System Architecture

```
Bank System (mock)
       |
       | POST /api/v1/ingest/transactions
       v
+-----------------------+   DB Transaction   +------------------+
|    Go API Server      |-------------------->|   PostgreSQL     |
|       (:8080)         |  (tx + outbox row) |                  |
|                       |                    +------------------+
|  [Ingestor Handler]   |
|  [Outbox Poller]   ---+---> PRODUCE -------> Kafka: transactions.raw
|  [Results Consumer] <-+---- CONSUME <------- Kafka: transactions.scored
|  [DLQ Consumer]    <--+---- CONSUME <------- Kafka: transactions.dlq
|  [WebSocket Hub]      |
|  [REST API Handlers]  |
+-----------------------+
        |                          ML Worker (Python)
        |  Redis                   CONSUME: transactions.raw
        |  (rate limit,            -> feature engineering
        |   velocity counters,     -> XGBoost inference
        |   config cache)          -> SHAP values
        |                          PRODUCE: transactions.scored
        v                          (or transactions.dlq on failure)
+------------------+
|  Next.js         |<---WebSocket--- (real-time events)
|  Dashboard       |
|    (:3000)       |
+------------------+

Observability Plane:
Go + Python --> OpenTelemetry SDK --> Jaeger    (traces)
Go + Python --> Prometheus /metrics --> Grafana (dashboards)
All logs    --> stdout JSON (zerolog / structlog)
```

### Key Architectural Decisions

**Single Go binary (not microservices)**
All Go logic — ingestion, result consumption, REST API, WebSocket — lives in one binary with clean internal package boundaries. The ML worker boundary is the only justified service split (different language runtime, different scaling profile, different failure mode). Splitting Go further would add inter-service HTTP calls and distributed transaction complexity for zero benefit at this scale.

**Outbox Pattern over dual-write**
Writing to Postgres AND publishing to Kafka in two separate operations risks losing the Kafka message on a crash. The Outbox Pattern writes both in one DB transaction; a background goroutine polls and publishes, making the pipeline crash-safe.

**Kafka over Redis Streams**
Kafka provides a durable, partitioned, replayable log with consumer group management and lag monitoring. Redis Streams gives 90% of this with zero operational overhead — but Kafka is the correct system design answer for high-throughput event pipelines and is what MAANG system design rounds probe.

**Async scoring (202 Accepted)**
The ingestor endpoint never waits for ML inference. It acknowledges in under 5ms. Results arrive asynchronously, fully decoupling ingestor latency from ML worker latency.

**OTel trace propagation via Kafka headers**
`trace_id` flows from HTTP ingestion through the Kafka message header into the ML worker and back, enabling a single Jaeger trace view for the full transaction lifecycle.

---

## 6. Folder Structure

```
fraud-detection/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── README.md                        # Architecture Decision Records (ADRs)
├── Makefile                         # make dev, make test, make migrate
│
├── services/
│   ├── api-server/                  # Go service
│   │   ├── cmd/
│   │   │   └── server/
│   │   │       └── main.go          # wires deps, starts HTTP + graceful shutdown
│   │   └── internal/
│   │       ├── config/
│   │       │   └── config.go        # loads .env, validates required vars
│   │       ├── database/
│   │       │   ├── postgres.go      # pgx pool setup
│   │       │   └── redis.go         # go-redis client setup
│   │       ├── middleware/
│   │       │   ├── auth.go          # JWT parse + inject analyst into context
│   │       │   ├── rbac.go          # role check: viewer / reviewer / admin
│   │       │   ├── ratelimit.go     # Redis token bucket per API key
│   │       │   ├── requestid.go     # inject X-Request-ID + trace_id
│   │       │   └── logging.go       # zerolog request logger
│   │       ├── handler/
│   │       │   ├── ingest.go        # POST /api/v1/ingest/transactions
│   │       │   ├── auth.go          # POST /auth/login, /refresh, /logout
│   │       │   ├── transactions.go  # GET /transactions, /:id
│   │       │   ├── reviews.go       # POST /transactions/:id/review
│   │       │   ├── stats.go         # GET /stats/summary, /stats/trends
│   │       │   ├── config.go        # GET/PATCH /admin/config/:key
│   │       │   ├── dlq.go           # GET /admin/dlq, POST /admin/dlq/:id/requeue
│   │       │   └── websocket.go     # WS /ws/feed
│   │       ├── ws/
│   │       │   ├── hub.go           # connection registry + broadcast loop
│   │       │   └── client.go        # per-connection reader/writer goroutines
│   │       ├── outbox/
│   │       │   ├── writer.go        # writes outbox row inside DB transaction
│   │       │   └── poller.go        # goroutine: polls outbox -> publishes Kafka
│   │       ├── kafka/
│   │       │   ├── producer.go      # confluent-kafka-go producer wrapper
│   │       │   ├── results_consumer.go  # reads transactions.scored
│   │       │   └── dlq_consumer.go      # reads transactions.dlq
│   │       ├── repository/
│   │       │   ├── transaction.go
│   │       │   ├── fraud_result.go
│   │       │   ├── review.go
│   │       │   ├── outbox.go
│   │       │   ├── config.go
│   │       │   └── audit.go
│   │       ├── service/
│   │       │   ├── ingest.go        # orchestrates: write tx + outbox
│   │       │   ├── fraud.go         # handles scored result: write DB + broadcast
│   │       │   ├── review.go        # analyst review state transitions
│   │       │   ├── stats.go         # aggregation queries for dashboard
│   │       │   └── config.go        # runtime config: DB read + Redis cache
│   │       ├── model/
│   │       │   ├── transaction.go
│   │       │   ├── fraud_result.go
│   │       │   └── analyst.go
│   │       ├── metrics/
│   │       │   └── prometheus.go    # all metric definitions + registration
│   │       └── tracing/
│   │           └── otel.go          # tracer provider setup, Jaeger exporter
│   │   ├── Dockerfile
│   │   └── go.mod
│   │
│   ├── ml-worker/                   # Python service
│   │   ├── main.py                  # entry: starts consumer loop + health server
│   │   ├── consumer.py              # Kafka consumer group loop
│   │   ├── predictor.py             # loads model, runs inference + SHAP
│   │   ├── publisher.py             # produces to transactions.scored / .dlq
│   │   ├── features.py              # feature engineering pipeline
│   │   ├── tracing.py               # OTel setup, Kafka header propagation
│   │   ├── metrics.py               # prometheus_client HTTP exposition
│   │   ├── dlq.py                   # retry logic + DLQ publish on max retries
│   │   ├── health.py                # FastAPI app: GET /health
│   │   ├── model/
│   │   │   ├── train.py             # offline training script
│   │   │   ├── evaluate.py          # F1, precision, recall, threshold tuning
│   │   │   ├── fraud_model_v1.pkl   # serialised XGBoost pipeline
│   │   │   └── feature_config.json  # feature names, scaler params, threshold
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── dashboard/                   # Next.js 14
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── login/page.tsx
│       │   └── dashboard/
│       │       ├── layout.tsx           # sidebar + nav
│       │       ├── page.tsx             # overview stats
│       │       ├── feed/page.tsx        # live WebSocket feed
│       │       ├── transactions/
│       │       │   ├── page.tsx         # searchable table
│       │       │   └── [id]/page.tsx    # detail + SHAP chart + review form
│       │       ├── analytics/page.tsx   # trend charts
│       │       └── admin/
│       │           ├── dlq/page.tsx
│       │           └── config/page.tsx
│       ├── components/
│       │   ├── feed/
│       │   │   ├── LiveFeed.tsx         # WS consumer, renders FlaggedCard list
│       │   │   └── FlaggedCard.tsx
│       │   ├── transactions/
│       │   │   ├── TransactionTable.tsx
│       │   │   ├── TransactionFilters.tsx
│       │   │   └── ShapChart.tsx        # Recharts horizontal bar for feature weights
│       │   ├── analytics/
│       │   │   ├── FraudRateChart.tsx
│       │   │   └── CategoryBreakdown.tsx
│       │   └── ui/                      # shared primitives
│       ├── lib/
│       │   ├── api.ts                   # axios instance + interceptors
│       │   └── ws.ts                    # WebSocket singleton + reconnect logic
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   ├── useTransactions.ts
│       │   └── useStats.ts
│       ├── types/index.ts
│       └── package.json
│
├── migrations/
│   ├── 001_create_analysts.sql
│   ├── 002_create_transactions.sql
│   ├── 003_create_outbox_events.sql
│   ├── 004_create_fraud_results.sql
│   ├── 005_create_reviews.sql
│   ├── 006_create_audit_logs.sql
│   ├── 007_create_model_versions.sql
│   └── 008_create_system_config.sql
│
├── infra/
│   ├── prometheus.yml               # scrape config
│   ├── grafana/
│   │   └── dashboards/
│   │       └── fraud_detection.json # pre-built dashboard
│   └── jaeger/
│       └── jaeger-config.yml
│
└── scripts/
    ├── seed_analysts.sql
    ├── mock_transactions.py         # POST fake transactions at 10/sec
    └── attack_scenario.py           # 20 txns from same account in 2 min
```

---

## 7. Environment Variables

A single `.env` file at the project root, mounted into all services via Docker Compose. Copy `.env.example` and fill in the values before running.

```bash
cp .env.example .env
```

```dotenv
# ── PostgreSQL ─────────────────────────────────────────────
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=fraud_db
POSTGRES_USER=fraud_user
POSTGRES_PASSWORD=strongpassword123

# ── Redis ──────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Kafka ──────────────────────────────────────────────────
KAFKA_BROKERS=kafka:9092
KAFKA_TOPIC_RAW=transactions.raw
KAFKA_TOPIC_SCORED=transactions.scored
KAFKA_TOPIC_DLQ=transactions.dlq
KAFKA_CONSUMER_GROUP=ml-workers
KAFKA_RESULTS_GROUP=api-results-consumer

# ── API Server ─────────────────────────────────────────────
API_PORT=8080
BANK_API_KEY=bank-secret-key-abc123
INGESTOR_RATE_LIMIT_RPS=1000
JWT_SECRET=your-256-bit-secret-here
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
CORS_ALLOWED_ORIGINS=http://localhost:3000

# ── ML Worker ──────────────────────────────────────────────
MODEL_PATH=/app/model/fraud_model_v1.pkl
FEATURE_CONFIG_PATH=/app/model/feature_config.json
SHAP_MAX_FEATURES=8
ML_MAX_RETRIES=3

# ── Observability ──────────────────────────────────────────
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317
OTEL_SERVICE_NAME_API=fraud-api-server
OTEL_SERVICE_NAME_ML=fraud-ml-worker
PROMETHEUS_PORT=9090

# ── Runtime Config Defaults (seeded into system_config) ───
FRAUD_THRESHOLD=0.75
AUTO_BLOCK_THRESHOLD=0.92
FRAUD_SPIKE_ALERT_RATE=0.05

# ── Dashboard ──────────────────────────────────────────────
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws/feed
```

---

## 8. Database Schema

Eight tables with clear separation of concerns. All primary keys are `UUID` (`gen_random_uuid()`). Timestamps are `TIMESTAMPTZ`. `JSONB` is used for flexible feature weights.

### `analysts`

```sql
CREATE TABLE analysts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('viewer', 'reviewer', 'admin')),
    is_active     BOOLEAN DEFAULT true,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    last_login    TIMESTAMPTZ
);
```

### `transactions`

```sql
CREATE TABLE transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id       TEXT UNIQUE NOT NULL,  -- bank's own transaction ID
    account_id        TEXT NOT NULL,
    merchant_id       TEXT NOT NULL,
    merchant_name     TEXT NOT NULL,
    merchant_category TEXT NOT NULL,         -- MCC code label
    amount            NUMERIC(12,2) NOT NULL,
    currency          CHAR(3) NOT NULL DEFAULT 'INR',
    country_code      CHAR(2) NOT NULL,
    transaction_type  TEXT NOT NULL,         -- purchase / withdrawal / transfer
    channel           TEXT NOT NULL,         -- online / pos / atm
    device_id         TEXT,
    ip_address        INET,
    timestamp         TIMESTAMPTZ NOT NULL,  -- when bank says txn happened
    ingested_at       TIMESTAMPTZ DEFAULT NOW(),
    status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'scored', 'auto_blocked', 'reviewed', 'scoring_failed'))
);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_timestamp  ON transactions(timestamp DESC);
CREATE INDEX idx_transactions_status     ON transactions(status);
```

### `outbox_events`

```sql
-- Outbox Pattern: ensures Kafka publish is never lost on crash
CREATE TABLE outbox_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,       -- transaction_id
    event_type   TEXT NOT NULL,       -- transaction.created
    payload      JSONB NOT NULL,
    published    BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Partial index: only unpublished rows — keeps the poller scan O(1)
CREATE INDEX idx_outbox_unpublished
    ON outbox_events(published, created_at)
    WHERE published = false;
```

### `fraud_results`

```sql
CREATE TABLE fraud_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    fraud_score     NUMERIC(5,4) NOT NULL,   -- 0.0000 to 1.0000
    is_fraud        BOOLEAN NOT NULL,
    threshold_used  NUMERIC(5,4) NOT NULL,   -- active threshold at scoring time
    auto_blocked    BOOLEAN DEFAULT false,
    model_version   TEXT NOT NULL,           -- e.g. v1.2.0
    feature_weights JSONB NOT NULL,          -- SHAP values per feature
    inference_ms    INTEGER,                 -- ML latency tracking
    trace_id        TEXT,                    -- OTel trace for this transaction
    scored_at       TIMESTAMPTZ DEFAULT NOW()
);

-- One result per transaction (also enforces idempotent re-processing)
CREATE UNIQUE INDEX idx_fraud_results_tx ON fraud_results(transaction_id);
```

**Example `feature_weights` JSONB** — positive values push toward fraud, negative toward legitimate:

```json
{
  "amount_zscore":           0.42,
  "txn_velocity_1h":         0.31,
  "country_mismatch":        0.18,
  "hour_of_day_sin":        -0.09,
  "merchant_category_risk":  0.27,
  "device_seen_before":     -0.15,
  "amount_vs_avg_ratio":     0.38
}
```

### `reviews`

```sql
CREATE TABLE reviews (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id),
    analyst_id     UUID NOT NULL REFERENCES analysts(id),
    decision       TEXT NOT NULL
        CHECK (decision IN ('confirmed_fraud', 'false_positive', 'escalated')),
    notes          TEXT,
    reviewed_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_reviews_transaction ON reviews(transaction_id);
```

### `model_versions`

```sql
CREATE TABLE model_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version      TEXT UNIQUE NOT NULL,  -- v1.0.0, v1.1.0
    artifact_path TEXT NOT NULL,
    f1_score     NUMERIC(5,4),
    precision    NUMERIC(5,4),
    recall       NUMERIC(5,4),
    is_active    BOOLEAN DEFAULT false,
    trained_at   TIMESTAMPTZ NOT NULL,
    deployed_at  TIMESTAMPTZ
);
```

### `system_config`

```sql
CREATE TABLE system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES analysts(id),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed:
INSERT INTO system_config VALUES
    ('fraud_threshold',       '0.75', 'Min score to flag as fraud',          null, NOW()),
    ('auto_block_threshold',  '0.92', 'Score for immediate auto-block',      null, NOW()),
    ('fraud_spike_alert_rate','0.05', 'Rate to trigger spike alert',         null, NOW());
```

### `audit_logs`

```sql
CREATE TABLE audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analyst_id UUID REFERENCES analysts(id),
    action     TEXT NOT NULL,   -- LOGIN, REVIEW_SUBMIT, CONFIG_UPDATE
    resource   TEXT,            -- transaction_id or config key
    metadata   JSONB DEFAULT '{}',
    ip_address INET,
    trace_id   TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_analyst ON audit_logs(analyst_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

---

## 9. API Documentation

**Base URL:** `/api/v1`

All endpoints except `/auth/*` require `Authorization: Bearer <access_token>`. The ingest endpoint uses `X-Bank-API-Key` header (separate from analyst JWT).

---

### Auth Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Body: `{ email, password }`. Returns `{ access_token, refresh_token, expires_in, analyst }` |
| `POST` | `/auth/refresh` | Body: `{ refresh_token }`. Returns `{ access_token, expires_in }` |
| `POST` | `/auth/logout` | Invalidates refresh token in Redis. Returns `204` |

---

### Ingest Endpoint *(Bank-Facing)*

**Header:** `X-Bank-API-Key` — Rate limited: token bucket per API key via Redis.

**`POST /api/v1/ingest/transactions`**

**Request:**
```json
{
  "external_id":        "TXN-2025-ABC123",
  "account_id":         "ACC-98765",
  "merchant_id":        "MER-001",
  "merchant_name":      "Amazon India",
  "merchant_category":  "E-Commerce",
  "amount":             45999.00,
  "currency":           "INR",
  "country_code":       "IN",
  "transaction_type":   "purchase",
  "channel":            "online",
  "device_id":          "DEV-iPhone14-XYZ",
  "ip_address":         "103.21.58.44",
  "timestamp":          "2025-03-27T14:32:00Z"
}
```

**Response `202 Accepted`:**
```json
{
  "status":         "queued",
  "transaction_id": "uuid-here",
  "trace_id":       "abc123def456",
  "message":        "Transaction accepted for async fraud scoring"
}
```

**Response `429 Too Many Requests`:**
```json
{ "error": "rate limit exceeded", "retry_after_seconds": 12 }
```

---

### Transaction Endpoints *(Analyst-Facing)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/transactions` | Query: `page`, `limit`, `status`, `from_date`, `to_date`, `min_score`, `merchant_category`, `is_fraud`. Cursor-based pagination. Returns `{ data: [...], pagination: { next_cursor, limit, total } }` |
| `GET` | `/transactions/:id` | Full transaction + fraud_result (with SHAP feature weights) + review (if exists) + `trace_id` for Jaeger link |
| `POST` | `/transactions/:id/review` | **Role: reviewer or admin.** Body: `{ decision: confirmed_fraud \| false_positive \| escalated, notes? }` |

---

### Stats Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats/summary` | Returns `{ total_transactions_today, flagged_today, auto_blocked_today, false_positive_rate_7d, avg_fraud_score_flagged, pending_review_count, kafka_consumer_lag }` |
| `GET` | `/stats/trends` | Query: `period` (7d/30d/90d), `granularity` (hour/day). Returns array of `{ timestamp, total, flagged, confirmed_fraud, false_positive }` |

---

### Config Endpoints *(Admin Only)*

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/config` | Returns all `system_config` rows |
| `PATCH` | `/admin/config/:key` | Body: `{ value: '0.80' }`. Writes to DB, invalidates Redis cache key, writes audit log |
| `GET` | `/admin/dlq` | Returns transactions in `transactions.dlq` topic. Query: `limit`, `offset` |
| `POST` | `/admin/dlq/:id/requeue` | Re-publishes a DLQ message to `transactions.raw` for re-scoring |

---

### WebSocket

```
GET /ws/feed?token=<access_token>
```

- Token is validated on connection upgrade.
- Server sends heartbeat `{ "event": "ping" }` every 25s; client must respond `{ "event": "pong" }` or connection closes after 60s.
- On reconnect, client should call `GET /stats/summary` to re-sync state.
- Slow-reader clients get a buffered channel (256 messages); if buffer fills, connection is dropped to protect the broadcast loop.

---

## 10. Real-Time Events (WebSocket)

All events are JSON objects. The hub broadcasts to all connected analysts regardless of role.

### `transaction.scored`

Emitted when the ML worker completes scoring and the result is written to DB.

```json
{
  "event": "transaction.scored",
  "data": {
    "transaction_id":    "uuid",
    "external_id":       "TXN-2025-ABC123",
    "account_id":        "ACC-98765",
    "merchant_name":     "Amazon India",
    "merchant_category": "E-Commerce",
    "amount":            45999.00,
    "currency":          "INR",
    "fraud_score":       0.923,
    "is_fraud":          true,
    "auto_blocked":      true,
    "top_features": [
      { "feature": "amount_zscore",    "weight": 0.42 },
      { "feature": "txn_velocity_1h",  "weight": 0.31 },
      { "feature": "country_mismatch", "weight": 0.18 }
    ],
    "trace_id":   "abc123def456",
    "scored_at":  "2025-03-27T14:32:01.823Z"
  }
}
```

### `alert.fraud_spike`

Emitted when fraud rate in the last 15 minutes exceeds the configured threshold.

```json
{
  "event": "alert.fraud_spike",
  "data": {
    "fraud_rate_15m": 0.087,
    "threshold":      0.05,
    "flagged_count":  34,
    "window_start":   "2025-03-27T14:15:00Z"
  }
}
```

### `transaction.reviewed`

Emitted when an analyst submits a review, so all other connected analysts see the update live.

```json
{
  "event": "transaction.reviewed",
  "data": {
    "transaction_id": "uuid",
    "decision":       "false_positive",
    "analyst_name":   "Priya Sharma",
    "reviewed_at":    "2025-03-27T14:38:00Z"
  }
}
```

### `transaction.dlq`

Emitted when the ML worker exhausts retries and sends a transaction to the DLQ.

```json
{
  "event": "transaction.dlq",
  "data": {
    "transaction_id": "uuid",
    "error":          "model inference timeout after 3 retries",
    "failed_at":      "2025-03-27T14:40:00Z"
  }
}
```

### `config.updated`

Emitted when an admin updates a runtime config value.

```json
{
  "event": "config.updated",
  "data": {
    "key":         "fraud_threshold",
    "old_value":   "0.75",
    "new_value":   "0.80",
    "updated_by":  "admin@bank.com"
  }
}
```

---

## 11. System Design Deep-Dive

### Kafka Topic Design

| Topic | Partitions | Producer | Consumer Group | Retention |
|---|---|---|---|---|
| `transactions.raw` | 3 (partitioned by `account_id` for per-account ordering) | Outbox poller | `ml-workers` | 7 days |
| `transactions.scored` | 3 | ML worker | `api-results-consumer` | 3 days |
| `transactions.dlq` | 1 | ML worker (on max retries) | `api-dlq-consumer` | 14 days |

### Outbox Pattern Flow

The Outbox Pattern solves the dual-write problem. Without it: if the API server writes to Postgres successfully but crashes before publishing to Kafka, the transaction is in the DB but never scored — silently lost from the pipeline.

```
Step 1: HTTP ingest handler begins a DB transaction.
Step 2: INSERT into transactions table.
Step 3: INSERT into outbox_events table (same transaction).
Step 4: COMMIT — both writes are atomic.
Step 5: Return 202 to caller immediately.

Background goroutine (outbox poller, runs every 500ms):
Step 6: SELECT id, payload FROM outbox_events
        WHERE published = false
        ORDER BY created_at LIMIT 100
        -- partial index makes this O(1)
Step 7: For each row: kafka.Produce(topic, payload)
Step 8: On Kafka ACK: UPDATE outbox_events
        SET published=true, published_at=NOW()
        WHERE id = ?

Idempotency on ML worker side:
  fraud_results has UNIQUE INDEX on transaction_id.
  Duplicate Kafka messages (at-least-once) result in a
  duplicate key error which the worker catches and ignores.
```

### Feature Engineering

The ML worker engineers 10 features from the raw transaction payload combined with Redis velocity counters. Velocity features are computed at inference time from Redis sorted sets — never from a slow PostgreSQL query in the hot path.

| Feature | Description | Source |
|---|---|---|
| `amount_zscore` | How many std-devs is this amount from the account's 30-day mean | Redis (account stats cache) |
| `txn_velocity_1h` | Transaction count from this `account_id` in past 1 hour | Redis `ZCOUNT` |
| `txn_velocity_24h` | Transaction count from this `account_id` in past 24 hours | Redis `ZCOUNT` |
| `country_mismatch` | Boolean: `country_code` ≠ account's home country | Redis (account profile) |
| `hour_of_day_sin` | Cyclical encoding of hour (sin component) | Transaction timestamp |
| `hour_of_day_cos` | Cyclical encoding of hour (cos component) | Transaction timestamp |
| `day_of_week_sin` | Cyclical encoding of weekday (sin component) | Transaction timestamp |
| `day_of_week_cos` | Cyclical encoding of weekday (cos component) | Transaction timestamp |
| `merchant_category_risk` | Precomputed risk score per MCC category from training data | In-memory lookup |
| `device_seen_before` | Boolean: has `device_id` appeared with this account before | Redis SET |
| `amount_vs_avg_ratio` | `amount / account 30-day average` — catches unusually large purchases | Redis (account stats cache) |

### Redis Data Structures for Velocity

```bash
# Ingestor writes on every transaction received:
ZADD acct:{account_id}:txns <unix_timestamp> <transaction_id>
EXPIRE acct:{account_id}:txns 172800   # 48-hour TTL

# ML Worker reads at inference time:
ZCOUNT acct:{account_id}:txns {now-3600}  {now}   # velocity_1h  — O(log N)
ZCOUNT acct:{account_id}:txns {now-86400} {now}   # velocity_24h — O(log N)

# Device seen before:
SADD     acct:{account_id}:devices {device_id}
SISMEMBER acct:{account_id}:devices {device_id}   # boolean check

# Runtime config cache (60s TTL, invalidated on admin update):
GET    config:fraud_threshold
DEL    config:{key}  # called by PATCH /admin/config/:key
```

### WebSocket Hub Architecture

Standard Go hub pattern with per-client buffered channels to prevent slow readers from blocking the broadcast loop.

```go
type Hub struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    mu         sync.RWMutex
}

type Client struct {
    conn      *websocket.Conn
    send      chan []byte  // buffered: 256
    analystID string
    role      string
}

// If client.send buffer is full (slow reader):
// Hub drops message + closes connection rather than blocking broadcast.
// Client reconnects and calls GET /stats/summary to re-sync.
```

### OTel Trace Propagation via Kafka

A single trace spans HTTP ingestion → Kafka → ML worker → result consumer → DB write. The `trace_id` is visible in Jaeger for any transaction, showing exact latency at each hop.

```go
// Go API Server (producer):
ctx, span := tracer.Start(ctx, "ingest.transaction")
propagator.Inject(ctx, KafkaHeaderCarrier(msg.Headers))
kafka.Produce(msg)
```

```python
# Python ML Worker (consumer):
ctx = propagator.extract(KafkaHeaderCarrier(msg.headers()))
with tracer.start_as_current_span("ml.score_transaction", context=ctx):
    score = predictor.predict(features)
    # This span is a CHILD of the original API server span
    # => single trace in Jaeger shows the full pipeline
```

---

## 12. Challenges & Solutions

### Challenge 1 — Feature computation requires recent transaction history

Features like `txn_velocity_1h` can't come from the transaction payload alone. A slow PostgreSQL query at inference time would destroy latency.

**Solution:** The ingestor maintains Redis sorted sets keyed by `account_id` (`ZADD` with Unix timestamp, 48h TTL). The ML worker does `ZCOUNT` to get velocity in O(log N) — sub-millisecond. No DB hit in the hot path.

---

### Challenge 2 — Outbox poller at-least-once Kafka delivery

If the server crashes after Kafka produce but before marking `published=true`, the message is re-sent on restart.

**Solution:** `fraud_results` has a `UNIQUE INDEX` on `transaction_id`. Duplicate inserts from re-processed Kafka messages are caught as constraint violations and silently skipped — idempotent by design.

---

### Challenge 3 — WebSocket slow-reader back-pressure

A naive WS hub blocks the broadcast goroutine if a client reads slowly, stalling all other clients.

**Solution:** Each client gets a buffered `send` channel (256 messages). If the buffer fills, the hub drops the message and closes that client's connection rather than blocking the broadcast loop. The client reconnects and re-syncs via `GET /stats/summary`.

---

### Challenge 4 — ML model class imbalance (3.5% fraud rate)

Training naively gives 96.5% accuracy with a useless model that predicts everything as legitimate.

**Solution:** XGBoost `scale_pos_weight = (negatives / positives)`. Threshold tuning on the validation set — the default 0.5 is wrong; the optimal threshold for F1 on this dataset is ~0.35–0.45. Target metric: **F1 on the fraud class, not accuracy**.

---

### Challenge 5 — SHAP computation latency

`TreeExplainer` SHAP for a single XGBoost sample takes 8–12ms. Re-instantiating the explainer per request would be catastrophic.

**Solution:** The SHAP explainer object is loaded **once** on worker startup alongside the model and reused for every inference call.

---

### Challenge 6 — Runtime config propagation

Fraud threshold updates need to reach all service instances without restart.

**Solution:** `system_config` table is the source of truth. Redis cache (60s TTL) sits in front. Admin `PATCH` invalidates the Redis key immediately (`DEL config:{key}`). Next inference request reads from DB and re-caches. Maximum 60s stale config window — acceptable for a risk threshold.

---

### Challenge 7 — Kafka consumer group rebalance during DLQ retry

Re-queuing a DLQ message to `transactions.raw` could cause it to be consumed by a different worker instance mid-rebalance and double-processed.

**Solution:** Idempotent processing via unique constraint on `fraud_results.transaction_id` ensures double-processing is a no-op. The re-queued message gets a new Kafka offset but the same `transaction_id`, so the DB insert is safely rejected.

---

## 13. Architecture Decision Records (ADRs)

### ADR-1: Kafka over Redis Streams

Kafka provides a durable partitioned log, consumer group management with lag monitoring, and replay capability. Redis Streams gives 90% of this with zero operational overhead.

**Decision:** Kafka, because this project specifically demonstrates event-driven architecture patterns that MAANG system design rounds probe.

**Trade-off:** Requires Zookeeper/KRaft; heavier Docker Compose setup.

**Interview answer:** *"In a startup context, Redis Streams is the correct operational choice. Kafka is correct here because it demonstrates exactly the infrastructure knowledge interviewers probe: consumer group management, partition key design, consumer lag observability, and DLQ patterns."*

---

### ADR-2: Single Go binary over microservices

All Go logic (ingestion, result consumption, REST API, WebSocket) lives in one binary with clean internal package boundaries. The ML worker is the only justified service split — different language runtime, different scaling profile, different failure mode.

**Trade-off:** Cannot scale ingestion independently from the API.

**Interview answer:** *"Splitting Go into two services for ingestion vs API would be premature — it adds inter-service HTTP calls and distributed transaction complexity for zero benefit at this scale. The Python ML worker boundary is the one that's truly justified."*

---

### ADR-3: Async scoring over synchronous

The ingestor returns `202 Accepted` in <5ms. ML inference arrives asynchronously via Kafka.

**Trade-off:** The bank caller cannot get a synchronous fraud decision in the same API response.

**Interview answer:** *"Synchronous scoring (request-reply via Kafka or gRPC) would be needed if the bank required a real-time block decision before transaction settlement. For post-hoc flagging, async is correct — it fully decouples ingestor latency from ML worker latency and means a slow or restarting ML worker never causes bank-facing timeouts."*

---

### ADR-4: XGBoost over deep learning

XGBoost is more interpretable (SHAP works cleanly), trains in minutes on a laptop, achieves competitive F1 on tabular fraud data, and requires no GPU.

**Trade-off:** Less accurate on velocity-based attack patterns with long temporal dependencies vs. an LSTM or Transformer.

**Interview answer:** *"Production answer: XGBoost for analyst-facing explainability, with a sequence model running in parallel for high-confidence auto-block decisions. For this project, XGBoost is the right call."*

---

### ADR-5: PostgreSQL + JSONB over MongoDB

SHAP `feature_weights` are stored as JSONB — flexible, schema-free. But the rest of the schema is deeply relational (`fraud_results` reference `transactions`, `reviews` reference `analysts`). PostgreSQL JSONB gives relational integrity where needed and schema flexibility where not.

**Trade-off:** JSONB queries are less ergonomic than native MongoDB document queries.

---

### ADR-6: In-memory WS hub vs. Redis Pub/Sub

Current implementation: single API server instance, hub is in-memory. If two API server instances run, a connection on server A won't receive broadcasts from server B.

**Upgrade path:** Redis Pub/Sub as a broadcast layer between instances — each server subscribes to a channel and re-broadcasts to local clients. The code structure makes this upgrade straightforward.

**Interview answer:** *"This is the correct answer to 'how would you scale the WebSocket tier?' — replace the in-memory hub with a Redis Pub/Sub fan-out layer and scale the API server horizontally."*

---

## 14. Observability

The full observability stack is included in Docker Compose and requires zero manual setup.

### Prometheus Metrics

| Metric | Type | Description |
|---|---|---|
| `transactions_ingested_total` | Counter | Total transactions received by ingest endpoint |
| `fraud_score_histogram` | Histogram | Distribution of fraud scores (buckets: 0–0.3, 0.3–0.6, 0.6–0.9, 0.9–1.0) |
| `ml_inference_duration_seconds` | Histogram | XGBoost inference latency per prediction |
| `kafka_consumer_lag` | Gauge | Current consumer lag on `transactions.raw` |
| `websocket_connections_active` | Gauge | Number of live WebSocket connections to the hub |
| `auto_blocked_total` | Counter | Transactions automatically blocked (score ≥ 0.92) |

### Jaeger Distributed Tracing

Every transaction produces a single trace spanning:
1. HTTP handler span (`ingest.transaction`) — Go
2. Kafka produce span
3. ML worker span (`ml.score_transaction`) — Python
4. DB write span (`fraud.save_result`) — Go

The `trace_id` is stored in `fraud_results` and surfaced as a clickable Jaeger link on the transaction detail page.

### Grafana Dashboard

A pre-built Grafana dashboard JSON is committed at `infra/grafana/dashboards/fraud_detection.json`. It includes panels for transaction throughput, fraud rate over time, ML inference p95, Kafka consumer lag, and WebSocket connection count.

### Structured Logging

All logs are JSON to stdout, compatible with any log aggregation platform (Loki, Datadog, CloudWatch).

```bash
# Filter logs for a specific transaction
docker compose logs -f api-server | jq 'select(.transaction_id=="<uuid>")'

# Filter only error logs
docker compose logs -f ml-worker | jq 'select(.level=="error")'
```

Every log line carries: `trace_id`, `transaction_id`, `service`, `level`, `timestamp`.

---

## 15. Bonus / Production Features

### Runtime-Configurable Thresholds

Fraud and auto-block thresholds live in `system_config` and are cached in Redis with a 60s TTL. An admin `PATCH /admin/config/:key` writes to DB, invalidates the Redis key, and emits a `config.updated` WebSocket event to all connected analysts. Zero restarts required.

**Interview answer:** *"How do you change ML thresholds without redeployment?"* → point to this pattern.

### Dead Letter Queue with Admin Requeue

When the ML worker fails inference after 3 retries with exponential backoff, the transaction is published to `transactions.dlq` with full error context. The admin dashboard shows all `scoring_failed` transactions, and `POST /admin/dlq/:id/requeue` re-publishes to `transactions.raw` for another attempt.

**Interview answer:** *"What happens when your ML service fails?"* → DLQ + requeue UI.

### Redis Token-Bucket Rate Limiter

Per-API-key token bucket on the ingest endpoint. The check-and-increment is performed as an atomic Lua script to prevent TOCTOU race conditions. Returns `429 Too Many Requests` with a `Retry-After` header.

**Interview answer:** *"How would you implement rate limiting?"* → point to this code.

### OpenTelemetry End-to-End Tracing

Trace context propagated via Kafka headers using the W3C TraceContext format. A single Jaeger trace shows the full pipeline for any transaction from HTTP ingestion to DB result write.

**Resume bullet:** *"Instrumented distributed traces across Go and Python services, propagated through Kafka headers, surfacing p95 inference latency in Jaeger."*

### Prometheus + Grafana

Pre-built Grafana dashboard committed to the repo. During demo: open Grafana alongside the app, show live metrics as `mock_transactions.py` runs at 10 transactions/second.

**Resume bullet:** *"Built observable system with Prometheus + Grafana tracking transaction throughput, ML inference p95, and Kafka consumer lag across services."*

### Fraud Spike Alerting

A background goroutine on the API server computes the fraud rate over a rolling 15-minute window. If it exceeds the configured `fraud_spike_alert_rate` (default 5%), an `alert.fraud_spike` WebSocket event is broadcast to all connected analysts immediately.

---

## 16. Running Locally

### Prerequisites

- Docker and Docker Compose v2
- Go 1.22 (for local development without Docker)
- Python 3.11 (for local development without Docker)
- Node.js 20+ (for local development without Docker)

### Quickstart (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/Sayantan-dev1003/Aegis
cd Aegis

# 2. Set up environment variables
cp .env.example .env
# Edit .env if needed — defaults work for local Docker Compose

# 3. Start the full stack
docker compose up -d

# 4. Run database migrations
make migrate

# 5. Seed analyst accounts
psql $DATABASE_URL -f scripts/seed_analysts.sql

# 6. Verify everything is running
docker compose ps
```

### Service URLs

| Service | URL |
|---|---|
| API Server | http://localhost:8080 |
| Next.js Dashboard | http://localhost:3000 |
| Kafka UI | http://localhost:8090 |
| Jaeger UI | http://localhost:16686 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

### Running the Demo

```bash
# Stream mock transactions at 10/sec
python scripts/mock_transactions.py

# Simulate an attack: 20 transactions from same account in 2 minutes
python scripts/attack_scenario.py
```

Watch the live feed in the dashboard at `http://localhost:3000/dashboard/feed`. Switch to Grafana at `http://localhost:3001` to see metrics update in real time. Click any flagged transaction to see the SHAP feature weights and the Jaeger trace link.

### Useful Make Targets

```bash
make dev       # Start all services in watch mode
make test      # Run Go unit tests + Python pytest
make migrate   # Run all pending DB migrations
make seed      # Seed analysts and system config
make logs      # Tail all service logs
make reset     # Tear down and wipe all volumes
```

---

<p align="center">
  Built by <strong>Sayantan Halder</strong> · B.Tech Computer Engineering, IITRAM Ahmedabad · Batch 2027<br/>
  <a href="https://github.com/sayantanhalder10">github.com/sayantanhalder10</a> · <a href="https://sayantan-dev-portfolio.vercel.app">sayantan-dev-portfolio.vercel.app</a>
</p>