-- Phase 111: Salvaguardas operativas - create audit_log table
--
-- Forensic trail for financial actions: subscription_cancelled,
-- transaction_voided, plan_assigned, plus reconciliation entries.
--
-- Idempotency: the _migrations tracker prevents a successful file from
-- running twice. CREATE TABLE (no IF NOT EXISTS) is intentional - the
-- run-migrations.ts runner surfaces "table already exists" as a clear
-- error if someone manually applied the SQL outside the tracker.
--
-- Note (Phase 86 / 103-01 precedent): hand-written SQL instead of
-- drizzle-kit generate because meta/_journal.json is heavily out of
-- sync (latest snapshot is 0059, DB is at 0107). Running db:generate
-- would either pollute the file with unrelated columns or fail
-- interactively. The Drizzle schema in src/db/schema/audit-log.ts is
-- the canonical source of truth - this DDL mirrors it exactly.
--
-- Note (Phase 103-01 precedent): SQL line comments must NOT contain
-- inline semicolons because run-migrations.ts splits the file on the
-- semicolon BEFORE stripping comments.

CREATE TABLE audit_log (
  id INT NOT NULL AUTO_INCREMENT,
  actor_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_kind VARCHAR(30) NOT NULL,
  target_id INT NOT NULL,
  payload_json JSON NOT NULL,
  reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_id) REFERENCES users(id),
  INDEX idx_audit_log_action_created (action, created_at),
  INDEX idx_audit_log_target (target_kind, target_id),
  INDEX idx_audit_log_actor_created (actor_id, created_at)
);
