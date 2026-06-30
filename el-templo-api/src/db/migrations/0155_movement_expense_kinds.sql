-- Phase 139-01 — cash_transfer + expense kinds, member_id + branch_id nullable (MOV-01..04, D-06)
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift (same reason 0153/0154 were hand-written). NEVER drizzle-kit push/migrate.
-- enum order MUST match the mysqlEnum in financial-transactions.ts byte-for-byte
-- (enum drift = CI "Unknown column" that tsc cannot detect). The 2 new values are
-- APPENDED last, the 5 existing ones keep their order.
--
-- All three statements are additive/non-destructive  no row is rewritten and the
-- FKs (member_id to users.id, branch_id to branches.id) are preserved by MySQL
-- MODIFY (a nullability change does not require dropping/re-adding the FK).
-- Loosening NOT NULL on member_id (D-06) and branch_id (extends D-06) lets
-- egresos/movimientos store NULL socio and NULL sucursal honestly.

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `kind`
  enum('plan_charge','debt_settlement','refund','adjustment','advance_payment','cash_transfer','expense')
  NOT NULL;

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `member_id` int NULL;

ALTER TABLE `financial_transactions`
  MODIFY COLUMN `branch_id` int NULL;
