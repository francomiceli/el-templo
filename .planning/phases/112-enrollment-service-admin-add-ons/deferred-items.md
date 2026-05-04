# Phase 112 — Deferred Items

Items discovered during execution that are out of scope for the current plan.

## From Plan 112-01 (Schema migration)

### Pre-existing test DB provisioning bug

**Discovered:** During Task 3 execution (`pnpm test test/migrations/0111-program-enrollments-addon-columns.test.ts`).

**Symptom:** App startup fails with `Unknown column 'description' in 'field list'` on `formats` table. Per-worker test DBs (`eltemplo_test_1`..`_4`) end up missing the `description` column even though migration `0023_format_descriptions.sql` is recorded as applied in `_migrations`.

**Root cause:** `test/setup.ts` per-worker provisioning has overly-broad error tolerance (`msg.includes("Table")` does NOT catch `"Unknown table"` because of case mismatch — `T` vs `t`). When migration `0070_rename_programs_merge_goal_plans.sql` runs `DROP TABLE member_goal_plans` and the table doesn't exist (because earlier migration tolerated a real error), the runner throws and stops applying further migrations. But `_migrations` still gets the row inserted for migrations that "tolerated" their errors silently — so the tracker is lying about state.

**Reproduction:** `pnpm test` against any test file triggers `createTestApp()` → `buildApp()` → `sessionRoutes` plugin runs `SELECT name, description FROM formats` at boot → fails with ER_BAD_FIELD_ERROR.

**Why deferred:**

- Pre-existing — not caused by Phase 112 changes (verified: `git status` shows no test setup file modifications, and the issue reproduces on commit `8b39ad63` before Plan 01).
- Out of scope — fixing test infrastructure is a separate concern (likely needs a v4.9 / housekeeping plan).
- Hit the FIX ATTEMPT LIMIT (3 attempts) on environmental fixes.

**Impact on Plan 112-01:**

- Migration 0111 itself is verified working: applied to local `eltemplo` DB, all columns + indexes + FKs created, `_migrations` tracks the file, replay is a no-op (verified with second `pnpm db:migrate` run). Backfill produced expected counts (6 plan_linked, 2 plan_bundle, 0 admin_addon, 0 with NULL source, 1 with NULL subscription_id).
- Drizzle schema + downstream type updates (`EnrollmentStatus` union, 6 insert sites in `subscriptions/service.ts`) compile cleanly via `pnpm tsc --noEmit`.
- The integration test file (`test/migrations/0111-program-enrollments-addon-columns.test.ts`) is structurally complete (6 `it()` blocks, no `as any`, real-DB pattern matches `0109_reconcile_soledad.test.ts` precedent). It is BLOCKED by the test-DB provisioning issue, not by anything plan-specific. Once a future housekeeping plan repairs the per-worker provisioner, the test will run as-is.

**Suggested fix path (not in v4.85 scope):**

- Tighten `test/setup.ts` error tolerance: replace the broad `msg.includes("Table")` and `msg.includes("Unknown column")` strings with a positive list that actually matches MySQL error codes / texts (e.g., `ER_DUP_FIELDNAME`, `ER_DUP_KEYNAME`, `ER_FK_DUP_NAME`).
- Once tolerated set is precise, untolerated errors will surface during provisioning and force migrations to be fixed forward (e.g., add `IF EXISTS` guards in `0070`).
