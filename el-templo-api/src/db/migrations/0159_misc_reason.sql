-- Phase 145-01 — add `misc_reason` enum column to financial_transactions (COBRO-01)
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type
-- interactive drift (same reason 0153/0154/0155/0158 were hand-written) and the
-- meta/_journal.json is stale, so generate would mis-number this file.
-- Next sequential number on this branch is 0159 (last applied 0158).
-- NEVER drizzle-kit push/migrate -- the _migrations table is the source of truth.
--
-- The column is named `misc_reason` (1st arg of mysqlEnum in
-- financial-transactions.ts), and stores WHY a cobro suelto was charged:
--   'sin_plan' = el socio no tiene plan activo (caso operativo principal)
--   'otro'     = cualquier otro motivo libre
-- NULLABLE on purpose: only kind='advance_payment' (cobro suelto) rows set it.
-- Every other row (plan_charge, debt_settlement, refund, adjustment,
-- advance_payment historical, cash_transfer, expense) stays NULL. No new index.
-- Placed AFTER `notes` to mirror the schema property order. The motivo is a
-- STRUCTURED field, NOT folded into the free-text `notes`.

ALTER TABLE `financial_transactions`
  ADD COLUMN `misc_reason` enum('sin_plan','otro') NULL AFTER `notes`;
