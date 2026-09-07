-- 0223_staff_shifts.sql
-- Modulo staff-attendance (2026-09-07): check-in/check-out de la jornada
-- laboral del staff. Nace con tenant_id desde el arranque (mismo criterio
-- que avisos/referral_partners, migraciones 0216/0215) -- el modulo entero
-- nace strict en TENANT_STRICT_MODULES, sin deuda de allowlist previa.
--
-- No hay unique de "una jornada abierta por usuario": MySQL no soporta "a lo
-- sumo un NULL" en checked_out_at via UNIQUE KEY de forma portable, asi que
-- ese invariante lo impone el service (chequeo antes del INSERT, bajo la
-- misma conexion). El indice idx_staff_shifts_tenant_user_open acelera esa
-- lectura (GET /me y el chequeo de check-in duplicado).
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215/0216).
-- NUNCA drizzle-kit push/migrate -- la tabla _migrations es la unica fuente
-- de verdad, local y prod.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `staff_shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `shift_date` date NOT NULL,
  `checked_in_at` timestamp NOT NULL,
  `checked_out_at` timestamp NULL,
  `checklist` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_shifts_tenant_user_open` (`tenant_id`, `user_id`, `checked_out_at`),
  KEY `idx_staff_shifts_tenant_branch_date` (`tenant_id`, `branch_id`, `shift_date`),
  CONSTRAINT `fk_staff_shifts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `staff_shifts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `staff_shifts_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
