-- Phase 48: Subscriptions
-- Create subscription_plans table, subscriptions table, and add boarding_pass_used to users

-- Create subscription_plans table
CREATE TABLE `subscription_plans` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `plan_tier` enum('flex','foundation','performance','other') NOT NULL,
  `booking_mode` enum('fixed','flexible') NOT NULL,
  `price_regular` int NOT NULL,
  `price_zero` int NOT NULL,
  `price_credit_card` int,
  `duration_days` int NOT NULL,
  `classes_per_week` int,
  `multi_branch` boolean NOT NULL DEFAULT false,
  `is_trial` boolean NOT NULL DEFAULT false,
  `is_group` boolean NOT NULL DEFAULT false,
  `group_max_members` int,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `subscription_plans_id` PRIMARY KEY(`id`)
);

-- Create subscriptions table
CREATE TABLE `subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `status` enum('active','paused','cancelled','expired') NOT NULL DEFAULT 'active',
  `start_date` date NOT NULL,
  `end_date` date,
  `price_paid` int NOT NULL,
  `price_type_applied` enum('regular','zero','credit_card') NOT NULL,
  `aura_discount` int,
  `aura_discount_percent` int,
  `boarding_pass_used` boolean NOT NULL DEFAULT false,
  `price_override_amount` int,
  `price_override_reason` text,
  `paused_at` timestamp NULL,
  `resumed_at` timestamp NULL,
  `cancelled_at` timestamp NULL,
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);

-- Foreign keys for subscriptions
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_plan_id_subscription_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Indexes for fast lookups
CREATE INDEX `idx_subscriptions_user_id` ON `subscriptions` (`user_id`);
CREATE INDEX `idx_subscriptions_plan_id` ON `subscriptions` (`plan_id`);

-- Add boarding_pass_used column to users table
ALTER TABLE `users` ADD COLUMN `boarding_pass_used` boolean NOT NULL DEFAULT false;
