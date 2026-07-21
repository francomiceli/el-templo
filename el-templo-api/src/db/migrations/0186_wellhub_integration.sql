-- 0186_wellhub_integration.sql
-- Integración Wellhub (ex Gympass) -- fundaciones de datos.
-- Hand-written (db:generate pega contra el drift interactivo conocido, ver
-- 0182). NEVER drizzle-kit push/migrate -- la tabla _migrations es la única
-- fuente de verdad, local y prod.
--
-- Numeración: staging y master están ambas en 0185 -- este archivo es el
-- siguiente libre real (0186).
--
-- Contenido:
--   1. users.status y user_status_history.from_status/to_status suman el
--      valor 'wellhub' (append-last, byte-idéntico a USER_STATUS_VALUES).
--   2. users.gympass_id -- id de 13 dígitos del usuario en Wellhub, único.
--   3. attendance.attendance_source suma 'wellhub' (append-last).
--   4. branches.wellhub_gym_id -- mapeo sede a gimnasio Wellhub, NULL = off.
--   5. Tablas nuevas wellhub_classes / wellhub_slots / wellhub_bookings /
--      wellhub_events (mapeos de identidad + log idempotente de webhooks).
-- Sin datos -- el alta del gym_id real por sede se hará por migración propia
-- cuando Wellhub entregue credenciales de producción.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recién después borra los
-- comentarios de doble guion.

ALTER TABLE `users` MODIFY COLUMN `status` enum('freemium','prueba','activo','inactivo','wellhub') NULL;

ALTER TABLE `user_status_history` MODIFY COLUMN `from_status` enum('freemium','prueba','activo','inactivo','wellhub') NULL;

ALTER TABLE `user_status_history` MODIFY COLUMN `to_status` enum('freemium','prueba','activo','inactivo','wellhub') NOT NULL;

ALTER TABLE `users` ADD COLUMN `gympass_id` varchar(16) NULL;

ALTER TABLE `users` ADD CONSTRAINT `users_gympass_id_unique` UNIQUE(`gympass_id`);

ALTER TABLE `attendance` MODIFY COLUMN `attendance_source` enum('qr','manual','wellhub') NOT NULL DEFAULT 'qr';

ALTER TABLE `branches` ADD COLUMN `wellhub_gym_id` bigint NULL;

ALTER TABLE `branches` ADD CONSTRAINT `branches_wellhub_gym_id_unique` UNIQUE(`wellhub_gym_id`);

CREATE TABLE `wellhub_classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `activity_id` int NOT NULL,
  `wellhub_class_id` bigint NOT NULL,
  `wellhub_product_id` bigint NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_classes_branch_activity` (`branch_id`, `activity_id`),
  UNIQUE KEY `idx_wellhub_classes_class_id` (`wellhub_class_id`),
  CONSTRAINT `wellhub_classes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `wellhub_classes_activity_id_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`)
);

CREATE TABLE `wellhub_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `wellhub_class_row_id` int NOT NULL,
  `schedule_id` int NOT NULL,
  `session_date` date NOT NULL,
  `wellhub_slot_id` bigint NOT NULL,
  `total_capacity` int NOT NULL,
  `total_booked` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_slots_schedule_date` (`schedule_id`, `session_date`),
  UNIQUE KEY `idx_wellhub_slots_slot_id` (`wellhub_slot_id`),
  KEY `idx_wellhub_slots_session_date` (`session_date`),
  CONSTRAINT `wellhub_slots_wellhub_class_row_id_wellhub_classes_id_fk` FOREIGN KEY (`wellhub_class_row_id`) REFERENCES `wellhub_classes` (`id`),
  CONSTRAINT `wellhub_slots_schedule_id_schedules_id_fk` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`)
);

CREATE TABLE `wellhub_bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_number` varchar(32) NOT NULL,
  `booking_id` int NULL,
  `user_id` int NOT NULL,
  `wellhub_slot_row_id` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_bookings_number` (`booking_number`),
  KEY `idx_wellhub_bookings_user` (`user_id`),
  CONSTRAINT `wellhub_bookings_booking_id_bookings_id_fk` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE SET NULL,
  CONSTRAINT `wellhub_bookings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `wellhub_bookings_wellhub_slot_row_id_wellhub_slots_id_fk` FOREIGN KEY (`wellhub_slot_row_id`) REFERENCES `wellhub_slots` (`id`)
);

CREATE TABLE `wellhub_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` varchar(128) NOT NULL,
  `event_type` varchar(32) NOT NULL,
  `payload` text NOT NULL,
  `status` varchar(16) NOT NULL,
  `error` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_events_event_id` (`event_id`),
  KEY `idx_wellhub_events_created_at` (`created_at`)
);
