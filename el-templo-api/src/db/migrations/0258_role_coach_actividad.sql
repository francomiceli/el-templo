-- Nuevo rol coach_actividad (2026-10-06): profe de una actividad (p. ej. yoga)
-- que opera el piso como un coach pero SIN plata. No cobra, no ve caja ni
-- deudas ni planes, y en el detalle del alumno no ve nada financiero.
-- Misma superficie operativa que coach: alumnos, horarios, asistencia, TV,
-- planis y jornada. El recorte financiero lo hace isFinanceBlindRole
-- (shared/permissions.ts) y los sets de roles, no esta migracion.
--
-- Solo agrega el valor al final del enum. La lista previa es byte a byte la de
-- la migracion 0235 y la nueva es la de roleEnum en src/db/schema/users.ts.
-- Idempotente: volver a correr deja la misma lista final.
-- Sin punto-y-coma dentro de comentarios (regla dura del skill).

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv','admin_sede','coach_actividad') NOT NULL;
