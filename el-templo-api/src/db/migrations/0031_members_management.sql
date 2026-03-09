-- Phase 47: Members Management
-- Extend users table with profile fields and create member_notes table

-- Add profile fields to users table
ALTER TABLE `users` ADD COLUMN `phone` varchar(30);
ALTER TABLE `users` ADD COLUMN `dni` varchar(20);
ALTER TABLE `users` ADD COLUMN `date_of_birth` date;
ALTER TABLE `users` ADD COLUMN `gender` enum('male','female','other');
ALTER TABLE `users` ADD COLUMN `emergency_contact_name` varchar(150);
ALTER TABLE `users` ADD COLUMN `emergency_contact_phone` varchar(30);
ALTER TABLE `users` ADD COLUMN `emergency_contact_relationship` varchar(50);
ALTER TABLE `users` ADD COLUMN `is_active` boolean NOT NULL DEFAULT true;

-- DNI unique index (MySQL unique index ignores NULLs by default)
ALTER TABLE `users` ADD UNIQUE INDEX `users_dni_unique` (`dni`);

-- Create member_notes table
CREATE TABLE `member_notes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `author_id` int NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `member_notes_id` PRIMARY KEY(`id`)
);

-- Foreign keys for member_notes
ALTER TABLE `member_notes` ADD CONSTRAINT `member_notes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `member_notes` ADD CONSTRAINT `member_notes_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Index for fast note lookups by user
CREATE INDEX `idx_member_notes_user_id` ON `member_notes` (`user_id`);
