-- 0327_centavos_y_sede_del_alumno.sql
-- Fase 207 (D-06 centavos de punta a punta, D-14 sede del alumno en cada cobro).
--
-- DI-01: las columnas de importe del ledger y de las cajas pasan de INT/BIGINT
-- a DECIMAL(14,2) manteniendo la unidad (pesos o euros, NO centavos enteros).
-- Los enteros existentes quedan validos sin multiplicar y el contrato de la API
-- no cambia de unidad. DECIMAL(14,2) contiene todo INT sin perdida.
-- Misma nulabilidad y mismo default que antes en cada columna.
--
-- DI-03: los precios de catalogo (planes, promos, partners, comisiones, AURA,
-- referidos, subscriptions.price_paid) quedan enteros. Fuera de esta migracion.
--
-- DI-07: financial_transactions.member_branch_id guarda la sede del alumno AL
-- MOMENTO del cobro (snapshot). El backfill de los historicos va en 0328 para
-- que un error del backfill no deje estos ALTER a medias.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).
-- Sin datos en este archivo.

ALTER TABLE `financial_transactions` MODIFY `amount` DECIMAL(14,2) NOT NULL, ADD COLUMN `member_branch_id` INT NULL AFTER `branch_id`, ADD CONSTRAINT `fk_financial_tx_member_branch` FOREIGN KEY (`member_branch_id`) REFERENCES `branches` (`id`), ADD INDEX `idx_financial_tx_tenant_member_branch_date` (`tenant_id`, `member_branch_id`, `transaction_date`);
--> statement-breakpoint
ALTER TABLE `transaction_links` MODIFY `allocated_amount` DECIMAL(14,2) NOT NULL;
--> statement-breakpoint
ALTER TABLE `balances` MODIFY `amount` DECIMAL(14,2) NOT NULL;
--> statement-breakpoint
ALTER TABLE `cash_registers` MODIFY `opening_balance` DECIMAL(14,2) NOT NULL DEFAULT 0, MODIFY `change_fund` DECIMAL(14,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `cash_counts` MODIFY `change_fund` DECIMAL(14,2) NOT NULL, MODIFY `firme_amount` DECIMAL(14,2) NOT NULL, MODIFY `pendiente_amount` DECIMAL(14,2) NOT NULL, MODIFY `expected_amount` DECIMAL(14,2) NOT NULL, MODIFY `counted_amount` DECIMAL(14,2) NOT NULL, MODIFY `difference` DECIMAL(14,2) NOT NULL;
--> statement-breakpoint
ALTER TABLE `weekly_board_snapshots` MODIFY `cobrado` DECIMAL(14,2) NULL DEFAULT NULL, MODIFY `deuda_cobrable` DECIMAL(14,2) NULL DEFAULT NULL, MODIFY `deuda_mas_10` DECIMAL(14,2) NULL DEFAULT NULL, MODIFY `deuda_incobrable` DECIMAL(14,2) NULL DEFAULT NULL;
