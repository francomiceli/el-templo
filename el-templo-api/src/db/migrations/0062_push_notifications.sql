-- Push Notifications Foundation (Phase 84, Plan 01)
-- Creates device_tokens, notification_templates, notification_preferences, pending_notifications tables
-- Adds ghost reattempt tracking columns to member_profiles

CREATE TABLE `device_tokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `token` varchar(500) NOT NULL,
  `device_platform` enum('android','ios') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `device_tokens_id` PRIMARY KEY(`id`),
  CONSTRAINT `device_tokens_token_unique` UNIQUE(`token`),
  CONSTRAINT `device_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE INDEX `idx_device_tokens_user_id` ON `device_tokens` (`user_id`);

CREATE TABLE `notification_templates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `template_key` varchar(100) NOT NULL,
  `notification_category` enum('entrenamiento','programas','motivacion','anuncios') NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `route` varchar(200) DEFAULT '/mi-templo',
  `is_enabled` boolean NOT NULL DEFAULT true,
  `sent_count` int NOT NULL DEFAULT 0,
  `opened_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `notification_templates_id` PRIMARY KEY(`id`),
  CONSTRAINT `notification_templates_template_key_unique` UNIQUE(`template_key`)
);

CREATE TABLE `notification_preferences` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `notification_category` enum('entrenamiento','programas','motivacion','anuncios') NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
  CONSTRAINT `uq_notification_preferences_user_category` UNIQUE(`user_id`,`notification_category`),
  CONSTRAINT `notification_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE INDEX `idx_notification_preferences_user_id` ON `notification_preferences` (`user_id`);

CREATE TABLE `pending_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `template_id` int,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `route` varchar(200) DEFAULT '/mi-templo',
  `notification_status` enum('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `scheduled_at` timestamp NOT NULL,
  `sent_at` timestamp,
  `error_message` varchar(500),
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pending_notifications_id` PRIMARY KEY(`id`),
  CONSTRAINT `pending_notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `pending_notifications_template_id_notification_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `notification_templates`(`id`)
);

CREATE INDEX `idx_pending_notifications_queue` ON `pending_notifications` (`notification_status`, `scheduled_at`);
CREATE INDEX `idx_pending_notifications_user_id` ON `pending_notifications` (`user_id`);

-- Ghost reattempt tracking on member_profiles (D-04)
ALTER TABLE `member_profiles` ADD COLUMN `ghost_reattempt_count` int DEFAULT 0;
ALTER TABLE `member_profiles` ADD COLUMN `last_ghost_reattempt_at` timestamp NULL;
