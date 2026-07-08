-- Alter the fraud_results table to match the expected Phase 7 schema

-- Drop columns that are no longer needed
ALTER TABLE fraud_results DROP COLUMN IF EXISTS threshold_used;
ALTER TABLE fraud_results DROP COLUMN IF EXISTS feature_weights;
ALTER TABLE fraud_results DROP COLUMN IF EXISTS inference_ms;
ALTER TABLE fraud_results DROP COLUMN IF EXISTS trace_id;

-- Add shap_values column
ALTER TABLE fraud_results ADD COLUMN IF NOT EXISTS shap_values JSONB;

-- Rename scored_at to created_at
ALTER TABLE fraud_results RENAME COLUMN scored_at TO created_at;

-- Allow model_version to be nullable
ALTER TABLE fraud_results ALTER COLUMN model_version DROP NOT NULL;

-- Ensure fraud_score is FLOAT instead of NUMERIC(5,4)
ALTER TABLE fraud_results ALTER COLUMN fraud_score TYPE DOUBLE PRECISION;

-- Drop the old index and add explicit unique constraint
DROP INDEX IF EXISTS idx_fraud_results_tx;
ALTER TABLE fraud_results DROP CONSTRAINT IF EXISTS fraud_results_transaction_id_key;
ALTER TABLE fraud_results ADD CONSTRAINT fraud_results_transaction_id_key UNIQUE (transaction_id);
