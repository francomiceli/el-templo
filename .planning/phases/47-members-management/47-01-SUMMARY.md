---
phase: 47-members-management
plan: 01
subsystem: api
tags: [fastify, drizzle, mysql, argon2, members, crud, notes, migration]

# Dependency graph
requires:
  - phase: 45-architecture-foundation
    provides: "Modular monolith structure, barrel export pattern, DB schema conventions"
provides:
  - "Members CRUD API (10 endpoints) at /api/admin/members"
  - "users table extended with profile fields (phone, dni, dateOfBirth, gender, emergency contact, isActive)"
  - "member_notes table with userId, authorId, content"
  - "Migration 0031 for schema changes"
  - "Deactivated user login block in auth routes"
  - "MemberService with constructor DI pattern"
  - "Integration tests covering all endpoints"
affects: [47-02, 47-03, 48-subscriptions, 49-payments, 50-attendance]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "isDuplicateKeyError helper for Drizzle-wrapped MySQL errors",
      "Plugin-level onRequest hook for admin role guard",
    ]

key-files:
  created:
    - "el-templo-api/src/db/schema/member-notes.ts"
    - "el-templo-api/src/db/migrations/0031_members_management.sql"
    - "el-templo-api/src/modules/members/types.ts"
    - "el-templo-api/src/modules/members/schemas.ts"
    - "el-templo-api/src/modules/members/service.ts"
    - "el-templo-api/src/modules/members/routes.ts"
    - "el-templo-api/src/modules/members/index.ts"
    - "el-templo-api/test/members/members.test.ts"
  modified:
    - "el-templo-api/src/db/schema/users.ts"
    - "el-templo-api/src/db/schema/index.ts"
    - "el-templo-api/src/modules/auth/routes.ts"
    - "el-templo-api/src/app.ts"

key-decisions:
  - "Drizzle wraps MySQL errors in err.cause — built isDuplicateKeyError helper to check ER_DUP_ENTRY on cause"
  - "Plugin-level onRequest hook for admin guard (all member routes require coach/admin/superadmin)"
  - "check-dni route defined before :userId param routes to avoid Fastify route conflict"

patterns-established:
  - "isDuplicateKeyError: Helper to detect MySQL duplicate key errors through Drizzle's error wrapping"
  - "Plugin-level auth hook: Single onRequest hook guards all routes in a Fastify plugin"

requirements-completed: [MEMB-01, MEMB-02, MEMB-03, MEMB-04, MEMB-05, MEMB-06]

# Metrics
duration: 13min
completed: 2026-03-09
---

# Phase 47 Plan 01: Members Management API Summary

**Members CRUD API with 10 endpoints, users schema extension (8 fields), member_notes table, DNI uniqueness checks, deactivation/login block, and 18 integration tests**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-09T16:08:24Z
- **Completed:** 2026-03-09T16:21:29Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Extended users table with phone, dni, dateOfBirth, gender, 3 emergency contact fields, and isActive boolean
- Created member_notes table with userId/authorId FKs, content, timestamps, and userId index
- Built complete MemberService with list (search/filter/paginate), CRUD, toggle active, DNI check, and notes CRUD
- 10 admin API endpoints registered at /api/admin/members with role-based guard
- Deactivated users blocked from login with "Cuenta desactivada" message
- 18 integration tests covering all endpoints, authorization, and edge cases — all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema extension, migration, and members module** - `f26b2c0` (feat)
2. **Task 2: Integration tests for members API** - `6828edf` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/users.ts` - Extended with 8 new profile/status columns
- `el-templo-api/src/db/schema/member-notes.ts` - New table schema with relations and index
- `el-templo-api/src/db/schema/index.ts` - Barrel export updated
- `el-templo-api/src/db/migrations/0031_members_management.sql` - ALTER TABLE + CREATE TABLE DDL
- `el-templo-api/src/modules/members/types.ts` - TypeScript interfaces for all member operations
- `el-templo-api/src/modules/members/schemas.ts` - Fastify JSON validation schemas
- `el-templo-api/src/modules/members/service.ts` - Business logic with constructor DI
- `el-templo-api/src/modules/members/routes.ts` - 10 admin endpoints with auth guard
- `el-templo-api/src/modules/members/index.ts` - Module barrel export
- `el-templo-api/src/modules/auth/routes.ts` - isActive check in login, isActive in /me response
- `el-templo-api/src/app.ts` - Registered memberRoutes plugin
- `el-templo-api/test/members/members.test.ts` - 18 integration tests

## Decisions Made

- Drizzle wraps MySQL errors in `err.cause` — built `isDuplicateKeyError` helper to detect `ER_DUP_ENTRY` on the cause object rather than the top-level error message
- Used plugin-level `onRequest` hook to guard all member routes with admin role check (cleaner than per-route guards)
- Placed `check-dni` route before `:userId` parametric routes to avoid Fastify route matching conflicts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle duplicate key error detection**

- **Found during:** Task 2 (Integration tests)
- **Issue:** Duplicate email/DNI inserts returned 500 instead of 409 because Drizzle wraps MySQL errors in `err.cause`, not `err.message`
- **Fix:** Built `isDuplicateKeyError` helper that checks `err.cause.code === 'ER_DUP_ENTRY'` and `err.cause.sqlMessage` for detail extraction
- **Files modified:** `el-templo-api/src/modules/members/routes.ts`
- **Verification:** Tests for duplicate email (409) and duplicate DNI (409) both pass
- **Committed in:** 6828edf (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness — duplicate key detection was broken without understanding Drizzle's error wrapping pattern.

## Issues Encountered

None beyond the auto-fixed deviation above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Complete members API ready for Plans 02 and 03 (admin UI)
- Migration 0031 needs to be run on staging/production databases
- All 10 endpoints available at /api/admin/members for frontend integration

## Self-Check: PASSED

- All 12 files verified present on disk
- Commit f26b2c0 (Task 1) verified in git log
- Commit 6828edf (Task 2) verified in git log
- TypeScript compiles cleanly (`tsc --noEmit`)
- All 233 tests pass (including 18 new members tests)

---

_Phase: 47-members-management_
_Completed: 2026-03-09_
