CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity TEXT NOT NULL,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL,
    value NUMERIC NOT NULL,
    "window" TEXT,
    action TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS velocity_config (
    entity TEXT PRIMARY KEY,
    windows JSONB NOT NULL
);

-- Trigger for updated_at
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON rules
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
