-- Phase 140-01 — idempotency_key on financial_transactions (CARGA-02, D-09)
-- Hand-written: db:generate hits the pre-existing sessions.goal_plan_type interactive
-- drift (same reason 0153/0154/0155 were hand-written). NEVER drizzle-kit push/migrate.
--
-- Both statements are additive/non-destructive  no existing row is rewritten.
-- The column is nullable so every historical/admin row stays NULL, and MySQL
-- permits UNLIMITED NULLs in a UNIQUE index (only non-null values must be unique).
-- That makes the UNIQUE index a safe dedup key for coach loads (client-generated
-- opaque ticket UUID per Confirm) without ever colliding on the NULL legacy rows.

ALTER TABLE `financial_transactions`
  ADD COLUMN `idempotency_key` varchar(64) NULL AFTER `notes`;

ALTER TABLE `financial_transactions`
  ADD UNIQUE INDEX `uq_financial_tx_idempotency_key` (`idempotency_key`);
