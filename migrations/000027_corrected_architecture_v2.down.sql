-- Migration: Reverse Corrected Architecture v2 schema upgrades

DROP INDEX IF EXISTS idx_incidents_reviewer_id;
DROP INDEX IF EXISTS idx_block_audit_samples_sampled_reason;
DROP INDEX IF EXISTS idx_transactions_reject_count;
DROP INDEX IF EXISTS idx_transactions_risk_score;

ALTER TABLE incidents
DROP COLUMN IF EXISTS sla_breach_type,
DROP COLUMN IF EXISTS incident_type,
DROP COLUMN IF EXISTS reviewer_id,
DROP COLUMN IF EXISTS queue_id,
DROP COLUMN IF EXISTS transaction_id;

DROP TABLE IF EXISTS block_audit_samples;

ALTER TABLE transactions
DROP COLUMN IF EXISTS sla_paused_at,
DROP COLUMN IF EXISTS requires_admin_review,
DROP COLUMN IF EXISTS sla_breach_type,
DROP COLUMN IF EXISTS step_up_result,
DROP COLUMN IF EXISTS reject_count,
DROP COLUMN IF EXISTS risk_source,
DROP COLUMN IF EXISTS risk_band,
DROP COLUMN IF EXISTS risk_score;
