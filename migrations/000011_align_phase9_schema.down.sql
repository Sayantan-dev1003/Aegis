-- 1. Revert transactions status constraint
ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check 
    CHECK (status IN ('pending', 'scored', 'auto_blocked', 'reviewed', 'scoring_failed'));

-- 2. Revert reviews table
UPDATE reviews SET decision = 'false_positive' WHERE decision = 'legitimate';
UPDATE reviews SET decision = 'escalated' WHERE decision = 'escalate';

ALTER TABLE reviews DROP CONSTRAINT reviews_decision_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_decision_check 
    CHECK (decision IN ('confirmed_fraud', 'false_positive', 'escalated'));
ALTER TABLE reviews DROP COLUMN IF EXISTS created_at;
ALTER TABLE reviews RENAME COLUMN reviewer_id TO analyst_id;

-- 3. Revert audit_logs table
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS trace_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource TEXT;

UPDATE audit_logs SET metadata = new_value::jsonb WHERE new_value IS NOT NULL AND new_value LIKE '{%}';
UPDATE audit_logs SET resource = resource_id::text;

ALTER TABLE audit_logs DROP COLUMN IF EXISTS resource_type;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS old_value;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS new_value;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS user_agent;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS resource_id;

ALTER TABLE audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_logs RENAME COLUMN actor_id TO analyst_id;

-- 4. Revert system_config
DELETE FROM system_config WHERE key IN ('review_threshold', 'max_transaction_amount', 'dlq_max_requeue_attempts');
UPDATE system_config SET value = '0.92' WHERE key = 'auto_block_threshold' AND value = '0.85';
