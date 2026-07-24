-- 0189_tv_screen.sql
-- Fase 164 (pantalla TV de sucursal): tres tablas nuevas para el televisor que
-- muestra la planificacion viva del bloque en curso.
--   tv_devices     -- televisores vinculados, uno o varios por sede
--   tv_pairings    -- flujo de vinculacion device-code (RFC 8628), el TV no tiene teclado
--   tv_class_state -- estado de clase por sede, unico, que espejan N televisores
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184 y 0188). NUNCA drizzle-kit
-- push/migrate -- la tabla _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: 0188_bookings_trial_date_index.sql es la ultima tanto en
-- origin/master como en origin/staging, verificado antes de escribir este
-- archivo, asi que 0189 es el siguiente libre real en ambas ramas.
--
-- timer_started_at y paused_at son timestamp(3) A PROPOSITO: son los primeros
-- timestamps con milisegundos del repo. El tiempo no viaja por la red, viaja el
-- sello de arranque y cada TV calcula el transcurrido contra su propio reloj.
-- Con precision de segundos MySQL redondea y el timer puede arrancar hasta un
-- segundo adelantado, que sobre un tabata de 20s es 5 por ciento de error.
--
-- tv_devices no lleva columna de expiracion: el token del dispositivo no expira
-- (D-03), se corta por fila con is_active + revoked_at desde el admin.
--
-- token_hash y device_code_hash guardan solo el sha256 hex del secreto, nunca el
-- plaintext -- mismo patron que refresh_tokens de la fase 116.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el runner
-- parte los statements crudos primero y recien despues borra los comentarios de
-- doble guion.

CREATE TABLE `tv_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `paired_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tv_devices_token_hash_unique` (`token_hash`),
  KEY `idx_tv_devices_branch` (`branch_id`),
  CONSTRAINT `tv_devices_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `tv_devices_paired_by_users_id_fk` FOREIGN KEY (`paired_by`) REFERENCES `users` (`id`)
);

CREATE TABLE `tv_pairings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_code` varchar(6) NOT NULL,
  `device_code_hash` varchar(64) NOT NULL,
  `branch_id` int DEFAULT NULL,
  `device_name` varchar(100) DEFAULT NULL,
  `claimed_at` timestamp NULL DEFAULT NULL,
  `claimed_by` int DEFAULT NULL,
  `device_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tv_pairings_user_code_unique` (`user_code`),
  UNIQUE KEY `tv_pairings_device_code_hash_unique` (`device_code_hash`),
  CONSTRAINT `tv_pairings_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `tv_pairings_claimed_by_users_id_fk` FOREIGN KEY (`claimed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `tv_pairings_device_id_tv_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `tv_devices` (`id`)
);

CREATE TABLE `tv_class_state` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `class_date` date NOT NULL,
  `block_role` varchar(20) NOT NULL,
  `level` varchar(20) NOT NULL,
  `exercise_index` int NOT NULL DEFAULT 0,
  `screen` varchar(10) NOT NULL DEFAULT 'class',
  `timer_status` varchar(10) NOT NULL DEFAULT 'idle',
  `timer_started_at` timestamp(3) NULL DEFAULT NULL,
  `paused_at` timestamp(3) NULL DEFAULT NULL,
  `paused_accum_ms` int NOT NULL DEFAULT 0,
  `sound_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by` int DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tv_class_state_branch` (`branch_id`),
  CONSTRAINT `tv_class_state_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `tv_class_state_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
);
