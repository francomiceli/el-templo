CREATE TABLE `promo_plans` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(150) NOT NULL,
  `promo_code` varchar(50) NOT NULL,
  `plan_duration_days` int NOT NULL DEFAULT 30,
  `subscription_plan_id` int NOT NULL,
  `start_date` datetime NOT NULL,
  `expiry_date` datetime NOT NULL,
  `promo_type` enum('qr_auto','admin_assignable') NOT NULL DEFAULT 'qr_auto',
  `is_active` boolean NOT NULL DEFAULT true,
  `redemption_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `promo_plans_id` PRIMARY KEY(`id`),
  CONSTRAINT `promo_plans_promo_code_unique` UNIQUE(`promo_code`)
);
