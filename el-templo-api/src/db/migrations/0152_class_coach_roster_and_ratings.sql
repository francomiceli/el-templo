-- Phase 143 Plan 01 (PROF-DATA, D-A1/D-A2/D-M1/D-M2)
-- Persistence layer for per-class coach attribution and post-class ratings.
--   class_coach_assignments   weekly roster assigning ONE coach per
--                             (branch, ISO week, day, slot). Single source of
--                             attribution for ratings (D-A1/D-Q1).
--   coach_ratings             append-only log of member ratings (1-5 stars +
--                             optional comment) attributed to a coach (D-M1/M2).
--
-- class_coach_assignments keeps one row per (branch, week, day, slot) so past
-- ratings stay attributable -- never mutate a single current row (D-A1). The
-- UNIQUE class_coach_assignment_unique enforces at most one coach per slot/week
-- at the DB engine level (D-A2). slot is derived from a schedule startTime
-- (before noon = morning).
--
-- coach_ratings is an append-style log mirroring attendance.
--   No UNIQUE on the natural key: the one-rating-per-class guard lives in the
--   service layer (D-P2). Indexes back the owner per-coach average (idx on
--   coach_id, D-O1) and the member+session one-shot check (member_id,
--   session_date, D-P2).
--
-- This migration is purely ADDITIVE DDL: two CREATE TABLE statements. It never
-- DELETEs, UPDATEs or reassigns existing rows. The FKs use the default RESTRICT
-- (no cascade) -- a rating is a historical log entry that must not vanish.
--
-- Reversibility
--   Rollback drops both tables. No existing data is altered, so it is lossless.
--
-- Idempotency rationale (migration replay)
--   The _migrations row tracks this filename and prevents replay by the project
--   runner (src/db/run-migrations.ts). Statement-level existence guards are
--   intentionally NOT used here per project pattern (0108, 0121, 0125, 0142).
--
-- Comment safety (Phase 103-01 invariant)
--   The migration runner splits this file on semicolons BEFORE stripping line
--   comments, so no semicolon character may appear inside any comment line.
--
-- Enum drift lesson (125/126/129/130/142)
--   The slot ENUM('morning','afternoon') here MUST match the Drizzle
--   mysqlEnum("slot", ["morning","afternoon"]) first-arg/values in
--   src/db/schema/class-coach-assignments.ts exactly.
--
-- FK convention
--   Constraint names follow Drizzle's auto-generated convention so a future
--   pnpm db:generate run and this hand-written SQL converge. The two FKs from
--   coach_ratings to users are disambiguated by the column name in the
--   constraint name (coach_id vs member_id).
--
-- Hand-written SQL (drizzle-kit meta journal is desynced while the DB is past
-- 0130, same pattern as 0108, 0111, 0121, 0125, 0142).

CREATE TABLE class_coach_assignments (
  id INT NOT NULL AUTO_INCREMENT,
  branch_id INT NOT NULL,
  week_start_date DATE NOT NULL,
  day_of_week TINYINT NOT NULL,
  slot ENUM('morning','afternoon') NOT NULL,
  coach_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now()),
  updated_at TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT class_coach_assignment_unique
    UNIQUE (branch_id, week_start_date, day_of_week, slot),
  INDEX idx_class_coach_assignments_coach (coach_id),
  CONSTRAINT class_coach_assignments_branch_id_branches_id_fk
    FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT class_coach_assignments_coach_id_users_id_fk
    FOREIGN KEY (coach_id) REFERENCES users(id)
);

CREATE TABLE coach_ratings (
  id INT NOT NULL AUTO_INCREMENT,
  coach_id INT NOT NULL,
  member_id INT NOT NULL,
  branch_id INT NOT NULL,
  schedule_id INT NULL,
  session_date DATE NOT NULL,
  stars TINYINT NOT NULL,
  comment VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT (now()),
  PRIMARY KEY (id),
  INDEX idx_coach_ratings_coach (coach_id),
  INDEX idx_coach_ratings_member_session (member_id, session_date),
  CONSTRAINT coach_ratings_coach_id_users_id_fk
    FOREIGN KEY (coach_id) REFERENCES users(id),
  CONSTRAINT coach_ratings_member_id_users_id_fk
    FOREIGN KEY (member_id) REFERENCES users(id),
  CONSTRAINT coach_ratings_branch_id_branches_id_fk
    FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT coach_ratings_schedule_id_schedules_id_fk
    FOREIGN KEY (schedule_id) REFERENCES schedules(id)
);
