---
phase: 112-enrollment-service-admin-add-ons
plan: 01
subsystem: programs
tags: [schema, migration, programs, enrollments]
requires: []
provides:
  - program_enrollments.source enum (plan_linked|plan_bundle|admin_addon) NOT NULL
  - program_enrollments.price_paid (int nullable)
  - program_enrollments.assigned_by (FK users.id nullable)
  - program_enrollments.subscription_id (FK subscriptions.id nullable)
  - program_enrollment_status enum extended with 'paused'
  - idx_enrollments_subscription_id, idx_enrollments_source
affects:
  - el-templo-api/src/modules/subscriptions/service.ts (6 enrollment insert sites + EnrollmentStatus type)
tech-stack:
  added: []
  patterns:
    - "Hand-written idempotent SQL migration (Phase 86 / 90 / 103-01 / 111 precedent)"
    - "Deferred-NOT-NULL pattern (column added NULL-tolerant, backfilled, then tightened)"
    - "WHERE-on-BEFORE-state guards on backfill UPDATEs for safe manual replay"
key-files:
  created:
    - el-templo-api/src/db/migrations/0111_program_enrollments_addon_columns.sql
    - el-templo-api/test/migrations/0111-program-enrollments-addon-columns.test.ts
    - .planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md
  modified:
    - el-templo-api/src/db/schema/program-enrollments.ts
    - el-templo-api/src/modules/programs/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
decisions:
  - "Deferred-NOT-NULL pattern for source: column is NULL-tolerant during the in-file backfill, then ALTER … MODIFY tightens to NOT NULL in Step 5 — fails fast and rolls back if any row remained NULL"
  - "WHERE source IS NULL guards on every backfill UPDATE so a manual replay outside the runner is a 0-row no-op (defense in depth on top of the _migrations tracker)"
  - "Drizzle schema source enum has no default; callers must pass an explicit source — Plan 02 EnrollmentService will own that responsibility"
  - "6 existing inserts in subscriptions/service.ts wired with source + subscription_id directly (Rule 3 fix to compile under the NOT NULL constraint); Plan 02 will replace these with EnrollmentService calls"
metrics:
  duration: ~19min
  tasks: 3
  files: 6
  completed: 2026-05-04
requirements:
  - ADDON-SCHEMA-01
  - ADDON-SCHEMA-02
  - ADDON-SCHEMA-03
  - ADDON-SCHEMA-04
  - ADDON-SCHEMA-05
---

# Phase 112 Plan 01: program_enrollments Add-on Schema Summary

Add-on persistence shape landed: `program_enrollments` now carries `source` (NOT NULL enum), `price_paid`, `assigned_by`, `subscription_id`, an extended status enum (`paused`), and 2 new indexes — backfilled deterministically and verified replay-safe via 112-line idempotent SQL migration `0111_program_enrollments_addon_columns.sql`.

## What Shipped

- **Migration `0111_program_enrollments_addon_columns.sql`** (112 lines, 8 SQL statements) — applied to local `eltemplo` DB and recorded in `_migrations`. Idempotent: a second `pnpm db:migrate` is a no-op (0 statements).
- **Drizzle schema `program-enrollments.ts`** — exports `programEnrollmentSourceEnum`, extends `programEnrollmentStatusEnum` with `paused`, declares the 4 new columns and 2 new indexes. FK references to `users.id` (assigned_by) and `subscriptions.id` (subscription_id).
- **EnrollmentStatus TS type** — union extended with `"paused"` to match the DB enum.
- **6 enrollment insert sites in `subscriptions/service.ts`** — wired with `source` (`plan_linked` | `plan_bundle`) + `subscription_id` (resolved to the freshly-created sub at each site). Plan 02 will replace these direct inserts with `EnrollmentService.enrollFromPlan(...)` calls; for now they satisfy the new NOT NULL contract without behavior change.
- **Integration test `test/migrations/0111-program-enrollments-addon-columns.test.ts`** — 6 `it()` blocks covering schema shape, FK constraints, plan_linked + plan_bundle backfill, ambiguous multi-match → NULL, and idempotency via `splitSqlStatements()` replay. tsc clean, no `as any`, mirrors `0109_reconcile_soledad.test.ts` pattern.

## Backfill Results (Local Apply)

`SELECT source, COUNT(*) FROM program_enrollments GROUP BY source;`

| source      | count |
| ----------- | ----- |
| plan_linked | 6     |
| plan_bundle | 2     |
| admin_addon | 0     |

- Rows with `source IS NULL` after migration: **0** ✓
- Rows with `subscription_id IS NULL`: **1** (ambiguous case — Plan 03 lifecycle hooks ignore null-sub rows by design; operator may review or leave as-is)

## Verification

| Check                                   | Result                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm tsc --noEmit`                     | exit 0                                                                                                                 |
| `pnpm db:migrate` (first run)           | "Applying: 0111... Applied 1 migration(s)"                                                                             |
| `pnpm db:migrate` (re-run)              | "No new migrations to apply"                                                                                           |
| `_migrations` row count for 0111        | 1                                                                                                                      |
| `SHOW COLUMNS FROM program_enrollments` | source NOT NULL ENUM, price_paid INT NULL, assigned_by INT NULL, subscription_id INT NULL, status enum includes paused |
| `grep -E "^\s*--.*;" 0111...sql`        | 0 matches (run-migrations.ts parser hazard avoided)                                                                    |
| `grep -c "drizzle-kit" 0111...sql`      | 0 (hand-written confirmation)                                                                                          |
| `grep -c "WHERE.*IS NULL" 0111...sql`   | 11 (idempotency guards present on every backfill UPDATE)                                                               |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired source + subscription_id at the 6 existing enrollment insert sites in `subscriptions/service.ts`.**

- **Found during:** Task 1 (`pnpm tsc --noEmit` after schema edit).
- **Issue:** Adding `source` as NOT NULL to the Drizzle schema broke the type contract for the 6 existing `tx.insert(schema.programEnrollments).values({...})` callsites in `subscriptions/service.ts` (assignPlan plan_linked + plan_bundle, changePlanNow plan_linked + plan_bundle, renewSubscription plan_linked, activateScheduledSub plan_linked).
- **Fix:** Added `source: "plan_linked" | "plan_bundle"` and `subscriptionId: <newSubscriptionId | subId | scheduled.id>` to each insert. Each site has the fresh sub ID in obvious lexical scope.
- **Why opportunistic subscription_id wiring:** the schema-FK is nullable so the minimum compile fix was source-only, but the architectural value of these 4 columns flows from `subscription_id` being populated on new rows. Plan 03's lifecycle hooks (`pauseForSubscription`, `tearDownForSubscription`) operate on `subscription_id IS NOT NULL`, so populating now means new enrollments get hook coverage immediately rather than waiting for Plan 02. Plan 02 will refactor these 6 sites into `EnrollmentService.enrollFromPlan(...)` calls — net code reduction, not addition.
- **Files modified:** `el-templo-api/src/modules/subscriptions/service.ts` (lines ~1204, ~1257, ~2485, ~2536, ~3191, ~3872).
- **Commit:** `43f6634d` (combined with the schema edit and `EnrollmentStatus` type update).

**2. [Rule 3 - Blocking] Extended `EnrollmentStatus` TS union with `"paused"`.**

- **Found during:** Task 1 tsc verification.
- **Issue:** `programs/types.ts` declared `EnrollmentStatus = "active" | "completed" | "expired" | "cancelled"`. `programs/service.ts` lines 423/464 cast Drizzle query results into `ProgramEnrollment[]`/`ProgramEnrollment` — adding `paused` to the schema enum widened the inferred type and broke assignment.
- **Fix:** Updated `EnrollmentStatus` to include `"paused"` with an inline D-02 comment.
- **Files modified:** `el-templo-api/src/modules/programs/types.ts`.
- **Commit:** `43f6634d`.

### Deferred Issues

**1. [Pre-existing infra rot] Test DB provisioning bug blocks `pnpm test` for the new test file.**

The integration test (`test/migrations/0111-program-enrollments-addon-columns.test.ts`) is structurally complete and tsc-clean but cannot execute today because of a pre-existing test-DB provisioning bug — `test/setup.ts` per-worker setup has overly-broad error tolerance (`msg.includes("Table")` does NOT catch `"Unknown table"` due to case mismatch) which leaves test DBs partially migrated; specifically the `formats.description` column never makes it into the per-worker test DBs, causing `buildApp()` to fail at boot when `sessionRoutes` reads format descriptions. Reproduces on `master` before any Phase 112 commit. Documented in `.planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md` with reproduction steps, root-cause trace, and a suggested fix path (positive error-code allowlist instead of substring match). **Out of scope for v4.85** (schema-only milestone); recommended for a future housekeeping plan or v4.9 split.

## Auth Gates

None — fully autonomous execution against the local dev environment.

## Operator Checkpoints (Pending — DO NOT auto-run)

1. **Staging** — apply migration on staging EC2:

   ```bash
   cd /var/www/staging/el-templo-api && pnpm db:migrate
   ```

   Verify: `mysql ... -e "SELECT source, COUNT(*) FROM program_enrollments GROUP BY source;"` returns no rows with `source IS NULL`.

2. **Production** — apply migration on production EC2 ONLY after staging is sanity-checked and approved:

   ```bash
   cd /var/www/production/el-templo-api && pnpm db:migrate
   ```

   The production count breakdown will differ from local (more rows). Verification gate: `SELECT COUNT(*) FROM program_enrollments WHERE source IS NULL` must return `0` post-apply, and a re-run of `pnpm db:migrate` must say "No new migrations to apply".

3. **Plan 02 unblocking criterion** — Plan 02 (EnrollmentService extraction) starts only after the local DB carries the new shape (already done) and the operator has scheduled the staging apply. Plan 02 is pure-TS service code; it does NOT require the production migration to be applied first, but the staging apply should land before the Plan 02 changes are deployed to staging together.

## Commits (per-task)

| Task | Description                                                                                  | Hash       |
| ---- | -------------------------------------------------------------------------------------------- | ---------- |
| 1    | Drizzle schema + EnrollmentStatus type + wire source/subscription_id at 6 insert sites       | `43f6634d` |
| 2    | Hand-written idempotent migration `0111_program_enrollments_addon_columns.sql` + local apply | `35697134` |
| 3    | Integration test (structurally complete; blocked by pre-existing test-DB bug, deferred)      | `e4b1112f` |

## Self-Check: PASSED

- ✓ `el-templo-api/src/db/migrations/0111_program_enrollments_addon_columns.sql` exists (FOUND, 112 lines, 8 statements)
- ✓ `el-templo-api/test/migrations/0111-program-enrollments-addon-columns.test.ts` exists (FOUND)
- ✓ `el-templo-api/src/db/schema/program-enrollments.ts` modified (FOUND: paused, plan_linked, plan_bundle, admin_addon, idx_enrollments_subscription_id, idx_enrollments_source)
- ✓ `el-templo-api/src/modules/programs/types.ts` modified (FOUND: paused added to EnrollmentStatus)
- ✓ `el-templo-api/src/modules/subscriptions/service.ts` modified (FOUND: source + subscriptionId at 6 sites)
- ✓ `.planning/phases/112-enrollment-service-admin-add-ons/deferred-items.md` exists (FOUND)
- ✓ Commit `43f6634d` (FOUND in `git log --oneline`)
- ✓ Commit `35697134` (FOUND)
- ✓ Commit `e4b1112f` (FOUND)
- ✓ `pnpm tsc --noEmit` — exit 0
- ✓ `pnpm db:migrate` first run — applied 1 migration
- ✓ `pnpm db:migrate` re-run — "No new migrations to apply"
- ✓ DB row count for 0111 in `_migrations` — 1
