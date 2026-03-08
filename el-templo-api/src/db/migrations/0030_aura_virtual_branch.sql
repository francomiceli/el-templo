-- Add is_virtual column to branches
ALTER TABLE `branches` ADD `is_virtual` boolean NOT NULL DEFAULT false;

-- Create aura_transactions table
CREATE TABLE `aura_transactions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social') NOT NULL,
  `amount` int NOT NULL,
  `reference_type` varchar(50),
  `reference_id` int,
  `description` varchar(255),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aura_transactions_id` PRIMARY KEY(`id`),
  CONSTRAINT `unique_user_source_ref` UNIQUE(`user_id`,`source_type`,`reference_type`,`reference_id`)
);

-- Create aura_balances table
CREATE TABLE `aura_balances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `balance` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aura_balances_id` PRIMARY KEY(`id`),
  CONSTRAINT `aura_balances_user_id_unique` UNIQUE(`user_id`)
);

-- Create aura_config table
CREATE TABLE `aura_config` (
  `id` int AUTO_INCREMENT NOT NULL,
  `aura_config_source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social') NOT NULL,
  `default_amount` int NOT NULL,
  `description` varchar(255),
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aura_config_id` PRIMARY KEY(`id`),
  CONSTRAINT `aura_config_aura_config_source_type_unique` UNIQUE(`aura_config_source_type`)
);

-- Add foreign keys
ALTER TABLE `aura_transactions` ADD CONSTRAINT `aura_transactions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `aura_balances` ADD CONSTRAINT `aura_balances_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Seed: Virtual "Templo Online" branch
INSERT INTO branches (name, code, timezone, is_active, is_virtual)
VALUES ('Templo Online', 'ONLINE', 'America/Argentina/Buenos_Aires', true, true);

-- Seed: AURA config defaults
INSERT INTO aura_config (aura_config_source_type, default_amount, description, is_active) VALUES
('training_completion', 10, 'Completed a training session', true),
('attendance', 5, 'Checked in at a branch', true),
('streak_bonus', 15, 'Maintained a training streak', true),
('referral', 50, 'Referred a new member', true),
('subscription_discount', 0, 'Milestone discount applied to subscription', true),
('manual_adjustment', 0, 'Manual adjustment by admin', true),
('challenge', 20, 'Completed a challenge', true),
('social', 5, 'Social engagement (post, reaction)', true);
