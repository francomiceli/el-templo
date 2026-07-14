-- 0176_referrals_core.sql
-- Phase 157 (REF-01/REF-04/DESC-04/AURA-02): núcleo de datos del sistema de referidos.
-- Hand-written: drizzle-kit generate sigue roto por el drift de goal_plan_type.
-- Crea referrals + referral_credits, agrega columnas a users/subscriptions y
-- siembra la calibración (10 por vínculo, tope 40) de forma idempotente.
-- NOTA sin punto y coma dentro de estas líneas de comentario (el runner splittea
-- por punto y coma ANTES de stripear los guiones dobles).
CREATE TABLE IF NOT EXISTS `referrals` (
  `id` int AUTO_INCREMENT NOT NULL,
  `referrer_id` int NOT NULL,
  `referred_id` int NOT NULL,
  `status` enum('pending','qualified','revoked') NOT NULL DEFAULT 'pending',
  `attribution_channel` enum('self_service','assisted') NOT NULL,
  `qualified_at` timestamp NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `referrals_id` PRIMARY KEY(`id`),
  CONSTRAINT `referrals_referred_id_unique` UNIQUE(`referred_id`),
  CONSTRAINT `referrals_referrer_id_users_id_fk` FOREIGN KEY (`referrer_id`) REFERENCES `users`(`id`),
  CONSTRAINT `referrals_referred_id_users_id_fk` FOREIGN KEY (`referred_id`) REFERENCES `users`(`id`),
  CONSTRAINT `referrals_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS `referral_credits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `user_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `percent` int NOT NULL,
  `amount` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `referral_credits_id` PRIMARY KEY(`id`),
  CONSTRAINT `unique_referral_credit_sub` UNIQUE(`subscription_id`),
  CONSTRAINT `referral_credits_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `referral_credits_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`)
);
ALTER TABLE `users` ADD COLUMN `referral_code` varchar(16) NULL;
ALTER TABLE `users` ADD COLUMN `referred_by` int NULL;
ALTER TABLE `users` ADD CONSTRAINT `users_referral_code_unique` UNIQUE(`referral_code`);
ALTER TABLE `users` ADD INDEX `idx_users_referred_by` (`referred_by`);
ALTER TABLE `users` ADD CONSTRAINT `users_referred_by_users_id_fk` FOREIGN KEY (`referred_by`) REFERENCES `users`(`id`) ON DELETE SET NULL;
ALTER TABLE `subscriptions` ADD COLUMN `referral_discount_percent` int NULL;
ALTER TABLE `subscriptions` ADD COLUMN `referral_discount_amount` int NULL;
-- Seed idempotente de la fila referral en aura_config (D-12/D-22/AURA-02): 10 por vínculo.
-- La columna física del enum es aura_config_source_type (mysqlEnum 1er-arg), NO source_type.
INSERT INTO `aura_config` (`aura_config_source_type`, `default_amount`, `description`, `is_active`)
SELECT 'referral', 10, 'Descuento por vinculo de referido activo', 1
WHERE NOT EXISTS (
  SELECT 1 FROM `aura_config` WHERE `aura_config_source_type` = 'referral'
);
-- Seed idempotente del tope de acumulación (D-12/D-22/DESC-04): 40 por ciento.
INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'referral.max_percent_cap', '40'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'referral.max_percent_cap'
);
