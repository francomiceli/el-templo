-- Phase 101: Debt tracking — create debts table
--
-- Adds a single new table `debts` that flags members with outstanding debt.
-- The invariant "one active (non-cancelled) debt per user" is enforced at
-- the service layer (MySQL lacks partial unique indexes). Soft-cancel via
-- is_cancelled + cancelled_at preserves history for a future accounting
-- phase. No backfill needed: table is net-new.
--
-- Migration numbering note: plan specified 0094, but Phase 100 shipped
-- earlier and claimed 0094 (session_blocks.custom_title) and 0095
-- (insert_games_format). Renumbered to 0096 — next free slot.
--
-- Idempotency: the _migrations tracker prevents a successful file from
-- running twice. `CREATE TABLE` (no IF NOT EXISTS) is intentional — the
-- run-migrations.ts runner surfaces "table already exists" as a clear
-- error if someone manually applied the SQL outside the tracker.

CREATE TABLE debts (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  amount INT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ARS',
  note TEXT NULL,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_debts_user_id FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_debts_user_id (user_id),
  INDEX idx_debts_user_active (user_id, is_cancelled)
);
