-- 0300_wellhub_usuarios.sql
-- Fase 204 Usuarios Wellhub (D-19, D-23, D-28): base de datos de la fase.
--
-- Hace dos cosas:
--   1. attendance.attendance_source suma 'wellhub_manual' (append-last): visita
--      Wellhub marcada a mano por el staff, que Wellhub no ve ni paga. Es un
--      valor distinto de 'wellhub' para que todos los totales actuales la sigan
--      contando y el reporte pueda separar validadas vs manuales con un GROUP BY.
--   2. Tabla gym-owned wellhub_conversions: una fila por conversion de un usuario
--      Wellhub a socio (D-04, D-23). Nace tenancy-native, por eso lleva tenant_id
--      y su FK desde el primer dia.
--
-- Valores de kind: nuevo = venia con estado wellhub, ex_alumno = venia inactivo,
-- otro = cualquier otro caso. from_status guarda el estado previo del usuario.
--
-- Sin backfill: el piloto arranco 2026-10-27 y no hay conversiones historicas.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: nunca drizzle-kit push/migrate, la tabla _migrations es la
-- unica fuente de verdad.
--
-- Numeracion: 0300 porque la 0298 y la 0299 estan reservadas por la rama
-- feat/201-conquer.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

ALTER TABLE `attendance` MODIFY COLUMN `attendance_source` enum('qr','manual','wellhub','wellhub_manual') NOT NULL DEFAULT 'qr';

CREATE TABLE `wellhub_conversions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `subscription_id` int NOT NULL,
  `plan_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `from_status` varchar(16) NULL,
  `kind` varchar(16) NOT NULL,
  `local_date` varchar(10) NOT NULL,
  `converted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_wellhub_conversions_tenant_user_sub` (`tenant_id`, `user_id`, `subscription_id`),
  KEY `idx_wellhub_conversions_tenant_branch_date` (`tenant_id`, `branch_id`, `local_date`),
  CONSTRAINT `fk_wellhub_conversions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `wellhub_conversions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `wellhub_conversions_subscription_id_subscriptions_id_fk` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`)
);
