-- Migration 000029: Remove step-up flow
-- 1. Drop the step_up_result column
ALTER TABLE transactions
DROP COLUMN IF EXISTS step_up_result;

-- 2. Rebuild status CHECK constraint without step_up_pending
DO $$
BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE transactions
ADD CONSTRAINT transactions_status_check
CHECK (status IN (
    'received', 'pending', 'escalated', 'auto_blocked',
    'scored_approved', 'reviewed', 'processing', 'scored', 'scoring_failed',
    'breached', 'claimed', 'approved', 'rejected'
));

-- 3. Remap rules that had action = 'step_up' to action = 'flag'
--    and target the "Account Takeover Suspects" queue with HIGH priority.
UPDATE rules
SET
    action   = 'flag',
    queue_id = (SELECT id FROM queues WHERE name = 'Account Takeover Suspects' LIMIT 1)
WHERE action = 'step_up';
