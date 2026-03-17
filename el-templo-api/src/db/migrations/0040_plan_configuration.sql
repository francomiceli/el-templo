-- Phase 60: Plan configuration - schema changes for class tracking and system settings

-- Add class tracking columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN classes_remaining INT NULL AFTER notes;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN fixed_days JSON NULL AFTER classes_remaining;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN grace_check_ins_after_expiry INT NOT NULL DEFAULT 0 AFTER fixed_days;
--> statement-breakpoint

-- Create system_settings table for global configuration
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_system_settings_key` (`setting_key`)
);
--> statement-breakpoint

-- Seed default grace period
INSERT INTO system_settings (setting_key, setting_value) VALUES ('grace_period_days', '5');
