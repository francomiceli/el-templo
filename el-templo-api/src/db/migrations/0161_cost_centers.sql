-- Phase 147-01 — cost_centers catalog + cost_center_id on the ledger (EGR-01/02/03)
-- Hand-written (db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift, same as 0154/0158, and meta/_journal.json is stale). Next sequential number
-- on this branch is 0161 (last applied 0160). NEVER drizzle-kit push/migrate -- the
-- _migrations table is the source of truth.
--
-- A SQL comment must never contain a statement separator char -- the runner splits
-- raw statements first and only then strips line comments.
--
-- Ordering is strict and load-bearing:
--   1. CREATE TABLE cost_centers
--   2. ALTER financial_transactions ADD cost_center_id (nullable FK) AFTER cash_register_id
--   3. SEED 4 AR cost centers, idempotent (re-run never duplicates)
--
-- country = varchar(2) (NOT an enum), modeled like branches.country, so no new enum
-- is introduced (decision 7 of the CONTEXT). cost_center_id is NULLABLE at the DB
-- level (historical rows + non-expense kinds stay NULL) and mandatory at the app
-- level ONLY for kind='expense' (validated in movement-service.registerExpense).

-- 1. cost_centers catalog
CREATE TABLE `cost_centers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `country` varchar(2) NOT NULL DEFAULT 'AR',
  `is_active` boolean NOT NULL DEFAULT true,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `cost_centers_id` PRIMARY KEY(`id`),
  INDEX `idx_cost_centers_country_active` (`country`, `is_active`)
);

-- 2. cost_center_id on the ledger (nullable FK), placed right after cash_register_id
ALTER TABLE `financial_transactions`
  ADD COLUMN `cost_center_id` int NULL AFTER `cash_register_id`;

ALTER TABLE `financial_transactions`
  ADD CONSTRAINT `financial_transactions_cost_center_id_cost_centers_id_fk`
  FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`id`);

-- 3. SEED 4 AR cost centers, idempotent. INSERT ... SELECT ... FROM DUAL WHERE NOT
-- EXISTS keyed on (name, country) so a re-run never duplicates. Selecting FROM a
-- derived/DUAL row (not from cost_centers itself) avoids error 1093 (cannot read and
-- write the same table in one INSERT...SELECT). "Varios" is the mandatory escape.
INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Alquiler Constitución', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Alquiler Constitución' AND cc.`country` = 'AR'
);

INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Librería', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Librería' AND cc.`country` = 'AR'
);

INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Viáticos profes', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Viáticos profes' AND cc.`country` = 'AR'
);

INSERT INTO `cost_centers` (`name`, `country`, `is_active`)
SELECT 'Varios', 'AR', true FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM `cost_centers` cc
  WHERE cc.`name` = 'Varios' AND cc.`country` = 'AR'
);
