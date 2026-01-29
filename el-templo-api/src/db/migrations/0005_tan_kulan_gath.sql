CREATE TABLE `evaluation_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`evaluation_request_status` enum('pending','approved','denied') NOT NULL DEFAULT 'pending',
	`average_rpe_at_request` int,
	`processed_at` timestamp,
	`processed_by` int,
	`notes` varchar(500),
	CONSTRAINT `evaluation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `evaluation_requests` ADD CONSTRAINT `evaluation_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `evaluation_requests` ADD CONSTRAINT `evaluation_requests_processed_by_users_id_fk` FOREIGN KEY (`processed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;