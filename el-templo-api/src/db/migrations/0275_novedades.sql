-- 0275_novedades.sql
-- Novedades en Mi Templo (feature suelta, fuera de las fases 196-199): un feed
-- de oraciones cortas que el admin carga desde Comunicaciones y la app muestra
-- arriba de todo en Mi Templo. Crea `novedades` y `novedad_views`. Las dos
-- tablas nacen con tenant_id desde el arranque (mismo criterio que `avisos`,
-- migracion 0216).
--
-- Tabla propia y no un placement de `avisos` (D-1): `avisos` exige boton,
-- destino y frecuencia NOT NULL, y las apps viejas mostrarian las tarjetas en
-- el carrusel. El modelo base es `tv_avisos`.
--
-- Unicidades:
--   uq_novedad_views_novedad_user (novedad_id, user_id) -- una fila por
--     novedad y socio (D-5). Derivada de FK scopeada: el primer campo
--     `novedad_id` apunta a `novedades`, tabla gym-owned -> va al allowlist de
--     tenant-tables.ts, sin tenant_id explicito en la unique (mismo caso que
--     `aviso_events.uq_aviso_events_aviso_user_type`).
--
-- Fechas: `publish_at`, `first_seen_at` y `clicked_at` son DATETIME en UTC
-- (Drizzle las escribe y lee como UTC). Las comparaciones contra "ahora" se
-- hacen con un parametro de la app y no con NOW() del servidor.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0216). NUNCA drizzle-kit
-- push/migrate -- la tabla _migrations es la unica fuente de verdad.
--
-- Numeracion: la 0275 salta a proposito porque las ramas 196 (0263-0269) y 195
-- (0270-0274) tienen numeros reservados sin pushear.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `novedades` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `text` varchar(80) NOT NULL,
  `scope_branch_ids` json NULL,
  `destination_type` enum('app_section','whatsapp_sales') NULL,
  `destination_section` varchar(40) NULL,
  `whatsapp_text` varchar(300) NULL,
  `publish_at` datetime NOT NULL,
  `status` enum('active','paused') NOT NULL DEFAULT 'active',
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_novedades_tenant_status_publish` (`tenant_id`, `status`, `publish_at`),
  CONSTRAINT `fk_novedades_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `novedades_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
--> statement-breakpoint

CREATE TABLE `novedad_views` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `novedad_id` int NOT NULL,
  `user_id` int NOT NULL,
  `first_seen_at` datetime NOT NULL,
  `clicked_at` datetime NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_novedad_views_novedad_user` (`novedad_id`, `user_id`),
  KEY `idx_novedad_views_user` (`user_id`),
  CONSTRAINT `fk_novedad_views_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `novedad_views_novedad_id_novedades_id_fk` FOREIGN KEY (`novedad_id`) REFERENCES `novedades` (`id`) ON DELETE CASCADE,
  CONSTRAINT `novedad_views_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
