CREATE TABLE system_config (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES analysts(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO system_config (key, value, description, updated_by, updated_at) VALUES
    ('fraud_threshold',       '0.75', 'Min score to flag as fraud',          null, NOW()),
    ('auto_block_threshold',  '0.92', 'Score for immediate auto-block',      null, NOW()),
    ('fraud_spike_alert_rate','0.05', 'Rate to trigger spike alert',         null, NOW())
ON CONFLICT (key) DO NOTHING;
