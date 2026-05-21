-- Phase 115 Plan 01 (R1, D-15)
-- Adds bar-challenge attempt fields to users
--   bar_challenge_completed    BOOLEAN nullable  - default NULL
--   bar_challenge_seconds      INT     nullable  - default NULL
--   bar_challenge_attempted_at TIMESTAMP nullable - default NULL
--
-- Semantics
--   NULL en las 3 columnas = el usuario no participó del desafío. El
--   endpoint POST /api/bar-challenge/result hace UPDATE condicional sobre
--   bar_challenge_attempted_at IS NULL para garantizar single-attempt
--   atómico (sin race condition entre SELECT y UPDATE).
--
-- Idempotency rationale
--   The _migrations row tracks this filename and prevents replay by the
--   project runner (src/db/run-migrations.ts). Statement-level guards
--   (IF NOT EXISTS) are intentionally NOT used here per project pattern
--   (see 0108, 0111, 0114, 0121 precedents). MySQL 8 inline IF NOT EXISTS
--   support for ADD COLUMN is version-flaky.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping
--   line comments, so no semicolon character may appear inside any comment
--   line. Every statement below ends with a single terminator on its own
--   non-comment line.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced at 0059 while DB
-- is at 0123, same pattern as 0107, 0108, 0111, 0121).

ALTER TABLE users
  ADD COLUMN bar_challenge_completed BOOLEAN NULL DEFAULT NULL AFTER current_program_enrollment_id;

ALTER TABLE users
  ADD COLUMN bar_challenge_seconds INT NULL DEFAULT NULL AFTER bar_challenge_completed;

ALTER TABLE users
  ADD COLUMN bar_challenge_attempted_at TIMESTAMP NULL DEFAULT NULL AFTER bar_challenge_seconds;
