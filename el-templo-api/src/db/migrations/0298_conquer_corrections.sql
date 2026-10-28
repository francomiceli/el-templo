-- 0298_conquer_corrections.sql
-- Fase 201 (Conquer v2), pedidos del UAT en staging, D-26 a D-28: correcciones
-- con video. El alumno manda un video de hasta 30 segundos de un escalon o de
-- un combo y el coach responde con texto y/o video (una sola respuesta, final).
--
-- Gym-owned y strict desde el primer dia: tenant_id NOT NULL DEFAULT 1 con FK a
-- tenants. Todo UNIQUE empieza por tenant_id.
--
-- El objetivo es un escalon (exercise_id mas step) o un combo (combo_key), uno u
-- otro: lo valida el servicio. rung_id guarda el peldano del momento.
--
-- video_key y reply_video_key apuntan al bucket R2 PRIVADO bajo el prefijo
-- private/conquer-corrections/ y nunca se loguean. video_key queda NULL cuando
-- el alumno borra su video (video_deleted_at y video_deleted_by).
--
-- El UNIQUE (tenant_id, video_key) impide que dos correcciones compartan una
-- clave. MySQL admite varios NULL en un UNIQUE, asi que los videos borrados no
-- chocan entre si.
--
-- Depende de la 0290 (conquer_exercises y conquer_rungs).
--
-- Cero datos en esta migracion (staging y prod comparten servidor MySQL, todo
-- DDL commiteado corre contra prod).
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `conquer_corrections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `exercise_id` int NULL,
  `step` enum('e1','e2','e3','hold') NULL,
  `combo_key` varchar(16) NULL,
  `rung_id` int NULL,
  `comment` varchar(500) NULL,
  `video_key` varchar(255) NULL,
  `video_seconds` smallint NOT NULL,
  `video_deleted_at` datetime NULL,
  `video_deleted_by` int NULL,
  `status` enum('pendiente','respondida') NOT NULL DEFAULT 'pendiente',
  `reply_text` varchar(1000) NULL,
  `reply_video_key` varchar(255) NULL,
  `reply_video_seconds` smallint NULL,
  `replied_by` int NULL,
  `replied_at` datetime NULL,
  `reply_seen_at` datetime NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_corrections_tenant_video_key` (`tenant_id`, `video_key`),
  KEY `idx_conquer_corrections_tenant_status` (`tenant_id`, `status`, `created_at`),
  KEY `idx_conquer_corrections_tenant_user` (`tenant_id`, `user_id`, `status`),
  CONSTRAINT `fk_conquer_corrections_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_corrections_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_corrections_exercise_id_conquer_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `conquer_exercises` (`id`),
  CONSTRAINT `conquer_corrections_rung_id_conquer_rungs_id_fk` FOREIGN KEY (`rung_id`) REFERENCES `conquer_rungs` (`id`) ON DELETE SET NULL,
  CONSTRAINT `conquer_corrections_video_deleted_by_users_id_fk` FOREIGN KEY (`video_deleted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `conquer_corrections_replied_by_users_id_fk` FOREIGN KEY (`replied_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
