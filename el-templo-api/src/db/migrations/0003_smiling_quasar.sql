CREATE TABLE `session_traces` (
	`id` int AUTO_INCREMENT NOT NULL,
	`session_id` int NOT NULL,
	`trace_json` json NOT NULL,
	`event_count` int NOT NULL,
	`warning_count` int NOT NULL,
	`error_count` int NOT NULL,
	`generation_ms` int NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `session_traces_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `session_traces` ADD CONSTRAINT `session_traces_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `session_traces_session_idx` ON `session_traces` (`session_id`);