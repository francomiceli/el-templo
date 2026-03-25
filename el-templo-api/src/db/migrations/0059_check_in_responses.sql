CREATE TABLE `check_in_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `question_type` enum('energy','soreness','sleep') NOT NULL,
  `value` varchar(20) NOT NULL,
  `body_area` varchar(20),
  `date` varchar(10) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `check_in_responses_id` PRIMARY KEY(`id`),
  CONSTRAINT `fk_check_in_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `uq_check_in_daily` UNIQUE(`user_id`, `question_type`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_check_in_user` ON `check_in_responses` (`user_id`);
