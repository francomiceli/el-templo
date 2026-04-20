-- Add 'recepcion' role to users.role enum.
-- Role scope: full access to alumnos and horarios only.

ALTER TABLE `users` MODIFY COLUMN `role` enum('member','coach','admin','owner','gestion','recepcion') NOT NULL;
