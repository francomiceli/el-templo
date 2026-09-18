-- Renombre del rol 'inversor' a 'admin_sede' (pedido de Franco 2026-09-18):
-- la etiqueta visible pasa a "Admin sede" y el valor interno deja
-- de nombrar el vinculo economico. Permisos y alcance no cambian (hereda
-- gestion, alcance forzado a sus sedes de user_branches, ver migracion 0225).
--
-- MySQL no renombra un valor de enum en un paso si hay filas que lo usan
-- (staging tiene cuentas de UAT con ese rol), asi que se hace en tres:
--   1. agregar 'admin_sede' al final conservando 'inversor'
--   2. mover las filas
--   3. quitar 'inversor' -- la lista final es byte a byte la de roleEnum en
--      src/db/schema/users.ts (mismo orden, 'admin_sede' ultimo)
-- Idempotente: si ya corrio, el paso 1 vuelve a agregar el valor, el UPDATE
-- no matchea filas y el paso 3 deja la misma lista final.
-- Sin punto-y-coma dentro de comentarios (regla dura del skill).

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv','inversor','admin_sede') NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `role` = 'admin_sede' WHERE `role` = 'inversor';
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv','admin_sede') NOT NULL;
