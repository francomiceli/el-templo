-- Admin session review workflow columns
-- Phase 14: Add session status tracking and branch timezone

-- Add timezone column to branches (IANA identifier for determining past/current/future)
ALTER TABLE `branches` ADD COLUMN `timezone` varchar(50) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires';
--> statement-breakpoint

-- Add admin workflow columns to sessions
ALTER TABLE `sessions` ADD COLUMN `status` varchar(20) NOT NULL DEFAULT 'pending_review';
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `approved_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `approved_by` int NULL;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `approved_by_system` boolean DEFAULT false;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `discarded_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `discarded_by` int NULL;
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `discarded_reason` text NULL;
--> statement-breakpoint

-- Add foreign key constraints for approval/discard tracking
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_discarded_by_users_id_fk` FOREIGN KEY (`discarded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

-- Add index for efficient status filtering
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);
