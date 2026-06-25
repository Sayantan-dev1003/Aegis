CREATE TABLE model_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version      TEXT UNIQUE NOT NULL,  -- v1.0.0, v1.1.0
    artifact_path TEXT NOT NULL,
    f1_score     NUMERIC(5,4),
    precision    NUMERIC(5,4),
    recall       NUMERIC(5,4),
    is_active    BOOLEAN DEFAULT false,
    trained_at   TIMESTAMPTZ NOT NULL,
    deployed_at  TIMESTAMPTZ
);
