-- 0239_class_reminder_and_destination_backfill.sql
-- Fix "seccion de destino no es valida" (2026-09-24, Sentry NODE-5V, template
-- 2312) + soporte de datos para el recordatorio de clase (rama
-- fix/notificaciones-recordatorio). Dos partes independientes en un mismo
-- archivo porque las dos son parte del mismo pedido de Franco.
--
-- PARTE 1 -- backfill de destination_section
-- -------------------------------------------
-- `seedTemplates()` (notifications/service.ts) insertaba las 17 plantillas de
-- sistema originales SIN `destination_type`/`destination_section` (la
-- migracion 0218 agrego esas columnas sin backfill) -- quedaban con el
-- DEFAULT `app_section`/NULL. El admin (`PushRuleEditorDialog.vue`) cargaba
-- ese NULL, el selector (`DestinoSelector.vue`) lo mostraba con un default
-- visual (`APP_SECTIONS[0]`), y al guardar sin tocar nada el body seguia
-- mandando `section: null` -> `validateDestination` (communications/
-- destinations.ts) rechazaba con 400 "La seccion de destino no es valida".
-- El envio real nunca se rompio (la app cae a `data.route`), pero el admin no
-- podia editar ninguna plantilla de sistema con destino app_section.
--
-- Mapeo (identico al de `appSectionForRoute`, communications/destinations.ts,
-- y al que ahora usa `seedTemplates` para que un tenant nuevo no nazca con el
-- mismo bug):
--   /mi-templo      -> mi_templo
--   /reservas       -> reservas
--   /mis-referidos  -> referidos
--   /mi-camino      -> programas   (la ruta ya no existe en la app -- hoy esos
--                                   taps estan rotos, `programas` resuelve a
--                                   /planes, PlanesPage.vue)
--   cualquier otra  -> mi_templo   (mismo fallback que FALLBACK_ROUTE)
--
-- Aplica a TODAS las filas afectadas (system y custom, todos los tenants):
-- una plantilla propia con destino app_section y section NULL tiene
-- exactamente el mismo bug. Idempotente por el WHERE (section IS NULL) --
-- correrla dos veces es un no-op la segunda vez.
--
-- PARTE 2 -- columna de dedupe para el job class_reminder
-- ---------------------------------------------------------
-- El recordatorio de clase (turno manana 30 min antes, turno tarde 60 min
-- antes -- CLASS_REMINDER_MINUTES_MORNING/AFTERNOON en
-- jobs/notification-cron.ts) corre cada 5 minutos por gimnasio activo y tiene
-- que sobrevivir a que el mismo tick (o el siguiente) vuelva a ver la misma
-- reserva sin duplicar el envio. `pending_notifications.booking_id` guarda
-- que reserva origino la fila, el job chequea "ya existe una fila para este
-- booking_id" antes de encolar. Nullable: el resto de los templates no vienen
-- de una reserva y la dejan en NULL. ON DELETE SET NULL, mismo criterio que
-- `template_id` (migracion 0219) -- un hard-delete de la reserva (raro, ej.
-- regenerar bookings de un plan fijo) no debe tumbar el historial de
-- `pending_notifications`.
--
-- Sin datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/.../0218/0227/0234).
-- NUNCA drizzle-kit push/migrate -- la tabla _migrations es la unica fuente
-- de verdad, local y prod.
--
-- Numeracion: 0236 es la ultima migracion en origin/master al momento de
-- escribir esta. 0237 (rama de Renovaciones) y 0238 (app 1.7.9) son ramas
-- paralelas que corren en simultaneo -- 0239 es el siguiente numero libre
-- para esta rama (fix/notificaciones-recordatorio). No se renumera si alguna
-- de las otras dos ramas mergea primero: `_migrations` trackea por nombre de
-- archivo, los tres numeros son mutuamente independientes.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

UPDATE notification_templates
SET destination_section = CASE route
  WHEN '/mi-templo' THEN 'mi_templo'
  WHEN '/reservas' THEN 'reservas'
  WHEN '/mis-referidos' THEN 'referidos'
  WHEN '/mi-camino' THEN 'programas'
  ELSE 'mi_templo'
END
WHERE destination_type = 'app_section'
  AND destination_section IS NULL;

ALTER TABLE `pending_notifications`
  ADD COLUMN `booking_id` int DEFAULT NULL AFTER `template_id`;

ALTER TABLE `pending_notifications`
  ADD CONSTRAINT `pending_notifications_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL;

CREATE INDEX `idx_pending_notifications_booking_id` ON `pending_notifications` (`booking_id`);
