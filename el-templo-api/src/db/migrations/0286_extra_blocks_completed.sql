-- 0286_extra_blocks_completed.sql
-- Fase 197 D-13: tabla propia del bloque libre de la tab Libre de Entrenar.
--
-- Cada fila es un bloque libre terminado por un socio. Es gym-owned y nace
-- strict (se registra en tenant-tables.ts en el plan 197-02), por eso lleva
-- tenant_id y su FK desde el primer dia.
--
-- NO escribe completed_sessions: por eso racha, programa, RPE de la evaluacion,
-- todaySession, completedDates y totalDaysTrained quedan intactos. Es el
-- invariante central de la fase.
--
-- exercises_completed es un JSON con ids de EJERCICIO (exercises.id), no ids de
-- prescripcion (ver riesgos.md seccion 4).
--
-- Fechas: started_at y ended_at son DATETIME en UTC. local_date es el dia en la
-- zona horaria de la sede en formato YYYY-MM-DD (mismo formato que
-- completed_sessions.date).
--
-- Sin UNIQUE a proposito: un socio puede hacer varios bloques libres el mismo
-- dia. El tope de una AURA por dia lo da aura_transactions (0285), no esta
-- tabla.
--
-- Cero datos de prueba en esta migracion (staging y prod comparten servidor
-- MySQL, todo DDL commiteado corre contra prod).
--
-- Hand-written: nunca drizzle-kit push/migrate, la tabla _migrations es la
-- unica fuente de verdad.
--
-- Numeracion: 0286 porque la 0284 queda reservada para la fase 196.
--
-- Un comentario SQL NUNCA debe contener el separador de statements, el
-- runner parte los statements crudos primero y recien despues borra los
-- comentarios de doble guion.

CREATE TABLE `extra_blocks_completed` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `user_id` int NOT NULL,
  `source_block_id` varchar(100) NOT NULL,
  `source_day_id` varchar(50) NOT NULL,
  `block_role` varchar(20) NOT NULL,
  `local_date` varchar(10) NOT NULL,
  `started_at` datetime NOT NULL,
  `ended_at` datetime NOT NULL,
  `duration_seconds` int NOT NULL,
  `exercises_completed` json NOT NULL,
  `aura_awarded` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_extra_blocks_tenant_user_date` (`tenant_id`, `user_id`, `local_date`),
  CONSTRAINT `fk_extra_blocks_completed_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `extra_blocks_completed_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
