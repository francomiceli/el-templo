-- Phase 78: Onboarding & User Profiling
-- Creates member_profiles and onboarding_analytics tables, adds onboarding_completion to aura enums

CREATE TABLE `member_profiles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `goal_type` enum('muscle_up','fitness','weight_loss','flexibility','wellness') NOT NULL,
  `experience_level` enum('beginner','intermediate','advanced') NOT NULL,
  `training_focus` enum('upper_body','lower_body','core','full_body') NOT NULL,
  `motivation_style` enum('discipline','community','results','challenges') NOT NULL,
  `onboarding_completed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `member_profiles_user_id_unique` (`user_id`),
  KEY `idx_member_profiles_user_id` (`user_id`),
  CONSTRAINT `member_profiles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);
--> statement-breakpoint
CREATE TABLE `onboarding_analytics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `onboarding_event_type` enum('quiz_started','question_answered','quiz_completed','quiz_abandoned') NOT NULL,
  `question_index` int NULL,
  `answer_value` varchar(50) NULL,
  `duration_ms` int NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  CONSTRAINT `onboarding_analytics_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
);
--> statement-breakpoint
ALTER TABLE `aura_config` MODIFY COLUMN `aura_config_source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion','onboarding_completion') NOT NULL;
--> statement-breakpoint
ALTER TABLE `aura_transactions` MODIFY COLUMN `source_type` enum('training_completion','attendance','streak_bonus','referral','subscription_discount','manual_adjustment','challenge','social','personalizada_completion','onboarding_completion') NOT NULL;
