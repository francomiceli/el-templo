-- 0316_oficina_temas.sql
-- Fase 205 Oficina (D-01..D-07): central de temas de gestion del admin.
--
-- Cuatro tablas gym-owned que nacen strict (modulo `office`): office_topics
-- (el tema), office_topic_events (el hilo: comentarios y cambios de estado),
-- office_topic_reads (visto por persona) y office_mentions (menciones por
-- evento y usuario). Llevan tenant_id NOT NULL DEFAULT 1 y su FK a tenants
-- desde el primer dia. Todo UNIQUE empieza por tenant_id.
--
-- Orden de creacion segun las FK: office_topics, office_topic_events,
-- office_topic_reads, office_mentions.
--
-- status y origin son varchar (no enum) con uniones en TypeScript, igual que
-- el resto de los estados nuevos. snoozed_until es un YYYY-MM-DD en texto.
-- source_key es la llave de dedupe de los temas del sistema, unica por tenant.
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

CREATE TABLE `office_topics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `title` varchar(160) NOT NULL,
  `body` text NULL,
  `status` varchar(16) NOT NULL DEFAULT 'abierto',
  `origin` varchar(16) NOT NULL DEFAULT 'manual',
  `source_key` varchar(120) NULL,
  `target_kind` varchar(32) NULL,
  `target_id` int NULL,
  `target_label` varchar(160) NULL,
  `branch_id` int NULL,
  `assignee_id` int NULL,
  `created_by` int NULL,
  `closed_by` int NULL,
  `closed_at` timestamp NULL,
  `snoozed_until` varchar(10) NULL,
  `last_activity_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_office_topics_tenant_source` (`tenant_id`, `source_key`),
  KEY `idx_office_topics_tenant_status_activity` (`tenant_id`, `status`, `last_activity_at`),
  KEY `idx_office_topics_tenant_target` (`tenant_id`, `target_kind`, `target_id`),
  KEY `idx_office_topics_tenant_assignee` (`tenant_id`, `assignee_id`, `status`),
  CONSTRAINT `fk_office_topics_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `office_topics_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `office_topics_assignee_id_users_id_fk` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `office_topics_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `office_topics_closed_by_users_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `office_topic_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `topic_id` int NOT NULL,
  `actor_id` int NULL,
  `type` varchar(24) NOT NULL,
  `body` text NULL,
  `payload` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_office_topic_events_tenant_topic` (`tenant_id`, `topic_id`, `created_at`),
  CONSTRAINT `fk_office_topic_events_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `office_topic_events_topic_id_office_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `office_topics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `office_topic_events_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `office_topic_reads` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `topic_id` int NOT NULL,
  `user_id` int NOT NULL,
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_office_topic_reads_tenant_topic_user` (`tenant_id`, `topic_id`, `user_id`),
  KEY `idx_office_topic_reads_tenant_user` (`tenant_id`, `user_id`),
  CONSTRAINT `fk_office_topic_reads_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `office_topic_reads_topic_id_office_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `office_topics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `office_topic_reads_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `office_mentions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `topic_id` int NOT NULL,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `read_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_office_mentions_tenant_event_user` (`tenant_id`, `event_id`, `user_id`),
  KEY `idx_office_mentions_tenant_user_read` (`tenant_id`, `user_id`, `read_at`),
  CONSTRAINT `fk_office_mentions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `office_mentions_topic_id_office_topics_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `office_topics` (`id`) ON DELETE CASCADE,
  CONSTRAINT `office_mentions_event_id_office_topic_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `office_topic_events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `office_mentions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
