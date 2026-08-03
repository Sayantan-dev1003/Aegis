-- Migration: Create sla_breaches table to record SLA breach events without duplicating transactions

CREATE TABLE IF NOT EXISTS sla_breaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    original_queue_id UUID NOT NULL REFERENCES queues(id),
    fallback_queue_id UUID REFERENCES queues(id),
    tier INT NOT NULL DEFAULT 1,
    sla_target_minutes INT NOT NULL DEFAULT 15,
    sla_remaining_seconds INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'breached',
    breached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sla_breaches_transaction_id ON sla_breaches(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_original_queue_id ON sla_breaches(original_queue_id);
CREATE INDEX IF NOT EXISTS idx_sla_breaches_breached_at ON sla_breaches(breached_at);
