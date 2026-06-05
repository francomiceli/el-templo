-- Phase 124 Plan 01 (TREE-01, D-01 D-03 D-07 D-08 D-11 D-12)
-- Structure of the 3 difficulty dimensions over the exercise catalog.
--   exercise_subfamilies   new catalog table (gesto/sub-familia, D-01)
--   exercises.subfamily_id        INT nullable FK -> exercise_subfamilies(id)
--   exercises.leverage            VARCHAR(50) nullable (palanca, D-03/D-05)
--   exercises.canonical_exercise_id  INT nullable self-FK (soft-merge, D-07)
--   exercises.route_pending       TINYINT(1) NOT NULL DEFAULT 0 (saneo marker, D-08)
-- Plus FKs and two indexes.
--
-- This migration is purely ADDITIVE DDL (D-11). It creates one table and adds
-- four columns - it never DELETEs, UPDATEs or reassigns existing rows, so the
-- historical FKs from session_prescriptions.exercise_id and
-- program_content_blocks.exercise_id stay intact. The saneo data writes
-- (canonical pointers and route_pending flags) live in the idempotent TS
-- script of Plan 02, which reports/inspects before mutating.
--
-- Reversibility (D-12)
--   Rollback drops the two indexes, the two FK constraints and the four new
--   columns on exercises, then drops the exercise_subfamilies table. No
--   existing data is altered, so rollback is lossless.
--
-- Idempotency rationale
--   The _migrations row tracks this filename and prevents replay by the
--   project runner (src/db/run-migrations.ts). Statement-level guards
--   (IF NOT EXISTS) are intentionally NOT used here per project pattern
--   (see 0108, 0121, 0125 precedents). MySQL 8 inline IF NOT EXISTS support
--   for ADD COLUMN/INDEX is version-flaky.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping
--   line comments, so no semicolon character may appear inside any comment
--   line. Every statement below ends with a single terminator on its own
--   non-comment line.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention
--   (exercises_subfamily_id_exercise_subfamilies_id_fk,
--   exercises_canonical_exercise_id_exercises_id_fk) so a future
--   pnpm db:generate run and this hand-written SQL converge on the same
--   identifiers. Both use ON DELETE SET NULL.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced at 0059 while the DB
-- is past 0130, same pattern as 0108, 0111, 0121, 0125).

CREATE TABLE exercise_subfamilies (
  id INT NOT NULL AUTO_INCREMENT,
  route VARCHAR(20) NOT NULL,
  name VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX exercise_subfamilies_route_idx (route)
);

ALTER TABLE exercises
  ADD COLUMN subfamily_id INT NULL DEFAULT NULL AFTER route;

ALTER TABLE exercises
  ADD COLUMN leverage VARCHAR(50) NULL DEFAULT NULL AFTER subfamily_id;

ALTER TABLE exercises
  ADD COLUMN canonical_exercise_id INT NULL DEFAULT NULL AFTER leverage;

ALTER TABLE exercises
  ADD COLUMN route_pending TINYINT(1) NOT NULL DEFAULT 0 AFTER canonical_exercise_id;

ALTER TABLE exercises
  ADD CONSTRAINT exercises_subfamily_id_exercise_subfamilies_id_fk
  FOREIGN KEY (subfamily_id) REFERENCES exercise_subfamilies(id) ON DELETE SET NULL;

ALTER TABLE exercises
  ADD CONSTRAINT exercises_canonical_exercise_id_exercises_id_fk
  FOREIGN KEY (canonical_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;

CREATE INDEX exercises_subfamily_idx ON exercises(subfamily_id);

CREATE INDEX exercises_canonical_idx ON exercises(canonical_exercise_id);
