-- Phase 88: Gender-Based Notification Personalization (Plan 01)
-- Adds 'unspecified' to gender enum and female variant columns to notification_templates

ALTER TABLE `users` MODIFY COLUMN `gender` enum('male','female','other','unspecified');

ALTER TABLE `notification_templates` ADD COLUMN `title_female` varchar(200) NULL;
ALTER TABLE `notification_templates` ADD COLUMN `body_female` text NULL;
