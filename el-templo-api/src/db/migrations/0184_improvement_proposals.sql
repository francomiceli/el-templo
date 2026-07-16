-- 0184_improvement_proposals.sql
-- Propuestas de mejora por sucursal (brief Nacho 2026-07-15): tabla nueva
-- improvement_proposals -- texto libre del socio, sucursal resuelta
-- server-side desde users.branch_id y denormalizada al momento del envío.
-- Hand-written (db:generate pega contra el drift interactivo conocido, ver
-- 0182). NEVER drizzle-kit push/migrate -- la tabla _migrations es la única
-- fuente de verdad, local y prod.
--
-- Numeración: la última en staging es 0183 -- este archivo es el siguiente
-- libre real (0184).
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el
-- runner parte los statements crudos primero y recién después borra los
-- comentarios de doble guion.

CREATE TABLE `improvement_proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int NOT NULL,
  `branch_id` int NOT NULL,
  `proposal` varchar(1000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_improvement_proposals_branch_created` (`branch_id`, `created_at`),
  KEY `idx_improvement_proposals_member_created` (`member_id`, `created_at`),
  CONSTRAINT `improvement_proposals_member_id_users_id_fk` FOREIGN KEY (`member_id`) REFERENCES `users` (`id`),
  CONSTRAINT `improvement_proposals_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
