CREATE TABLE audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analyst_id UUID REFERENCES analysts(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,   -- LOGIN, REVIEW_SUBMIT, CONFIG_UPDATE
    resource   TEXT,            -- transaction_id or config key
    metadata   JSONB DEFAULT '{}',
    ip_address INET,
    trace_id   TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_analyst ON audit_logs(analyst_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
