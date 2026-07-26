DROP INDEX IF EXISTS idx_transactions_queue_status;

ALTER TABLE transactions
DROP COLUMN IF EXISTS queue_id;

ALTER TABLE rules
DROP COLUMN IF EXISTS queue_id;
