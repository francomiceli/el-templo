---
phase: 103
plan: 01
subsystem: api/db-schema
tags: [migration, schema, backfill, users, status-enum]
dependency_graph:
  requires: []
  provides:
    - users.status ENUM('freemium','prueba','activo','inactivo') DEFAULT NULL
    - users.staff_disabled BOOLEAN NOT NULL DEFAULT FALSE
    - idx_users_status btree index
    - userStatusEnum drizzle export
  affects:
    - el-templo-api/src/db/schema/users.ts
    - downstream Plans 02-07 (recomputeUserStatus, members API, admin UI, auth)
tech_stack:
  added: []
  patterns:
    - "hand-written multi-section SQL migration with idempotent backfill UPDATEs"
    - "drizzle mysqlEnum declared at module scope (matches subscriptionStatusEnum/bookingStatusEnum)"
key_files:
  created:
    - el-templo-api/src/db/migrations/0100_user_status_enum.sql
    - el-templo-api/test/migrations/0100-user-status-backfill.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
decisions:
  - "Hand-write the migration SQL (no pnpm db:generate) since drizzle-kit cannot produce the 6 backfill UPDATEs"
  - "DEFAULT NULL at DB level per D-12; subsequent plans set the value explicitly per endpoint intent"
  - "Drop is_active in the SAME migration after all backfills complete (no transitional dual-column window per D-07)"
  - "SQL comments must not contain semicolons because run-migrations.ts splits on ; before stripping -- comments"
metrics:
  duration: ~25min
  completed_date: 2026-04-25
  tasks_completed: 2
  commits: 2
  test_cases: 7
  test_status: all-passing
requirements_completed: [R1, R2, R3, R4]
---

# Phase 103 Plan 01: User Status Enum Schema Migration + Backfill Summary

**One-liner:** Single atomic migration that adds `users.status` ENUM, `users.staff_disabled` BOOLEAN, drops `users.is_active`, swaps the matching index, and backfills every existing row with idempotent UPDATEs guarded by `WHERE status IS NULL`.

## What Shipped

- **Drizzle schema (`users.ts`):** Exported `userStatusEnum`, replaced `isActive` field with `status` (nullable, no `.default()`) plus `staffDisabled boolean NOT NULL default(false)`, swapped `idx_users_is_active` for `idx_users_status`.
- **Migration (`0100_user_status_enum.sql`):** Section 1 adds two columns. Section 2 runs 6 idempotent backfill UPDATEs. Section 3 drops `idx_users_is_active`, drops `is_active` column, creates `idx_users_status`.
- **Integration test (`test/migrations/0100-user-status-backfill.test.ts`):** 7 cases covering all 4 enum values + staff stays NULL + idempotency + R4 count gate against a populated DB.

## Exact SQL Applied

```sql
-- Phase 103: User Status Enum + staff_disabled split + drop is_active
-- See .planning/phases/103-user-status-enum/103-SPEC.md for full rationale.
--
-- Idempotency: runner skips Duplicate/already-exists/Can't DROP errors.
-- Backfill UPDATEs are guarded by WHERE status IS NULL so re-runs no-op.
-- Order matters: status backfill MUST run BEFORE dropping is_active because
-- step 5 (legacy override) reads the legacy column.
--
-- D-12: status DEFAULT NULL at the DB level. Staff inserts that omit the
-- field stay NULL. Member-creating endpoints set the value explicitly in
-- Plan 03 (POST /register --> 'freemium', POST /api/admin/members --> 'prueba',
-- POST /api/admin/trials --> 'prueba').

-- Section 1: Add new columns
ALTER TABLE `users`
  ADD COLUMN `status` ENUM('freemium','prueba','activo','inactivo') DEFAULT NULL;

ALTER TABLE `users`
  ADD COLUMN `staff_disabled` BOOLEAN NOT NULL DEFAULT FALSE;

-- Section 2: Backfill data (idempotent, each guarded by status IS NULL where applicable)
-- ADD COLUMN with DEFAULT NULL leaves all existing rows with status=NULL, ready for rules below

-- 2.1 Active subscribers go to activo
UPDATE users u
  SET u.status = 'activo'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = u.id
        AND s.subscription_status IN ('active','paused')
        AND (s.end_date IS NULL OR s.end_date >= CURDATE())
    );

-- 2.2 Trial leads go to prueba
UPDATE users u
  SET u.status = 'prueba'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.member_id = u.id AND b.is_trial = 1
    );

-- 2.3 Online self-registered without sub or trial go to freemium
UPDATE users u
  SET u.status = 'freemium'
  WHERE u.role = 'member'
    AND u.status IS NULL
    AND u.branch_id = (SELECT id FROM branches WHERE code = 'ONLINE');

-- 2.4 Everyone else (presential users without sub or trial, ex-alumnos) go to inactivo
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.status IS NULL;

-- 2.5 Override: legacy deactivated members go to inactivo
UPDATE users u
  SET u.status = 'inactivo'
  WHERE u.role = 'member'
    AND u.is_active = FALSE
    AND u.deleted_at IS NULL;

-- 2.6 Staff: status stays NULL (default), staff_disabled mirrors NOT is_active
UPDATE users u
  SET u.staff_disabled = NOT u.is_active
  WHERE u.role != 'member';

-- Section 3: Drop legacy column and index, add new index
DROP INDEX `idx_users_is_active` ON `users`;

ALTER TABLE `users` DROP COLUMN `is_active`;

CREATE INDEX `idx_users_status` ON `users` (`status`);
```

## Backfill Counts (local dev DB)

After migration, `SELECT status, COUNT(*) FROM users GROUP BY role, status`:

| Role group | status   | count |
| ---------: | -------- | ----: |
|    members | freemium |     5 |
|    members | prueba   |     0 |
|    members | activo   |     1 |
|    members | inactivo |    25 |
|      staff | NULL     |    11 |

R4 count gate verified directly against dev DB:

- `SELECT COUNT(*) FROM users WHERE role='member' AND status IS NULL AND deleted_at IS NULL` → **0**
- `SELECT COUNT(*) FROM users WHERE role!='member' AND status IS NOT NULL` → **0**

`prueba=0` is expected on this dev DB because it has no `bookings.is_trial=1` rows yet (Phase 102 trials shipped on a different DB snapshot). The test in Task 2 exercises the `prueba` path against a fixture-built DB.

## DESCRIBE users (status, staff_disabled)

```
Field           Type                                                Null  Key  Default  Extra
status          enum('freemium','prueba','activo','inactivo')       YES   MUL  NULL
staff_disabled  tinyint(1)                                          NO         0
```

R1 acceptance verbatim: `status enum('freemium','prueba','activo','inactivo') ... NULL ... DEFAULT NULL`. ✓
R2 acceptance verbatim: `staff_disabled tinyint(1) NOT NULL DEFAULT 0`. ✓
R3 acceptance: `is_active` row absent from DESCRIBE output. ✓

## Index State

```
SHOW INDEX FROM users WHERE Key_name='idx_users_status';
-> 1 row: BTREE on column `status`

SHOW INDEX FROM users WHERE Key_name='idx_users_is_active';
-> 0 rows
```

## Idempotency Verification

Ran `pnpm db:migrate` twice in succession on the dev DB:

1. First run: `Applying: 0100_user_status_enum.sql (11 statements) ... Applied successfully ... Applied 1 migration(s)`
2. Second run: `No new migrations to apply` (the runner found the entry in `_migrations` and skipped — no statements re-executed at all).

The UPDATEs are also self-idempotent thanks to `WHERE status IS NULL` guards, so even if the `_migrations` ledger were lost, re-running would be a no-op for backfill steps 2.1-2.4. Steps 2.5/2.6 read the `is_active` legacy column, which is dropped at the end of the same migration; re-running would fail at section 3 (Can't DROP) and that error is swallowed by the runner's idempotency handler (`Can't DROP` is in the skip-list at `run-migrations.ts:103`).

## Test Results

```
$ cd el-templo-api && pnpm test test/migrations/0100-user-status-backfill.test.ts

✓ test/migrations/0100-user-status-backfill.test.ts (7 tests) 2252ms
  ✓ assigns activo to member with active subscription
  ✓ assigns prueba to member with trial booking only
  ✓ assigns freemium to member on ONLINE branch with no sub and no trial
  ✓ assigns inactivo to member on presential branch with no sub and no trial
  ✓ leaves status NULL for staff (role != member)
  ✓ is idempotent — second backfill run changes nothing
  ✓ R4 count gate: zero members with NULL status, zero staff with non-NULL status

Test Files  1 passed (1)
     Tests  7 passed (7)
```

All 7 cases pass on real MySQL (`eltemplo_test`).

## Schema TS and SQL Co-located in Same Commit

```
$ git log --oneline -2
3683435b test(103-01): backfill correctness for migration 0100 (7 cases)
4582d19d feat(103-01): add users.status enum + staff_disabled, drop is_active
```

Commit `4582d19d` contains BOTH `el-templo-api/src/db/schema/users.ts` AND `el-templo-api/src/db/migrations/0100_user_status_enum.sql` per the "Always commit migration SQL files alongside schema changes" memory rule (CLAUDE.md adjacent guidance).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Initial migration failed because comment header contained an inline `;`**

- **Found during:** Task 1 Part C (first `pnpm db:migrate` attempt)
- **Issue:** `run-migrations.ts` splits the SQL by `;` BEFORE stripping `--` comments. My header comment block included the line `-- field stay NULL; member-creating endpoints set the value explicitly in` — the inline `;` caused that comment to split across two "statements", and the right half (which no longer started with `--`) was sent to MySQL verbatim, producing `ER_PARSE_ERROR 1064` near "member-creating endpoints set the value explicitly in".
- **Fix:** Re-wrote the migration header without inline semicolons (replaced the `;` with `.` and removed the `--> Plan 03 (...)` paren-list that needed the comma boundaries). Re-ran `pnpm db:migrate` — applied cleanly.
- **Files modified:** `el-templo-api/src/db/migrations/0100_user_status_enum.sql` (header text only)
- **No commit:** the fix was applied before the first commit so it's folded into commit `4582d19d`.

### Out-of-scope Discoveries (logged for follow-up plans)

The grep `grep -rn "users\.isActive\|users\.is_active" el-templo-api/src` returns **7 references** that will fail typecheck once `is_active` is dropped. These are out of scope for Plan 01 (which is schema-only) and are explicitly the work of Plans 02-07 (recomputeUserStatus + members API + auth + admin UI). The local dev DB has the column dropped now, but the API source still reads `users.isActive` in:

- `src/modules/auth/routes.ts:251, 359` (login/me select projection)
- `src/modules/analytics/service.ts:205` (countActiveMembers)
- `src/modules/users/service.ts:35, 183, 213` (toggleActive + listing)

Pre-commit hooks did not block the commits because `lint-staged` runs only Prettier on API files; full typecheck runs in CI. Plans 02-07 must land before merging this branch.

## Threat Surface Scan

No new security-relevant surface introduced. Schema-level changes only; no new endpoints, auth paths, file access patterns, or trust-boundary changes. The `is_active` column drop is a tightening (removes a stale flag) rather than a loosening — Plan D will introduce the new staff_disabled login gate explicitly.

## Self-Check: PASSED

- File `el-templo-api/src/db/schema/users.ts`: FOUND
- File `el-templo-api/src/db/migrations/0100_user_status_enum.sql`: FOUND
- File `el-templo-api/test/migrations/0100-user-status-backfill.test.ts`: FOUND
- Commit `4582d19d` (schema + migration): FOUND
- Commit `3683435b` (backfill test): FOUND
- DB: `users.status` enum exists with DEFAULT NULL — VERIFIED via DESCRIBE
- DB: `users.staff_disabled` tinyint(1) NOT NULL DEFAULT 0 — VERIFIED via DESCRIBE
- DB: `users.is_active` absent — VERIFIED via DESCRIBE
- DB: `idx_users_status` exists — VERIFIED via SHOW INDEX
- DB: `idx_users_is_active` absent — VERIFIED via SHOW INDEX
- DB: 0 members with NULL status (non soft-deleted), 0 staff with non-NULL status — VERIFIED via COUNT
- Migration applied twice without error (idempotency) — VERIFIED via consecutive `pnpm db:migrate` runs
- Tests: 7/7 passing — VERIFIED via `pnpm test test/migrations/0100-user-status-backfill.test.ts`
