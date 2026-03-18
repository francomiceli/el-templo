---
phase: 66-roles-permissions
plan: 01
subsystem: api
tags: [rbac, roles, permissions, drizzle, mysql, fastify]

# Dependency graph
requires:
  - phase: 63-cash-box
    provides: "recepcionista role type added to AdminRole"
provides:
  - "Centralized permission registry (shared/permissions.ts)"
  - "Four-role system: owner, admin, coach, recepcionista"
  - "User management CRUD endpoints at /api/admin/users (owner-only)"
  - "DB migration renaming superadmin to owner and adding recepcionista"
affects: [66-02-frontend-roles, admin-app-sidebar, admin-app-auth]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized role constants with as const for type-safe permission checks"
    - "Cast pattern: (ROLES as readonly string[]).includes(role) for const array .includes()"

key-files:
  created:
    - el-templo-api/src/modules/shared/permissions.ts
    - el-templo-api/src/modules/users/routes.ts
    - el-templo-api/src/modules/users/service.ts
    - el-templo-api/src/modules/users/schemas.ts
    - el-templo-api/src/modules/users/types.ts
    - el-templo-api/src/modules/users/index.ts
    - el-templo-api/src/db/migrations/0047_role_rename_and_recepcionista.sql
    - el-templo-api/test/users/users.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
    - el-templo-api/src/app.ts
    - el-templo-api/src/modules/*/routes.ts (17 files)
    - el-templo-api/src/modules/members/service.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/setup.ts

key-decisions:
  - "Cast pattern (ROLES as readonly string[]).includes() for TypeScript const array compatibility"
  - "sessions/routes.ts also had inline superadmin check -- fixed as deviation Rule 1"
  - "members/service.ts canEditNote had superadmin check -- fixed to owner"
  - "Test setup.ts and test files updated from superadmin to owner to prevent test failures"

patterns-established:
  - "Centralized permissions: import role groups from shared/permissions.ts, never define local arrays"
  - "Owner-only modules: use OWNER_ROLES for franchise, blog, gladius, academy, app-landing, users"
  - "Staff CRUD pattern: UserService with constructor DI, owner-only routes, direct DB test helpers"

requirements-completed: [ROLES-01, ROLES-02, ROLES-03]

# Metrics
duration: 11min
completed: 2026-03-18
---

# Phase 66 Plan 01: Backend Role System Summary

**Four-role permission system (owner/admin/coach/recepcionista) with centralized registry, DB migration, 17-module permission update, and owner-only user management CRUD**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-18T16:30:42Z
- **Completed:** 2026-03-18T16:41:42Z
- **Tasks:** 2
- **Files modified:** 38

## Accomplishments

- Replaced superadmin with owner across entire API codebase (zero remaining references)
- Created centralized permission registry with 9 role group exports (OWNER_ROLES, ADMIN_ROLES, COACH_ROLES, CAJA_ROLES, ATTENDANCE_ROLES, MEMBER_ROLES, PAYMENT_ROLES, SUBSCRIPTION_ROLES, ALL_STAFF_ROLES)
- Updated 17 API module route files to import from shared/permissions.ts instead of defining local arrays
- Created user management module with 4 endpoints (GET/POST/PUT/PATCH) for owner-only staff CRUD
- DB migration 0047 with 3-step enum transition (add values, migrate data, remove superadmin)
- Integration tests covering role enforcement, CRUD operations, duplicate email, password update, deactivation

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + centralized permission registry** - `60a525ee` (feat)
2. **Task 2: Update all API modules + user management CRUD + tests** - `59961cde` (feat)

## Files Created/Modified

### Created

- `el-templo-api/src/modules/shared/permissions.ts` - Centralized role permission constants
- `el-templo-api/src/db/migrations/0047_role_rename_and_recepcionista.sql` - Role enum migration
- `el-templo-api/src/modules/users/routes.ts` - Owner-only user management endpoints
- `el-templo-api/src/modules/users/service.ts` - Staff CRUD business logic
- `el-templo-api/src/modules/users/schemas.ts` - Fastify JSON validation schemas
- `el-templo-api/src/modules/users/types.ts` - StaffUser, CreateStaffInput, UpdateStaffInput interfaces
- `el-templo-api/src/modules/users/index.ts` - Module barrel export
- `el-templo-api/test/users/users.test.ts` - 10 integration test cases

### Modified

- `el-templo-api/src/db/schema/users.ts` - Role enum updated (owner, recepcionista)
- `el-templo-api/src/db/seed.ts` - superadmin replaced with owner
- `el-templo-api/src/db/seed-staging.ts` - superadmin replaced with owner
- `el-templo-api/src/db/import-members.ts` - superadmin replaced with owner
- `el-templo-api/src/app.ts` - userRoutes registered at /api/admin/users
- `el-templo-api/src/modules/*/routes.ts` - 17 files updated to use centralized imports
- `el-templo-api/src/modules/members/service.ts` - canEditNote uses owner instead of superadmin
- `el-templo-api/src/modules/sessions/routes.ts` - Inline role check replaced with ADMIN_ROLES import
- `el-templo-api/test/setup.ts` - Seeds owner instead of superadmin
- `el-templo-api/test/helpers.ts` - Added createStaffUser helper, argon2 import
- `el-templo-api/test/auth/auth.test.ts` - Expects owner role from seeded user
- `el-templo-api/test/franchise/franchise-admin.test.ts` - Renamed superadminToken to ownerToken
- `el-templo-api/test/blog/blog.test.ts` - Updated comment
- `el-templo-api/test/gladius/gladius.test.ts` - Updated comment

## Decisions Made

- Used `(ROLES as readonly string[]).includes()` cast pattern for TypeScript const array compatibility with string role values
- Fixed additional superadmin references found in sessions/routes.ts and members/service.ts beyond the plan scope (Rule 1 - bug fix)
- Updated all test files referencing superadmin to prevent test breakage (Rule 3 - blocking)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed superadmin reference in sessions/routes.ts**

- **Found during:** Task 2 (module-wide superadmin search)
- **Issue:** sessions/routes.ts had inline `["admin", "superadmin"]` check not listed in plan
- **Fix:** Added ADMIN_ROLES import and replaced inline array
- **Files modified:** el-templo-api/src/modules/sessions/routes.ts
- **Committed in:** 59961cde (Task 2 commit)

**2. [Rule 1 - Bug] Fixed superadmin reference in members/service.ts**

- **Found during:** Task 2 (module-wide superadmin search)
- **Issue:** canEditNote method checked for "superadmin" role
- **Fix:** Changed to check for "owner" role
- **Files modified:** el-templo-api/src/modules/members/service.ts
- **Committed in:** 59961cde (Task 2 commit)

**3. [Rule 3 - Blocking] Updated test setup and test files**

- **Found during:** Task 1 and Task 2
- **Issue:** test/setup.ts seeded superadmin, test files referenced superadmin causing test failures
- **Fix:** Updated setup.ts to seed owner, updated auth/blog/franchise/gladius tests
- **Files modified:** test/setup.ts, test/auth/auth.test.ts, test/franchise/franchise-admin.test.ts, test/blog/blog.test.ts, test/gladius/gladius.test.ts
- **Committed in:** 60a525ee and 59961cde

---

**Total deviations:** 3 auto-fixed (2 bug fixes, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None - TypeScript compiled cleanly on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend role system complete, ready for Phase 66-02 (frontend admin sidebar, role-based UI)
- DB migration 0047 must be applied to staging/production before deploying frontend changes
- Frontend still references "superadmin" in 5 files (handled in 66-02)

## Self-Check: PASSED

All 8 created files verified. Both task commits (60a525ee, 59961cde) confirmed in git log.

---

_Phase: 66-roles-permissions_
_Completed: 2026-03-18_
