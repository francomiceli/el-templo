-- Phase 63: Cash Box — Make payments.subscription_id NOT NULL
-- No real production data yet, so safe to delete orphan payments

-- First delete any orphan payments without subscription_id
DELETE FROM payments WHERE subscription_id IS NULL;

-- Make subscription_id NOT NULL
ALTER TABLE payments MODIFY COLUMN subscription_id INT NOT NULL;
