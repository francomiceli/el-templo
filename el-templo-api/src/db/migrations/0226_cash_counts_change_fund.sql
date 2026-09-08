-- 0226_cash_counts_change_fund.sql
-- Arqueo / cierre de caja del profe (feedback caja/cobros 2026-09-08, brief de
-- Nacho, opcion A elegida por Franco). Hand-written (db:generate roto).
--
-- 1) cash_registers.change_fund: fondo de cambio fijo de la caja de efectivo
--    (plata que se queda siempre en el cajon para dar vuelto). Parametrizable
--    por caja desde el admin, default 0. Nunca entra al monto a retirar.
--
-- 2) cash_counts: un arqueo = alguien conto la plata de una caja. Guarda el
--    esperado como snapshot (fondo + firme + pendiente) y lo contado. NO toca
--    financial_transactions: la diferencia queda registrada con nota y la
--    decide gestion. Nace con tenant_id y entra a TENANT_STRICT_MODULES
--    (finance) desde el arranque.
--
-- Cero datos: staging y prod comparten MySQL, todo DDL corre contra prod.

ALTER TABLE cash_registers ADD COLUMN change_fund INT NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `cash_counts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `cash_register_id` int NOT NULL,
  `counted_by` int NOT NULL,
  `staff_shift_id` int NULL,
  `counted_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `change_fund` int NOT NULL,
  `firme_amount` int NOT NULL,
  `pendiente_amount` int NOT NULL,
  `expected_amount` int NOT NULL,
  `counted_amount` int NOT NULL,
  `difference` int NOT NULL,
  `payments_count` int NOT NULL DEFAULT 0,
  `notes` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cash_counts_tenant_register_at` (`tenant_id`, `cash_register_id`, `counted_at`),
  CONSTRAINT `fk_cash_counts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `cash_counts_cash_register_id_cash_registers_id_fk` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`id`),
  CONSTRAINT `cash_counts_counted_by_users_id_fk` FOREIGN KEY (`counted_by`) REFERENCES `users` (`id`),
  CONSTRAINT `cash_counts_staff_shift_id_staff_shifts_id_fk` FOREIGN KEY (`staff_shift_id`) REFERENCES `staff_shifts` (`id`)
);
