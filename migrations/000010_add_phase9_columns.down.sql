ALTER TABLE transactions DROP COLUMN IF EXISTS requeue_count;
ALTER TABLE transactions DROP COLUMN IF EXISTS last_requeued_at;
ALTER TABLE transactions DROP COLUMN IF EXISTS updated_at;
