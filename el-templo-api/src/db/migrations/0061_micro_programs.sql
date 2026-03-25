-- Phase 83: Micro-programs, content blocks, enrollments, and AURA source types

CREATE TABLE `micro_programs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(150) NOT NULL,
  `description` text,
  `price` int NOT NULL,
  `duration_weeks` int NOT NULL,
  `sessions_per_week_to_advance` int NOT NULL DEFAULT 3,
  `aura_weekly_bonus` int DEFAULT 15,
  `aura_completion_bonus` int DEFAULT 100,
  `is_active` tinyint NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `micro_programs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `micro_program_content_blocks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `program_id` int NOT NULL,
  `week_number` int NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `block_type` enum('video','text','pdf','exercise') NOT NULL,
  `title` varchar(200) NOT NULL,
  `content` text,
  `video_url` varchar(500),
  `exercise_id` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `micro_program_content_blocks_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_content_blocks_program` FOREIGN KEY (`program_id`) REFERENCES `micro_programs`(`id`),
  CONSTRAINT `fk_content_blocks_exercise` FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_content_blocks_program_week` ON `micro_program_content_blocks` (`program_id`, `week_number`);
--> statement-breakpoint
CREATE TABLE `program_enrollments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `program_id` int NOT NULL,
  `status` enum('active','completed','expired','cancelled') NOT NULL DEFAULT 'active',
  `current_week` int NOT NULL DEFAULT 1,
  `sessions_completed_this_week` int NOT NULL DEFAULT 0,
  `week_unlocked_at` timestamp,
  `enrolled_at` timestamp NOT NULL DEFAULT (now()),
  `completed_at` timestamp,
  `expired_at` timestamp,
  `cancelled_at` timestamp,
  `payment_amount` int,
  `payment_method` varchar(30),
  `notes` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `program_enrollments_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_enrollments_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_enrollments_program` FOREIGN KEY (`program_id`) REFERENCES `micro_programs`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_enrollments_user_id` ON `program_enrollments` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_enrollments_program_id` ON `program_enrollments` (`program_id`);
--> statement-breakpoint
CREATE INDEX `idx_enrollments_status` ON `program_enrollments` (`status`);
--> statement-breakpoint
ALTER TABLE `aura_transactions` MODIFY COLUMN `source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion','onboarding_completion','program_week_completion','program_completion') NOT NULL;
--> statement-breakpoint
ALTER TABLE `aura_config` MODIFY COLUMN `aura_config_source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion','onboarding_completion','program_week_completion','program_completion') NOT NULL;
