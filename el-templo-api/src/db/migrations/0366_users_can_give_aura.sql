-- Permiso por persona para dar el regalo de Aura del profe (2026-11-27).
-- Pedido de Franco: en Barcelona dan clases personas que en el sistema tienen
-- rol de recepción (Exequiel Torrone) y no podían regalar Aura porque solo los
-- profes podían. Con esta columna el dueño lo activa en la ficha del staff.
-- Solo cuenta para recepción y gestión (profes, admins de sede y admins ya
-- regalan por su rol, el dueño nunca).
-- Número 0366 porque feat/comunidad-2 ya ocupa hasta la 0365 sin pushear.
-- Escrita a mano (db:generate está roto por drift previo, ver el skill
-- el-templo-db-migrations). Sin punto y coma en los comentarios.
ALTER TABLE `users` ADD COLUMN `can_give_aura` boolean NOT NULL DEFAULT false AFTER `staff_disabled`;

-- Exequiel Torrone (staff de recepción en Barcelona, id 5857 en prod).
-- La guarda por nombre y rol evita tocar otra fila en una base donde ese id
-- sea otra persona (staging, tests).
UPDATE `users` SET `can_give_aura` = true
WHERE `id` = 5857 AND `role` = 'recepcion' AND `first_name` = 'Exequiel' AND `last_name` = 'Torrone';
