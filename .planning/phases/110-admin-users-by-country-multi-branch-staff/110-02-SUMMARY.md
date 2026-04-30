---
phase: 110-admin-users-by-country-multi-branch-staff
plan: 02
subsystem: api/db-migration
tags:
  [
    migration,
    drizzle,
    mysql,
    backfill,
    test-harness,
    country-scope,
    multi-branch,
  ]
requires:
  - el-templo-api/src/db/migrations/0107_admin_users_by_country.sql (Plan 01)
  - el-templo-api/src/db/run-migrations.ts (custom migration runner)
  - el-templo-api/src/db/schema/user-branches.ts (Plan 01)
provides:
  - migration 0107_admin_users_by_country.sql applied to local DB (recorded in _migrations)
  - users.country populated for admin/gestion (owner stays NULL)
  - user_branches populated 1:1 from coach/recepcion users
  - cleanAllTestData includes userBranches in TABLES_TO_CLEAN
affects:
  - Plan 110-03 (country-scope hook can read users.country at runtime)
  - Plan 110-04+ (canAccessBranch helper can join user_branches)
  - All future integration tests (cleanup harness drains user_branches)
tech-stack:
  added: []
  patterns:
    - pnpm db:migrate (custom run-migrations.ts) — never drizzle-kit migrate
    - TABLES_TO_CLEAN child-before-parent ordering — Phase 105-06 precedent
key-files:
  created: []
  modified:
    - el-templo-api/test/helpers.ts
decisions:
  - "Migration applied via project's pnpm db:migrate runner (CLAUDE.md mandates over drizzle-kit migrate)"
  - "userBranches added in 'Junction + leaf tables' group (line 137), placed BEFORE the users deletion at line 199 — child-first to satisfy FK CASCADE invariant even though FKs would cascade-delete on parent removal"
  - "No commit needed for Task 2 (DB-only state change tracked in _migrations table; no source files modified)"
metrics:
  duration: 109s
  completed: 2026-04-30
  pre_migration_counts:
    admin: 1
    gestion: 0
    coach: 7
    recepcion: 0
    owner: 3
    branches_total: 10
    branches_with_country: 10
  post_migration_counts:
    admin_with_country: 1
    gestion_with_country: 0
    owner_with_country: 0
    user_branches_rows: 7
    coach_recepcion_rows: 7
---

# Phase 110 Plan 02: Apply migration 0107 + drain user_branches in test cleanup Summary

## One-liner

Applied migration 0107 against local DB via `pnpm db:migrate`; backfill verified (admin AR matches branch country, owner NULL preserved, 7 user_branches rows for the 7 coaches); test harness now drains `user_branches` before `users`.

## Tasks Completed

| #   | Task                                                         | Commit     | Files                                |
| --- | ------------------------------------------------------------ | ---------- | ------------------------------------ |
| 1   | [Operator gate] Confirm dev branch + local DB + 0106 applied | n/a        | (pre-approved by user)               |
| 2   | Run pnpm db:migrate against local DB                         | n/a (DB)   | migration 0107 → `_migrations` table |
| 3   | Add `schema.userBranches` to `TABLES_TO_CLEAN` before users  | `81d7eae2` | `el-templo-api/test/helpers.ts`      |

## What changed

**Database (local `eltemplo` on localhost):**

- Migration runner output: `Applied 0107_admin_users_by_country.sql (4 statements) — Applied successfully — Applied 1 migration(s)`.
- `users.country VARCHAR(2) NULL` added (verified via `DESCRIBE users`).
- `user_branches` table created with autoincrement PK, `(user_id, branch_id)` unique key, both FKs `ON DELETE CASCADE`, per-column lookup indexes (verified via `SHOW CREATE TABLE`).
- Backfill UPDATE: 1 admin row got `country='AR'` (matches its branch's country). 0 gestion users existed pre-migration (still 0 rows updated). 0 owner rows touched (role NOT IN clause).
- Backfill INSERT IGNORE: 7 rows inserted into `user_branches` (one per coach; recepción count was 0).

**Test harness (`el-templo-api/test/helpers.ts`):**

- `schema.userBranches` inserted at line 137 of `TABLES_TO_CLEAN`, in the "Junction + leaf tables" group, immediately before `schema.blogPostTags`.
- The `users` deletion is on line 199 — child-before-parent ordering satisfied. Even though the FK has `ON DELETE CASCADE`, explicit cleanup keeps state deterministic across vitest workers and matches the existing pattern for every other join table.
- Diff is +1 line, no other changes.

## Pre-migration vs post-migration counts

| Metric                                                         | Pre                | Post        | Expected                    |
| -------------------------------------------------------------- | ------------------ | ----------- | --------------------------- |
| `_migrations` rows for `0107_admin_users_by_country.sql`       | 0                  | **1**       | 1                           |
| `users` with `role IN ('admin','gestion') AND country IS NULL` | n/a (col absent)   | **0**       | 0                           |
| `users` with `role='owner' AND country IS NOT NULL`            | n/a                | **0**       | 0 (D-12)                    |
| `user_branches` total rows                                     | n/a (table absent) | **7**       | 7 (= coach+recepción count) |
| `user_branches` joined to coach/recepción users                | n/a                | **7**       | 7                           |
| Admin's `users.country` vs `branches.country` (id 37)          | n/a                | **AR = AR** | match                       |

All acceptance criteria satisfied.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Non-deviation notes

- **Task 1 was pre-approved by the user** (orchestrator-level checkpoint) per the execution context. Operator confirmed dev branch (`master`, local-only per the v4.4 local-only workflow), local DB target (`localhost / eltemplo`), and that 0106 was the most recent applied migration before authorising the run. No additional checkpoint prompt was raised.
- **Task 2 produces no source-file changes.** DB state is captured in the `_migrations` table; the migration SQL was already committed in Plan 01 (`d7144350`). No additional commit was created for Task 2 — this is the standard pattern for `pnpm db:migrate` runs.

## Acceptance Criteria

- [x] `pnpm db:migrate` exits 0 (`Applied 1 migration(s)`).
- [x] `SELECT name FROM _migrations WHERE name LIKE '0107_admin_users%'` returns exactly 1 row.
- [x] `SELECT COUNT(*) FROM users WHERE role IN ('admin','gestion') AND country IS NULL` returns 0.
- [x] `SELECT COUNT(*) FROM user_branches` returns 7, equal to count of coach+recepción users.
- [x] `SELECT COUNT(*) FROM users WHERE role='owner' AND country IS NOT NULL` returns 0.
- [x] `DESCRIBE users` shows `country VARCHAR(2) YES NULL`.
- [x] `SHOW CREATE TABLE user_branches` shows `ON DELETE CASCADE` on both FKs and `UNIQUE KEY user_branch_unique`.
- [x] `grep -n "schema.userBranches" el-templo-api/test/helpers.ts` returns line 137 (lower than `users` deletion at line 199).
- [x] `cd el-templo-api && pnpm tsc --noEmit` exits 0.
- [x] `cd el-templo-api && pnpm test test/country-scope.test.ts` exits 0 (15 passed, 1 pre-existing skip).

## Threat Surface Notes

No new security-relevant surface introduced beyond what the threat register (PLAN `<threat_model>`) anticipated:

- **T-110-02-01** (migration on wrong DB) — mitigated as planned: operator gate confirmed `localhost / eltemplo` before run; user pre-approved.
- **T-110-02-02** (TRUNCATE order in test cleanup) — mitigated as planned: `userBranches` inserted at line 137, before users at line 199.
- **T-110-02-03** (migration logs leak data) — accepted: runner logs filename + statement count only, no row data.
- **T-110-02-04** (applied migration repudiation) — accepted: `_migrations` row inserted with timestamp.

## Out of Scope (explicitly NOT done in this plan)

- Staging / production migration runs — separate operator approval required.
- Hook `country-scope.ts` extension to populate `branchIds` and `role` — Plan 110-03.
- `canAccessBranch` helper + `requireBranchAccess` preHandler — Plan 110-04+.
- Service-level cardinality validation, UI form changes, endpoint scope-eados — Plans 110-05–09 per the wave map.

## Self-Check: PASSED

**Files modified:**

- `el-templo-api/test/helpers.ts` — verified (line 137 contains `schema.userBranches,`)

**Database state:**

- `_migrations` row for `0107_admin_users_by_country.sql` — present (1 row)
- `users.country` column — present (varchar(2) nullable)
- `user_branches` table — present (7 rows, FK CASCADE on both columns, unique key)

**Commits exist on master:**

- `81d7eae2` test(110-02): drain user_branches before users in cleanAllTestData
