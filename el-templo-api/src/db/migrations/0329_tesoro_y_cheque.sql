-- Fase 208 Plan 01: Tesoro (cuenta de efectivo sin sede) y medio de pago cheque.
--
-- is_treasury marca la reserva de efectivo "Tesoro" (una por moneda), distinta
-- de la Caja central. Tesoro = efectivo + branch_id NULL + is_treasury TRUE.
-- Central = efectivo + branch_id NULL + is_treasury FALSE. El invariante
-- (solo efectivo y sin sede) vive en el service, no en un CHECK. Todas las
-- cajas existentes quedan en FALSE por el DEFAULT.
--
-- El valor 'cheque' se agrega AL FINAL del enum payment_method para no alterar
-- el orden de los valores previos. Es medio de pago de egresos (fase 209): los
-- cobros siguen sin aceptarlo. El nombre de columna debe coincidir con el 1er
-- arg de mysqlEnum en src/db/schema/financial-transactions.ts.
--
-- Escrita a mano (db:generate sigue roto por el drift de goal_plan_type).

ALTER TABLE `cash_registers` ADD COLUMN `is_treasury` BOOLEAN NOT NULL DEFAULT FALSE AFTER `currency`;

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `payment_method` enum('cash','transfer','card','aura_credit','internal','direct_debit','cheque') NOT NULL;
