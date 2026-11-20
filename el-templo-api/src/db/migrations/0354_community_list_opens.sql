-- 0354_community_list_opens.sql
-- Fase 214 Comunidad, registro de aperturas de la lista de anotados (plan de
-- lanzamiento: medir en la semana 1, 2 y 4 cuantos alumnos abren la lista).
--
-- Tabla gym-owned que nace strict (modulo `scheduling`): una fila por alumno,
-- horario y fecha de clase (UNIQUE tenant_id, user_id, schedule_id,
-- session_date). Cada vez que la API responde bien la lista de anotados de esa
-- clase suma 1 a open_count y mueve last_opened_at. first_opened_at queda en la
-- primera apertura. session_date es la fecha local de la clase, igual que en
-- bookings y attendance.
--
-- user_id y schedule_id llevan ON DELETE CASCADE. El alumno: igual que
-- aura_gifts, member_photos y member_notifications, la fila es un dato propio
-- suyo y se va con la cuenta. El horario: el admin puede borrar un horario
-- (borra sus reservas y despues el horario) y una FK sin cascada haria fallar
-- ese borrado con un 500 para cualquier horario cuya lista se haya abierto.
--
-- El indice (tenant_id, session_date) sirve para los cortes por semana de los
-- reportes, que cuentan por la fecha local de la clase. Los timestamps llevan
-- DEFAULT CURRENT_TIMESTAMP explicito y los dos se llenan en la misma sentencia
-- del INSERT.
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

CREATE TABLE `community_list_opens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `schedule_id` int NOT NULL,
  `session_date` date NOT NULL,
  `open_count` int NOT NULL DEFAULT 1,
  `first_opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_opened_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_community_list_opens_tenant_user_slot` (`tenant_id`, `user_id`, `schedule_id`, `session_date`),
  KEY `idx_community_list_opens_tenant_date` (`tenant_id`, `session_date`),
  CONSTRAINT `fk_community_list_opens_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `fk_community_list_opens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_community_list_opens_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE CASCADE
);
