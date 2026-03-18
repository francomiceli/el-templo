-- Add classes_budget column to track total class budget across renewals
ALTER TABLE `subscriptions` ADD `classes_budget` int;

-- Backfill: set budget = remaining for active/paused subscriptions (no classes used yet in staging)
UPDATE `subscriptions` SET `classes_budget` = `classes_remaining` WHERE `classes_remaining` IS NOT NULL;
