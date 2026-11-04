-- 0321_oficina_avisos.sql
-- Fase 205 Oficina: avisos automaticos activables por sede.
--
-- Una tabla gym-owned que nace strict (modulo `office`): office_auto_topic_mutes.
-- Cada fila silencia UN detector de temas automaticos para el gimnasio entero
-- (branch_id = 0) o para una sede puntual. Fila presente = silenciado, ausencia
-- = activo. branch_id = 0 significa "todo el gimnasio", por eso no lleva FK a
-- branches. Lleva tenant_id NOT NULL DEFAULT 1 con su FK a tenants desde el
-- primer dia, y la UNIQUE empieza por tenant_id.
--
-- detector es un varchar (no enum) con la union de claves en TypeScript, igual
-- que el resto de los estados nuevos de Oficina.
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

CREATE TABLE `office_auto_topic_mutes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `detector` varchar(40) NOT NULL,
  `branch_id` int NOT NULL DEFAULT 0,
  `created_by` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_office_auto_topic_mutes_tenant_detector_branch` (`tenant_id`, `detector`, `branch_id`),
  CONSTRAINT `fk_office_auto_topic_mutes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `office_auto_topic_mutes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
);
