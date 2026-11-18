-- 0349_aura_gifts.sql
-- Fase 215 Regalar Aura (D-02, D-03, D-20).
--
-- Tabla gym-owned que nace strict (modulo `aura-gifts`): una fila por regalo de
-- Aura. Guarda quien dio (giver_user_id) y quien recibio (receiver_user_id), el
-- tipo de quien da (giver_kind: 'alumno' o 'profe'), la clase (branch_id,
-- schedule_id y session_date, la fecha local de la clase), las asistencias
-- involucradas, el motivo (reason), el monto (amount, para que anular revierta
-- exactamente lo dado) y el estado (aura_gift_status: vigente o anulado) con los
-- datos de la anulacion (voided_by_user_id, voided_at, void_cause).
--
-- Dos candados en la base. El regalo de alumno es uno por asistencia de quien da
-- (uq_aura_gifts_tenant_giver_attendance, D-02): los NULL del profe no chocan.
-- El profe regala una vez por dia a cada persona
-- (uq_aura_gifts_tenant_coach_day, D-03): los NULL del alumno no chocan. Ambos
-- UNIQUE llevan tenant_id primero. Un regalo anulado sigue ocupando el UNIQUE, asi
-- que anular no devuelve el cupo (D-09, el cupo se deriva de las asistencias).
--
-- Sin FK a attendance a proposito: las asistencias se borran al deshacer un
-- check-in y los regalos se anulan antes. El ledger de Aura referencia cada regalo
-- con reference_type aura_gift y reference_id igual al id de esta tabla.
--
-- Lleva tenant_id NOT NULL DEFAULT 1 y su FK a tenants desde el primer dia.
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

CREATE TABLE `aura_gifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `giver_user_id` int NOT NULL,
  `receiver_user_id` int NOT NULL,
  `giver_kind` varchar(10) NOT NULL,
  `branch_id` int NOT NULL,
  `schedule_id` int NULL,
  `session_date` date NOT NULL,
  `giver_attendance_id` int NULL,
  `receiver_attendance_id` int NOT NULL,
  `coach_gift_date` date NULL,
  `reason` varchar(20) NOT NULL,
  `amount` int NOT NULL,
  `aura_gift_status` enum('vigente','anulado') NOT NULL DEFAULT 'vigente',
  `voided_by_user_id` int NULL,
  `voided_at` timestamp NULL DEFAULT NULL,
  `void_cause` varchar(20) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aura_gifts_tenant_giver_attendance` (`tenant_id`, `giver_attendance_id`),
  UNIQUE KEY `uq_aura_gifts_tenant_coach_day` (`tenant_id`, `giver_user_id`, `receiver_user_id`, `coach_gift_date`),
  KEY `idx_aura_gifts_tenant_receiver_created` (`tenant_id`, `receiver_user_id`, `created_at`),
  KEY `idx_aura_gifts_tenant_giver_date` (`tenant_id`, `giver_user_id`, `session_date`),
  KEY `idx_aura_gifts_tenant_branch_date` (`tenant_id`, `branch_id`, `session_date`),
  KEY `idx_aura_gifts_tenant_receiver_attendance` (`tenant_id`, `receiver_attendance_id`),
  CONSTRAINT `fk_aura_gifts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_aura_gifts_giver` FOREIGN KEY (`giver_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aura_gifts_receiver` FOREIGN KEY (`receiver_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aura_gifts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  CONSTRAINT `fk_aura_gifts_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_aura_gifts_voided_by` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
