DROP INDEX IF EXISTS idx_reviews_txn_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_transaction ON reviews(transaction_id);
