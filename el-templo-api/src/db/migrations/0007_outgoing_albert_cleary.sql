ALTER TABLE `sessions` DROP FOREIGN KEY `sessions_discarded_by_users_id_fk`;
--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `discarded_at`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `discarded_by`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `discarded_reason`;