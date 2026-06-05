-- Phase 126 Plan 01 (TREE-04, D-03)
-- Persistence layer for the v5.1 progression graph (DAG).
--   exercise_progressions   new table holding the directed edges of the skill
--                            tree (from_exercise_id -> to_exercise_id)
--
-- Each row is one edge. The source enum distinguishes auto (SPOM-derived
-- backbone, regenerated wholesale by the Plan 02 constructor) from manual (profe
-- overrides authored in phase 128). The regenerate step DELETEs and re-inserts
-- ONLY source=auto edges, never touching manual ones.
--
-- This migration is purely ADDITIVE DDL: one CREATE TABLE. It never DELETEs,
-- UPDATEs or reassigns existing rows. Both FKs use ON DELETE CASCADE because an
-- edge is meaningless without both of its endpoints -- if either exercise is
-- deleted, its incident edges must go with it.
--
-- Idempotency at the data layer
--   A UNIQUE KEY on (from_exercise_id, to_exercise_id) enforces "at most one
--   edge per ordered pair", backing the Plan 02 regenerate/dedupe so re-running
--   the constructor converges to the same auto edge set with no duplicates.
--
-- Reversibility
--   Rollback drops the table (DROP TABLE exercise_progressions). No existing
--   data is altered, so rollback is lossless.
--
-- Idempotency rationale (migration replay)
--   The _migrations row tracks this filename and prevents replay by the project
--   runner (src/db/run-migrations.ts). Statement-level existence guards are
--   intentionally NOT used here per project pattern (0108, 0121, 0125, 0137,
--   0138). MySQL 8 inline guard support is version-flaky.
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention
--   (exercise_progressions_from_exercise_id_exercises_id_fk and the matching to_
--   constraint) so a future pnpm db:generate run and this hand-written SQL
--   converge.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0111, 0121, 0125, 0137, 0138).

CREATE TABLE exercise_progressions (
  id INT NOT NULL AUTO_INCREMENT,
  from_exercise_id INT NOT NULL,
  to_exercise_id INT NOT NULL,
  source ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  PRIMARY KEY (id),
  UNIQUE KEY exercise_progressions_edge_uq (from_exercise_id, to_exercise_id),
  INDEX exercise_progressions_from_idx (from_exercise_id),
  INDEX exercise_progressions_to_idx (to_exercise_id),
  INDEX exercise_progressions_source_idx (source),
  CONSTRAINT exercise_progressions_from_exercise_id_exercises_id_fk
    FOREIGN KEY (from_exercise_id) REFERENCES exercises(id) ON DELETE CASCADE,
  CONSTRAINT exercise_progressions_to_exercise_id_exercises_id_fk
    FOREIGN KEY (to_exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);
