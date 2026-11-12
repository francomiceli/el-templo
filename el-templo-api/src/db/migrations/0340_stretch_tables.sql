-- 0340_stretch_tables.sql
-- Fase 213 Estiramiento post-clase (D-01, D-02, D-15, D-16).
--
-- Dos tablas gym-owned que nacen strict (modulo `stretch`):
-- stretch_catalog (la lista curada de ejercicios de estiramiento, D-02) y
-- stretch_offers (una fila por alumno y dia, que es la oferta y a la vez el
-- dedupe del push, el embudo y el registro del completado, D-15 y D-16).
-- Llevan tenant_id NOT NULL DEFAULT 1 y su FK a tenants desde el primer dia.
-- Toda UNIQUE empieza por tenant_id.
--
-- Orden de creacion segun las FK: stretch_catalog, stretch_offers.
--
-- pending_notification_id no tiene FK a proposito: la cola de pendientes se
-- purga a las 24 horas. Las marcas del embudo llevan NULL DEFAULT NULL
-- explicito para que MySQL no auto-pueble el primer TIMESTAMP de la tabla.
--
-- Cero datos: staging y prod comparten servidor MySQL, todo DDL commiteado
-- corre contra prod. La carga de la lista curada va en la migracion siguiente.
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `stretch_catalog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `exercise_id` int NOT NULL,
  `exercise_name` varchar(150) NOT NULL,
  `family` varchar(10) NOT NULL,
  `sort_order` int NOT NULL,
  `sides` tinyint NOT NULL,
  `base_order` int NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stretch_catalog_tenant_exercise` (`tenant_id`, `exercise_id`),
  KEY `idx_stretch_catalog_tenant_family` (`tenant_id`, `family`, `sort_order`),
  CONSTRAINT `fk_stretch_catalog_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_stretch_catalog_exercise` FOREIGN KEY (`exercise_id`) REFERENCES `exercises` (`id`)
);
--> statement-breakpoint
CREATE TABLE `stretch_offers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `local_date` date NOT NULL,
  `attendance_id` int NULL,
  `branch_id` int NOT NULL,
  `source_day_id` varchar(40) NOT NULL,
  `class_end_at` timestamp NOT NULL,
  `exercises` json NOT NULL,
  `planned_seconds` int NOT NULL,
  `arm` varchar(10) NOT NULL,
  `card_seen_at` timestamp NULL DEFAULT NULL,
  `push_decision` varchar(30) NULL,
  `push_queued_at` timestamp NULL DEFAULT NULL,
  `pending_notification_id` int NULL,
  `push_sent_at` timestamp NULL DEFAULT NULL,
  `push_opened_at` timestamp NULL DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `started_from` varchar(10) NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_seconds` int NULL,
  `aura_awarded` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stretch_offers_tenant_user_date` (`tenant_id`, `user_id`, `local_date`),
  KEY `idx_stretch_offers_tenant_date` (`tenant_id`, `local_date`),
  KEY `idx_stretch_offers_tenant_user_queued` (`tenant_id`, `user_id`, `push_queued_at`),
  CONSTRAINT `fk_stretch_offers_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_stretch_offers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stretch_offers_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_stretch_offers_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
