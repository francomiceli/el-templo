-- Phase 117 (D-10): create user_status_history table
--
-- FOUNDATION table. Records forward-only transitions of users.status
-- (freemium/prueba/activo/inactivo). It starts accumulating now via a hook in
-- SubscriptionService.recomputeUserStatus, plus an approximate backfill in
-- migration 0129. It is NOT consumed in Phase 117 -- Phase 118 (funnel de
-- conversion freemium-prueba-activo + retencion por cohortes de ciclos)
-- reads it.
--
-- from_status is nullable because the first recorded transition (e.g. the
-- initial state from the backfill) has no prior origin. source distinguishes
-- 'recompute' (live hook), 'backfill' (migration 0129) and 'admin' (future).
--
-- Idempotency rationale
--   The _migrations row tracks this filename and prevents replay by the
--   project runner (src/db/run-migrations.ts). CREATE TABLE without
--   IF NOT EXISTS is intentional per project pattern (0125 precedent) -- the
--   runner surfaces "table already exists" as a clear error if someone
--   manually applied the SQL outside the tracker.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so NO semicolon character may appear inside any comment line.
--
-- FK convention
--   Constraint name follows Drizzle's auto-generated convention
--   (user_status_history_user_id_users_id_fk) so a future pnpm db:generate run
--   and this hand-written SQL converge. user_id uses ON DELETE CASCADE
--   mirroring refresh_tokens (future-proofing -- delete-account is soft today).
--
-- Hand-written SQL (drizzle-kit meta journal is desynced, same pattern as
-- 0108, 0111, 0121, 0125).

CREATE TABLE user_status_history (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  from_status ENUM('freemium','prueba','activo','inactivo') NULL,
  to_status ENUM('freemium','prueba','activo','inactivo') NOT NULL,
  source VARCHAR(16) NOT NULL DEFAULT 'recompute',
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_status_history_user_id (user_id),
  INDEX idx_user_status_history_user_changed (user_id, changed_at),
  CONSTRAINT user_status_history_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
