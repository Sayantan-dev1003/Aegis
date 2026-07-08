-- Revert fraud_results table changes

ALTER TABLE fraud_results DROP CONSTRAINT IF EXISTS fraud_results_transaction_id_key;
CREATE UNIQUE INDEX idx_fraud_results_tx ON fraud_results(transaction_id);

ALTER TABLE fraud_results ALTER COLUMN fraud_score TYPE NUMERIC(5,4);

ALTER TABLE fraud_results ALTER COLUMN model_version SET NOT NULL;

ALTER TABLE fraud_results RENAME COLUMN created_at TO scored_at;

ALTER TABLE fraud_results DROP COLUMN IF EXISTS shap_values;

ALTER TABLE fraud_results ADD COLUMN threshold_used NUMERIC(5,4) NOT NULL DEFAULT 0.8500;
ALTER TABLE fraud_results ADD COLUMN feature_weights JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE fraud_results ADD COLUMN inference_ms INTEGER;
ALTER TABLE fraud_results ADD COLUMN trace_id TEXT;
