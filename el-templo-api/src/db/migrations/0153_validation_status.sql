-- Phase 137-01 — validation_status enum (VAL-01, VAL-05)
-- Orthogonal to the soft-void axis (voided_at). ANULADO stays as
-- voided_at IS NOT NULL  this enum is a separate axis. The 4 values and
-- their order MUST match the mysqlEnum in financial-transactions.ts
-- byte-for-byte (enum drift = CI "Unknown column" that tsc cannot detect).
--
-- DEFAULT 'validado' backfills every existing row so the 6 v5.0 management
-- metrics keep identical numbers (validado AND voided_at IS NULL equals the
-- old inflow AND voided_at IS NULL filter for all historical rows). The
-- ALTER is purely additive and non-destructive  no row is rewritten.

ALTER TABLE `financial_transactions`
  ADD COLUMN `validation_status`
  enum('pendiente','observado','corregido','validado')
  NOT NULL DEFAULT 'validado'
  AFTER `void_reason`;

ALTER TABLE `financial_transactions`
  ADD INDEX `idx_financial_tx_validation_voided` (`validation_status`, `voided_at`);
