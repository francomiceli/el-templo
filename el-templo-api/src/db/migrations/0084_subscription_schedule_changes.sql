CREATE TABLE `subscription_schedule_changes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `subscription_id` int NOT NULL,
  `actor_id` int NOT NULL,
  `old_schedule_ids` json NOT NULL,
  `new_schedule_ids` json NOT NULL,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `subscription_schedule_changes_id` PRIMARY KEY(`id`),
  CONSTRAINT `subscription_schedule_changes_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`),
  CONSTRAINT `subscription_schedule_changes_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_sub_schedule_changes_sub_id` ON `subscription_schedule_changes` (`subscription_id`);
