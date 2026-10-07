-- 0270_branches_web_fields.sql
-- Fase 195 (D-10): `branches` pasa a ser la fuente unica de las sedes de la web
-- publica (eltemplo.org). El endpoint publico de solo lectura (plan 195-02) y
-- el build de la web (plan 195-03) leen estas columnas.
--
-- Una sola sentencia ALTER con las 16 columnas (todas nullable salvo
-- publish_on_web y web_kind, que llevan DEFAULT) mas la unique por tenant del
-- slug publico (patron de uq_branches_tenant_code, migracion 0196: toda unique
-- gym-owned arranca con tenant_id).
--
-- Los DATOS de cada sede (slug, nombre publico, geo) los carga la 0271. El
-- place_id, el telefono, el codigo postal y maps_url llegan despues con los
-- links que pasa Franco (plan 195-14).
--
-- Hand-written: bloque reservado 0270-0279 de la fase 195 (D-28). NUNCA
-- drizzle-kit push/migrate/generate -- la tabla _migrations es la unica fuente
-- de verdad, local y prod.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

ALTER TABLE `branches`
  ADD COLUMN `web_slug` varchar(60) NULL,
  ADD COLUMN `public_name` varchar(100) NULL,
  ADD COLUMN `publish_on_web` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `web_kind` enum('gym','community_space') NOT NULL DEFAULT 'gym',
  ADD COLUMN `locality` varchar(100) NULL,
  ADD COLUMN `region` varchar(100) NULL,
  ADD COLUMN `postal_code` varchar(20) NULL,
  ADD COLUMN `phone` varchar(30) NULL,
  ADD COLUMN `latitude` decimal(9,6) NULL,
  ADD COLUMN `longitude` decimal(9,6) NULL,
  ADD COLUMN `place_id` varchar(255) NULL,
  ADD COLUMN `maps_url` varchar(500) NULL,
  ADD COLUMN `photo_url` varchar(500) NULL,
  ADD COLUMN `gbp_location_id` varchar(100) NULL,
  ADD COLUMN `gbp_synced_hash` char(64) NULL,
  ADD COLUMN `gbp_synced_at` timestamp NULL;
--> statement-breakpoint

ALTER TABLE `branches`
  ADD UNIQUE KEY uq_branches_tenant_web_slug (tenant_id, web_slug);
