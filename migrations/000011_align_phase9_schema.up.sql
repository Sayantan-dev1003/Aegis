-- 1. Update transactions status constraint
ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check 
    CHECK (status IN ('pending', 'processing', 'scored', 'auto_blocked', 'reviewed', 'escalated', 'scoring_failed'));

-- 2. Alter reviews table
ALTER TABLE reviews RENAME COLUMN analyst_id TO reviewer_id;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE reviews DROP CONSTRAINT reviews_decision_check;
ALTER TABLE reviews ADD CONSTRAINT reviews_decision_check 
    CHECK (decision IN ('legitimate', 'confirmed_fraud', 'escalate'));

-- Update existing data in reviews (if any) to match new constraint
UPDATE reviews SET decision = 'legitimate' WHERE decision = 'false_positive';
UPDATE reviews SET decision = 'escalate' WHERE decision = 'escalated';

-- 3. Alter audit_logs table
ALTER TABLE audit_logs RENAME COLUMN analyst_id TO actor_id;
ALTER TABLE audit_logs ALTER COLUMN actor_id SET NOT NULL;
ALTER TABLE audit_logs RENAME COLUMN resource TO resource_id_text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID;

-- Try converting existing text to UUID
UPDATE audit_logs SET resource_id = resource_id_text::uuid WHERE resource_id_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
ALTER TABLE audit_logs DROP COLUMN resource_id_text;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50) NOT NULL DEFAULT 'unknown';
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Move metadata into new_value if we want to preserve it, else just drop
UPDATE audit_logs SET new_value = metadata::text WHERE metadata IS NOT NULL AND metadata::text != '{}';
ALTER TABLE audit_logs DROP COLUMN IF EXISTS metadata;
ALTER TABLE audit_logs DROP COLUMN IF EXISTS trace_id;

-- 4. Update system_config
-- Insert new configs
INSERT INTO system_config (key, value, description) VALUES
    ('review_threshold', '0.60', 'Fraud score threshold for flagging for manual review'),
    ('max_transaction_amount', '50000', 'Maximum allowed transaction amount in INR'),
    ('dlq_max_requeue_attempts', '3', 'Maximum times a DLQ transaction can be requeued')
ON CONFLICT (key) DO NOTHING;

-- Update auto_block_threshold default if not changed
UPDATE system_config SET value = '0.85' WHERE key = 'auto_block_threshold' AND value = '0.92';
