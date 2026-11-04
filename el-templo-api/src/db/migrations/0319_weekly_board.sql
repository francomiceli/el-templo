-- 0319_weekly_board.sql
-- Fase 206 Tablero semanal de gerencia (D-08, D-09, D-10, D-24, D-25).
--
-- Dos tablas gym-owned que nacen strict (modulo `weekly-board`):
-- weekly_board_snapshots (la foto congelada por semana y sede, con conteos
-- crudos y dos sellos independientes main_closed_at y late_closed_at) y
-- weekly_board_leads (los leads cargados a mano por sede y semana, fuera de la
-- foto). Llevan tenant_id NOT NULL DEFAULT 1 y su FK a tenants desde el primer
-- dia. Toda UNIQUE empieza por tenant_id.
--
-- Orden de creacion segun las FK: weekly_board_snapshots, weekly_board_leads.
--
-- Los sellos main_closed_at y late_closed_at llevan NULL DEFAULT NULL explicito
-- para que MySQL no auto-pueble el primer TIMESTAMP de la tabla.
--
-- Cero datos: staging y prod comparten servidor MySQL, todo DDL commiteado
-- corre contra prod.
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `weekly_board_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `week_start` date NOT NULL,
  `branch_id` int NOT NULL,
  `currency` varchar(3) NOT NULL,
  `cobrado` bigint NULL,
  `deuda_cobrable` bigint NULL,
  `deuda_mas_10` bigint NULL,
  `deuda_incobrable` bigint NULL,
  `activos` int NULL,
  `vencen_semana_siguiente` int NULL,
  `main_closed_at` timestamp NULL DEFAULT NULL,
  `reservas` int NULL,
  `reservas_ocurridas` int NULL,
  `asistieron` int NULL,
  `compraron` int NULL,
  `compraron_ocurridas` int NULL,
  `compraron_asistieron` int NULL,
  `vencimientos` int NULL,
  `renovaron` int NULL,
  `no_renueva` int NULL,
  `volvio_tarde` int NULL,
  `sin_contactar` int NULL,
  `late_closed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weekly_board_snapshots_tenant_week_branch` (`tenant_id`, `week_start`, `branch_id`),
  CONSTRAINT `fk_weekly_board_snapshots_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_weekly_board_snapshots_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
--> statement-breakpoint
CREATE TABLE `weekly_board_leads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `branch_id` int NOT NULL,
  `week_start` date NOT NULL,
  `leads` int NOT NULL,
  `updated_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weekly_board_leads_tenant_branch_week` (`tenant_id`, `branch_id`, `week_start`),
  CONSTRAINT `fk_weekly_board_leads_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_weekly_board_leads_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_weekly_board_leads_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
