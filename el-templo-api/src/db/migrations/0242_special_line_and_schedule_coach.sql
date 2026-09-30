-- Linea del pase especial + profe por horario (2026-09-29, yoga de Moreno).
--
-- 1. activities.special_line y subscription_plans.special_line: un pase
--    especial solo habilita las actividades especiales de SU linea. NULL es la
--    linea "Actividades con Aura" (todas las especiales y pases previos quedan
--    en NULL, cero cambio de comportamiento). Asi el pase de yoga no sirve para
--    Verticales ni al reves, y un socio puede tener un pase de cada linea.
-- 2. schedules.coach_user_id: profe propio del horario. Pisa al profe del
--    turno del roster (class_coach_assignments, por dia y manana/tarde) solo
--    para ese horario. NULL = hereda el del turno. ON DELETE SET NULL para que
--    borrar un usuario nunca bloquee ni borre horarios.
--
-- Columnas nullable al final de cada tabla (INSTANT ADD COLUMN en MySQL 8).
-- Sin punto-y-coma dentro de comentarios (regla dura del skill).

ALTER TABLE `activities`
  ADD COLUMN `special_line` varchar(50) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `subscription_plans`
  ADD COLUMN `special_line` varchar(50) DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `schedules`
  ADD COLUMN `coach_user_id` int DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `schedules`
  ADD CONSTRAINT `schedules_coach_user_id_users_id_fk` FOREIGN KEY (`coach_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
