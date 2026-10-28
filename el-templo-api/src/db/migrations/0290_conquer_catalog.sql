-- 0290_conquer_catalog.sql
-- Fase 201 (Conquer v2), D-21: catalogo de Conquer (4 tablas).
--
-- Tablas: conquer_ladders (escaleras), conquer_rungs (peldanos),
-- conquer_exercises (ejercicios) y conquer_template_days (plantillas de 2 y 3
-- dias). Son gym-owned y nacen strict, por eso llevan tenant_id NOT NULL
-- DEFAULT 1 y su FK a tenants desde el primer dia. Todo UNIQUE empieza por
-- tenant_id.
--
-- rungs.position: 0 es el peldano MAS DIFICIL (igual que el oraculo y la
-- seccion 8.1 de la sintesis).
--
-- El catalogo lo siembra la migracion 0292 (plan 201-02) con INSERT IGNORE,
-- solo para el tenant 1. Esta migracion NO inserta filas.
--
-- Numeracion: 0290 porque la fase 200 (anatomia) se quedo con 0287 a 0289.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `conquer_ladders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `code` varchar(30) NOT NULL,
  `name` varchar(60) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_ladders_tenant_code` (`tenant_id`, `code`),
  CONSTRAINT `fk_conquer_ladders_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_rungs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `ladder_id` int NOT NULL,
  `code` varchar(40) NOT NULL,
  `name` varchar(60) NOT NULL,
  `position` smallint NOT NULL,
  `brazos_rectos` boolean NOT NULL DEFAULT false,
  `unilateral` boolean NOT NULL DEFAULT false,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_rungs_tenant_ladder_code` (`tenant_id`, `ladder_id`, `code`),
  UNIQUE KEY `uq_conquer_rungs_tenant_ladder_position` (`tenant_id`, `ladder_id`, `position`),
  CONSTRAINT `fk_conquer_rungs_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_rungs_ladder_id_conquer_ladders_id_fk` FOREIGN KEY (`ladder_id`) REFERENCES `conquer_ladders` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_exercises` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `code` varchar(40) NOT NULL,
  `name` varchar(80) NOT NULL,
  `ladder_id` int NOT NULL,
  `unit` enum('reps','s') NOT NULL,
  `muscles` json NOT NULL,
  `start_steps` json NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_exercises_tenant_code` (`tenant_id`, `code`),
  CONSTRAINT `fk_conquer_exercises_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_exercises_ladder_id_conquer_ladders_id_fk` FOREIGN KEY (`ladder_id`) REFERENCES `conquer_ladders` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_template_days` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `days_count` tinyint NOT NULL,
  `day_key` varchar(20) NOT NULL,
  `label` varchar(40) NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `finisher_text` varchar(200) NOT NULL,
  `exercise_codes` json NOT NULL,
  `opening_combo_key` varchar(20) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_template_days_tenant_days_key` (`tenant_id`, `days_count`, `day_key`),
  CONSTRAINT `fk_conquer_template_days_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
);
