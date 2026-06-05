-- Phase 125 Plan 01 (TREE-02, D-01 D-03 D-06)
-- Reviewable first pass of the 3-dimension decomposition.
--   exercise_dimension_proposals   new table holding PENDING heuristic proposals
--                                   (gesto/sub-familia, palanca/leverage, ruta)
--
-- The heuristic bootstrap (bootstrap-dimensions.ts) inserts only pending rows
-- here. The phase-124 truth columns on exercises (subfamily_id, leverage, route,
-- route_pending) are NEVER written by the bootstrap -- they are written only when
-- a profe accepts a proposal in the review screen of Plan 02 (D-01).
--
-- Column widths mirror the truth columns so the accept flow never truncates
--   proposed_subfamily 150 -> exercise_subfamilies.name (150)
--   proposed_leverage   50 -> exercises.leverage (50)
--   proposed_route      20 -> exercises.route (20)
--
-- This migration is purely ADDITIVE DDL: one CREATE TABLE. It never DELETEs,
-- UPDATEs or reassigns existing rows. The exercise_id FK uses ON DELETE CASCADE
-- (a proposal carries no historical weight and is meaningless without its
-- exercise), unlike the 124 truth columns which use SET NULL.
--
-- Idempotency at the data layer
--   A UNIQUE KEY on exercise_id enforces "at most one live proposal per
--   exercise", backing the bootstrap NOT-EXISTS guard so re-runs insert no
--   duplicates (D-06, idempotent/resumable).
--
-- Reversibility
--   Rollback drops the table (DROP TABLE exercise_dimension_proposals). No
--   existing data is altered, so rollback is lossless.
--
-- Idempotency rationale (migration replay)
--   The _migrations row tracks this filename and prevents replay by the project
--   runner (src/db/run-migrations.ts). Statement-level guards (IF NOT EXISTS)
--   are intentionally NOT used here per project pattern (0108, 0121, 0125, 0137).
--   MySQL 8 inline IF NOT EXISTS support is version-flaky.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- FK convention
--   Constraint name follows Drizzle's auto-generated convention
--   (exercise_dimension_proposals_exercise_id_exercises_id_fk) so a future
--   pnpm db:generate run and this hand-written SQL converge.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0111, 0121, 0125, 0137).

CREATE TABLE exercise_dimension_proposals (
  id INT NOT NULL AUTO_INCREMENT,
  exercise_id INT NOT NULL,
  proposed_subfamily VARCHAR(150) NULL DEFAULT NULL,
  proposed_leverage VARCHAR(50) NULL DEFAULT NULL,
  proposed_route VARCHAR(20) NULL DEFAULT NULL,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  engine VARCHAR(30) NULL DEFAULT NULL,
  confidence INT NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY exercise_dimension_proposals_exercise_uq (exercise_id),
  INDEX exercise_dimension_proposals_status_idx (status),
  INDEX exercise_dimension_proposals_route_idx (proposed_route),
  CONSTRAINT exercise_dimension_proposals_exercise_id_exercises_id_fk
    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
