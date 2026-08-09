# My Performance — Rebuild Plan

Reviewer-side page. Single reviewer permanently owns a single queue — no cross-queue
scope needed anywhere on this page. Everything below is derived from real tables
(`reviews`, `transactions`, `queues`, `analysts`) — **no schema migration required**,
all fields already exist (`claimed_at`, `sla_start_at`, `reviewed_at`, `decision`, etc).

---

## Page Layout (top to bottom)

| # | Section | Own Filter? |
|---|---|---|
| 1 | KPI Row (4 cards) | Today / This Week / This Month |
| 2 | Decision Ratio + Breakdown | *shares filter with #1* |
| 3 | Throughput Trend | This Week / This Month / This Year *(independent)* |
| 4 | Avg Handling Time Trend | This Week / This Month / This Year *(independent)* |
| 5 | Team Leaderboard | Today / This Week / This Month *(independent)* |

Three filter states total on the page, each owning its own section(s). No global filter.

---

## 1 + 2. KPI Row & Decision Breakdown

**Filter:** `PerformanceDateFilter` — Today / This Week / This Month (no custom range).

### KPI Cards (4)

| Card | Formula | Icon (lucide-react) |
|---|---|---|
| Cases Reviewed | `COUNT(reviews) WHERE reviewer_id = me AND reviewed_at IN period` | `ListChecks` |
| Throughput | `cases_reviewed / elapsed_days_in_period` (Not calculated for 'Today' filter) | `Gauge` |
| Avg Handling Time | `AVG(reviewed_at - claimed_at)` over the same review set (Not calculated for 'Today' filter) | `Timer` |
| SLA Compliance % | `% of reviews where reviewed_at <= sla_start_at + queue.sla_target_minutes` (see note below) | `ShieldCheck` |

> **SLA formula note:** reuse the exact same pause-aware calculation `sla_monitor.go` /
> Case Queue's `getSlaRemaining()` already use, so the number here never disagrees with
> what the reviewer saw live in Case Queue. Compliance counts *any* terminal action
> (approve/decline/block/escalate) taken within the window — escalating still stops
> that reviewer's clock.

Accuracy Rate is dropped entirely — no ground-truth outcome field exists on
`reviews`/`transactions` (only `risk_score`), so there's nothing to measure it against.

### Decision Breakdown + Ratio (same filter, same API call)

- `DecisionBreakdownCards` — 4 mini-cards: Approved / Declined / Blocked / Escalated, count + % of total
- `DecisionRatioDonut` — recharts Pie, same grouped data
- Query: `SELECT decision, COUNT(*) FROM reviews WHERE reviewer_id = me AND reviewed_at IN period GROUP BY decision`
- Icons (replacing emojis):

| Decision | Old (emoji) | New (lucide-react) |
|---|---|---|
| Approved | ✓ | `CheckCircle2` |
| Declined | ✕ | `XCircle` |
| Blocked | 🔒 | `ShieldOff` |
| Escalated | ⬆ | `ArrowUpCircle` |

**Endpoint:** `GET /api/v1/reviewer/performance/summary?period=today|week|month`
Returns KPI values + decision breakdown in one payload (single round trip).

```json
{
  "period": "week",
  "cases_reviewed": 63,
  "throughput_per_day": 9.0,
  "avg_handling_time_minutes": 19,
  "sla_compliance_pct": 96.8,
  "decision_breakdown": {
    "approved": 38, "declined": 17, "blocked": 5, "escalated": 3
  }
}
```

---

## 3. Throughput Trend

**Filter:** `ThroughputRangeFilter` — This Week / This Month / This Year (independent of section 1).

| Range | Bucketing |
|---|---|
| This Week | daily (7 bars) |
| This Month | weekly (4–5 bars) |
| This Year | monthly (12 bars) |

- Data: `COUNT(reviews)` grouped by day/week/month bucket, `reviewer_id = me`
- Chart: single line or bar — no second "accuracy" series (dropped, see above)

**Endpoint:** `GET /api/v1/reviewer/performance/trend?metric=throughput&range=week|month|year`

```json
{ "metric": "throughput", "range": "month", "buckets": [
  { "label": "W1", "value": 14 }, { "label": "W2", "value": 17 }, ...
]}
```

---

## 4. Avg Handling Time Trend

**Filter:** `AhtRangeFilter` — This Week / This Month / This Year (independent, same bucketing rule as above).

- Data: `AVG(reviewed_at - claimed_at)` grouped per bucket, `reviewer_id = me`
- Reference line: the reviewer's queue `sla_target_minutes` — this is now a **fixed
  constant** on the chart (not dynamic per-transaction) since the queue never changes
  for a given reviewer
- Reading it: bars trending down = getting faster; bars near/above the line = at risk of breaching

**Endpoint:** `GET /api/v1/reviewer/performance/trend?metric=aht&range=week|month|year`

```json
{ "metric": "aht", "range": "week", "sla_target_minutes": 25, "buckets": [
  { "label": "Mon", "value": 22 }, { "label": "Tue", "value": 18 }, ...
]}
```

---

## 5. Team Leaderboard

**Filter:** `LeaderboardDateFilter` — Today / This Week / This Month (independent of everything above).

### Columns

| Column | Source |
|---|---|
| Rank | derived from sort |
| Reviewer Name | `analysts.full_name` |
| Queue | `queues.name` (each reviewer's permanently assigned queue) |
| Cases Reviewed | `COUNT(reviews)` grouped by `reviewer_id`, informational only |
| SLA Compliance % | same formula as KPI card, per reviewer |
| Avg Handling Time | same formula as KPI card, per reviewer |
| Escalation Rate % | `escalated decisions / total decisions`, per reviewer |

### Sorting

Sortable via clickable column headers, not a separate dropdown:
- **SLA Compliance %** — default sort, descending (higher = better)
- **Escalation Rate %** — ascending (lower = better)

Cases Reviewed and Avg Handling Time are shown as context columns (volume/complexity
varies by queue) but are **not** sort targets — sorting by raw volume would just rank
whoever sits on the busiest queue, not who's actually performing best.

Current reviewer's row highlighted (`isMe` styling, already exists in current mock UI).

**Endpoint:** `GET /api/v1/reviewer/performance/leaderboard?period=today|week|month&sort=sla|escalation`

```json
{ "period": "week", "sort": "sla", "rows": [
  { "reviewer_id": "...", "name": "Aisha K.", "queue": "High Value Transactions",
    "cases_reviewed": 63, "sla_compliance_pct": 98.1,
    "avg_handling_time_minutes": 17, "escalation_rate_pct": 4.8 },
  ...
]}
```

---

## Backend Work Summary

New `PerformanceRepository` (or extend existing `StatsRepository`), all queries scoped
by `reviewer_id` from the JWT — same auth pattern as `analysts/me`.

| Endpoint | Powers |
|---|---|
| `GET /reviewer/performance/summary?period=` | Section 1 + 2 |
| `GET /reviewer/performance/trend?metric=throughput&range=` | Section 3 |
| `GET /reviewer/performance/trend?metric=aht&range=` | Section 4 |
| `GET /reviewer/performance/leaderboard?period=&sort=` | Section 5 |

No new columns, no new tables. Every metric above is computable today from
`reviews.reviewer_id/decision/reviewed_at`, `transactions.claimed_at/sla_start_at`,
and `queues.sla_target_minutes`.

## Explicitly Out of Scope (for now)

- Accuracy Rate / Model Agreement — needs a real outcome field (`confirmed_fraud` /
  `confirmed_legit` / `disputed`), which doesn't exist. Not faking it with a score threshold.
- Escalation Reason breakdown — `reviews.notes` is free text, no structured reason enum.
- Custom date range — explicitly excluded per current requirement (Today/Week/Month only).
- Notification bell — deferred, tackled after this page ships.