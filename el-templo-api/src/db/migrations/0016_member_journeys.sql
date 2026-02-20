CREATE TABLE `member_journeys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `journey_type` varchar(30) NOT NULL,
  `semana_20` int NOT NULL DEFAULT 1,
  `semana_40` int NOT NULL DEFAULT 1,
  `semana_60` int NOT NULL DEFAULT 1,
  `is_active` boolean NOT NULL DEFAULT true,
  `started_at` timestamp NOT NULL DEFAULT (now()),
  `archived_at` timestamp NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `member_journeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  KEY `member_journeys_user_active_idx` (`user_id`, `is_active`)
);

ALTER TABLE `sessions` ADD COLUMN `journey_type` varchar(30) NULL;

ALTER TABLE `completed_sessions` ADD COLUMN `journey_type` varchar(30) NULL;
ALTER TABLE `completed_sessions` ADD COLUMN `duration` int NULL;
