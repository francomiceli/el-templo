-- 0209_referral_partners.sql
-- Fase 179 (D-09, D-11, D-12, D-13, D-14, D-16, D-20): cimiento de datos del
-- modulo de referidos de partners/marcas. Crea `referral_partners`,
-- `partner_referrals` y `partner_commissions` -- las tres tablas nacen con
-- tenant_id desde el arranque (D-20), regla dura de la fase: NO tocar
-- `referrals` ni `computeReferralDiscountPercent`, este es un modulo con
-- tablas propias, no una extension del sistema de referidos de socios.
--
-- Compone el contrato de columna de tenant-column.ts (tenant_id int NOT NULL
-- DEFAULT 1 + FK a tenants) con el estilo de unique compuesta tenant_id-
-- primero de la migracion 0196 (CON-01), mismo patron que 0202
-- (session_week_regime), la primera tabla gym-owned que nacio asi.
--
-- Unicidades:
--   uq_referral_partners_tenant_code (tenant_id, code) -- compuesta: dos
--     gimnasios distintos pueden compartir el mismo codigo de partner.
--     `code` NO deriva de ninguna FK scopeada, asi que NO va al allowlist de
--     tenant-tables.ts (necesita tenant_id explicito en la unique).
--   partner_referrals_referred_id_unique (referred_id) -- exclusividad de
--     origen (D-12): un socio tiene un solo origen, referrer (referrals) XOR
--     partner (esta tabla). Derivada de FK scopeada (referred_id -> users) ->
--     va al allowlist de tenancy, sin tenant_id en la unique.
--   unique_partner_commission_sub (subscription_id) -- idempotencia por cargo
--     (D-11): un mismo cargo no puede generar dos comisiones. Derivada de FK
--     scopeada (subscription_id -> subscriptions, que ancla en users) -> va
--     al allowlist de tenancy.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202). NUNCA
-- drizzle-kit push/migrate -- la tabla _migrations es la unica fuente de
-- verdad, local y prod.
--
-- Numeracion: verificado 2026-08-23 con `git ls-tree --name-only
-- origin/master el-templo-api/src/db/migrations/` y lo mismo contra
-- origin/staging -- ambas ramas topean en 0208_rename_branches_short_names.sql,
-- asi que 0209 es el siguiente libre real en ambas.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `referral_partners` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `name` varchar(120) NOT NULL,
  `code` varchar(24) NOT NULL,
  `branch_id` int NOT NULL,
  `benefit_type` enum('discount_percent','free_pass') NOT NULL,
  `benefit_value` int NOT NULL,
  `commission_type` enum('none','fixed') NOT NULL DEFAULT 'fixed',
  `commission_value` int NOT NULL DEFAULT 0,
  `currency` enum('ARS','EUR') NOT NULL,
  `contact_name` varchar(120) NULL,
  `contact_phone` varchar(40) NULL,
  `notes` text NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_referral_partners_tenant_code` (`tenant_id`, `code`),
  CONSTRAINT `fk_referral_partners_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `referral_partners_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `referral_partners_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE `partner_referrals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `partner_id` int NOT NULL,
  `referred_id` int NOT NULL,
  `status` enum('pending','qualified','revoked') NOT NULL DEFAULT 'pending',
  `attribution_channel` enum('self_service','assisted') NOT NULL,
  `benefit_type` enum('discount_percent','free_pass') NOT NULL,
  `benefit_value` int NOT NULL,
  `benefit_status` enum('pending','consumed','expired') NOT NULL DEFAULT 'pending',
  `benefit_expires_at` datetime NOT NULL,
  `benefit_consumed_at` timestamp NULL,
  `applied_percent` int NULL,
  `applied_amount` int NULL,
  `applied_subscription_id` int NULL,
  `applied_reason` varchar(120) NULL,
  `qualified_at` timestamp NULL,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `partner_referrals_referred_id_unique` (`referred_id`),
  CONSTRAINT `fk_partner_referrals_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `partner_referrals_partner_id_referral_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `referral_partners` (`id`),
  CONSTRAINT `partner_referrals_referred_id_users_id_fk` FOREIGN KEY (`referred_id`) REFERENCES `users` (`id`),
  CONSTRAINT `partner_referrals_applied_subscription_id_subscriptions_id_fk` FOREIGN KEY (`applied_subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `partner_referrals_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE `partner_commissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `partner_id` int NOT NULL,
  `partner_referral_id` int NOT NULL,
  `user_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `amount` int NOT NULL,
  `currency` enum('ARS','EUR') NOT NULL,
  `status` enum('pending','settled','void') NOT NULL DEFAULT 'pending',
  `settled_at` timestamp NULL,
  `settled_by` int NULL,
  `voided_at` timestamp NULL,
  `void_reason` varchar(200) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_partner_commission_sub` (`subscription_id`),
  CONSTRAINT `fk_partner_commissions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `partner_commissions_partner_id_referral_partners_id_fk` FOREIGN KEY (`partner_id`) REFERENCES `referral_partners` (`id`),
  CONSTRAINT `partner_commissions_partner_referral_id_partner_referrals_id_fk` FOREIGN KEY (`partner_referral_id`) REFERENCES `partner_referrals` (`id`),
  CONSTRAINT `partner_commissions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `partner_commissions_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `partner_commissions_settled_by_users_id_fk` FOREIGN KEY (`settled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

ALTER TABLE `subscriptions` ADD COLUMN `partner_discount_percent` int NULL;
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `partner_discount_amount` int NULL;
