-- 0255_invitations.sql
-- Fase 194 (D-04): tabla `invitations`, una fila por invitacion ACTIVADA. Es la
-- fuente de verdad del cupo mensual, la ventana de 90 dias, los estados de
-- "Mis invitados" y la etapa del lead. Nunca se borra: la anulacion es
-- status 'voided' mas voided_at, voided_by y void_reason.
--
-- Nace con tenant_id desde el arranque (gym-owned, modulo strict referrals).
-- Sin restricciones de unicidad a proposito: una unicidad no compuesta
-- obligaria a tocar el mapa de derivadas de db:verify-uniques. Solo indices
-- simples que arrancan en tenant_id.
--
-- Cero datos en esta migracion (staging y prod comparten servidor MySQL, todo
-- DDL commiteado corre contra prod). Idempotente con CREATE TABLE IF NOT EXISTS.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type. NUNCA drizzle-kit push o migrate: la tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: verificado con git ls-tree contra origin/master y origin/staging,
-- ambas topean en 0254_schedules_deleted_from.sql. 0255 es el siguiente libre.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, porque el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE IF NOT EXISTS `invitations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `inviter_id` int NOT NULL,
  `invited_user_id` int NOT NULL,
  `channel` enum('self_service','assisted') NOT NULL,
  `status` enum('active','voided') NOT NULL DEFAULT 'active',
  `activated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `quota_month` char(7) NOT NULL,
  `access_starts_on` date NOT NULL,
  `access_expires_on` date NOT NULL,
  `subscription_id` int NULL,
  `branch_id` int NOT NULL,
  `invited_phone_last10` varchar(10) NOT NULL,
  `invited_dni` varchar(20) NULL,
  `converted_at` timestamp NULL,
  `converted_subscription_id` int NULL,
  `created_by` int NULL,
  `voided_at` timestamp NULL,
  `voided_by` int NULL,
  `void_reason` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invitations_inviter_month` (`tenant_id`, `inviter_id`, `quota_month`),
  KEY `idx_invitations_invited` (`tenant_id`, `invited_user_id`, `activated_at`),
  KEY `idx_invitations_phone` (`tenant_id`, `invited_phone_last10`),
  CONSTRAINT `fk_invitations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `invitations_inviter_id_fk` FOREIGN KEY (`inviter_id`) REFERENCES `users` (`id`),
  CONSTRAINT `invitations_invited_user_id_fk` FOREIGN KEY (`invited_user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `invitations_subscription_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `invitations_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `invitations_converted_subscription_id_fk` FOREIGN KEY (`converted_subscription_id`) REFERENCES `subscriptions` (`id`),
  CONSTRAINT `invitations_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `invitations_voided_by_fk` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
