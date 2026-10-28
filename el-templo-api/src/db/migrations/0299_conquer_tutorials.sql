-- 0299_conquer_tutorials.sql
-- Fase 201 (Conquer v2), pedidos del UAT en staging, D-25: tutoriales en video,
-- uno por ejercicio o por combo, que sube el coach desde el admin.
--
-- Gym-owned y strict desde el primer dia: tenant_id NOT NULL DEFAULT 1 con FK a
-- tenants. Todo UNIQUE empieza por tenant_id.
--
-- La fila es de un ejercicio (exercise_id) o de un combo (combo_key), uno u
-- otro: lo valida el servicio. Los dos UNIQUE admiten varios NULL, asi que las
-- filas de combo no chocan entre si por exercise_id ni al reves.
--
-- video_key apunta al bucket R2 PUBLICO bajo conquer/tutorials/.
--
-- Depende de la 0290 (conquer_exercises).
--
-- Cero datos en esta migracion (staging y prod comparten servidor MySQL, todo
-- DDL commiteado corre contra prod). Los tutoriales los carga el coach.
--
-- Hand-written: nunca drizzle-kit push/migrate/generate, la tabla _migrations
-- es la unica fuente de verdad.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `conquer_tutorials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `exercise_id` int NULL,
  `combo_key` varchar(16) NULL,
  `video_key` varchar(255) NOT NULL,
  `uploaded_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conquer_tutorials_tenant_exercise` (`tenant_id`, `exercise_id`),
  UNIQUE KEY `uq_conquer_tutorials_tenant_combo` (`tenant_id`, `combo_key`),
  CONSTRAINT `fk_conquer_tutorials_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `conquer_tutorials_exercise_id_conquer_exercises_id_fk` FOREIGN KEY (`exercise_id`) REFERENCES `conquer_exercises` (`id`) ON DELETE CASCADE,
  CONSTRAINT `conquer_tutorials_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
