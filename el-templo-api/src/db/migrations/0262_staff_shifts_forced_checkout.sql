-- 0262_staff_shifts_forced_checkout.sql
-- Cierre forzado de jornada del staff (2026-10-08). Hasta hoy una jornada
-- abierta de otra persona solo se cerraba a mano por SQL, y mientras siguiera
-- abierta bloqueaba su check-in en todas las sedes. Ahora owner y admin pueden
-- forzar el check-out desde el tablero de jornadas.
--
-- 1. forced_checkout_by: usuario que forzo el cierre. NULL en un cierre normal.
--    ON DELETE SET NULL para que borrar un usuario nunca bloquee ni borre
--    jornadas.
-- 2. forced_checkout_reason: motivo libre obligatorio, hasta 255 caracteres.
--
-- Un cierre forzado deja checklist en NULL a proposito (marca de cierre no
-- normal). Columnas nullable al final de la tabla, cero datos en la migracion.
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente.
-- Los statements van separados con el marcador de breakpoint de drizzle, asi el
-- runner no parte el archivo por el separador de statements.

ALTER TABLE `staff_shifts`
  ADD COLUMN `forced_checkout_by` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `staff_shifts`
  ADD COLUMN `forced_checkout_reason` varchar(255) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `staff_shifts`
  ADD CONSTRAINT `staff_shifts_forced_checkout_by_users_id_fk` FOREIGN KEY (`forced_checkout_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
