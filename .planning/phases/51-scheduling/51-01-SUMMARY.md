---
phase: 51-scheduling
plan: 01
subsystem: api
tags: [fastify, drizzle, mysql, scheduling, bookings, waitlist, holidays]

requires:
  - phase: 50-attendance
    provides: "AttendanceService, QR check-in, constructor DI pattern, subscription/overdue checks"
  - phase: 48-subscriptions
    provides: "SubscriptionService.getMemberSubscription, classesPerWeek field"
  - phase: 49-payments
    provides: "PaymentService.getMemberBalance for overdue check"
provides:
  - "4 new DB tables: activities, schedules, bookings, holidays"
  - "branches: country, maxCapacity, romEnabled columns"
  - "attendance: scheduleId FK column"
  - "SchedulingService with full booking lifecycle"
  - "Admin routes at /api/admin/scheduling"
  - "Member routes at /api/members/scheduling"
  - "25 integration tests for scheduling module"
affects: [51-02-admin-ui, 51-03-member-app, 52-analytics]

tech-stack:
  added: []
  patterns:
    [
      "shared handleServiceError helper for routes",
      "getFutureSlot test helper for time-dependent booking tests",
    ]

key-files:
  created:
    - el-templo-api/src/db/schema/activities.ts
    - el-templo-api/src/db/schema/schedules.ts
    - el-templo-api/src/db/schema/bookings.ts
    - el-templo-api/src/db/schema/holidays.ts
    - el-templo-api/src/db/migrations/0035_scheduling.sql
    - el-templo-api/src/modules/scheduling/types.ts
    - el-templo-api/src/modules/scheduling/service.ts
    - el-templo-api/src/modules/scheduling/schemas.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/scheduling/index.ts
    - el-templo-api/test/scheduling/scheduling.test.ts
  modified:
    - el-templo-api/src/db/schema/branches.ts
    - el-templo-api/src/db/schema/attendance.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/attendance/attendance.test.ts
    - el-templo-api/test/members/members.test.ts
    - el-templo-api/test/payments/payments.test.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts

key-decisions:
  - "Separate ALTER statements in migration for MySQL 5.7 compat (IF NOT EXISTS not supported on ADD COLUMN)"
  - "Shared handleServiceError helper in routes.ts for DRY error handling across all scheduling endpoints"
  - "getFutureSlot test helper dynamically calculates bookable slots relative to current time for reliable tests"
  - "Delete old cancelled/no_show bookings on re-reserve to avoid unique constraint violation"

patterns-established:
  - "handleServiceError: shared error handler for route plugins that maps service errors to HTTP codes"
  - "getFutureSlot: time-aware test helper that finds bookable future slots regardless of when tests run"

requirements-completed: [SCHD-01, SCHD-02, SCHD-03, SCHD-04, SCHD-05, SCHD-06]

duration: 15min
completed: 2026-03-10
---

# Phase 51 Plan 01: Scheduling API Summary

**Complete scheduling API with 4 new tables, SchedulingService with reserve/cancel/waitlist/capacity/weekly-limit/overdue/holiday enforcement, admin+member routes, and 25 integration tests (330 total passing)**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-10T14:33:09Z
- **Completed:** 2026-03-10T14:48:27Z
- **Tasks:** 2
- **Files modified:** 19 (11 created, 8 modified)

## Accomplishments

- 4 new DB tables (activities, schedules, bookings, holidays) with proper indexes and unique constraints
- branches table extended with country, maxCapacity, romEnabled; attendance extended with scheduleId FK
- SchedulingService with complete booking lifecycle: reserve with 9-step validation, cancel with waitlist auto-promote, admin override booking, seed default schedules, holiday management with auto-cancel
- Admin routes (13 endpoints) and member routes (4 endpoints) registered in app.ts
- 25 scheduling integration tests plus updated cleanup order in 4 existing test suites (330 total tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema, migration, types, and SchedulingService** - `ef8d76b` (feat)
2. **Task 2: Scheduling routes, app registration, and integration tests** - `b13515e` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/activities.ts` - Activities table (name, description, isActive)
- `el-templo-api/src/db/schema/schedules.ts` - Weekly recurring slots (branch, activity, dayOfWeek, startTime, endTime)
- `el-templo-api/src/db/schema/bookings.ts` - Member bookings with status enum and waitlist position
- `el-templo-api/src/db/schema/holidays.ts` - Country-specific holidays for schedule cancellation
- `el-templo-api/src/db/schema/branches.ts` - Added country, maxCapacity, romEnabled columns
- `el-templo-api/src/db/schema/attendance.ts` - Added scheduleId FK to link check-ins to booked slots
- `el-templo-api/src/db/schema/index.ts` - Added exports for 4 new schema files
- `el-templo-api/src/db/migrations/0035_scheduling.sql` - DDL for 4 tables, 3 branch columns, 1 attendance column
- `el-templo-api/src/modules/scheduling/types.ts` - TypeScript interfaces for all scheduling entities
- `el-templo-api/src/modules/scheduling/service.ts` - SchedulingService with all business logic
- `el-templo-api/src/modules/scheduling/schemas.ts` - Fastify JSON schemas for request/response validation
- `el-templo-api/src/modules/scheduling/routes.ts` - Admin and member route plugins
- `el-templo-api/src/modules/scheduling/index.ts` - Barrel export
- `el-templo-api/src/app.ts` - Route registration for scheduling plugins
- `el-templo-api/test/scheduling/scheduling.test.ts` - 25 integration tests
- `el-templo-api/test/attendance/attendance.test.ts` - Updated cleanup order for bookings FK
- `el-templo-api/test/members/members.test.ts` - Updated cleanup order for bookings FK
- `el-templo-api/test/payments/payments.test.ts` - Updated cleanup order for bookings FK
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - Updated cleanup order for bookings FK

## Decisions Made

- **MySQL 5.7 compat migration:** Used separate ALTER TABLE statements instead of `ADD COLUMN IF NOT EXISTS` (not supported in MySQL 5.7). The test setup already handles duplicate column errors gracefully.
- **Shared error handler:** Created `handleServiceError` helper in routes.ts to DRY up the BadRequestError/NotFoundError/ConflictError -> HTTP status mapping across 17 route handlers.
- **Re-reserve after cancel:** When a member has a cancelled/no_show booking for a slot and tries to re-reserve, the old record is deleted before inserting the new one to avoid unique constraint violation on (member, schedule, date).
- **getFutureSlot test helper:** Dynamically calculates a bookable slot that is in the future regardless of what day/time the tests run, making tests reliable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed migration syntax for MySQL 5.7 compatibility**

- **Found during:** Task 2 (running integration tests)
- **Issue:** `ALTER TABLE ADD COLUMN IF NOT EXISTS` syntax is not supported in the MySQL version used. Migration failed during test setup.
- **Fix:** Split multi-column ALTER TABLE into separate single-column ALTER statements. The test setup's error handler already catches "Duplicate column name" errors for idempotency.
- **Files modified:** el-templo-api/src/db/migrations/0035_scheduling.sql
- **Verification:** All 330 tests pass
- **Committed in:** b13515e (Task 2 commit)

**2. [Rule 2 - Missing Critical] Updated cleanup order in 4 existing test files**

- **Found during:** Task 2 (running integration tests)
- **Issue:** New bookings table has FK constraints on users and schedules. Existing test cleanup functions tried to delete users before bookings, causing ER_ROW_IS_REFERENCED_2 errors.
- **Fix:** Added `bookings`, `holidays`, `schedules`, `activities` deletion before `attendance` and `users` in cleanup functions of attendance, members, payments, and subscriptions test files.
- **Files modified:** test/attendance/attendance.test.ts, test/members/members.test.ts, test/payments/payments.test.ts, test/subscriptions/subscriptions.test.ts
- **Verification:** All 330 tests pass with zero regressions
- **Committed in:** b13515e (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both auto-fixes necessary for correct test execution. No scope creep.

## Issues Encountered

None beyond the auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Complete scheduling API ready for consumption by admin UI (Plan 02) and member app (Plan 03)
- All SCHD requirements addressed at the API level
- Migration 0035 needs to be run against staging/production databases before deploying

## Self-Check: PASSED

- All 12 created/key files verified present on disk
- Commit ef8d76b (Task 1) verified in git log
- Commit b13515e (Task 2) verified in git log

---

_Phase: 51-scheduling_
_Completed: 2026-03-10_
