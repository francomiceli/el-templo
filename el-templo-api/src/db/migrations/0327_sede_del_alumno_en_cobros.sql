-- 0327_sede_del_alumno_en_cobros.sql
-- Fase 207 (D-14, DI-07): financial_transactions.member_branch_id guarda la
-- sede del alumno AL MOMENTO del cobro (snapshot que no cambia si el alumno se
-- muda de sede). El backfill de los historicos va en 0328 para que un error del
-- backfill no deje este ALTER a medias.
--
-- D-23 (2026-11-11): los importes NO cambian de tipo. El paso a DECIMAL(14,2)
-- que traia esta migracion se retiro antes de aplicarla en ningun entorno, la
-- plata sigue en unidades enteras.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).
-- Sin datos en este archivo.

ALTER TABLE `financial_transactions` ADD COLUMN `member_branch_id` INT NULL AFTER `branch_id`, ADD CONSTRAINT `fk_financial_tx_member_branch` FOREIGN KEY (`member_branch_id`) REFERENCES `branches` (`id`), ADD INDEX `idx_financial_tx_tenant_member_branch_date` (`tenant_id`, `member_branch_id`, `transaction_date`);
