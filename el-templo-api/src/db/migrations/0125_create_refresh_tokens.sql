-- Phase 116: Refresh tokens auth - create refresh_tokens table
--
-- Long-lived (30d sliding) session credentials replacing the single 7d JWT.
-- Persists ONLY the sha256 hex of the opaque token (token_hash) - the
-- plaintext token is never written to the DB (T-116-01).
--
-- Idempotency rationale
--   The _migrations row tracks this filename and prevents replay by the
--   project runner (src/db/run-migrations.ts). CREATE TABLE without
--   IF NOT EXISTS is intentional per project pattern (see 0108 and 0121
--   precedents) - the runner surfaces "table already exists" as a clear
--   error if someone manually applied the SQL outside the tracker.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping
--   line comments, so no semicolon character may appear inside any comment
--   line. Every statement ends with a single terminator on its own
--   non-comment line.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention
--   (refresh_tokens_user_id_users_id_fk,
--   refresh_tokens_replaced_by_id_refresh_tokens_id_fk) so a future
--   pnpm db:generate run and this hand-written SQL converge on the same
--   identifiers. user_id uses ON DELETE CASCADE as a future-proofing
--   defense (D-05). The replaced_by_id self-FK uses ON DELETE SET NULL.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced at 0059 while DB
-- is past 0120, same pattern as 0108, 0111, 0121).

CREATE TABLE refresh_tokens (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  replaced_by_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_token_hash (token_hash),
  INDEX idx_refresh_tokens_user_id (user_id),
  CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT refresh_tokens_replaced_by_id_refresh_tokens_id_fk FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
);
