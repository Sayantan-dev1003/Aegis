# Aegis — Corrected Transaction Review Architecture (v2)

## 0. What changed and why

The original design had five structural faults. This version fixes all five. Read this section first — everything below builds on these five decisions.

1. **Rules and ML now run in parallel, not sequentially.** In v1, if a rule flagged or blocked a transaction, the Kafka outbox event was skipped entirely (`skipML = true`). ML never saw rule-caught transactions. This created two problems: reviewers had no risk signal to prioritize their queue (pure FIFO), and the ML model was trained/scored only on the "easy" transactions that bypassed rules — a textbook selection-bias trap that guarantees model drift. **Fix:** every transaction, regardless of rule outcome, gets an outbox event and an ML risk score. Rules decide the *action* (block / flag / step-up / pass); ML always contributes a *risk score* that enriches whatever path the transaction is already on.

2. **Auto-blocked transactions get audit sampling.** In v1, `auto_blocked` was a dead end — no human ever looks at it again, so a misconfigured rule threshold can silently block real customers forever. **Fix:** a lightweight audit-sample queue pulls a subset of blocked transactions (randomly + risk-weighted) for periodic human sanity-checks.

3. **"Step Up" is now a fully specified state**, not a mystery third action that exists in the UI but nowhere in the workflow docs.

4. **SLA breach logic is now symmetric.** In v1, a reviewer who *proactively rejected* a case (honest behavior) got *less* time in the Default Queue, while a reviewer who silently let the SLA expire (negligent behavior) got a *full fresh* SLA. This rewards negligence over honesty. **Fix:** reject → full fresh SLA. Silent breach → reduced SLA + logged as a negligence incident against that reviewer.

5. **The reject loop is capped.** In v1, nothing stopped a case from bouncing between queues indefinitely if every reviewer rejected it. **Fix:** one reject is allowed; a second forces mandatory claim by Admin, no further reject option.

---

## 1. Complete status state machine

| Status | Meaning | Set by | Terminal? |
|---|---|---|---|
| `received` | Transaction persisted, about to be rule-evaluated (sub-millisecond, transient) | Ingest API | No |
| `pending` | No deterministic rule matched — outcome rests solely on ML | Rule engine | No |
| `step_up_pending` | Rule requires customer-side verification (OTP / 2FA / document) before proceeding | Rule engine | No |
| `escalated` | Sitting in a reviewer queue awaiting human decision | Rule engine **or** ML (borderline score) | No |
| `auto_blocked` | Hard-blocked by a deterministic rule | Rule engine (or ML, in rare high-confidence cases) | Yes, but eligible for audit sampling |
| `scored_approved` | ML-only path resolved as low risk, no rule triggered | ML worker | Yes |
| `reviewed` | Human verdict recorded (`confirmed_fraud` / `false_positive`) | Reviewer | Yes |

New/changed columns on `transactions`:

- `risk_score` (float, 0–1, nullable until ML responds)
- `risk_band` (`low` / `medium` / `high`)
- `risk_source` (`rule` / `ml` / `hybrid`) — tells you *why* the current status was set
- `reject_count` (int, default 0)
- `step_up_result` (`pending` / `passed` / `failed` / `timeout`, nullable)
- `sla_breach_type` (`none` / `manual_reject` / `auto_breach`) — used for the symmetric SLA fix and for reviewer performance tracking

New table: `block_audit_samples` — `transaction_id`, `sampled_reason` (`random` / `low_score_despite_block`), `reviewed_by`, `verdict`, `reviewed_at`.

---

## 2. The corrected flow, in words

1. **Ingest.** `POST /api/v1/ingest/transactions` hits. Transaction is written with `status = received`.
2. **Synchronous rule evaluation.** In the same DB transaction as the write, the rules engine evaluates all active rules against this transaction. This produces one action: `block`, `flag`, `step_up`, or nothing.
3. **Unconditional outbox write.** Regardless of what step 2 produced, an `outbox_events` row is written **every single time**. There is no `skipML` flag anymore. This is the single most important change — it's what makes rules and ML parallel instead of sequential.
4. **Status assignment based on rule action:**
   - `block` → `status = auto_blocked` (terminal, no queue)
   - `flag` → `status = escalated`, `queue_id` assigned via the existing priority hierarchy (VIP > ATO > AML/KYC > General)
   - `step_up` → `status = step_up_pending`, verification challenge triggered
   - nothing matched → `status = pending`
5. **Kafka relay → ML worker (async, always runs).** The ML worker consumes every event from step 3, computes `risk_score` and `risk_band`, and writes it back to the transaction row. What happens next depends on the status the transaction already has:
   - If `pending`: the ML score **is** the decision. Low → `scored_approved`. Medium/high → `escalated` into the **ML Borderline Review** queue (this queue already exists in your Queue Config — it was just never being used, because `skipML` meant nothing ever reached it from the pending path in a meaningful volume, and nothing from the rule path reached it at all).
   - If `escalated` (rule-flagged): the score is written to the existing row as an enrichment field. It does **not** change the status or queue — it changes the **ordering** of the reviewer's worklist, so the highest-risk case in their queue surfaces first instead of pure FIFO.
   - If `auto_blocked`: the score is written for audit purposes. If the score is surprisingly low despite the block (e.g. below an "audit threshold" like 0.2), the transaction is added to `block_audit_samples` for later human review. The transaction itself stays blocked — this is monitoring, not un-blocking.
   - If `step_up_pending`: the score is cached and used once the step-up challenge resolves (see Case 8 below).
6. **Reviewer worklist (Claim/Reject gate), unchanged structurally, with two fixes:**
   - **Symmetric SLA:** manual reject → pushed to Default Queue with a full fresh SLA. Silent SLA breach → pushed to Default Queue with a *reduced* SLA (e.g. half the standard window) and an incident is logged against the original reviewer for performance review.
   - **Reject cap:** `reject_count` increments on every reject. On the second reject, the transaction is force-escalated to Admin with mandatory claim — no reject option is shown.
7. **Verdict.** Reviewer submits `Legitimate` or `Confirmed Fraud`. Written to `reviews` table. `transactions.status = reviewed`.
8. **Tier-2 SLA breach (Default Queue also expires).** In v1 this triggered a fresh Kafka emission and a wait for ML scoring — slow, because the event was never sent earlier. In v2, the ML score was **already computed at ingestion** (step 5), so the system can resolve immediately using the cached score: low → `scored_approved`, medium/high → routed to ML Borderline Review, is treated as a fresh high-priority case. No additional Kafka round-trip needed unless the cached score is stale (older than a configurable freshness window, e.g. 30 minutes — in which case a re-score event is emitted).
9. **Feedback loop.** Every `reviews` table entry (from both rule-caught and ML-caught cases, since rule-caught cases now also carry ML scores) becomes labeled training data for periodic model retraining. This closes the selection-bias gap from v1, where the model only ever saw transactions that bypassed rules.

---

## 3. Worked example: 100 transactions hit the ingest API

Say a batch of 100 transactions arrives.

**Step 1 — all 100 persisted, all 100 get an outbox event.** No exceptions, regardless of what happens in rule evaluation.

**Step 2 — synchronous rule evaluation produces this split** (illustrative, based on your actual configured rules):

- 6 transactions match a `block` rule (Fraud Ring Detection, Suspicious IP Activity, Payment Testing Attack) → `auto_blocked`
- 2 transactions match a `step_up` rule (ATO Prevention, Shared Network Protection) → `step_up_pending`
- 14 transactions match a `flag` rule → `escalated`, routed by priority (e.g. a transaction matching both "VIP Ultra-High Value" and "Structuring Pattern" goes to VIP / White-Glove Support, since VIP is Priority 1)
- 78 transactions match nothing → `pending`

**Step 3 — Kafka/ML worker processes all 100 asynchronously, within a few seconds:**

- Of the 78 `pending`: 70 score low → `scored_approved`. 6 score medium/high → escalated into **ML Borderline Review**. 2 score very high → `auto_blocked` (ML-triggered, `risk_source = ml`, distinguishable in the Audit Log from rule-triggered blocks).
- Of the 14 rule-`escalated`: each gets a `risk_score` written. Reviewers now see their worklist sorted highest-risk-first instead of FIFO.
- Of the 6 rule-`auto_blocked`: say 1 scores unexpectedly low (0.12). It's added to `block_audit_samples` — flagged for someone to sanity-check whether the rule threshold is too aggressive.
- Of the 2 `step_up_pending`: scores are cached, used once the customer completes or fails the challenge.

End state after processing: 70 auto-approved, 8 escalated to ML Borderline Review (6 pending-turned-borderline + 2 ML-triggered blocks logged separately), 6 auto-blocked (1 flagged for audit), 14 in rule-based queues (now risk-sorted), 2 in step-up limbo. Every single one of the 100 has a risk score attached somewhere in the system — nothing is invisible to ML anymore.

---

## 4. Case studies (all paths covered)

### Case 1 — Clean transaction, low ML risk
Transaction hits ingest, no rule matches → `pending`. ML worker scores it 0.08 (low). Status → `scored_approved`. No human ever touches it. Shows up in Admin/Viewer ledger as "scored".

### Case 2 — Clean transaction, ML borderline
No rule matches → `pending`. ML scores 0.55 (medium). Status → `escalated`, `queue_id = ML Borderline Review`, `risk_source = ml`. This is exactly what that queue was built for — in v1 it was almost never populated correctly because the pending path could reach it but the far more common rule-bypass path (skipped ML entirely) never fed it useful volume for model feedback.

### Case 3 — Rule-flagged, multiple rules matched, priority routing
A $1.2M transaction from a new device also trips a structuring-pattern velocity rule. Both "VIP Ultra-High Value Clearance" (Priority 1) and "Structuring / Smurfing Pattern" (Priority 3) fire. Priority hierarchy wins → routed to VIP / White-Glove Support, SLA = 10 minutes. In parallel, ML scores it 0.15 (low) — this doesn't change the queue, but it tells the reviewer "this one's probably fine, high amount but low behavioral risk," letting them triage faster if they have multiple VIP cases open.

### Case 4 — Tier-1 SLA breach (primary queue negligence)
A Chargeback & Dispute Review case sits unclaimed for 60 minutes (SLA expired, reviewer never acted). System auto-escalates: severity bumped to High Risk Priority, pushed to Default Queue. Under the symmetric fix, this is a *silent breach*, so it gets a **reduced** SLA (e.g. 30 minutes instead of the standard 60) and an incident is logged against the original reviewer (`sla_breach_type = auto_breach`) for performance tracking.

### Case 5 — Manual reject (honest behavior, rewarded)
An ATO Suspects reviewer has a conflict of interest and rejects the case before claiming. Under the symmetric fix, this pushes to Default Queue with a **full fresh SLA** (`sla_breach_type = manual_reject`) — proactive honesty is not penalized with less time.

### Case 6 — Reject cap hit
The Default Queue reviewer also rejects the same case from Case 5. `reject_count` is now 2. The cap triggers: the case is force-escalated to Admin, with mandatory claim — the reject button is no longer shown. This prevents indefinite bouncing.

### Case 7 — Tier-2 SLA breach (Default Queue also expires)
A case breaches SLA even in the Default Queue — manual review has fully failed. In v1 this triggers a fresh Kafka emission and a wait. In v2, the ML score was already computed back at ingestion (Case 3-style parallel scoring), so the system resolves immediately using the cached score — if still fresh (< 30 min old), no extra round-trip. Low score → `scored_approved`. Medium/high → routed into ML Borderline Review as a new high-priority case.

### Case 8 — Step-up flow, pass and fail branches
A transaction trips "Account Takeover (ATO) Prevention" (`velocity >= 7`) → `step_up_pending`. Customer is challenged with OTP.
- **Pass within window:** `step_up_result = passed`. System checks the cached ML score (computed in parallel at ingestion). If low → `scored_approved`. If medium/high despite passing step-up → still routed to `escalated` in Account Takeover Suspects for a final human check.
- **Fail or timeout:** `step_up_result = failed` or `timeout`. Transaction is immediately escalated to Account Takeover Suspects queue with elevated priority (bypasses normal SLA queueing — treated as already-breached urgency), since a failed step-up is a strong fraud signal.

### Case 9 — Block with audit sampling catching a possible false positive
A transaction trips "Fraud Ring Detection" (`device velocity >= 10`) → `auto_blocked` instantly, customer sees decline. In parallel, ML scores it 0.11 — surprisingly low for something that got hard-blocked. Because it's below the audit threshold, it's added to `block_audit_samples`. An Admin reviews it later, finds the device velocity rule threshold is catching a shared-office-WiFi false positive pattern, and adjusts the rule. The customer was still blocked in the moment (rules stay authoritative for blocking decisions — that's correct for fraud prevention), but the system now has a mechanism to detect and fix a bad rule instead of that customer being silently blocked forever.

### Case 10 — VIP queue real-time alert
Your actual data shows VIP / White-Glove Support has a 10-minute SLA and a 100% breach rate. A 10-minute window cannot rely on a reviewer occasionally glancing at a dashboard. Fix: any transaction entering a queue with SLA ≤ 15 minutes triggers an immediate push notification (Slack/SMS/webhook) to the assigned reviewer and a secondary alert to Admin if unclaimed after half the SLA window has elapsed. This is an operational fix, not just an architectural one, but it's necessary — the architecture can be perfect and still fail if nobody sees the case in time.

---

## 5. Cleanup items in current configuration

- Rules with `action = block` (Fraud Ring Detection, Suspicious IP Activity, Payment Testing Attack) currently show `Default Fallback` as their target queue. Since blocked transactions never route to any queue, this field is misleading in the UI. Either hide the target-queue field entirely for block-action rules, or repurpose it to mean "which audit queue this block's samples go to" (i.e., point it at `block_audit_samples` conceptually).
- "Step Up" action needs to be documented in the same place as `block`/`flag` — right now it's live in two rules (ATO Prevention, Shared Network Protection, one of which has already triggered once) with no corresponding workflow spec.

---

## 6. RBAC alignment (uses your existing Admin / Reviewer / Viewer roles — no new role needed)

- **Reviewer:** works assigned-queue worklists, claims/rejects/verdicts, same as before.
- **Admin:** handles reject-cap escalations (Case 6), reviews `block_audit_samples` (Case 9), tunes rule thresholds, configures per-queue alert thresholds.
- **Viewer:** unchanged, read-only across all ledgers including the new `risk_score` column and audit sample outcomes.

---

## 7. One-line summary of the fix

Rules decide **what happens right now** (block / flag / step-up / pass). ML decides **how urgently a human should care**, and it gets a vote on every transaction, all the time — not just the ones rules didn't already touch.
