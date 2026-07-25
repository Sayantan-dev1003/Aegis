CREATE TABLE IF NOT EXISTS velocity_config (
    entity VARCHAR(50) PRIMARY KEY,
    windows JSONB NOT NULL DEFAULT '[]'::jsonb
);
