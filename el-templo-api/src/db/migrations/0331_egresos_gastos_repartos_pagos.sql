-- 0331_egresos_gastos_repartos_pagos.sql
-- Fase 209 Egresos (DI-01): gasto, reparto entre sedes y pagos.
--
-- Tres tablas gym-owned que nacen strict (modulo `finance`): expense_records
-- (el gasto que carga administracion), expense_allocations (el reparto del
-- gasto entre sedes y Casa Matriz) y expense_payments (cada pago, que apunta a
-- su fila `kind expense` del ledger financial_transactions). Llevan tenant_id
-- NOT NULL DEFAULT 1 y su FK a tenants desde el primer dia. Todo UNIQUE empieza
-- por tenant_id.
--
-- La plata va en unidades ENTERAS (D-23): todo importe es int. El unico
-- decimal es fx_rate DECIMAL(12,4), el tipo de cambio cargado a mano, que es
-- informativo y nunca se suma ni se compara. El equivalente en pesos se
-- calcula una vez al guardar y se persiste entero (amount_ars).
--
-- Casa Matriz = branch_id NULL en expense_allocations. No hay unique por
-- (gasto, sede) porque un NULL repetido no lo atraparia la unique: la regla
-- de destinos sin repetir y a lo sumo una Casa Matriz vive en el service.
--
-- payment_method es varchar(20) con la lista validada en la API, no enum de
-- DB. amount_status distingue el importe estimado del confirmado.
--
-- Orden de creacion segun las FK: expense_records, expense_allocations,
-- expense_payments.
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

CREATE TABLE `expense_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `country` varchar(2) NOT NULL,
  `concept` varchar(200) NOT NULL,
  `beneficiary` varchar(200) NULL,
  `cost_center_id` int NOT NULL,
  `imputation_month` char(7) NOT NULL,
  `amount` int NOT NULL,
  `currency` varchar(3) NOT NULL,
  `amount_status` enum('estimado','confirmado') NOT NULL,
  `fx_rate` decimal(12,4) NULL,
  `receipt_links` json NULL,
  `notes` text NULL,
  `idempotency_key` varchar(64) NULL,
  `created_by` int NOT NULL,
  `voided_at` timestamp NULL,
  `voided_by` int NULL,
  `void_reason` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_records_tenant_idempotency` (`tenant_id`, `idempotency_key`),
  KEY `idx_expense_records_tenant_country_month` (`tenant_id`, `country`, `imputation_month`),
  KEY `idx_expense_records_tenant_cost_center` (`tenant_id`, `cost_center_id`),
  CONSTRAINT `fk_expense_records_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `expense_records_cost_center_id_cost_centers_id_fk` FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers` (`id`),
  CONSTRAINT `expense_records_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `expense_records_voided_by_users_id_fk` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_allocations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `expense_record_id` int NOT NULL,
  `branch_id` int NULL,
  `amount` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_expense_allocations_tenant_record` (`tenant_id`, `expense_record_id`),
  KEY `idx_expense_allocations_tenant_branch` (`tenant_id`, `branch_id`),
  CONSTRAINT `fk_expense_allocations_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `expense_allocations_expense_record_id_expense_records_id_fk` FOREIGN KEY (`expense_record_id`) REFERENCES `expense_records` (`id`) ON DELETE CASCADE,
  CONSTRAINT `expense_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT 1,
  `expense_record_id` int NOT NULL,
  `transaction_id` int NOT NULL,
  `paid_on` date NOT NULL,
  `cash_register_id` int NOT NULL,
  `payment_method` varchar(20) NOT NULL,
  `amount` int NOT NULL,
  `currency` varchar(3) NOT NULL,
  `applied_amount` int NOT NULL,
  `fx_rate` decimal(12,4) NULL,
  `amount_ars` int NULL,
  `reference` varchar(100) NULL,
  `notes` text NULL,
  `idempotency_key` varchar(64) NULL,
  `created_by` int NOT NULL,
  `voided_at` timestamp NULL,
  `voided_by` int NULL,
  `void_reason` text NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_payments_tenant_idempotency` (`tenant_id`, `idempotency_key`),
  UNIQUE KEY `uq_expense_payments_tenant_transaction` (`tenant_id`, `transaction_id`),
  KEY `idx_expense_payments_tenant_record` (`tenant_id`, `expense_record_id`),
  KEY `idx_expense_payments_tenant_paid_on` (`tenant_id`, `paid_on`),
  KEY `idx_expense_payments_tenant_register` (`tenant_id`, `cash_register_id`),
  CONSTRAINT `fk_expense_payments_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `expense_payments_expense_record_id_expense_records_id_fk` FOREIGN KEY (`expense_record_id`) REFERENCES `expense_records` (`id`),
  CONSTRAINT `expense_payments_transaction_id_financial_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `financial_transactions` (`id`),
  CONSTRAINT `expense_payments_cash_register_id_cash_registers_id_fk` FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers` (`id`),
  CONSTRAINT `expense_payments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`),
  CONSTRAINT `expense_payments_voided_by_users_id_fk` FOREIGN KEY (`voided_by`) REFERENCES `users` (`id`)
);
