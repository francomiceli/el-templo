-- Phase 114 Plan 01 (D-15, D-16, D-17, D-18)
-- Adds lead lifecycle fields to users
--   lead_status   ENUM nullable - no default - explicit at insert time
--   lead_notes    TEXT nullable
--   created_by    INT nullable - FK -> users.id ON DELETE SET NULL
-- Plus two indexes for filter performance
--
-- Idempotency rationale
--   The _migrations row tracks this filename and prevents replay by the
--   project runner (src/db/run-migrations.ts). Statement-level guards
--   (IF NOT EXISTS) are intentionally NOT used here per project pattern
--   (see 0108 and 0111 precedents). MySQL 8 inline IF NOT EXISTS support
--   for ADD COLUMN/INDEX is version-flaky.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping
--   line comments, so no semicolon character may appear inside any comment
--   line. Every statement below ends with a single terminator on its own
--   non-comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced at 0059 while DB
-- is at 0120, same pattern as 0107, 0108, 0111).

ALTER TABLE users
  ADD COLUMN lead_status ENUM('en_seguimiento','cerrado','perdido') NULL DEFAULT NULL AFTER converted_at;

ALTER TABLE users
  ADD COLUMN lead_notes TEXT NULL DEFAULT NULL AFTER lead_status;

ALTER TABLE users
  ADD COLUMN created_by INT NULL DEFAULT NULL AFTER lead_notes;

-- FK constraint name follows Drizzle's auto-generated convention
-- (users_created_by_users_id_fk) so a future pnpm db:generate run and
-- this hand-written SQL converge on the same identifier.
ALTER TABLE users
  ADD CONSTRAINT users_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_users_lead_status ON users(lead_status);

CREATE INDEX idx_users_created_by ON users(created_by);
