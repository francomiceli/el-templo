CREATE TABLE `completed_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`day_id` varchar(50) NOT NULL,
	`date` varchar(10) NOT NULL,
	`branch_id` int NOT NULL,
	`started_at` timestamp NOT NULL,
	`completed_at` timestamp NOT NULL,
	`rpe` int,
	`notes` text,
	`blocks_completed` json NOT NULL,
	CONSTRAINT `completed_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `completed_sessions` ADD CONSTRAINT `completed_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `completed_sessions` ADD CONSTRAINT `completed_sessions_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `completed_sessions_user_idx` ON `completed_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `completed_sessions_date_idx` ON `completed_sessions` (`date`);--> statement-breakpoint
CREATE INDEX `completed_sessions_branch_idx` ON `completed_sessions` (`branch_id`);