-- 0219_notification_templates_rules.sql
-- Pedido de Franco (2026-09-03): las notificaciones push propias se crean
-- con una condicion recetada (catalogo cerrado) evaluada por un job diario,
-- y el borrado/restauracion de plantillas se vuelve homogeneo entre
-- 'sistema' (TEMPLATE_SEEDS) y 'propias' (creadas por el editor admin).
--
-- Extiende `notification_templates` (NO se crea tabla nueva -- sigue
-- estando en el allowlist de tenant-tables.ts sin cambios, los conteos
-- 94/98 no se mueven):
--   kind: 'system' (default, TEMPLATE_SEEDS) | 'custom' (creada por el
--     admin con una regla). El default 'system' preserva las 17 filas
--     existentes sin backfill manual.
--   name: nombre interno, solo aplica a 'custom' (las de 'system' muestran
--     el label fijo del catalogo del admin, no esta columna).
--   trigger_type/trigger_value/trigger_segment: la condicion recetada.
--     Catalogo cerrado en RULE_TRIGGERS (src/modules/notifications/rules.ts).
--     trigger_value = N dias (NULL para segment_is, que no lleva numero).
--     trigger_segment reusa BYTE A BYTE los valores del enum member_segment
--     de member_profiles (member-profiles.ts): optima/regular/alerta/ausente.
--   scope_branch_ids/scope_countries: JSON NULL = sin filtro (todas las
--     sedes/paises del tenant) -- mismo patron que avisos.scope_branch_ids
--     de la migracion 0216.
--   cooldown_days: minimo de dias entre dos pushes de la MISMA regla al
--     MISMO socio (evita reenviar todos los dias mientras la condicion
--     se siga cumpliendo). Default 30, siempre NOT NULL (incluso 'system',
--     que no lo usa -- el motor de reglas solo itera kind='custom').
--   created_by: admin (users.id) que creo la regla propia. ON DELETE SET
--     NULL, mismo patron que referral_partners.created_by (migracion 0215).
--
-- FK de pending_notifications.template_id: pasa de RESTRICT (comportamiento
-- implicito de MySQL sin ON DELETE explicito, migracion 0062) a SET NULL.
-- Es lo que habilita borrar CUALQUIER template (D-homogeneidad: tambien los
-- de sistema) sin romper el historico de pending_notifications ya enviadas
-- -- quedan con template_id NULL, dato historico intacto. La columna ya
-- era nullable desde la 0062 (sin .notNull() en el schema), asi que no
-- hace falta ALTER de nulabilidad, solo recrear el constraint.
-- `NotificationService.queueNotification` ya tolera un template_key sin
-- fila (log.warn + return -1, no rompe) -- ese es el comportamiento
-- deseado tras borrar una plantilla de sistema.
--
-- Indice idx_notification_templates_tenant_kind (tenant_id, kind): el motor
-- de reglas (jobs/notification-rules.ts) filtra por tenant + kind='custom'
-- una vez por gimnasio activo, todos los dias.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215/0216/
-- 0217/0218). NUNCA drizzle-kit push/migrate -- la tabla _migrations es la
-- unica fuente de verdad, local y prod.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

ALTER TABLE `notification_templates`
  ADD COLUMN `kind` enum('system','custom') NOT NULL DEFAULT 'system',
  ADD COLUMN `name` varchar(120) NULL,
  ADD COLUMN `trigger_type` enum('plan_expires_in_days','plan_expired_days_ago','days_without_attendance','member_since_days','segment_is') NULL,
  ADD COLUMN `trigger_value` int NULL,
  ADD COLUMN `trigger_segment` enum('optima','regular','alerta','ausente') NULL,
  ADD COLUMN `scope_branch_ids` json NULL,
  ADD COLUMN `scope_countries` json NULL,
  ADD COLUMN `cooldown_days` int NOT NULL DEFAULT 30,
  ADD COLUMN `created_by` int NULL;
--> statement-breakpoint

ALTER TABLE `notification_templates`
  ADD CONSTRAINT `notification_templates_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
--> statement-breakpoint

CREATE INDEX `idx_notification_templates_tenant_kind` ON `notification_templates` (`tenant_id`, `kind`);
--> statement-breakpoint

ALTER TABLE `pending_notifications`
  DROP FOREIGN KEY `pending_notifications_template_id_notification_templates_id_fk`;
--> statement-breakpoint

ALTER TABLE `pending_notifications`
  ADD CONSTRAINT `pending_notifications_template_id_notification_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `notification_templates` (`id`) ON DELETE SET NULL;
