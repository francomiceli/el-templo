-- Phase 156 Plan 02 (PLAN-03, D-06)
-- Join table for explicit multi-program access per subscription plan.
--   plan_programs   maps a subscription_plan to the list of programs it
--                   unlocks when grants_all_programs is false. When
--                   grants_all_programs is true the plan grants every active
--                   program and this list is ignored (all takes priority).
--
-- The composite UNIQUE plan_program_unique enforces at most one row per
-- (subscription_plan_id, program_id) at the DB engine level, so the
-- delete-plus-insert reconciliation in the plans CRUD cannot produce
-- duplicates. Per-column indexes back the two read directions -- all programs
-- of a plan (idx_plan_programs_plan_id) and all plans of a program
-- (idx_plan_programs_program_id).
--
-- This migration is purely ADDITIVE DDL: one CREATE TABLE statement. It never
-- DELETEs, UPDATEs or reassigns existing rows. The FKs use the default RESTRICT
-- (no cascade) -- a plan or program in use must not vanish out from under a
-- live grant.
--
-- Reversibility
--   Rollback drops the table. No existing data is altered, so it is lossless.
--
-- Idempotency rationale (migration replay)
--   The _migrations row tracks this filename and prevents replay by the project
--   runner (src/db/run-migrations.ts). Statement-level existence guards are
--   intentionally NOT used here per project pattern (0108, 0121, 0142, 0152).
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Column drift lesson (125/126/129/130/142)
--   The snake_case column names here MUST match the Drizzle first-arg names in
--   src/db/schema/plan-programs.ts exactly, or CI fails with Unknown column.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention so a future
--   pnpm db:generate run and this hand-written SQL converge.
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0111, 0121, 0142, 0152).

CREATE TABLE plan_programs (
  id INT NOT NULL AUTO_INCREMENT,
  subscription_plan_id INT NOT NULL,
  program_id INT NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT plan_program_unique
    UNIQUE (subscription_plan_id, program_id),
  INDEX idx_plan_programs_plan_id (subscription_plan_id),
  INDEX idx_plan_programs_program_id (program_id),
  CONSTRAINT plan_programs_subscription_plan_id_subscription_plans_id_fk
    FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id),
  CONSTRAINT plan_programs_program_id_programs_id_fk
    FOREIGN KEY (program_id) REFERENCES programs(id)
);
