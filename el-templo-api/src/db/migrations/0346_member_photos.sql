-- 0346_member_photos.sql
-- Fase 214 Foto propia (D-30, D-31, D-34, D-45, D-50).
--
-- Tabla gym-owned que nace strict (modulo `members`): una fila por foto que se
-- muestra en la comunidad. Hay dos origenes (photo_origin): 'alumno' (la sube
-- el alumno, pasa por aprobacion del staff y da los 5 Aura de la primera) y
-- 'ficha' (la foto que el staff subio a la ficha, copiada al bucket privado
-- la primera vez que se muestra). source_url guarda la users.photo_url copiada
-- para detectar si el staff la cambio.
--
-- Estados (member_photo_status): pendiente, aprobada, rechazada, quitada,
-- reemplazada, fallida. rules_accepted_at registra que el alumno acepto las
-- normas antes de subir (D-50) y es NULL en las de ficha. reporter_ids es un
-- arreglo JSON con los ids de quienes reportaron la foto (un reporte por
-- persona) y report_count es su largo.
--
-- Sin ninguna UNIQUE a proposito: la invariante (como mucho una pendiente y una
-- aprobada por persona y origen) se impone en el servicio con SELECT FOR
-- UPDATE, para no sumar una entrada a TENANT_UNIQUE_ALLOWLIST. Lleva
-- tenant_id NOT NULL DEFAULT 1 y su FK a tenants desde el primer dia.
-- Los timestamps NULL llevan NULL DEFAULT NULL explicito para que MySQL no
-- auto-pueble el primer TIMESTAMP de la tabla.
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

CREATE TABLE `member_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `storage_key` varchar(255) NOT NULL,
  `photo_origin` varchar(10) NOT NULL DEFAULT 'alumno',
  `source_url` varchar(512) NULL,
  `member_photo_status` enum('pendiente','aprobada','rechazada','quitada','reemplazada','fallida') NOT NULL DEFAULT 'pendiente',
  `rules_accepted_at` timestamp NULL DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `reviewed_by` int NULL,
  `rejection_reason` varchar(20) NULL,
  `report_count` int NOT NULL DEFAULT 0,
  `reporter_ids` json NULL,
  `last_reported_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_member_photos_tenant_status_uploaded` (`tenant_id`, `member_photo_status`, `uploaded_at`),
  KEY `idx_member_photos_tenant_user_status` (`tenant_id`, `user_id`, `member_photo_status`),
  CONSTRAINT `fk_member_photos_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_member_photos_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_photos_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
