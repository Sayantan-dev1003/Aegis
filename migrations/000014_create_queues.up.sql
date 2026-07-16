CREATE TABLE IF NOT EXISTS queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    sla_target_minutes INT NOT NULL DEFAULT 60,
    assignment_rule TEXT,
    coverage_start TIME,
    coverage_end TIME,
    timezone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger for updated_at
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON queues
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();

-- Update reviews table with queue_id
ALTER TABLE reviews
ADD COLUMN queue_id UUID REFERENCES queues(id) ON DELETE SET NULL;
