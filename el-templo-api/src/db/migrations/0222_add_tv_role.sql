-- Rol 'tv': cuenta dedicada para loguear los televisores de las sedes.
-- Incidente 2026-09-07: las pantallas estaban logueadas con la cuenta de un
-- coach y al editarle las sedes desde Usuarios quedaron en 403 congeladas.
-- El rol 'tv' ve todas las sedes del gimnasio sin depender de user_branches
-- y solo accede a la seccion TV del admin.

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion','tv') NOT NULL;
