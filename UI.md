# Aegis — Fraud Detection Platform
## Dashboard UX Specification: Admin, Reviewer & Viewer

**Prepared as:** Sr. Frontend Engineer perspective, FinTech dashboard design
**Scope:** Page inventory, page-level detail, KPIs/settings, and visual system for the three post-MVP roles

---

## 0. Why three roles, and why they look different

Fraud platforms at real fintechs (Stripe Radar, Sift, Feedzai, etc.) all separate **configuration**, **investigation**, and **oversight** into different surfaces — not just different permissions on the same screen. This isn't bureaucracy, it's separation of duties, which is a real compliance requirement (SOC 2 / PCI-DSS): the person who tunes the model shouldn't be the same person clearing cases, and someone needs a read-only view for audits without touching production config.

| Role | Who they are | Primary job | Access |
|---|---|---|---|
| **Admin** | Platform/fraud-ops engineers, team leads | Configure the system: models, rules, users, health | Full read/write |
| **Reviewer** | Fraud analysts | Investigate flagged transactions, make decisions | Read + case actions (no config) |
| **Viewer** | Compliance, execs, auditors, support leads | Monitor trends, pull reports, no risk of accidental change | Read-only |

This also solves a real UX problem: an analyst clearing 200 cases a day needs a dense, keyboard-friendly queue. An exec checking in once a week needs three big numbers and a trend line. Building one "dashboard" for both fails both users.

---

## 1. ADMIN — Pages

### 1.1 System Health & Observability *(landing page)*
**Purpose:** Single pane of glass over the pipeline you already built (Kafka → Go services → Python scorer → Redis → Postgres → WebSocket hub), sitting on top of your existing OpenTelemetry/Prometheus/Grafana stack.

**Sections:**
- Kafka consumer lag per topic (transactions in, results out) — line chart
- API latency: p50 / p95 / p99 per endpoint
- Inference throughput (txn/sec) and scoring latency
- Redis: cache hit rate, velocity-feature compute latency, memory usage
- WebSocket hub: active connections, message throughput
- Service uptime matrix (Go API, Python scorer, Postgres, Redis, Kafka brokers)
- Live incident/alert banner (fires from Prometheus alertmanager)
- "Deep dive in Grafana" deep-link per panel (don't rebuild Grafana — link to it)

**KPIs:** Kafka lag (ms), throughput (txn/s), p99 latency, error rate %, uptime %, DB pool utilization %, Redis memory %

**Settings/Config:**
- Alert thresholds (e.g., page on-call if lag > 30s)
- Data retention window for dashboard charts
- Grafana panel links/embeds

---

### 1.2 Model Management (MLOps)
**Purpose:** Lifecycle management of the XGBoost model — this is the page that turns your PR-AUC 0.887 / ROC-AUC 0.977 / Accuracy 0.990 into an operational tool instead of a one-time notebook result.

**Sections:**
- Current model card: version, deploy date, training dataset (IEEE-CIS), champion vs. challenger if A/B testing
- Live performance vs. offline benchmark (PR-AUC, ROC-AUC, precision/recall trend over the last N days — production drift shows up here first)
- Feature drift chart (distribution shift per input feature over time)
- SHAP global feature importance (bar chart — top features driving decisions)
- **Threshold tuner**: interactive slider on the precision/recall curve, showing live "if you move threshold here, X more cases get flagged" impact
- Model version history with rollback button
- Retrain trigger + retrain job logs/status

**KPIs:** PR-AUC, ROC-AUC, precision, recall, F1, false positive rate, false negative rate, inference latency, drift score

**Settings/Config:**
- Decision threshold (the score cutoff for "flag as fraud")
- Retrain schedule / auto-retrain trigger conditions (e.g., drift > X)
- Canary rollout percentage for new model versions
- Enable/disable a model version

---

### 1.3 Rules & Velocity Engine
**Purpose:** Config for the deterministic rules layer that sits alongside the ML score (nearly every real fraud stack is ML score + rules, not ML alone) — this is where your Redis-backed velocity features become admin-editable instead of hardcoded.

**Sections:**
- Rule list with a condition builder (`IF txn_count_1h[card] > 5 THEN flag`)
- Velocity feature config: entity (card/user/IP/device) × window (1h/24h/7d)
- Rule backtest/simulation sandbox — run a proposed rule against historical data before activating
- Rule ordering/priority
- Per-rule performance: trigger count, precision, overlap with ML flags (are rules catching things the model misses, or just adding noise?)

**KPIs:** rule trigger count, rule precision %, % of flags that are rule-only vs. ML-only vs. both

**Settings/Config:** create/edit/disable rule, threshold values, time windows, action on trigger (flag / hard block / step-up auth)

---

## 1.4 User & Role Management
**Purpose:** RBAC administration.

**Sections:** user directory, role assignment

> **Note:** The features requested in this prompt have been fully implemented with dynamic data backed by PostgreSQL and the Go backend API.

queue/team assignment, last-login/activity status, invite/deactivate flow

**KPIs:** active users, cases handled per reviewer (links out to 2.4)

**Settings/Config:** permission matrix, SSO/MFA enforcement, session timeout policy

---

### 1.5 Case Queue & SLA Configuration
**Purpose:** How flagged transactions get routed and escalated.

**Sections:** queue definitions (high-risk, chargeback, manual review), auto-assignment logic (round-robin / skill-based), SLA timers, escalation path

**KPIs:** avg queue depth, SLA breach %, avg time-to-assignment

**Settings/Config:** SLA thresholds, escalation rules, coverage hours

---

### 1.6 Audit Log
**Purpose:** Immutable compliance trail — every threshold change, rule edit, role change.

**Sections:** filterable table (actor, action, before/after diff, timestamp), export

**Settings/Config:** retention period, export to CSV/PDF

---

### 1.7 Integrations & API Keys *(optional, given your webhook/Razorpay background)*
**Purpose:** Manage webhook endpoints and third-party data providers (KYC, chargeback feeds).

**Sections:** API key list with scopes, webhook config + delivery/retry logs

**KPIs:** webhook success rate, API call volume

**Settings/Config:** create/revoke keys, webhook URLs, retry policy

---

## 2. REVIEWER — Pages

### 2.1 Case Queue *(landing page)*
**Purpose:** The analyst's worklist — this page gets opened hundreds of times a day, so density and speed matter more than polish.

**Sections:** sortable/filterable table — risk score, amount, merchant, customer, flag reason(s), SLA countdown, assignee. Bulk actions (assign, snooze). Saved filter presets. Keyboard shortcuts for triage (this matters a lot at scale — analysts live in this table).

**KPIs:** queue depth, my open cases, SLA-at-risk count, my avg handling time

**Settings/Config:** personal filter presets, notification preferences

---

### 2.2 Transaction Investigation *(the core page — most design effort goes here)*
**Purpose:** Everything needed to decide approve/decline in one screen, no tab-switching.

**Sections:**
- Header: txn ID, amount, timestamp, merchant, current status
- Risk score with **SHAP-based "why flagged"** — top 5 contributing features in plain language, not raw feature names
- Velocity signals panel: txn count/amount in last 1h/24h/7d for this card/device/IP
- Customer history timeline: past transactions, past flags, prior chargebacks
- Device & network fingerprint: IP geolocation, device ID, browser
- **Linked entity graph**: shared card/device/IP across other flagged accounts (network visualization — this is often the single most useful panel for catching rings)
- Decision panel: Approve / Decline / Escalate / Request info, with a required reason code + notes
- Case activity log (who else viewed/acted on this case)

**Data shown:** risk score (0–100 or probability), model confidence, SHAP feature contributions, this customer's/merchant's historical fraud rate

**Settings/Config:** none structural — reviewers can save canned reason-code templates

---

### 2.3 Customer / Entity 360 Profile
**Purpose:** Full history of a customer/card/device, independent of any single transaction — for when a case needs deeper context.

**Sections:** profile summary, full transaction history, past decisions on this entity, risk trend over time, linked accounts

**KPIs:** lifetime volume, historical fraud flags, chargeback count, account age

---

### 2.4 My Performance
**Purpose:** Personal scorecard — every serious fraud-ops team tracks analyst accuracy, since bad decisions cost money either way (false decline = lost revenue, false approve = fraud loss).

**Sections:** cases reviewed (day/week/month), decision breakdown, accuracy vs. confirmed outcome, avg handling time, SLA compliance

**KPIs:** throughput, accuracy rate, avg handling time (AHT), escalation rate

---

### 2.5 Alerts / Notifications Inbox
**Purpose:** Real-time feed off your WebSocket hub for new high-priority cases.

**Sections:** notification feed, jump-to-case, read/unread

**Settings/Config:** which risk bands trigger push/email notifications

---

## 3. VIEWER — Pages

### 3.1 Executive Overview *(landing page)*
**Purpose:** Three-numbers-and-a-trend for someone checking in weekly, not hourly.

**Sections:** fraud rate trend, $ fraud prevented, total transactions monitored, top fraud typologies, geographic heatmap

**KPIs:** fraud rate %, $ prevented, txn volume, false positive rate, chargeback rate, approval rate

**Settings/Config:** date range picker, export to PDF/CSV (the only interactive elements on this whole role)

---

### 3.2 Analytics & Reports
**Purpose:** Self-serve drill-down without needing to ask an engineer for a custom query.

**Sections:** report builder (metric × dimension × date range), saved report library, scheduled email reports

**Settings/Config:** report scheduling, export format

---

### 3.3 Model Performance *(read-only)*
**Purpose:** Model risk governance/transparency — compliance teams at real fintechs need to see this without being able to touch the threshold (same data as 1.2, permission-stripped).

**Sections:** PR-AUC/ROC-AUC trend, drift indicators, model version changelog

---

### 3.4 Case Outcomes / Audit Trail *(read-only)*
**Purpose:** Compliance sampling of reviewer decisions.

**Sections:** searchable table of closed cases — decision, reviewer, reason code, linked evidence

**Settings/Config:** export only

---

## 4. Visual System

### Design philosophy
Aegis is literally named after a shield — lean into "vigilant, not alarming." Fraud dashboards get this wrong two ways: either they look like a generic SaaS admin panel (no urgency) or they look like a hacker-movie terminal (constant false alarm fatigue). The right target is **a SOC-style dark interface with disciplined, meaningful color** — color that means something (risk level) rather than color as decoration.

I'm deliberately steering away from the two AI-dashboard defaults you'll see everywhere right now: warm cream + terracotta (feels like a marketing site, wrong register entirely) and pure black + neon-green/vermilion (reads as a stock "hacker" cliché, and burns out any real alerting color). Aegis instead uses a **deep ink-navy base** (not true black — easier on the eyes across a long review shift) with a **restrained indigo accent** for interactive elements, keeping red/amber/green completely reserved for risk meaning so they never get diluted.

### Core palette (dark mode — default for Admin & Reviewer)

| Token | Hex | Use |
|---|---|---|
| `bg-base` | `#0A0E14` | App background |
| `bg-surface` | `#121822` | Cards, panels, table rows |
| `bg-surface-hover` | `#1A2230` | Hover/active states |
| `border` | `#232C3A` | Dividers, table borders |
| `text-primary` | `#E8EDF4` | Primary text |
| `text-secondary` | `#8D9AAB` | Labels, metadata |
| `text-disabled` | `#4E5A6B` | Disabled states |
| `accent` (brand) | `#5C6EF8` | Buttons, links, active nav, focus rings |

### Semantic risk colors (identical meaning across all three roles — never repurpose these)

| Meaning | Hex | Use |
|---|---|---|
| Critical / Decline | `#E5484D` | High risk score, decline decisions, SLA breach |
| Medium / Review | `#F5A524` | Medium risk, pending review, warnings |
| Low / Approved | `#12B76A` | Low risk, approved, healthy system status |
| Informational | `#4CC2FF` | New case, informational badges, neutral status |

**Accessibility note:** don't rely on color alone for risk — pair each risk color with a distinct icon/shape (triangle for critical, circle for medium, check for low). ~8% of men have red-green color blindness, and in a tool where misreading risk has real financial consequences, redundant coding isn't optional polish.

### Light mode (default for Viewer; toggle available everywhere)

| Token | Hex |
|---|---|
| `bg-base` | `#F7F9FC` |
| `bg-surface` | `#FFFFFF` |
| `border` | `#E3E8EF` |
| `text-primary` | `#101828` |
| `text-secondary` | `#475467` |
| `accent` | `#4B5FE0` |
| Critical / Medium / Low | `#D92D20` / `#DC6803` / `#039855` *(deepened slightly for AA contrast on white)* |

### Typography

- **UI & body:** Inter or IBM Plex Sans — neutral, excellent at small sizes, the same register Stripe/Plaid-tier fintechs use. Don't reach for a "characterful" display face here; this is an ops tool, not a marketing page.
- **Numeric/tabular data:** IBM Plex Mono or JetBrains Mono with `font-variant-numeric: tabular-nums` for amounts, transaction IDs, timestamps, and risk scores. This one choice does more for table scannability than almost anything else — misaligned digits in a $ column is the single most common "this looks unpolished" tell in fintech UI.

### The one signature element
Use a consistent **radial risk gauge** (a partial ring, 0–100) as the risk-score visual everywhere — queue table, case detail header, model performance page. It's a small shield-notch motif that ties back to "Aegis" without being literal or cute, and gives users one visual pattern they learn once and recognize everywhere in the product.

### Role-level tone, same system
- **Admin:** indigo accent dominant (this is a control surface)
- **Reviewer:** dense tables, risk colors do a lot of work, indigo reserved for primary actions (Approve/Decline buttons should NOT be red/green — use neutral filled buttons with an icon, since red/green are already claimed by risk meaning)
- **Viewer:** more whitespace, charts-forward, minimal tables — this role should feel like a briefing, not a workbench