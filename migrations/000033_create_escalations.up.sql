-- Migration: Create escalations table

CREATE TABLE IF NOT EXISTS escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    escalated_by UUID REFERENCES analysts(id) ON DELETE SET NULL,
    original_queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    target_queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
    target_analyst_id UUID REFERENCES analysts(id) ON DELETE SET NULL,
    reason_code VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escalations_transaction_id ON escalations(transaction_id);
