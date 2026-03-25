-- Phase 79: Behavioral Segmentation
-- Adds segment columns to member_profiles, creates member_logins table,
-- seeds segment threshold settings, removes unused grace_period_days.

-- Add segment columns to member_profiles
ALTER TABLE `member_profiles`
  ADD COLUMN `member_segment` enum('nuevo_guerrero','espartano','intermitente','en_riesgo','digital_warrior','ghost') DEFAULT NULL,
  ADD COLUMN `segment_updated_at` timestamp NULL DEFAULT NULL;
--> statement-breakpoint
-- Create member_logins table for login tracking
CREATE TABLE `member_logins` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `logged_in_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `member_logins_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  KEY `idx_member_logins_user_date` (`user_id`, `logged_in_at`)
);
--> statement-breakpoint
-- Seed segment threshold settings (per D-13)
INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES
  ('segment.espartano_pct', '80'),
  ('segment.intermitente_pct', '40'),
  ('segment.en_riesgo_weeks', '2'),
  ('segment.ghost_weeks', '8'),
  ('segment.nuevo_guerrero_days', '30'),
  ('segment.window_days', '28');
--> statement-breakpoint
-- Cleanup: remove unused grace_period_days (per D-15)
DELETE FROM `system_settings` WHERE `setting_key` = 'grace_period_days';
