-- Migration 000029 (down): Restore step-up flow

-- 1. Re-add step_up_result column
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS step_up_result VARCHAR(20) NULL;

-- 2. Rebuild status CHECK constraint with step_up_pending
DO $$
BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE transactions
ADD CONSTRAINT transactions_status_check
CHECK (status IN (
    'received', 'pending', 'step_up_pending', 'escalated', 'auto_blocked',
    'scored_approved', 'reviewed', 'processing', 'scored', 'scoring_failed',
    'breached', 'claimed', 'approved', 'rejected'
));

-- 3. Revert rules that were remapped: set action back to 'step_up'
--    for "Account Takeover (ATO) Prevention" and "Shared Network Protection"
UPDATE rules
SET
    action   = 'step_up',
    queue_id = NULL
WHERE name IN ('Account Takeover (ATO) Prevention', 'Shared Network Protection');
