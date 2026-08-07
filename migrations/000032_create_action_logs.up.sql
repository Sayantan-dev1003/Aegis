-- Migration: Create action_logs table

CREATE TABLE IF NOT EXISTS action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES analysts(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'INGESTED', 'QUEUED', 'SLA_STARTED', 'CLAIMED', 'ESCALATED', 'REVIEWED'
    action_payload JSONB DEFAULT '{}', -- Flexible payload for specific action details
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_logs_transaction_id ON action_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);
