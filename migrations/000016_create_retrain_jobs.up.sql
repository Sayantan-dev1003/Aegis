CREATE TABLE IF NOT EXISTS retrain_jobs (
    id VARCHAR(50) PRIMARY KEY,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_sec INT,
    triggered_by VARCHAR(255)
);
