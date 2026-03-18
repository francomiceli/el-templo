-- Subscription Periods Redesign
-- Each subscription record now represents ONE period of service.
-- Renewals and plan changes create NEW records instead of mutating.

-- Add 'completed' and 'changed' to subscription_status enum
ALTER TABLE `subscriptions` MODIFY COLUMN `subscription_status` enum('active','paused','cancelled','expired','completed','changed') NOT NULL DEFAULT 'active';

-- Add previous_subscription_id column to link renewal/change chains
ALTER TABLE `subscriptions` ADD COLUMN `previous_subscription_id` int NULL;

-- Add index for efficient chain traversal
CREATE INDEX `idx_subscriptions_previous_id` ON `subscriptions` (`previous_subscription_id`);
