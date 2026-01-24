CREATE TABLE `sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`day_id` varchar(50) NOT NULL,
	`week` int NOT NULL,
	`day` varchar(20) NOT NULL,
	`level_group` varchar(20) NOT NULL,
	`block_count` int NOT NULL,
	`trace_json` json,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_day_id_unique` UNIQUE(`day_id`)
);
--> statement-breakpoint
CREATE TABLE `session_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`block_id` varchar(100) NOT NULL,
	`role` varchar(20) NOT NULL,
	`route` varchar(20) NOT NULL,
	`pattern` varchar(150) NOT NULL,
	`intensity` int NOT NULL,
	`reps_budget` int NOT NULL,
	`format_id` int NOT NULL,
	`format_name` varchar(50) NOT NULL,
	`exercise_count` int NOT NULL,
	`sort_order` int NOT NULL,
	CONSTRAINT `session_blocks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_prescriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`block_id` int NOT NULL,
	`exercise_id` int NOT NULL,
	`exercise_name` varchar(150) NOT NULL,
	`contraction` varchar(10) NOT NULL,
	`reps` int NOT NULL,
	`seconds` int NOT NULL,
	`rest` int NOT NULL,
	`notes` varchar(255),
	`sort_order` int NOT NULL,
	CONSTRAINT `session_prescriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `format_compatibility` MODIFY COLUMN `block` enum('initium','nucleus','deuteros','athlos','epikos') NOT NULL;--> statement-breakpoint
ALTER TABLE `session_blocks` ADD CONSTRAINT `session_blocks_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session_prescriptions` ADD CONSTRAINT `session_prescriptions_block_id_session_blocks_id_fk` FOREIGN KEY (`block_id`) REFERENCES `session_blocks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sessions_week_day_level_idx` ON `sessions` (`week`,`day`,`level_group`);--> statement-breakpoint
CREATE INDEX `session_blocks_session_idx` ON `session_blocks` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_prescriptions_block_idx` ON `session_prescriptions` (`block_id`);