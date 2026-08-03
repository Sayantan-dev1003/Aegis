-- Migration: Add SLA tracking, claim gating, and priority level columns to transactions table

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES analysts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_start_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS sla_remaining_seconds INTEGER NULL,
ADD COLUMN IF NOT EXISTS priority_level TEXT NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_transactions_claimed_by ON transactions(claimed_by);
CREATE INDEX IF NOT EXISTS idx_transactions_sla_start_at ON transactions(sla_start_at);
CREATE INDEX IF NOT EXISTS idx_transactions_priority_level ON transactions(priority_level);
