-- Phase 138-01 — cash_registers entity + cash_register_id on the ledger (CAJA-01, CAJA-02)
-- Hand-written (db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift, same as 0153). enum order MUST match the mysqlEnum in cash-registers.ts
-- byte-for-byte (enum drift = CI "Unknown column" that tsc cannot detect).
--
-- Ordering is strict and load-bearing:
--   1. CREATE TABLE cash_registers
--   2. ALTER financial_transactions ADD cash_register_id + FK + index
--   3. SEED 8 cajas (FK targets for the backfill)
--   4. BACKFILL historical cash_register_id (labels only, excluded from saldo by cutoff)
-- Step 3 MUST precede step 4 — the backfill FK targets must exist first.
--
-- D-04: caja efectivo de sucursal (branch_id=X), efectivo central (branch_id NULL),
-- banco POR MONEDA (branch_id NULL, una ARS y una EUR). D-06/D-07: opening_balance
-- arranca en 0, cutoff_date = go-live (CURDATE) sembrado con un único valor global.
-- D-05: el backfill etiqueta los históricos solo para reportes  el cutoff los excluye
-- del saldo, asi que el efectivo histórico NUNCA infla el saldo del dia 1.

-- 1. cash_registers table
CREATE TABLE `cash_registers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('efectivo','banco') NOT NULL,
  `branch_id` int NULL,
  `currency` varchar(3) NOT NULL,
  `opening_balance` int NOT NULL DEFAULT 0,
  `cutoff_date` date NOT NULL,
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cash_registers_id` PRIMARY KEY(`id`),
  CONSTRAINT `cash_registers_branch_id_branches_id_fk`
    FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`),
  INDEX `idx_cash_registers_type_currency` (`type`, `currency`),
  INDEX `idx_cash_registers_branch` (`branch_id`)
);

-- 2. cash_register_id on the ledger (nullable FK) + per-caja read index
ALTER TABLE `financial_transactions`
  ADD COLUMN `cash_register_id` int NULL AFTER `branch_id`;

ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `financial_transactions_cash_register_id_cash_registers_id_fk`
  FOREIGN KEY (`cash_register_id`) REFERENCES `cash_registers`(`id`);

ALTER TABLE `financial_transactions`
  ADD INDEX `idx_financial_tx_cash_register` (`cash_register_id`, `transaction_date`);

-- 3. SEED 8 cajas. Efectivo por sucursal vía SELECT keyed on branches (no ids
-- hardcodeados) filtrando virtual/inactiva (Pitfall 6 — la sucursal ONLINE no
-- recibe efectivo). Moneda derivada del country (ES -> EUR, si no ARS). Hoy
-- todas las fisicas son AR -> ARS. opening_balance 0, cutoff_date = CURDATE.
INSERT INTO `cash_registers` (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
SELECT
  CONCAT('Efectivo ', b.`name`) AS name,
  'efectivo' AS type,
  b.`id` AS branch_id,
  CASE WHEN b.`country` = 'ES' THEN 'EUR' ELSE 'ARS' END AS currency,
  0 AS opening_balance,
  CURDATE() AS cutoff_date,
  true AS is_active
FROM `branches` b
WHERE b.`is_virtual` = false AND b.`is_active` = true;

-- Efectivo central (branch_id NULL)
INSERT INTO `cash_registers` (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
VALUES ('Efectivo Central', 'efectivo', NULL, 'ARS', 0, CURDATE(), true);

-- Banco POR MONEDA (branch_id NULL) — D-04: una ARS, una EUR (EUR es forward-compat)
INSERT INTO `cash_registers` (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
VALUES ('Banco ARS', 'banco', NULL, 'ARS', 0, CURDATE(), true);

INSERT INTO `cash_registers` (`name`, `type`, `branch_id`, `currency`, `opening_balance`, `cutoff_date`, `is_active`)
VALUES ('Banco EUR', 'banco', NULL, 'EUR', 0, CURDATE(), true);

-- 4. BACKFILL historical cash_register_id (D-01, labels only, excluded from saldo by cutoff).
-- cash -> caja efectivo de la sucursal de la transaccion, misma moneda.
UPDATE `financial_transactions` ft
JOIN `cash_registers` cr
  ON cr.`type` = 'efectivo'
  AND cr.`branch_id` = ft.`branch_id`
  AND cr.`currency` = ft.`currency`
SET ft.`cash_register_id` = cr.`id`
WHERE ft.`payment_method` = 'cash'
  AND ft.`cash_register_id` IS NULL;

-- transfer/card -> caja banco de la moneda.
UPDATE `financial_transactions` ft
JOIN `cash_registers` cr
  ON cr.`type` = 'banco'
  AND cr.`currency` = ft.`currency`
SET ft.`cash_register_id` = cr.`id`
WHERE ft.`payment_method` IN ('transfer', 'card')
  AND ft.`cash_register_id` IS NULL;

-- aura_credit / internal -> ninguna caja (cash_register_id queda NULL). No-op deliberado.
