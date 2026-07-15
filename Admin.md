# Aegis Admin Dashboard — Build Prompt

Paste this whole document into Claude Code / your agent of choice. It assumes the shell (sidebar nav, header, page title pattern) shown in the screenshots is already built and working — this prompt is scoped to building out the **content area** of all 7 admin routes only. Do not rebuild or restyle the sidebar, header, or page title block.

---

## 0. Role

You are a senior frontend engineer at a fintech company, building the internal admin console for **Aegis**, a real-time fraud detection platform (Kafka → Go services → Python/XGBoost scorer → Redis → Postgres → WebSocket hub, observability via OpenTelemetry/Prometheus/Grafana). This console is used daily by fraud-ops engineers to monitor the pipeline and configure the system. It needs to feel like a real trading-desk/SOC tool — dense, fast, no wasted motion — not a generic admin template.

---

## 1. Existing foundation (do not change)

From the current shell:
- Sidebar: fixed left, dark background, "Aegis" wordmark top-left in accent color, 7 nav items, active item gets a left accent border + accent text color, user card pinned to bottom (name, role, Sign Out button)
- Header: right-aligned "● Live Data Connected" pill with a green pulsing dot
- Page pattern: large bold title + one-line gray subtitle, content area below is currently empty

**Inspect the existing codebase first** and reuse whatever is already defined:
- Tailwind config / CSS variables for color tokens (background, surface, border, text, accent)
- The font-family already applied to headings/body — do not introduce a new font, match what's rendering in the title text
- Existing Button, Badge, or Card components if any already exist — extend them, don't fork a second version

If tokens genuinely aren't defined yet, use this as the source of truth:

```
--bg-base: #0A0E14
--bg-surface: #121822
--bg-surface-hover: #1A2230
--border: #232C3A
--text-primary: #E8EDF4
--text-secondary: #8D9AAB
--text-disabled: #4E5A6B
--accent: #5C6EF8          /* indigo — buttons, links, active states */
--risk-critical: #E5484D   /* red */
--risk-medium: #F5A524     /* amber */
--risk-low: #12B76A        /* green */
--info: #4CC2FF            /* sky blue */
```

**Tech stack assumption:** Next.js (App Router) + TypeScript + Tailwind CSS + Recharts for charts. If the actual project uses something different (Vue, plain React, a different chart lib), translate the component specs below 1:1 into that stack — the structure and behavior matter more than the exact library.

---

## 2. Build shared components first

These are used across multiple pages — build them once in a `components/` (or equivalent) folder before starting on individual pages.

| Component | Props / behavior |
|---|---|
| `StatCard` | `label, value, delta?, deltaDirection?, icon?, status?('good'\|'warn'\|'critical')`. Big number, small label above, optional trend arrow + delta below. Status colors the accent edge/icon only, not the whole card. |
| `ChartCard` | Wrapper for any chart: `title, subtitle?, liveIndicator?(bool), externalLink?, children`. Title row has an optional small pulsing dot + "updates every Xs" when `liveIndicator` is true. |
| `StatusBadge` | `status: 'active'\|'inactive'\|'warning'\|'critical'\|'pending'`. Pill with dot + label, uses the risk/semantic tokens above — never invent new colors here. |
| `DataTable` | Generic sortable/paginated table: `columns, rows, onRowClick?, emptyState, loading`. Server-side pagination pattern (don't load-all-then-paginate client side — Audit Log especially will have thousands of rows). |
| `EmptyState` | `icon, title, description, actionLabel?, onAction?`. Every empty table/list needs one of these, not a bare "No data" string — see per-page copy below. |
| `ConfirmDialog` | `title, description, confirmLabel, danger?(bool), onConfirm`. Used for anything destructive (revoke key, delete rule, deactivate user, rollback model). |
| `Drawer` / `Modal` | Standard slide-over and centered modal, both with focus trap + Esc to close. |
| `Toggle` | Simple on/off switch for rule-active, queue-paused, etc. |
| `Slider` | Range input with a live value readout — needed for the model threshold tuner. |

---

## 3. Page-by-page spec

### 3.1 `/admin` (or `/admin/health`) — System Health & Observability

**Layout (top to bottom):**
```
[ KPI row: 5 StatCards ]
  Kafka Lag | Throughput | p99 Latency | Error Rate | Uptime

[ 2-column chart grid ]
  Kafka consumer lag (line, per topic)   |  API latency p50/p95/p99 (multi-line)
  Redis hit rate + compute latency        |  WebSocket connections/throughput

[ Service status matrix ]
  Grid of StatusBadge pills: Go API, Python Scorer, Postgres, Redis, Kafka Broker 1-3

[ Active Incidents panel ]
  Table: severity | message | started | acknowledge button
  Empty state: "All systems operational" with a green check icon
```

**Data shape:**
```ts
interface HealthKPI { label: string; value: string; delta?: number; status: 'good'|'warn'|'critical' }
interface TimeSeriesPoint { timestamp: string; value: number; series?: string }
interface ServiceStatus { name: string; status: 'up'|'degraded'|'down'; latencyMs?: number }
interface Incident { id: string; severity: 'critical'|'warning'; message: string; startedAt: string; acknowledged: boolean }
```

**Behavior:** This page should feel live — poll every 5–10s (or mock with `setInterval` updating random-walk values around a baseline). If a critical incident is active, show a dismissible banner above the KPI row, not buried in the table. Each `ChartCard` gets an "Open in Grafana ↗" link (can be a dead link/placeholder for now).

---

### 3.2 `/admin/model` — Model Management (MLOps)

**Layout:**
```
[ Model card ]
  "XGBoost v2.3" badge · Live (green) · Deployed Jul 10, 2026 · Trained on IEEE-CIS

[ KPI row: 4 StatCards ]
  PR-AUC 0.887 | ROC-AUC 0.977 | Accuracy 0.990 | F1 Score

[ 2-column ]
  Precision/Recall curve + draggable threshold marker  |  SHAP feature importance (horizontal bars, top 10)

[ Feature drift chart ]
  Multi-line, feature selector dropdown/legend to toggle lines

[ Model version history table ]
  version | date | PR-AUC | status | [Rollback]

[ Retrain section ]
  "Trigger Retrain" button (opens ConfirmDialog) + job history table (id, status badge, started, duration)
```

**Data shape:**
```ts
interface ModelVersion { version: string; deployedAt: string; prAuc: number; rocAuc: number; accuracy: number; status: 'live'|'archived'|'canary' }
interface ThresholdPoint { threshold: number; precision: number; recall: number; flaggedPct: number }
interface FeatureImportance { feature: string; shapValue: number }
interface DriftPoint { timestamp: string; feature: string; driftScore: number }
interface RetrainJob { id: string; status: 'queued'|'running'|'completed'|'failed'; startedAt: string; durationSec?: number }
```

**Behavior:** The threshold slider is the centerpiece — as the user drags it, interpolate against the precision/recall curve data and update a live callout: *"At threshold 0.62: 3.2% of transactions flagged, 91% precision, 84% recall."* Rollback and retrain both require confirmation (`danger: true` on rollback).

---

### 3.3 `/admin/rules` — Rules & Velocity Engine

**Layout:**
```
[ Header row ]  Search/filter  ·····························  [+ Create Rule]

[ Rules table ]
  name | condition summary | entity | window | action | trigger count (24h) | precision % | active toggle | edit/delete

[ Velocity config panel ]
  4 cards: Card / User / IP / Device — each shows configured windows as editable chips (1h, 24h, 7d)

[ Backtest sandbox ]
  Select rule (or draft) → date range → [Run Backtest] → result panel:
  "Would trigger 1,204 times · 68% overlap with ML flags · Est. precision 71%"
```

**Data shape:**
```ts
interface Rule { id: string; name: string; entity: 'card'|'user'|'ip'|'device'; metric: string; window: string; operator: '>'|'>='|'<'|'=='; value: number; action: 'flag'|'block'|'step_up'; active: boolean; triggerCount24h: number; precisionPct: number; priority: number }
interface BacktestResult { triggerCount: number; overlapWithMlPct: number; estimatedPrecision: number }
```

**Behavior:** "Create Rule" opens a condition-builder form (Entity → Metric → Window → Operator → Value → Action), not a raw JSON/code editor — this is used by fraud-ops staff, not engineers. Rows are drag-reorderable or have a numeric priority field for rule ordering. Empty state copy: *"No custom rules yet — fraud is currently only caught by the ML model. Add a rule to layer in deterministic checks."*

---

### 3.4 `/admin/users` — User & Role Management

**Layout:**
```
[ Header row ]  Search · Role filter · Status filter  ·······  [+ Invite User]

[ Users table ]
  avatar/initials | name + email | role badge | queue/team | status dot | last active | [Edit] [Deactivate]

[ Permission Matrix (secondary tab or section) ]
  Read-only table: capability rows × Admin/Reviewer/Viewer columns, checkmarks
```

**Data shape:**
```ts
interface User { id: string; name: string; email: string; role: 'admin'|'reviewer'|'viewer'; queues: string[]; status: 'active'|'inactive'; lastActiveAt: string; mfaEnforced: boolean }
```

**Behavior:** Role badges use distinct but non-risk colors (e.g. indigo=Admin, sky=Reviewer, slate=Viewer — don't reuse red/amber/green here, those are reserved for risk meaning elsewhere in the app). Editing a user's role opens a drawer, not inline — role changes are sensitive enough to warrant a confirm step. Deactivate always confirms.

---

### 3.5 `/admin/queue` — Case Queue & SLA Configuration

**Layout:**
```
[ Queue cards grid ]
  Each card: queue name · description · open case count · SLA target · breach-rate sparkline · [Configure]

[+ Create Queue]

[ Configure drawer, opened per queue ]
  Assignment rule: round robin / skill-based / manual  (dropdown)
  SLA timer: numeric input (minutes)
  Escalation: "Escalate to [lead] after [X] min breach"
  Coverage hours: time range + timezone
  Active/paused toggle
```

**Data shape:**
```ts
interface Queue { id: string; name: string; description: string; openCases: number; slaMinutes: number; breachRatePct: number; assignmentRule: 'round_robin'|'skill_based'|'manual'; active: boolean }
```

**Behavior:** Deleting a queue with active cases assigned should warn explicitly ("12 open cases will be reassigned") rather than a generic confirm.

---

### 3.6 `/admin/audit` — Audit Log

**Layout:**
```
[ Filter bar ]  Actor · Action type · Date range · Search  ···  [Export ↓]

[ Log table, server-paginated ]
  timestamp | actor (avatar+name) | action badge (Created/Updated/Deleted/RolledBack) | target | summary | [View Diff]

[ Diff modal ]
  Side-by-side or inline colored before/after (red strikethrough / green addition, like a git diff)
```

**Data shape:**
```ts
interface AuditLogEntry { id: string; timestamp: string; actor: { name: string; avatarUrl?: string }; action: 'created'|'updated'|'deleted'|'rolled_back'; targetType: string; targetName: string; diff?: { before: Record<string, unknown>; after: Record<string, unknown> } }
```

**Behavior:** This table can get large fast — build filters and pagination as first-class from the start, not client-side `.slice()`. Export triggers a CSV download of the currently filtered view, not the whole table.

---

### 3.7 `/admin/integrations` — Integrations & API Keys

**Layout:**
```
[ Tabs: API Keys | Webhooks ]

API Keys tab:
  Table: name | key prefix (sk_live_****1234) | scopes (badges) | created | last used | [Revoke]
  [+ Generate New Key] → modal shows full key ONCE + copy button + "this won't be shown again" warning

Webhooks tab:
  List: URL | events subscribed | status (active/failing) | success rate % | last delivery | [View Deliveries]
  [+ Add Webhook] → modal: URL, event checkboxes, signing secret
  Delivery log drawer: timestamp | event | status code | response time | [Retry] (for failed only)
```

**Data shape:**
```ts
interface ApiKey { id: string; name: string; keyPrefix: string; scopes: string[]; createdAt: string; lastUsedAt?: string }
interface Webhook { id: string; url: string; events: string[]; status: 'active'|'failing'; successRatePct: number; lastDeliveryAt: string }
interface WebhookDelivery { id: string; timestamp: string; event: string; statusCode: number; responseMs: number; success: boolean }
```

**Behavior:** The one-time key reveal is a real security pattern, not decoration — the modal must make clear the key can't be retrieved again. Revoke always confirms with `danger: true`.

---

## 4. Non-functional requirements

- **Real data feel:** mock data should be internally consistent and specific to Aegis — PR-AUC around 0.887, ROC-AUC around 0.977, IEEE-CIS as the dataset name, realistic-looking rule names ("Card velocity >5 txns/1h"). Generic placeholder data ("Item 1", "Test Rule") undercuts the whole exercise.
- **Loading states:** every async section gets a skeleton, not a spinner-then-pop. Skeletons should match the shape of the eventual content (card outlines, table row bars).
- **Empty states:** every table/list needs a real `EmptyState`, not a blank area or bare "No data" text — copy examples are given per page above.
- **Desktop-first:** this is an internal ops tool used on desktop monitors, not a mobile product. Optimize for ≥1280px; don't invest in a mobile layout, but nothing should visually break down to ~1024px.
- **Accessibility floor:** all tables/modals are keyboard-navigable, modals trap focus and close on Esc, icon-only buttons (edit/delete/revoke) have `aria-label`s, color is never the only signal on a status (pair with icon/shape, not just red/green fill).
- **Consistency:** reuse `StatCard`, `ChartCard`, `StatusBadge`, `DataTable` everywhere — if a page seems to need a one-off variant, that's a signal to extend the shared component, not fork it.

---

## 5. Definition of done (per page)

- [ ] Matches existing shell/header pattern exactly, no sidebar/header changes
- [ ] Uses only the established color tokens — no new hex values introduced ad hoc
- [ ] Loading skeleton + empty state implemented, not just the happy path
- [ ] All destructive actions (revoke, delete, deactivate, rollback) go through `ConfirmDialog`
- [ ] Mock data is realistic and Aegis-specific
- [ ] Keyboard-navigable, focus-visible on all interactive elements
