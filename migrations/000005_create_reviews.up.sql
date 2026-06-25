CREATE TABLE reviews (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    analyst_id     UUID NOT NULL REFERENCES analysts(id) ON DELETE CASCADE,
    decision       TEXT NOT NULL
        CHECK (decision IN ('confirmed_fraud', 'false_positive', 'escalated')),
    notes          TEXT,
    reviewed_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_reviews_transaction ON reviews(transaction_id);
