-- 0241_trial_followups.sql
-- Cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26).
-- Ver SPEC en scratchpad (seccion "DECISIONES DE FRANCO" manda sobre el
-- diseno original): NO existe un estado "Asistencia sin cargar" persistido -
-- todo estado de sesion se DERIVA en cada lectura desde bookings/attendance/
-- users.lead_status (ver modules/reports/trial-cadence.ts). Esta migracion
-- solo agrega lo que hace falta para guardar lo MANUAL de la cadencia.
--
-- Tres cambios:
--   1. trial_followups -- una fila por SESION de prueba (booking_id UNIQUE
--      por tenant), mensajes M1/M2/M3 + quien/cuando, respuesta, motivo de
--      Perdida manual, y el vinculo de reagenda (rescheduled_from_booking_id).
--      Nace tenant-scoped y STRICT (mismo criterio que renewal_followups,
--      migracion 0237) -- src/db/tenant-tables.ts TENANT_STRICT_MODULES
--      ["trial-followups"].
--   2. branches: 4 columnas TIME para las franjas de turno manana/tarde,
--      parametrizables por sede (brief SS3, defaults 07-11 / 17-21).
--   3. system_settings: semillas GLOBALES (esta tabla no lleva tenant_id, ver
--      src/db/tenant-tables.ts) para los parametros de la cadencia:
--      trials.followup_retry_hours=24, trials.max_reschedules=2,
--      trials.cadence_start_date=CURDATE() (corte go-live: sesiones
--      anteriores a esta fecha no generan proxima accion).
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184/0188/0189/0202/0215/0216/
-- 0223/0237). NUNCA drizzle-kit push/migrate -- la tabla _migrations es la
-- unica fuente de verdad, local y prod.
--
-- Numeracion: 0240 es la mas alta en el arbol al momento de escribir esta
-- migracion (verificado con `ls src/db/migrations/*.sql | sort | tail`). El
-- tren et-182 (modulo Gimnasio) corre desde 0242 en adelante.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `trial_followups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `booking_id` int NOT NULL,
  `m1_sent_at` timestamp NULL,
  `m1_sent_by` int NULL,
  `m2_kind` enum('venta','reagenda') NULL,
  `m2_sent_at` timestamp NULL,
  `m2_sent_by` int NULL,
  `m3_sent_at` timestamp NULL,
  `m3_sent_by` int NULL,
  `responded_at` timestamp NULL,
  `responded_by` int NULL,
  `lost_reason` enum('no_responde','precio','horario','distancia','otro') NULL,
  `lost_note` varchar(500) NULL,
  `rescheduled_from_booking_id` int NULL,
  `updated_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_trial_followups_tenant_booking` (`tenant_id`, `booking_id`),
  KEY `idx_trial_followups_tenant_rescheduled_from` (`tenant_id`, `rescheduled_from_booking_id`),
  CONSTRAINT `fk_trial_followups_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `trial_followups_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`),
  CONSTRAINT `trial_followups_m1_sent_by_users_id_fk` FOREIGN KEY (`m1_sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `trial_followups_m2_sent_by_users_id_fk` FOREIGN KEY (`m2_sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `trial_followups_m3_sent_by_users_id_fk` FOREIGN KEY (`m3_sent_by`) REFERENCES `users` (`id`),
  CONSTRAINT `trial_followups_responded_by_users_id_fk` FOREIGN KEY (`responded_by`) REFERENCES `users` (`id`),
  CONSTRAINT `trial_followups_rescheduled_from_booking_id_bookings_id_fk` FOREIGN KEY (`rescheduled_from_booking_id`) REFERENCES `bookings` (`id`),
  CONSTRAINT `trial_followups_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`)
);
--> statement-breakpoint

ALTER TABLE `branches`
  ADD COLUMN `trial_morning_start` time NOT NULL DEFAULT '07:00:00',
  ADD COLUMN `trial_morning_end` time NOT NULL DEFAULT '11:00:00',
  ADD COLUMN `trial_afternoon_start` time NOT NULL DEFAULT '17:00:00',
  ADD COLUMN `trial_afternoon_end` time NOT NULL DEFAULT '21:00:00';
--> statement-breakpoint

INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'trials.followup_retry_hours', '24'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'trials.followup_retry_hours'
);
--> statement-breakpoint

INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'trials.max_reschedules', '2'
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'trials.max_reschedules'
);
--> statement-breakpoint

INSERT INTO `system_settings` (`setting_key`, `setting_value`)
SELECT 'trials.cadence_start_date', CAST(CURDATE() AS CHAR)
WHERE NOT EXISTS (
  SELECT 1 FROM `system_settings` WHERE `setting_key` = 'trials.cadence_start_date'
);
