# Aegis Admin Panel — Make All Data Dynamic (Implementation Prompt)

## Role & Objective

You are working on **Aegis**, a fraud detection platform with three services:
- `services/api` — Go backend (chi router, pgx/Postgres, Kafka, Redis, OTel)
- `services/dashboard` — Next.js admin/reviewer/viewer frontend
- `services/ml-worker` — Python fraud-scoring worker (Kafka consumer, XGBoost, SHAP)

The admin panel (`/admin/*` routes in the dashboard) currently renders **static/mock data** on 7 of 8 pages. Only `admin/config` is wired to a real API. Your job is to make **every admin page fully dynamic**, backed by real database state, with no hardcoded arrays, no `Math.random()` simulation, and no fake "Live Data Connected" indicators that aren't actually live.

Work through the phases below **in order** — later phases depend on earlier ones. Do not skip Phase 0.

---

## Ground Truth (verified against the repo — do not re-litigate this)

**Real and working today:**
- Routes: `/auth/login|refresh|logout|me|admin`, `/api/v1/ingest/transactions`, `/api/v1/transactions`, `/api/v1/transactions/{id}`, `/api/v1/transactions/{id}/review`, `/api/v1/stats/summary`, `/api/v1/stats/trends`, `/admin/config` (GET/PATCH), `/admin/dlq` (GET), `/admin/dlq/{id}/requeue` (POST).
- `AuditRepository.Create` is called from `UpdateConfig` and `RequeueDLQ` in `services/api/internal/handler/admin_api.go` — writes work, there is just no read endpoint yet.
- `analysts` table is real, seeded with 3 rows (admin/reviewer/viewer). This is the actual user table — the "Alice/Bob/Charlie/Diana" users shown in User Management do not exist in the DB and must be removed.
- The async pipeline (outbox poller → Kafka → ML worker → `transactions.scored` topic → `results_consumer.go`) exists in code but has not been run against the seeded `transactions`/`outbox_events` data, so `fraud_results` and `reviews` are empty.
- Observability infra exists: `infra/prometheus.yml`, Grafana dashboard JSON (`infra/grafana/dashboards/fraud_detection.json`), OTel tracing in both Go and Python. Nothing currently reads from this for the dashboard.

**Confirmed missing — no table, no handler, no route (checked all 12 migrations; only 8 tables exist: `analysts`, `transactions`, `outbox_events`, `fraud_results`, `reviews`, `audit_logs`, `model_versions`, `system_config`):**
- Rules & Velocity — no `rules` table, no `velocity_config`.
- Queue Config — no `queues` table.
- Integrations — no `api_keys` table, no `webhooks` table.
- Model Management — `model_versions` table exists but is empty; no CRUD/deploy/rollback handler; the `/admin/model-manage` page currently 404s.

**Frontend files confirmed to be 100% mock (grep for `fetchApi` returned nothing in these):**
`services/dashboard/src/app/(dashboard)/admin/health/page.tsx`, `rules/page.tsx`, `queue/page.tsx`, `users/page.tsx`, `audit/page.tsx`, `integrations/page.tsx`, `model-manage/page.tsx`.

`health/page.tsx` in particular has a block literally commented `// --- Mock Data ---` with a `setInterval` that fakes live updates using `Math.random()`. Delete this entirely.

The working reference pattern to copy everywhere is `admin/config/page.tsx` (frontend) + `ListConfig`/`UpdateConfig` (backend, `admin_api.go`) + `ConfigRepository`.

---

## Phase 0 — Get the pipeline actually producing data

Nothing downstream can be considered "real" until this is done, since several new endpoints will read from `fraud_results` / `reviews`.

1. Deploy/run the ML worker (`services/ml-worker`) and confirm it's consuming from the raw transactions topic and publishing to `transactions.scored`.
2. Confirm `results_consumer.go` (`services/api/internal/kafka/results_consumer.go`) is running as part of the API service and successfully:
   - Inserts a row into `fraud_results` for every scored transaction.
   - Updates `transactions.status` (pending → approved/flagged/blocked) based on `system_config` thresholds (`fraud_threshold`, `review_threshold`, `auto_block_threshold`).
   - Inserts a row into `reviews` when the score falls in the manual-review band.
3. Re-run against the existing 51 seeded transactions (or reset and re-seed via `scripts/mock_transactions.py`) and verify in pgAdmin that `fraud_results` and `reviews` are no longer empty.
4. Remove the stray test row (`external_id = 'ext-12345'`, `account_id = 'acc-999'`, merchant "Test Merchant", dated 2023-10-01) from `transactions` — it's leftover seed/manual test data and will pollute every admin view's counts.

**Acceptance:** querying `fraud_results` and `reviews` in pgAdmin returns rows that correspond 1:1 with scored transactions; `transactions.status` is no longer stuck at `pending` for everything.

---

## Phase 1 — Backend: expose data that's already being written

### 1.1 Audit Log — read endpoint
- Add `AuditRepository.List(ctx, filters, limit, cursor)` in `services/api/internal/repository/audit.go`. Support filtering by `actor_id`, `action`, `resource_type`, and a date range (matches the UI's two "All" dropdowns + date picker).
- Add `AdminHandler.ListAuditLogs` in `admin_api.go`, following the same shape as `ListDLQ` (pagination via limit/cursor).
- Register `GET /admin/audit` in `cmd/server/main.go` inside the existing admin-protected route group (same middleware chain as `/admin/config`, `/admin/dlq`).
- Add a `model.AuditLog` JSON-safe response type if the existing one doesn't serialize cleanly (check `old_value`/`new_value` nullability).

### 1.2 User Management — real analysts CRUD
- Extend `services/api/internal/repository/analyst.go` with:
  - `List(ctx) ([]Analyst, error)` — do not return `password_hash` in any response.
  - `UpdateRole(ctx, id, role) error`
  - `SetActive(ctx, id, isActive bool) error`
- Add a new handler (e.g. `services/api/internal/handler/analyst_api.go`) with `ListAnalysts`, `UpdateAnalyst` (role + active status). On every mutation, write an audit log entry the same way `UpdateConfig` does (`action: "analyst.updated"`, old/new value = role or status).
- Register `GET /admin/analysts` and `PATCH /admin/analysts/{id}` in `main.go`.
- Note: the current `analysts` table/model does not have a "queues" or "permissions" concept beyond `role` (admin/reviewer/viewer). Either:
  (a) keep the Permission Matrix as static app-level config (it's role → capability, not user-specific, so this is acceptable to hardcode), or
  (b) if per-user queue assignment is required, this needs the `queues` table from Phase 2 first plus a join table — flag this as a follow-up, do not block Phase 1 on it.

**Acceptance:** `/admin/audit` returns real rows after Phase 0 audit-worthy actions occur; `/admin/analysts` returns exactly the 3 seeded rows (or however many exist) with no password data, and editing a role/status persists and shows up in the audit log.

---

## Phase 2 — Backend: build the missing tables + endpoints

Follow the existing migration numbering convention (`NNNNNN_description.up.sql` / `.down.sql` in `migrations/`, starting at `000013`).

### 2.1 Rules & Velocity
- New migration: `rules` table — columns roughly: `id UUID PK`, `name TEXT`, `entity TEXT` (card/user/ip/device), `metric TEXT` (velocity/amount/etc.), `operator TEXT`, `value NUMERIC`, `window TEXT`, `action TEXT` (block/step_up/flag), `is_active BOOLEAN`, `created_at`, `updated_at`.
- New migration: `velocity_config` table (or a JSONB column) storing the per-entity window chips (Card/User/IP/Device Velocity → list of windows like `1h`, `24h`, `7d`).
- New repository `repository/rule.go` with `List`, `Create`, `Update`, `Delete`, `ToggleActive`.
- New handler `handler/rule_api.go`: `GET /admin/rules`, `POST /admin/rules`, `PATCH /admin/rules/{id}`, `DELETE /admin/rules/{id}`, `PATCH /admin/rules/{id}/toggle`.
- Trigger count and precision % shown in the UI must be computed, not stored — derive `triggers_24h` and `precision` by joining `rules` against `fraud_results`/`reviews` for the last 24h (or store denormalized counters updated by the scoring pipeline — your call, but do not hardcode).
- Backtest Sandbox: add `POST /admin/rules/{id}/backtest` that runs the rule's condition against historical `transactions` + `fraud_results` for the selected date range and returns match count / precision. If this is too large a scope for now, explicitly mark it as a stubbed/future endpoint rather than leaving the frontend button dead with no backend at all.

### 2.2 Queue Config
- New migration: `queues` table — `id UUID PK`, `name TEXT`, `description TEXT`, `status TEXT` (active/paused), `sla_target_minutes INT`, `assignment_rule TEXT`, `coverage_start TIME`, `coverage_end TIME`, `timezone TEXT`, `created_at`, `updated_at`.
- `reviews` needs a `queue_id` FK (add via migration) so open-case counts and breach rate can be computed live: `open_cases = COUNT(reviews WHERE queue_id = X AND status = 'pending')`, `breach_rate = ` cases where time-in-queue exceeded `sla_target_minutes`.
- New repository `repository/queue.go`, new handler `handler/queue_api.go`: `GET /admin/queues`, `POST /admin/queues`, `PATCH /admin/queues/{id}`, `DELETE /admin/queues/{id}`.
- Update the review-assignment logic (wherever `reviews` rows get created — likely in `service/review.go` or the results consumer) to actually assign a `queue_id` based on the routing rules described in the UI (Tier 1 Review, Escalations, Account Takeover, VIP Support), instead of leaving it unset.

### 2.3 Integrations (API Keys + Webhooks)
- New migration: `api_keys` table — `id`, `name`, `key_hash` (store hashed, never plaintext), `key_prefix` (for display, e.g. `sk_live_****1a9b`), `scopes TEXT[]`, `created_at`, `last_used_at`, `revoked_at`.
- New migration: `webhooks` table — `id`, `url`, `subscribed_events TEXT[]`, `status TEXT`, `secret_hash`, `created_at`; plus `webhook_deliveries` table for the "View Deliveries" drill-down (`webhook_id`, `event_type`, `status_code`, `success BOOLEAN`, `delivered_at`, `response_body` truncated).
- New handlers: `POST /admin/api-keys` (generate, return plaintext once), `DELETE /admin/api-keys/{id}` (revoke); `POST /admin/webhooks`, `PATCH/DELETE /admin/webhooks/{id}`, `GET /admin/webhooks/{id}/deliveries`.
- Success rate (`99.8%`, `45.2%` in the screenshot) must be computed from `webhook_deliveries`, not hardcoded.
- If actual webhook dispatch (firing HTTP calls on `case.created`, `rule.breached`, etc.) is out of scope for this pass, still build the CRUD + schema so the UI is honest about what's configured, and clearly flag dispatch itself as a separate follow-up task.

### 2.4 Model Management
- Use the existing `model_versions` table — no new migration needed unless columns are missing for what the UI needs (check for `is_active`, `f1_score`, `precision`, `recall`, `trained_at`, `deployed_at`, `artifact_path` — these already exist per the schema you inspected).
- New handler `handler/model_api.go`: `GET /admin/models` (list all versions), `POST /admin/models/{id}/deploy` (sets `is_active = true` on target, `false` on the currently active one, in a transaction), `POST /admin/models/{id}/rollback` (same mechanism, pointed at a prior version).
- Every deploy/rollback must write an audit log entry (`action: "model.deployed"` / `"model.rolled_back"`, old/new = version strings) — this is what makes the existing "Bob Smith rolled back scoring model v2.3 → v2.2" audit entry pattern actually real going forward.
- Insert at least one real row into `model_versions` (from an actual trained artifact, or from the ML worker's training pipeline output) so the page isn't empty on first load.
- Build the actual `/admin/model-manage` page route/component in the dashboard — right now it 404s because the page was never created, not just because it lacks data.

**Acceptance for Phase 2:** every "+ Create X" / "Save" / "Generate" / "Deploy" action in Rules, Queue Config, Integrations, and Model Management persists to Postgres, is visible on refresh, and produces a corresponding row in `audit_logs`.

---

## Phase 3 — Backend: real System Health metrics

1. Add an endpoint (e.g. `GET /admin/metrics`) that either:
   - Proxies/queries the existing Prometheus instance (`infra/prometheus.yml` already scrapes the services), or
   - Reads the same counters Prometheus scrapes directly from `services/api/internal/metrics/prometheus.go` and exposes a simplified JSON shape for the dashboard.
2. Metrics needed to replace the mock KPI cards and charts: Kafka consumer lag (per topic), API p50/p95/p99 latency, error rate, uptime, Redis hit rate/latency, WebSocket active connections/throughput.
3. Service status list (Go API / Python Scorer / Postgres / Redis / Kafka brokers) should reflect real health checks, not a hardcoded array with one service permanently stuck on `warning`.

**Acceptance:** refreshing the System Health page after generating real traffic shows numbers that actually move; killing a dependency (e.g. stopping Redis locally) changes its status badge.

---

## Phase 4 — Frontend: rewire every admin page

For each page below, remove all hardcoded `useState([...])` seed data and any `Math.random()`/`setInterval` simulation, and replace with `fetchApi` calls to the corresponding endpoint from Phases 1–3. Follow the exact pattern already used correctly in `admin/config/page.tsx`.

- `admin/health/page.tsx` → `GET /admin/metrics`, `GET /api/v1/stats/summary`, `GET /api/v1/stats/trends`. Delete the `// --- Mock Data ---` block and the fake live-update interval entirely.
- `admin/rules/page.tsx` → `GET/POST/PATCH/DELETE /admin/rules`, `POST /admin/rules/{id}/backtest`.
- `admin/queue/page.tsx` → `GET/POST/PATCH/DELETE /admin/queues`.
- `admin/users/page.tsx` → `GET/PATCH /admin/analysts`.
- `admin/audit/page.tsx` → `GET /admin/audit`, with working search/filter/date-range wired to real query params, not client-side filtering of a fake array.
- `admin/integrations/page.tsx` → `GET/POST/DELETE /admin/api-keys`, `GET/POST/PATCH/DELETE /admin/webhooks`, `GET /admin/webhooks/{id}/deliveries`.
- `admin/model-manage/page.tsx` → build the page (currently missing/404), wire to `GET /admin/models`, `POST /admin/models/{id}/deploy`, `POST /admin/models/{id}/rollback`.

Every mutating UI action (Save Rule, Create Queue, Deactivate User, Generate Key, Revoke, Deploy Model, etc.) must:
- Call the real endpoint.
- Show a loading/error state (don't assume success).
- Refetch or optimistically update the list on success.
- Rely on the backend's audit logging — don't duplicate audit writes on the frontend.

**Acceptance:** `grep -rn "useState(\[" services/dashboard/src/app/(dashboard)/admin` should no longer show any hardcoded seed arrays standing in for server data; every admin page should show a real loading state on first render before data arrives.

---

## Phase 5 — Cleanup & verification

1. Remove the `ext-12345`/`acc-999` test transaction if not already handled in Phase 0.
2. Do a final pass: for each of the 8 admin pages, refresh the browser and confirm every number displayed can be traced to a real Postgres row or a real Prometheus metric — no exceptions.
3. Confirm the "Live Data Connected" indicator in the sidebar is tied to an actual health check (e.g. a successful recent API call or WebSocket ping), not just always rendered green.
4. Re-verify timezone consistency: DB stores `timestamptz` (UTC); ensure all admin pages display times consistently (either all UTC or all converted to a chosen local zone), matching the timezone selector already present in Queue Config.
5. Update `Admin.md` / `UI.md` in the repo root to reflect the new endpoints and remove any documentation that still describes the old static behavior.

---

## Constraints & conventions to follow throughout

- Match existing Go patterns: repository layer does SQL only, service layer (where present) holds business logic, handler layer does HTTP + validation + calls `auditRepo.Create` in a `go func()` with a `context.WithTimeout`, exactly like `UpdateConfig` and `RequeueDLQ` already do.
- All new admin routes go inside the same protected route group as `/admin/config` and `/admin/dlq` in `cmd/server/main.go` (same RBAC middleware — admin-only).
- All new tables follow the existing migration style: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`, explicit `created_at`/`updated_at`, foreign keys with `ON DELETE` behavior matching sibling tables (e.g. `reviews.transaction_id REFERENCES transactions(id) ON DELETE CASCADE`).
- Never return `password_hash` or raw API key secrets in any list/read response.
- Every write/delete/deploy/rollback/revoke action must produce an `audit_logs` row — no silent mutations.
- Do not invent data client-side to "fill gaps" — if a metric can't be computed yet, show an explicit empty/loading state rather than a placeholder number.