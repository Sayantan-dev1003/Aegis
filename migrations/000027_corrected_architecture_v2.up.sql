-- Migration: Corrected Architecture v2 schema upgrades

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS risk_score DOUBLE PRECISION NULL,
ADD COLUMN IF NOT EXISTS risk_band VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS risk_source VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS reject_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS step_up_result VARCHAR(20) NULL,
ADD COLUMN IF NOT EXISTS sla_breach_type VARCHAR(50) NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS requires_admin_review BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ NULL;

-- Update status constraint on transactions table
DO $$
BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE transactions
ADD CONSTRAINT transactions_status_check
CHECK (status IN (
    'received', 'pending', 'step_up_pending', 'escalated', 'auto_blocked',
    'scored_approved', 'reviewed', 'processing', 'scored', 'scoring_failed',
    'breached', 'claimed', 'approved', 'rejected'
));

CREATE TABLE IF NOT EXISTS block_audit_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    sampled_reason VARCHAR(50) NOT NULL CHECK (sampled_reason IN ('random', 'low_score_despite_block', 'ml_auto_block')),
    reviewed_by UUID REFERENCES analysts(id) ON DELETE SET NULL,
    verdict VARCHAR(50) NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to incidents table for negligence, timeouts, and escalation tracking
ALTER TABLE incidents
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES analysts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS incident_type VARCHAR(50) NULL,
ADD COLUMN IF NOT EXISTS sla_breach_type VARCHAR(50) NOT NULL DEFAULT 'none';

-- Seed Admin Escalations queue in queues table
INSERT INTO queues (id, name, description, status, sla_target_minutes, created_at, updated_at)
SELECT gen_random_uuid(), 'Admin Escalations', 'Queue for reject-cap hits, SLA negligence, and investigation timeouts requiring admin review', 'active', 30, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM queues WHERE name = 'Admin Escalations'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_risk_score ON transactions(risk_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_transactions_reject_count ON transactions(reject_count);
CREATE INDEX IF NOT EXISTS idx_block_audit_samples_sampled_reason ON block_audit_samples(sampled_reason);
CREATE INDEX IF NOT EXISTS idx_incidents_reviewer_id ON incidents(reviewer_id);
