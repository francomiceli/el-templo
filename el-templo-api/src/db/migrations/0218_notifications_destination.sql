-- 0218_notifications_destination.sql
-- Fase 193 (D-01, D-02, D-04, D-05): la notificacion push adopta el destino
-- comun. Agrega 3 columnas a `notification_templates` y a
-- `pending_notifications`: `destination_type` (app_section|whatsapp_sales,
-- default app_section), `destination_section` (key curada de
-- modules/communications/destinations.ts, nullable) y `whatsapp_text`
-- (texto editable de WhatsApp de ventas, D-02, nullable -- NULL usa el
-- default global DEFAULT_WHATSAPP_TEXT en tiempo de envio).
--
-- `route` NO se borra ni se renombra (D-04): sigue siendo la ruta de
-- FALLBACK que consume la app vieja y los callers internos
-- (`queueNotification` con `routeOverride`, `TEMPLATE_SEEDS`). El destino
-- nuevo viaja en las 3 columnas de esta migracion, ademas de `route`.
--
-- Backfill: NINGUNO necesario. El DEFAULT `app_section` de
-- `destination_type` mas la columna `route` ya existente describen
-- correctamente las filas viejas (una ruta de texto libre es, de por si, un
-- destino de tipo app_section aunque no tenga una `destination_section`
-- curada asociada -- `destination_section` queda NULL para esas filas, y
-- `resolveDestinationRoute`/`fallbackRouteFor` de destinations.ts caen a
-- FALLBACK_ROUTE si algun consumidor futuro intenta resolverla sin
-- section, nunca truena).
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215/0216).
-- NUNCA drizzle-kit push/migrate -- la tabla _migrations es la unica fuente
-- de verdad, local y prod.
--
-- Numeracion: verificado 2026-09-02 con `git ls-tree --name-only
-- origin/master el-templo-api/src/db/migrations/` y lo mismo contra
-- origin/staging -- ambas ramas topean en 0215_referral_partners.sql. Este
-- worktree (et-193) ya tiene 0216_communications.sql y
-- 0217_seed_system_avisos.sql propios de esta misma fase (rama
-- feat/193-comunicaciones) -- 0218 es el siguiente libre real. Nota: la
-- base local `eltemplo` de este checkout tambien tiene aplicadas
-- `0216_platform_core.sql` y `0217_gym_catalog.sql` de la rama v6.1
-- (`et-182`/`et-185`, otro worktree) -- son archivos con OTRO nombre y no
-- colisionan (`_migrations` trackea por nombre de archivo). No se tocan ni
-- se renumeran.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

ALTER TABLE `notification_templates`
  ADD COLUMN `destination_type` enum('app_section','whatsapp_sales') NOT NULL DEFAULT 'app_section' AFTER `route`,
  ADD COLUMN `destination_section` varchar(40) DEFAULT NULL AFTER `destination_type`,
  ADD COLUMN `whatsapp_text` varchar(300) DEFAULT NULL AFTER `destination_section`;

ALTER TABLE `pending_notifications`
  ADD COLUMN `destination_type` enum('app_section','whatsapp_sales') NOT NULL DEFAULT 'app_section' AFTER `route`,
  ADD COLUMN `destination_section` varchar(40) DEFAULT NULL AFTER `destination_type`,
  ADD COLUMN `whatsapp_text` varchar(300) DEFAULT NULL AFTER `destination_section`;
