CREATE TABLE fraud_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    fraud_score     NUMERIC(5,4) NOT NULL,   -- 0.0000 to 1.0000
    is_fraud        BOOLEAN NOT NULL,
    threshold_used  NUMERIC(5,4) NOT NULL,   -- active threshold at scoring time
    auto_blocked    BOOLEAN DEFAULT false,
    model_version   TEXT NOT NULL,           -- e.g. v1.2.0
    feature_weights JSONB NOT NULL,          -- SHAP values per feature
    inference_ms    INTEGER,                 -- ML latency tracking
    trace_id        TEXT,                    -- OTel trace for this transaction
    scored_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_fraud_results_tx ON fraud_results(transaction_id);
