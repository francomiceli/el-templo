---
phase: 89-planes-online-infra
plan: 03
started: "2026-04-04T19:11:35Z"
completed: "2026-04-04T19:34:00Z"
duration: 22min
status: complete
tasks_completed: 2
tasks_total: 2
files_modified: 10
key-files:
  created:
    - el-templo-api/test/goal-plans/goal-plans.test.ts
  modified:
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/subscriptions/member-plans.test.ts
    - el-templo-api/test/subscriptions/promo-plans.test.ts
    - el-templo-api/test/auth/promo-registration.test.ts
    - el-templo-api/test/programs.test.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-api/src/modules/progression/routes.ts
  deleted:
    - el-templo-api/test/personalizadas/personalizadas.test.ts
decisions:
  - "Admin module and progression module schema references updated as blocking fix (Rule 3) since Plans 01/02 renamed schema columns but missed these consumers"
  - "programs.test.ts keeps /has-personalizada-access URL since the actual API route hasn't been renamed yet -- only test descriptions updated"
---

# Phase 89 Plan 03: Test Suite Rename and Validation Summary

Update all API test files to use goalPlan/planCategory naming, rename test directory from personalizadas/ to goal-plans/, fix broken schema references in admin and progression modules discovered during test execution. Full suite green (640/640).

## What Changed

### Task 1: Test helpers and goal-plans test file (3cd99924)

- Renamed `test/personalizadas/personalizadas.test.ts` to `test/goal-plans/goal-plans.test.ts`
- All identifiers: `personalizada` -> `goalPlan`, `personalizadas` -> `goalPlans`
- Plan fixtures: `isPersonalizada: true` + `personalizadaType` -> `planCategory: "online_goal"` + `goalPlanType`
- HTTP paths: `/personalizadas/` -> `/goal-plans/`, `/admin/personalizadas/` -> `/admin/goal-plans/`
- Response keys: `personalizada` -> `goalPlan`, `personalizadas` -> `goalPlans`
- DayId assertions: `P-` prefix -> `GP-` prefix
- Schema references: `schema.memberPersonalizadas` -> `schema.memberGoalPlans` in helpers.ts cleanAllTestData

### Task 2: Subscription, promo, auth, and programs tests + API fixes (cbaf1cc2)

- `member-plans.test.ts`: `isPersonalizada`/`personalizadaType`/`personalizadaZones` -> `planCategory`/`goalPlanType`/`goalPlanZones`
- `promo-plans.test.ts`: `isOnline: true` -> `planCategory: "online_regular"`
- `promo-registration.test.ts`: `isOnline: true` -> `planCategory: "online_regular"`
- `programs.test.ts`: test descriptions updated from "personalizada" to "goal-plan"
- **Rule 3 fix**: Admin module (`service.ts`, `routes.ts`, `schemas.ts`) still referenced `schema.sessions.personalizadaType` which was renamed to `goalPlanType` by Plan 01 -- caused 500 errors on `/admin/sessions`
- **Rule 3 fix**: Progression module (`routes.ts`) still referenced `schema.completedSessions.personalizadaType` which was renamed to `goalPlanType` -- caused 500 on `/progression/stats`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Admin module schema references broken by Plan 01/02 renames**
- **Found during:** Task 2 (test run)
- **Issue:** Plans 01/02 renamed `sessions.personalizadaType` and `completedSessions.personalizadaType` columns to `goalPlanType` in the Drizzle schema, but the admin module (`service.ts`, `routes.ts`, `schemas.ts`) still referenced the old column names. This caused 500 errors on admin session listing endpoints.
- **Fix:** Updated all `personalizadaType` references in admin module to `goalPlanType` (interface, filter logic, select columns, query params, JSON schemas)
- **Files modified:** `admin/service.ts`, `admin/routes.ts`, `admin/schemas.ts`
- **Commit:** cbaf1cc2

**2. [Rule 3 - Blocking] Progression module schema reference broken by Plan 01/02 renames**
- **Found during:** Task 2 (test run)
- **Issue:** `progression/routes.ts` referenced `schema.completedSessions.personalizadaType` in a query filtering out goal plan completions, but the column was renamed to `goalPlanType`. Caused 500 on `/progression/stats`.
- **Fix:** Updated to `schema.completedSessions.goalPlanType`
- **Files modified:** `progression/routes.ts`
- **Commit:** cbaf1cc2

## Verification

- Full test suite: **640/640 tests passing** (35 test files)
- Zero `isPersonalizada|isOnline|personalizadaType|memberPersonalizadas|personalizada_completion` references in `test/` directory
- `test/goal-plans/` exists, `test/personalizadas/` does not exist
- All plan fixtures use `planCategory` enum values

## Known Stubs

None.

## Self-Check: PASSED
