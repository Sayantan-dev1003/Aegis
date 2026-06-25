CREATE TABLE transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id       TEXT UNIQUE NOT NULL,  -- bank's own transaction ID
    account_id        TEXT NOT NULL,
    merchant_id       TEXT NOT NULL,
    merchant_name     TEXT NOT NULL,
    merchant_category TEXT NOT NULL,         -- MCC code label
    amount            NUMERIC(12,2) NOT NULL,
    currency          CHAR(3) NOT NULL DEFAULT 'INR',
    country_code      CHAR(2) NOT NULL,
    transaction_type  TEXT NOT NULL,         -- purchase / withdrawal / transfer
    channel           TEXT NOT NULL,         -- online / pos / atm
    device_id         TEXT,
    ip_address        INET,
    timestamp         TIMESTAMPTZ NOT NULL,  -- when bank says txn happened
    ingested_at       TIMESTAMPTZ DEFAULT NOW(),
    status            TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'scored', 'auto_blocked', 'reviewed', 'scoring_failed'))
);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_timestamp  ON transactions(timestamp DESC);
CREATE INDEX idx_transactions_status     ON transactions(status);
