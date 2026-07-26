ALTER TABLE rules
ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id) ON DELETE SET NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES queues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_queue_status ON transactions(queue_id, status);
