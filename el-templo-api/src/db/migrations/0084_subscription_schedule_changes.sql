CREATE TABLE `subscription_schedule_changes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `subscription_id` int NOT NULL,
  `actor_id` int NOT NULL,
  `old_schedule_ids` json NOT NULL,
  `new_schedule_ids` json NOT NULL,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `sub_sched_changes_pk` PRIMARY KEY(`id`),
  CONSTRAINT `sub_sched_changes_sub_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`),
  CONSTRAINT `sub_sched_changes_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sub_schedule_changes_sub_id` ON `subscription_schedule_changes` (`subscription_id`);
