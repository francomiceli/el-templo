-- Phase 49: Payments
-- Create payments table for payment recording, voiding, and balance tracking

CREATE TABLE `payments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `member_id` int NOT NULL,
  `subscription_id` int,
  `amount` int NOT NULL,
  `payment_method` enum('cash','transfer','card') NOT NULL,
  `payment_date` date NOT NULL,
  `reference` varchar(255),
  `notes` text,
  `recorded_by` int NOT NULL,
  `voided_at` timestamp NULL,
  `voided_by` int,
  `void_reason` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);

-- Foreign keys
ALTER TABLE `payments` ADD CONSTRAINT `payments_member_id_users_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `payments` ADD CONSTRAINT `payments_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `payments` ADD CONSTRAINT `payments_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE `payments` ADD CONSTRAINT `payments_voided_by_users_id_fk` FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Indexes for fast lookups
CREATE INDEX `idx_payments_member_id` ON `payments` (`member_id`);
CREATE INDEX `idx_payments_subscription_id` ON `payments` (`subscription_id`);
