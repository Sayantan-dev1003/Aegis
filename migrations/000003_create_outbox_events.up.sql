CREATE TABLE outbox_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,       -- transaction_id
    event_type   TEXT NOT NULL,       -- transaction.created
    payload      JSONB NOT NULL,
    published    BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outbox_unpublished
    ON outbox_events(published, created_at)
    WHERE published = false;
