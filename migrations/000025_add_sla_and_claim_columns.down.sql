-- Revert Migration 000025: Drop SLA tracking, claim gating, and priority level columns

DROP INDEX IF EXISTS idx_transactions_priority_level;
DROP INDEX IF EXISTS idx_transactions_sla_start_at;
DROP INDEX IF EXISTS idx_transactions_claimed_by;

ALTER TABLE transactions
DROP COLUMN IF EXISTS priority_level,
DROP COLUMN IF EXISTS sla_remaining_seconds,
DROP COLUMN IF EXISTS sla_start_at,
DROP COLUMN IF EXISTS claimed_at,
DROP COLUMN IF EXISTS claimed_by;
