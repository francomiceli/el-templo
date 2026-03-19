-- Add 'scheduled' status for early renewals (paid but not yet active)
ALTER TABLE `subscriptions` MODIFY COLUMN `subscription_status` enum('active','paused','cancelled','expired','completed','changed','scheduled') NOT NULL DEFAULT 'active';
