# Aegis — Investigation Page: Making It Real

Audited against the actual repo (`Sayantan-dev1003/Aegis`, `main`). Every claim below about what's "real" vs "fake" is traced to a specific file/table — not a guess.

---

## 0. TL;DR

- The page already fetches real data (`GET /transactions/:id`) but only uses it for 6 fields. Everything else — SHAP list, Customer Profile, Device & Network, Velocity Signals, Transaction History, Linked Entity Graph, Case Activity Log — is a hardcoded object (`CASES["3"]` in `investigate/page.tsx`).
- There's a **P0 bug** hiding in the current code: the Decision Panel submits `decision: "approved" | "declined" | "blocked" | "escalated"`, but the backend only accepts `"legitimate" | "confirmed_fraud" | "escalate"`. Every submission from this page **fails silently** (empty `catch`) and the UI shows "submitted" anyway. Reviewers currently believe they're logging decisions that never reach the DB.
- Some panels (Customer Profile: name/email/KYC) have **no backing table anywhere in the schema** — not a wiring problem, a missing-table problem. Resolved: seed a `customers` table + gate ingestion on identity existence (§3.3) so every transaction a reviewer ever sees has a real customer behind it.
- `Reason Code` dropdown — the value is captured in the UI but the backend struct doesn't have a field for it. It's silently dropped today even on the drawer component that does hit the real endpoint.
- Decision Panel is finalized to 3 buttons (Approve / Block / Escalate) with decision-scoped reason codes, required notes, and optional evidence attachment (§3.9).

---

## 1. Navigation & Routing Changes

### 1.1 Remove "Investigation" from the sidebar

**File:** `services/dashboard/src/app/(dashboard)/layout.tsx`

```diff
const reviewerNav = [
  { name: "Case Queue", path: "/reviewer/queue" },
- { name: "Investigation", path: "/reviewer/investigate" },
  { name: "Customer 360", path: "/reviewer/customer" },
  { name: "My Performance", path: "/reviewer/performance" },
  { name: "Alerts", path: "/reviewer/alerts" },
];
```

### 1.2 Keep "Case Queue" highlighted while on Investigation

The sidebar's active-state logic is `pathname.startsWith(link.path)` (line 89 of `layout.tsx`). Today `/reviewer/investigate` and `/reviewer/queue` are siblings, so once you remove the nav entry, **nothing** matches `/reviewer/investigate` and no item highlights.

Fix: nest the route under Case Queue instead of leaving it a sibling.

```
/reviewer/queue/page.tsx                          (unchanged, the table)
/reviewer/queue/investigate/[id]/page.tsx          (moved from /reviewer/investigate)
```

With this, `pathname.startsWith("/reviewer/queue")` is true on both the table and the investigation page, so "Case Queue" stays highlighted automatically — no special-casing needed in the layout.

Also update `getPageMeta`'s `metaMap` in `layout.tsx` — right now it does `Object.keys(metaMap).find(k => path.startsWith(k))`, and since `/reviewer/queue` is inserted before `/reviewer/investigate`, a nested path would incorrectly match the Case Queue title first. Reorder so the more specific key is checked first, or switch to matching the **longest** key that's a prefix:

```ts
const match = Object.keys(metaMap)
  .filter(k => path.startsWith(k))
  .sort((a, b) => b.length - a.length)[0];
```

### 1.3 Row navigation with an ID (already correct)

`reviewer/queue/page.tsx` line 931/1274 already does `router.push(`/reviewer/investigate?id=${t.id}`)`. Update the path to match the new nested route and switch to a path param instead of query string (cleaner, and lets you keep `?page=` free for pagination state):

```ts
router.push(`/reviewer/queue/investigate/${t.id}?returnPage=${currentPage}`);
```

### 1.4 Back button that returns to the same paginated page

The queue table currently fetches everything once (`limit=200`) and paginates **client-side** with a `currentPage` React state (line 217, 1405 in `queue/page.tsx`). That state lives only in memory — navigating away and back always resets to page 1. Two things need to change together:

1. **Investigate page**: read `returnPage` from the query string, and render a "← Back to Case Queue" button that does `router.push(`/reviewer/queue?page=${returnPage}`)` instead of `router.back()` (safer — `back()` breaks if the reviewer opened the case in a fresh tab or refreshed).
2. **Queue page**: on mount, read `page` from `useSearchParams()` and initialize `currentPage` from it instead of always defaulting to `1`. When the reviewer changes pages manually, also push the page number into the URL (`router.replace(`/reviewer/queue?page=${n}`)`) so it round-trips.

This is a small, contained change — no backend work needed for it.

---

## 2. Honest Data Audit — What's Real, What's Not

Before listing components, here's the ground truth per panel, checked against the actual Postgres migrations (`migrations/*.up.sql`) and Redis usage (`repository/velocity.go`).

| Panel | Real data available today? | Where it would come from |
|---|---|---|
| Risk gauge, txn ID, amount, merchant, timestamp, status, queue | ✅ Yes | `GET /transactions/:id` — already wired |
| ML Confidence / Fraud probability | ✅ Yes | `fraud_results.fraud_score` — already wired |
| SHAP "Why was this flagged" | ✅ Yes, unused | `fraud_results.feature_weights` (JSONB) — API already returns it, frontend ignores it |
| Rule-based flag reason ("ATO-01: Password Reset...") | ❌ Not persisted anywhere | `RulesEngine.Evaluate()` computes the matching rule at ingest time (`service/ingest.go:100`) but **discards it** after picking a queue. No `matched_rule_id` column exists. |
| Device ID, IP address, country code | ✅ Yes | `transactions.device_id`, `transactions.ip_address`, `transactions.country_code` |
| Device type ("Mobile Android 14"), Browser ("Chrome 126") | ❌ No column exists | `transactions` has no `user_agent`/`device_type` field. Only `audit_logs` captures `user_agent`, and only for analyst actions, not the originating transaction. |
| City-level location ("Hyderabad, India") | ❌ No column exists | Only 2-letter `country_code` is stored. City requires an IP-geolocation lookup (MaxMind or similar) — not integrated anywhere in the repo. |
| "New device — never seen before" | ✅ Yes, unused | `VelocityStore.CheckDeviceSeen(accountID, deviceID)` already exists in Redis (`repository/velocity.go`) — no endpoint exposes it yet |
| Velocity Signals (1h/24h/7d, by card/device/IP) | ✅ Yes, unused | `VelocityStore.Count(entity, id, duration)` — real sliding-window counts already computed in Redis on every ingest. **No API endpoint exposes this today.** |
| Customer Name, Email, KYC Status, Account Age | ❌ No table exists today | There is no `customers` or `accounts` table anywhere in the schema. `transactions.account_id` is a bare `TEXT` column, not a foreign key to any identity record. `reviewer/customer/page.tsx` (Customer 360) is *also* 100% hardcoded — this isn't just an Investigation-page gap. **Resolved in §3.3:** seed `customers` + gate ingestion on it. |
| Customer Transaction History | ✅ Yes | `transactions` filtered by `account_id`, ordered by `timestamp` — real, just needs a query |
| Linked Entity Graph (shared device/IP) | ✅ Derivable | Self-join `transactions` on `device_id`/`ip_address` excluding the current `account_id` — real signal, no new table needed, just a new query |
| Case Activity Log | ⚠️ Partially | `audit_logs` captures `review.submitted` (with actor, timestamp) since `ReviewService.SubmitReview` writes to it. But `ClaimTransaction` and `RejectTransaction` (`service/review.go`) **do not** write audit log entries today — so "Aisha K. claimed this case" would be missing from a real feed. |
| Decision Panel (Approve/Decline/Block/Escalate) | ⚠️ Wired to wrong values | Hits `POST /transactions/:id/review`, but sends decision values the backend rejects (see §4). |
| Reason Code dropdown | ❌ Not persisted | `reviews` table has no `reason_code` column; `SubmitReviewRequest` struct only has `decision` and `notes`. |

---

## 3. Section-by-Section Spec

### 3.1 Case Header (keep, already mostly real)
**Shows:** risk score gauge, txn ID, status pill, queue name, amount, merchant, timestamp, flag reason line, ML confidence.
**Source:** `GET /transactions/:id` → `transaction.*`, `fraud_result.fraud_score`.
**Reviewer value:** the 5-second orientation — what am I looking at, how urgent is it, what queue put it here.
**Action:** wire `caseData` fully from `liveTx` instead of falling back to mock fields for `queue` (currently falls back to `"ML Borderline Review"` hardcoded string when `queue_name` is missing — needs the join added to `GetByID` or a lookup against `queues` by `transaction.queue_id`).

### 3.2 SHAP Explanation ("Why Was This Flagged")
**Shows:** ranked feature contributions with +/- weight bars.
**Source:** `fraud_result.feature_weights` — already returned by `GetByID`, just needs mapping.
**Mapping needed:** API returns `{feature, weight, importance}` where `weight` is signed (positive → pushes toward fraud, negative → pushes toward legitimate) and `importance` is `abs(weight)`. Frontend currently expects `{feature, value, direction}` — derive `direction` from `Math.sign(weight)` and use `importance` for the bar length.
**Reviewer value:** this is the single most decision-relevant panel — it's the model's actual reasoning, not a guess. Currently showing 5 hardcoded lines that have nothing to do with the real case in front of the reviewer is actively misleading, not just "static."
**Action:** rewire immediately — zero backend work required, purely a frontend mapping fix.

**Rule-triggered flag reason** ("ATO-01: Password Reset + Immediate Withdrawal") is a separate thing from SHAP and currently has no data source at all (see §2). Needs a schema change — see §5.

### 3.3 Customer Profile — resolved via a `customers` table + ingestion-time identity gate

**Shows today (fake):** Name, Account ID, Email, Account Age, KYC Status.
**What's real:** only Account ID (`transactions.account_id`).

**The core problem:** a `customers` table only helps if every `account_id` that reaches a transaction has a matching row in it. The ingestion API takes `account_id` as a bare string with no validation today — nothing stops a transaction arriving for an account that was never onboarded, which would just reproduce the same blank-profile problem through a different door.

**Finalized design — three layers:**

**1. Seed `customers` up front.**
```sql
CREATE TABLE customers (
    account_id   TEXT PRIMARY KEY,
    full_name    TEXT,
    email        TEXT,
    kyc_status   TEXT CHECK (kyc_status IN ('verified','pending','mismatch')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
For the mock dataset specifically: `mock_transactions.py` generates account IDs as `ACCT_{random 1001 to 1000+pool_size}`, with `--account-pool` defaulting to **30** (so `ACCT_1001`–`ACCT_1030`). Seed the full range up front, not just IDs observed in one run, since the pool is re-randomized every run:
```sql
INSERT INTO customers (account_id, full_name, email, kyc_status, created_at)
SELECT
  'ACCT_' || n,
  (ARRAY['Amit Verma','Priya Nair','Rohan Kulkarni','Ananya Deshmukh','Kavya Sundaram',
         'Vikram Mehta','Siddharth Verma','Aarav Sharma','Rajeshwar Iyer'])[1 + (n % 9)],
  'user' || n || '@example.com',
  (ARRAY['verified','verified','verified','pending','mismatch'])[1 + (n % 5)],
  NOW() - (random() * INTERVAL '5 years')
FROM generate_series(1001, 1030) AS n
ON CONFLICT (account_id) DO NOTHING;
```
Run as a seed migration (or a `scripts/seed_customers.py` companion to `mock_transactions.py`) before generating transaction traffic. If `--account-pool` is ever run larger than 30, extend the range to match.

**2. Gate ingestion on identity existence — before rules, before ML.** In `service/ingest.go`, right after `ValidateTransaction` and before `s.rules.Evaluate(ctx, t)` (currently line ~100), add an identity check:

```go
exists, err := s.customerRepo.Exists(ctx, t.AccountID) // SELECT 1 FROM customers WHERE account_id = $1
if err != nil {
    // fail open or closed is a judgment call; failing closed (treat as unknown) is safer for fraud
}
if !exists {
    t.Status = "auto_blocked"
    source := "identity" // NOT "rule"/"ml"/"hybrid" — see note below
    t.RiskSource = &source
    // Insert the transaction, write an `incidents` row (incident_type: "unknown_account_transaction"),
    // and return early — skip rules.Evaluate, skip the ML outbox event entirely.
    // Do NOT insert into block_audit_samples — that table audits model decisions, and this isn't one.
}
```

**Why the distinct `risk_source = "identity"` and why skip `block_audit_samples`:** `block_audit_samples.sampled_reason` is a CHECK-constrained column (`'random' | 'low_score_despite_block' | 'ml_auto_block'`) specifically for auditing ML/rule decision *quality*. An unknown-account block isn't a model judgment — routing it there would quietly pollute your auto-block-rate and audit-sampling metrics with a completely unrelated failure mode (missing identity sync, not a fraud call the model got right or wrong). Log it to `incidents` instead — that table already exists and already handles this kind of "operational, not scoring" event (see `force_escalation` in `RejectTransaction`).

**Performance note:** `account_id` is the primary key on `customers`, so this is a single indexed lookup — negligible against your ~55–70ms current ingest latency. If it ever matters at higher throughput, a small in-process LRU or Redis set cache of known-good `account_id`s avoids a DB round-trip on the hot path.

**3. Keep the UI-level safety net anyway.** Even with the gate in place, use `LEFT JOIN customers` (not inner join) when the Investigation page fetches a case, and render an explicit **"No customer record on file"** state if it's ever null — don't let it silently blank out. This covers edge cases the ingestion gate doesn't (a `customers` row deleted after the fact, manual test data inserted directly into `transactions`, etc.), and honestly, "no identity on file" is itself a legitimate red flag worth surfacing rather than hiding.

**Net effect:** for your actual demo data, every transaction that ever reaches `escalated` (and therefore the Investigation page) is guaranteed to have a real, seeded customer behind it — Customer Profile stops being fake for the whole review flow, not just patched over.

**Reviewer value:** confirms the reviewer isn't reviewing a stranger — account tenure and KYC status are strong legitimate-vs-fraud signals. This also fixes Customer 360 (`reviewer/customer/page.tsx`), which has the identical hardcoded-data problem.

### 3.4 Device & Network
**Shows today (partially fake):** Device ID ✅, IP ✅, Country ✅, Device type ❌, Browser ❌, City ❌, "New device" badge ⚠️(real data, no endpoint).
**Action:**
- Wire Device ID / IP / Country immediately from `GetByID`.
- Add `GET /transactions/:id/device-check` → calls existing `VelocityStore.CheckDeviceSeen(accountID, deviceID)`, returns `{seen_before: bool}`. This is the highest-value fix in this panel — the "NEW DEVICE — Never seen before" red banner is a genuinely strong ATO signal and the backend already computes it.
- Drop Device Type / Browser / City, or capture `user_agent` at ingest time (new column) and integrate a geo-IP lookup if you want city-level location — both are real scope additions, not wiring fixes.

### 3.5 Velocity Signals (Card / Device / IP tabs, 1h/24h/7d)
**Shows:** transaction count + amount per window, per entity type.
**Source:** fully computed in Redis already (`VelocityStore.Count`), just never exposed.
**New endpoint needed:**
```
GET /api/v1/transactions/:id/velocity
→ {
    card:   { "1h": {count, amount}, "24h": {...}, "7d": {...} },
    device: { ... },
    ip:     { ... }
  }
```
Implementation is thin — the handler resolves the transaction's `account_id`/`device_id`/`ip_address`, then calls `VelocityStore.Count()` six times (3 windows × the entity in question) using the windows already configured in `velocity_config`. Note: the existing store only tracks `user`/`device`/`ip` entities (see `RecordTransactionAndDevice`) — there's no separate "card" entity distinct from `user`/account. Either rename the UI tab from "CARD" to "ACCOUNT" to match reality, or add a `card` entity to `velocity_config` and record it separately at ingest if card-level (not account-level) velocity is actually meaningful for your fraud patterns.
**Reviewer value:** answers "is this an isolated spike or a burst?" — core to catching card testing, rapid cash-out, and bot-driven ATO.

### 3.6 Customer Transaction History
**Shows:** last N transactions for this account with status.
**Source:** real, just needs a query — `SELECT * FROM transactions WHERE account_id = $1 ORDER BY timestamp DESC LIMIT 5` (excluding the current transaction).
**Action:** `ListTransactionsRequest` (`model/api_response.go`) doesn't have an `account_id` filter today — only a generic `search` string. Add an explicit `account_id` param to `List()` and its handler so this can be a clean filtered call instead of piggybacking on the free-text search.
**Reviewer value:** pattern recognition — is ₹1,02,000 wildly out of character, or does this account regularly move that kind of money?

### 3.7 Linked Entity Graph
**Shows:** other accounts sharing this transaction's device ID or IP within a lookback window.
**Source:** derivable, no new table:
```sql
SELECT DISTINCT account_id, device_id, ip_address, MAX(timestamp) as last_seen
FROM transactions
WHERE (device_id = $1 OR ip_address = $2)
  AND account_id != $3
  AND timestamp > NOW() - INTERVAL '30 days'
GROUP BY account_id, device_id, ip_address;
```
**New endpoint:** `GET /transactions/:id/linked-accounts`
**Reviewer value:** the strongest fraud-ring signal on the whole page — one compromised device or IP touching multiple "different" accounts is a much bigger red flag than any single transaction's score. Currently this shows two literally invented names ("Rahul Verma", "Unknown Entity") — worth prioritizing this one, it's cheap to build and high-signal.
**Note:** you won't have real customer *names* to show here without solving §3.3 first — show `account_id` and the shared attribute (device/IP) instead, that's enough to be useful and is 100% real today.

### 3.8 Case Activity Log
**Shows:** timeline of who did what to this case.
**Source:** `audit_logs` filtered by `resource_id = transaction_id`, ordered by `created_at`.
**Gap:** `ClaimTransaction` and `RejectTransaction` in `service/review.go` currently only broadcast a WebSocket event — they don't write to `audit_logs`. Only `SubmitReview` does. Fix by adding the same fire-and-forget `auditRepo.Create()` call (pattern already exists in `SubmitReview`, copy it) to both.
**New endpoint:** `GET /transactions/:id/activity` → `SELECT actor_id, action, created_at FROM audit_logs WHERE resource_id = $1 ORDER BY created_at`.
**Reviewer value:** accountability and context — was this already looked at by someone else, was it auto-escalated or manually flagged, how long has it been sitting.

### 3.9 Decision Panel — fix before anything else, then finalize to 3 actions

**Current bug (P0):** frontend sends `"approved"/"declined"/"blocked"/"escalated"`; backend (`handler/review_api.go`) only accepts `"legitimate"/"confirmed_fraud"/"escalate"` and 400s on anything else. The current `handleSubmit` swallows the fetch error in an empty `catch {}` and optimistically shows "submitted" regardless. **Every review submitted through this page today is silently lost.** This is the first thing to fix, independent of any dynamic-data work — it's why "correct reviews" isn't currently possible even with a human making the right call.

**Finalized button set — Approve / Block / Escalate only** (Decline removed — it doesn't map to a real, distinct backend action and just adds ambiguity):

| Button | Meaning | Call |
|---|---|---|
| ✅ Approve | Transaction is legitimate | `POST /transactions/:id/review {decision:"legitimate", reason_code, notes}` |
| 🔒 Block | Confirmed fraud, deny it | `POST /transactions/:id/review {decision:"confirmed_fraud", reason_code, notes}` |
| ↑ Escalate | Needs senior/compliance eyes | `POST /transactions/:id/review {decision:"escalate", reason_code, notes}` |

**Reason Code — expand the list and scope it to the selected decision.** A single flat dropdown mixes irrelevant reasons (a fraud reason showing up under Approve is just noise). Filter the options array by the currently selected `decision`:

```
APPROVE:
  - Customer verified by phone
  - Transaction pattern consistent with account history
  - Business/merchant payment verified
  - KYC re-confirmed, false positive on device/location signal

BLOCK:
  - Confirmed account takeover
  - Confirmed card-not-present fraud
  - Confirmed synthetic identity
  - Confirmed money-mule / structuring pattern
  - Customer denied making the transaction (via support call)
  - Transaction against unknown/unverified account (risk_source = "identity")

ESCALATE:
  - Requires senior analyst review
  - Requires compliance / AML / SAR filing
  - Ambiguous signals, insufficient evidence to decide
  - Suspected fraud ring, needs cross-account investigation
```

**Backend change:** `reviews` table has no `reason_code` column today. Minimal fix:
```sql
ALTER TABLE reviews ADD COLUMN reason_code TEXT;
```
Add `ReasonCode string` to `SubmitReviewRequest` and `model.Review`, thread it through `ReviewService.SubmitReview`. Without this, the dropdown is decorative — it's already being silently dropped today even in `InvestigationDrawer.tsx`, the one component that does hit the real endpoint.

**Investigation Notes — required, enforce on both ends.** Client-side already half-does this (disable Submit until non-empty); add the same check server-side in `SubmitReview` so the API itself refuses an empty-notes submission rather than relying on the frontend never sending one.

**Attach Evidence — optional, and a genuinely new capability, not a wiring gap.** Checked the backend: there's no file storage, no evidence/attachment table, no S3 or blob integration anywhere in the repo today. Before building the upload widget, decide:
- Where files live (S3-compatible bucket, local disk behind a proxy — nothing exists today)
- A tracking table: `review_evidence (id, review_id, filename, url, uploaded_by, uploaded_at)`
- That it doesn't block submission — evidence can be attached as a follow-up call after `POST /review` returns a `review_id`, since it's optional

Sequence this **after** everything else in §6 — Approve/Block/Escalate + Reason Code + required Notes gets you a fully correct, fully persisted decision flow with zero new infrastructure. Evidence upload is a separate project once you've picked a storage backend.

---

## 4. Required Backend Work — Summary

**New endpoints:**
| Endpoint | Purpose |
|---|---|
| `GET /transactions/:id/velocity` | Card/device/IP counts, 1h/24h/7d (Redis, already computed) |
| `GET /transactions/:id/device-check` | "New device" boolean (Redis, already computed) |
| `GET /transactions/:id/linked-accounts` | Shared device/IP accounts (Postgres self-join) |
| `GET /transactions/:id/activity` | Audit log timeline for this case |
| `GET /transactions?account_id=...` | Filtered transaction history (extend existing `List`) |

**Migrations:**
| Change | Required for |
|---|---|
| `transactions.matched_rule_id UUID REFERENCES rules(id)` (set in `service/ingest.go` where the rule match is currently discarded) | Real rule-based flag reason text |
| `reviews.reason_code TEXT` | Reason Code dropdown persistence |
| `customers` table + seed script (§3.3) | Real Customer Profile / Customer 360 — **finalized, not optional** |
| *(optional, later)* `review_evidence` table | Attach Evidence upload (§3.9) — only once a storage backend is chosen |

**Ingestion pipeline change (§3.3):**
Add an identity-existence gate in `service/ingest.go`, before `s.rules.Evaluate(...)`: if `customers` has no row for `t.AccountID`, set `status = "auto_blocked"`, `risk_source = "identity"` (a new value, not `"rule"`/`"ml"`/`"hybrid"` — no CHECK constraint exists on this column so it costs nothing), write an `incidents` row (`incident_type: "unknown_account_transaction"`), and return early — skip `rules.Evaluate`, skip the ML outbox event. **Do not** insert into `block_audit_samples` — that table's `sampled_reason` CHECK constraint (`'random' | 'low_score_despite_block' | 'ml_auto_block'`) is scoped to auditing model decision quality; an unknown-account block isn't a model judgment and would pollute those metrics.

**Bug fixes (do first, before any UI polish):**
1. Decision value mismatch in `handleSubmit` (§3.9) — P0, silently destroys reviewer decisions today.
2. `ClaimTransaction` / `RejectTransaction` missing audit log writes (§3.8).

---

## 5. Component Decision: Keep / Modify / Remove

| Component | Verdict |
|---|---|
| Case Header | **Keep**, finish wiring `queue_name` |
| SHAP Explanation | **Keep**, rewire mapping (no backend work) |
| Rule flag-reason line | **Modify** — needs `matched_rule_id` migration, or drop the specific rule name and just show `risk_source` badge (rule/ml/hybrid) which *is* real today |
| Customer Profile | **Modify** — build `customers` table, seed it, gate ingestion on it (§3.3, finalized) |
| Device & Network | **Modify** — keep Device ID/IP/Country, add real "new device" badge, drop or defer Browser/City |
| Velocity Signals | **Keep**, build the new endpoint — high reviewer value, data already exists |
| Customer Transaction History | **Keep**, add `account_id` filter to `List` |
| Linked Entity Graph | **Keep**, build the new endpoint — cheap, highest fraud-ring signal on the page |
| Case Activity Log | **Keep**, backfill missing audit writes on claim/reject |
| Decision Panel | **Fix immediately** — decision-value bug, then finalize to Approve/Block/Escalate only |
| Reason Code dropdown | **Modify** — add `reason_code` column, expand list, scope options to selected decision |
| Attach Evidence | **New, deferred** — no storage backend exists yet; build last, after everything else ships |
| `components/InvestigationDrawer.tsx` | **Remove** — dead code, not imported anywhere in the dashboard (`grep` confirms zero usages). It duplicates the investigation UI in an unused side-drawer form. Delete it to avoid future confusion about which decision-submission code path is live. |

---

## 6. Suggested Build Order

1. Fix the decision-value bug in `handleSubmit` (§3.9) — unblocks correct reviews immediately, zero new endpoints needed. Collapse buttons to Approve/Block/Escalate at the same time.
2. Rewire SHAP explanation from `fraud_result.feature_weights` — zero backend work, high value.
3. Wire Case Header fully off `liveTx`, drop the `CASES["3"]` mock object entirely.
4. Create `customers` table + seed script matching the mock script's account-ID range (§3.3), before generating any more test traffic.
5. Add the ingestion-time identity gate in `service/ingest.go` (§3.3/§4) — do this once `customers` is seeded, not before, or every existing account will get auto-blocked.
6. Build `device-check` and `velocity` endpoints (Redis-only, no migration) → wire Device & Network + Velocity Signals.
7. Add `account_id` filter to `List` → wire Transaction History.
8. Build `linked-accounts` endpoint → wire Linked Entity Graph (account IDs now resolve to real customers from step 4).
9. Backfill audit logging on claim/reject → build `activity` endpoint → wire Case Activity Log.
10. `reason_code` migration → expand and scope the reason list per decision (§3.9) → wire the dropdown for real.
11. Do the routing/sidebar/back-button changes from §1 — independent of the data work, easy to slot in anytime.
12. Delete `InvestigationDrawer.tsx`.
13. *(Later, separate effort)* Pick a storage backend and build Attach Evidence — not blocking anything above.