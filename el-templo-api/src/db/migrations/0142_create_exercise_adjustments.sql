-- Phase 131 Plan 01 (ADJUST-03, D-01)
-- Persistence layer for the in-session difficulty adjustment log.
--   exercise_adjustments   new table holding the per-member, per-node record of
--                          a difficulty adjustment (dominado / bajado) captured
--                          by an explicit player tap during a session
--
-- Each row records that a member tapped más difícil/más fácil on a tree node
-- (exercise_id, the ORIGIN exercise) and the outcome (dominado when stepping up,
-- bajado when stepping down). This record is DISTINCT from the whole-session
-- completado + RPE in completed_sessions.rpe -- it is a finer-grained per-node
-- signal the in-session adjustment and the tree percent enrichment rest on.
--
-- to_exercise_id is the resolved neighbor that was served (D-05, useful for the
-- coach view). It is nullable defensively but is set on every written row, since
-- a row is persisted ONLY when a neighbor was resolved (chain-end taps are a
-- graceful no-op and write NO row).
--
-- This migration is purely ADDITIVE DDL: one CREATE TABLE. It never DELETEs,
-- UPDATEs or reassigns existing rows. The FKs use the default RESTRICT (no
-- cascade) -- an adjustment row is a historical log entry that must not vanish if
-- a referenced user/exercise is later removed, and exercises are never hard
-- deleted in this system (they are soft-merged via canonical_exercise_id).
--
-- Append-style log
--   No UNIQUE constraint: re-taps create new rows. The tree percent reads the
--   latest-per-node state (D-04/D-05). Indexes on member_id and exercise_id back
--   those reads.
--
-- Reversibility
--   Rollback drops the table (DROP TABLE exercise_adjustments). No existing data
--   is altered, so rollback is lossless.
--
-- Idempotency rationale (migration replay)
--   The _migrations row tracks this filename and prevents replay by the project
--   runner (src/db/run-migrations.ts). Statement-level existence guards are
--   intentionally NOT used here per project pattern (0108, 0121, 0125, 0137,
--   0138, 0139).
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Enum drift lesson (125/126/129/130)
--   The status ENUM('dominado','bajado') here MUST match the Drizzle
--   mysqlEnum("status", ["dominado","bajado"]) first-arg/values in
--   src/db/schema/exercise-adjustments.ts exactly.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention so a future
--   pnpm db:generate run and this hand-written SQL converge.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0111, 0121, 0125, 0137, 0138, 0139).

CREATE TABLE exercise_adjustments (
  id INT NOT NULL AUTO_INCREMENT,
  member_id INT NOT NULL,
  exercise_id INT NOT NULL,
  to_exercise_id INT NULL,
  status ENUM('dominado','bajado') NOT NULL,
  day_id VARCHAR(50) NOT NULL,
  date VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now()),
  PRIMARY KEY (id),
  INDEX exercise_adjustments_member_idx (member_id),
  INDEX exercise_adjustments_exercise_idx (exercise_id),
  CONSTRAINT exercise_adjustments_member_id_users_id_fk
    FOREIGN KEY (member_id) REFERENCES users(id),
  CONSTRAINT exercise_adjustments_exercise_id_exercises_id_fk
    FOREIGN KEY (exercise_id) REFERENCES exercises(id),
  CONSTRAINT exercise_adjustments_to_exercise_id_exercises_id_fk
    FOREIGN KEY (to_exercise_id) REFERENCES exercises(id)
);
