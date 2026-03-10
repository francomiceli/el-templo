# Phase 53 - Deferred Items

## Schema Drift: sessions.journey_type vs discarded columns

**Found during:** 53-02 Task 2 (migration generation)

**Issue:** `drizzle-kit generate` detects schema drift on the `sessions` table: the Drizzle schema defines `journey_type` column, but the actual DB has `discarded_at`, `discarded_by`, `discarded_reason` columns. This causes drizzle-kit to prompt interactively for every migration generation.

**Impact:** Cannot use `pnpm db:generate` non-interactively until resolved.

**Workaround used:** Hand-wrote migration 0036 instead of using drizzle-kit generate.

**Recommended fix:** Create a migration that drops the `discarded_*` columns and adds `journey_type`, then regenerate the drizzle snapshot.

## Pre-existing Test Failures: scheduling seed route

**Found during:** 53-02 Task 1 (verification)

**Issue:** 3 tests in `test/scheduling/scheduling.test.ts` fail because `POST /api/admin/scheduling/schedules/seed` returns 404 instead of the expected responses. The route appears to have been removed or never registered.

**Impact:** 3 tests always fail, masking real regressions.

**Recommended fix:** Either register the seed route or remove the tests.
