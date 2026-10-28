-- 0291_conquer_member_state.sql
-- Fase 201 (Conquer v2), D-21: estado del alumno en Conquer (6 tablas).
--
-- Orden de creacion segun las FK: conquer_members, conquer_steps,
-- conquer_sessions, conquer_session_steps, conquer_alerts, conquer_body_checks.
-- Son gym-owned y nacen strict, por eso llevan tenant_id NOT NULL DEFAULT 1 y
-- su FK a tenants desde el primer dia. Todo UNIQUE empieza por tenant_id.
--
-- Depende de la 0290 (conquer_exercises y conquer_rungs).
--
-- conquer_session_steps guarda un numero por escalon (el peor de las 3 series)
-- mas el objetivo previo, con snapshot del peldano y del modo al guardar. Solo
-- lleva created_at.
--
-- Las claves de foto de conquer_body_checks apuntan al bucket R2 privado. Nunca
-- se loguean.
--
-- Numeracion: 0291 porque la fase 200 (anatomia) se quedo con 0287 a 0289.
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

CREATE TABLE `conquer_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `status` enum('pedido','activo') NOT NULL,
  `requested_at` datetime NULL,
  `level` enum('ternero','novillo','toro') NULL,
  `days_count` tinyint NULL,
  `coach_user_id` int NULL,
  `inc_reps` tinyint NOT NULL DEFAULT 1,
  `inc_s` tinyint NOT NULL DEFAULT 2,
  `activated_at` datetime NULL,
  `activated_by` int NULL,
  `activation_date` date NULL,
  `level_since` date NULL,
  `cut_stage` tinyint NOT NULL DEFAULT 0,
  `combo_state` json NULL,
  `day0_skipped_at` datetime NULL,
  `publish_enabled` boolean NOT NULL DEFAULT false,
  `publish_no_face` boolean NOT NULL DEFAULT false,
  `publish_changed_at` datetime NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_members_tenant_user` (`tenant_id`, `user_id`),
  KEY `idx_conquer_members_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_conquer_members_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_members_coach_user_id_users_id_fk` FOREIGN KEY (`coach_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `conquer_members_activated_by_users_id_fk` FOREIGN KEY (`activated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `conquer_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `member_id` int NOT NULL,
  `exercise_id` int NOT NULL,
  `step` enum('e1','e2','e3','hold') NOT NULL,
  `rung_id` int NOT NULL,
  `mode` enum('completa','negativa','hold') NOT NULL,
  `since_date` date NULL,
  `calibration` enum('pendiente','resuelta') NOT NULL DEFAULT 'pendiente',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_steps_tenant_member_exercise_step` (`tenant_id`, `member_id`, `exercise_id`, `step`),
  CONSTRAINT `fk_conquer_steps_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_steps_member_id_conquer_members_id_fk` FOREIGN KEY (`member_id`) REFERENCES `conquer_members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_steps_exercise_id_conquer_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `conquer_exercises` (`id`),
  CONSTRAINT `conquer_steps_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`rung_id`) REFERENCES `conquer_rungs` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `session_date` date NOT NULL,
  `day_key` varchar(20) NOT NULL,
  `pain` tinyint NOT NULL DEFAULT 0,
  `combo_rung_id` int NULL,
  `combo_series` tinyint NULL,
  `combo_target` tinyint NULL,
  `push_rung_id` int NULL,
  `push_series` tinyint NULL,
  `push_target` tinyint NULL,
  `pull_rung_id` int NULL,
  `pull_series` tinyint NULL,
  `pull_target` tinyint NULL,
  `saved_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_sessions_tenant_user_date_day` (`tenant_id`, `user_id`, `session_date`, `day_key`),
  KEY `idx_conquer_sessions_tenant_user_date` (`tenant_id`, `user_id`, `session_date`),
  CONSTRAINT `fk_conquer_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_sessions_combo_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`combo_rung_id`) REFERENCES `conquer_rungs` (`id`),
  CONSTRAINT `conquer_sessions_push_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`push_rung_id`) REFERENCES `conquer_rungs` (`id`),
  CONSTRAINT `conquer_sessions_pull_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`pull_rung_id`) REFERENCES `conquer_rungs` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_session_steps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `session_id` int NOT NULL,
  `exercise_id` int NOT NULL,
  `step` enum('e1','e2','e3','hold') NOT NULL,
  `value` smallint NOT NULL,
  `prev_target` smallint NULL,
  `rung_id` int NOT NULL,
  `mode` enum('completa','negativa','hold') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_session_steps_tenant_session_exercise_step` (`tenant_id`, `session_id`, `exercise_id`, `step`),
  CONSTRAINT `fk_conquer_session_steps_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_session_steps_session_id_conquer_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `conquer_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_session_steps_exercise_id_conquer_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `conquer_exercises` (`id`),
  CONSTRAINT `conquer_session_steps_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`rung_id`) REFERENCES `conquer_rungs` (`id`)
);
--> statement-breakpoint
CREATE TABLE `conquer_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `type` enum('molestia','caida','tope_escalera','paso_nivel') NOT NULL,
  `detail` json NOT NULL,
  `dedupe_key` varchar(120) NOT NULL,
  `status` enum('abierta','vista','resuelta') NOT NULL DEFAULT 'abierta',
  `resolved_by` int NULL,
  `resolved_at` datetime NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_alerts_tenant_user_type_dedupe` (`tenant_id`, `user_id`, `type`, `dedupe_key`),
  KEY `idx_conquer_alerts_tenant_status` (`tenant_id`, `status`),
  CONSTRAINT `fk_conquer_alerts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_alerts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_alerts_resolved_by_users_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `conquer_body_checks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `check_date` date NOT NULL,
  `kind` enum('dia0','periodico') NOT NULL,
  `photo_front_key` varchar(255) NULL,
  `photo_side_key` varchar(255) NULL,
  `photo_back_key` varchar(255) NULL,
  `arm_cm` decimal(5,1) NULL,
  `chest_cm` decimal(5,1) NULL,
  `shoulders_cm` decimal(5,1) NULL,
  `waist_cm` decimal(5,1) NULL,
  `weight_kg` decimal(5,1) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_body_checks_tenant_user_date` (`tenant_id`, `user_id`, `check_date`),
  CONSTRAINT `fk_conquer_body_checks_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_body_checks_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
