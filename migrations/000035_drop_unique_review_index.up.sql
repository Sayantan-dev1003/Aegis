DROP INDEX IF EXISTS idx_reviews_transaction;
CREATE INDEX IF NOT EXISTS idx_reviews_txn_id ON reviews(transaction_id);
