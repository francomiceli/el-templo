---
phase: 61-qr-access-control
plan: 01
subsystem: api, database
tags: [attendance, subscriptions, mysql-migration, drizzle, aura, qr-checkin]

# Dependency graph
requires:
  - phase: 60-plan-configuration
    provides: subscription class tracking, fixedDays, graceCheckInsAfterExpiry columns
  - phase: 50-attendance
    provides: attendance table, QR check-in flow, registrado/confirmado two-step model
provides:
  - Migration 0041 removing grace period and two-step attendance model
  - subscription_schedules junction table for fixed-plan schedule slot references
  - Simplified AttendanceService with immediate confirmado + AURA award
  - SubscriptionService without grace period or fixedDays columns
affects:
  [61-02 (subscription_schedules usage), 61-03 (admin UI attendance view)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      immediate-confirm-on-qr,
      hard-block-on-expiry,
      junction-table-for-fixed-schedules,
    ]

key-files:
  created:
    - el-templo-api/src/db/migrations/0041_attendance_rework.sql
    - el-templo-api/src/db/schema/subscription-schedules.ts
  modified:
    - el-templo-api/src/db/schema/attendance.ts
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/settings/service.ts

key-decisions:
  - "QR check-in immediately creates confirmado status and awards 10 AURA (no two-step model)"
  - "Expired subscription = immediate hard block, no grace period logic anywhere"
  - "subscription_schedules junction table created for Plan 02 fixed-plan schedule slot references"
  - "SettingsService kept as empty shell for future settings (grace period methods removed)"
  - "unconfirmedAttendance field in weekly grid set to constant 0 (registrado status removed)"

patterns-established:
  - "Immediate-confirm: QR scan creates confirmado + awards AURA in single operation"
  - "Hard-block expiry: autoExpireSubscriptions uses simple endDate < today comparison"

requirements-completed: [ACCESS-05]

# Metrics
duration: 23min
completed: 2026-03-17
---

# Phase 61 Plan 01: Schema Migration & Service Cleanup Summary

**Remove grace period and two-step attendance model; QR scan immediately confirms and awards 10 AURA; create subscription_schedules junction table**

## Performance

- **Duration:** 23 min
- **Started:** 2026-03-17T16:04:36Z
- **Completed:** 2026-03-17T16:27:41Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- Migration 0041 removes registrado status, confirmedAt column, fixedDays/graceCheckInsAfterExpiry columns, and creates subscription_schedules table
- QR check-in now creates attendance with status "confirmado" and awards 10 AURA immediately (both regular and force check-in)
- All grace period logic removed from AttendanceService, SubscriptionService, BookingService, SettingsService
- All 465 tests pass with updated assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration and Drizzle model updates** - `26c73aa9` (feat)
2. **Task 2: Service cleanup -- remove grace period, auto-confirm, update tests** - `b79a8ba6` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0041_attendance_rework.sql` - Migration: enum change, column drops, new junction table
- `el-templo-api/src/db/schema/subscription-schedules.ts` - New Drizzle schema for subscription_schedules junction table
- `el-templo-api/src/db/schema/attendance.ts` - Enum only "confirmado", removed confirmedAt column
- `el-templo-api/src/db/schema/subscriptions.ts` - Removed fixedDays and graceCheckInsAfterExpiry columns
- `el-templo-api/src/db/schema/index.ts` - Export subscription-schedules module
- `el-templo-api/src/modules/attendance/service.ts` - Simplified: no grace period, immediate confirmado + AURA award
- `el-templo-api/src/modules/attendance/types.ts` - AttendanceStatus = "confirmado" only, removed confirmedAt
- `el-templo-api/src/modules/attendance/routes.ts` - Removed SettingsService dependency
- `el-templo-api/src/modules/attendance/schemas.ts` - Status enum ["confirmado"], removed confirmedAt
- `el-templo-api/src/modules/subscriptions/service.ts` - Removed grace period, fixedDays, settingsService
- `el-templo-api/src/modules/subscriptions/types.ts` - Removed fixedDays, graceCheckInsAfterExpiry from interfaces
- `el-templo-api/src/modules/subscriptions/routes.ts` - Removed SettingsService dependency
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Removed fixedDays, graceCheckInsAfterExpiry from response schemas
- `el-templo-api/src/modules/scheduling/booking-service.ts` - Removed fixed-day check, grace period check, settingsService
- `el-templo-api/src/modules/scheduling/routes.ts` - Removed SettingsService from both admin and member route plugins
- `el-templo-api/src/modules/scheduling/types.ts` - AttendanceWeekRecord status = "confirmado" only
- `el-templo-api/src/modules/scheduling/schemas.ts` - Updated attendance status enum
- `el-templo-api/src/modules/scheduling/service.ts` - Removed unconfirmed attendance query (registrado no longer exists)
- `el-templo-api/src/modules/settings/service.ts` - Removed grace period methods (empty shell remains)
- `el-templo-api/src/modules/settings/routes.ts` - Removed grace period endpoints
- `el-templo-api/src/modules/settings/schemas.ts` - Removed grace period schemas
- `el-templo-api/test/attendance/attendance.test.ts` - Updated: confirmado assertions, AURA verification, removed grace/fixedDay tests
- `el-templo-api/test/scheduling/scheduling.test.ts` - Removed fixed-day booking enforcement test
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - Removed fixedDays/graceCheckInsAfterExpiry assertions
- `el-templo-api/test/settings/settings.test.ts` - Deleted (only had grace period tests)

## Decisions Made

- QR check-in immediately creates confirmado status and awards 10 AURA (no two-step registrado->confirmado)
- Expired subscription = immediate hard block with no grace period logic anywhere in the codebase
- subscription_schedules junction table created now for Plan 02 to use for fixed-plan schedule slot references
- SettingsService kept as empty shell for future settings extensibility (grace period methods fully removed)
- unconfirmedAttendance in weekly grid hardcoded to 0 since registrado status no longer exists

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed scheduling/service.ts referencing removed "registrado" status**

- **Found during:** Task 2 (service cleanup)
- **Issue:** SchedulingService.getWeeklyGrid had a query counting "registrado" attendance records, which would fail since the enum value no longer exists
- **Fix:** Removed the unconfirmed attendance query and hardcoded unconfirmedAttendance to 0
- **Files modified:** el-templo-api/src/modules/scheduling/service.ts
- **Verification:** TypeScript compilation clean, tests pass
- **Committed in:** b79a8ba6 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed scheduling/schemas.ts and scheduling/types.ts referencing "registrado"**

- **Found during:** Task 2 (service cleanup)
- **Issue:** AttendanceWeekRecord type and schema still had "registrado" in status union
- **Fix:** Updated to only "confirmado"
- **Files modified:** el-templo-api/src/modules/scheduling/types.ts, el-templo-api/src/modules/scheduling/schemas.ts
- **Verification:** TypeScript compilation clean
- **Committed in:** b79a8ba6 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed subscriptions/schemas.ts still referencing fixedDays and graceCheckInsAfterExpiry**

- **Found during:** Task 2 (service cleanup)
- **Issue:** Subscription detail response schema and assign/change-plan body schemas still had fixedDays and graceCheckInsAfterExpiry
- **Fix:** Removed from all three schema locations
- **Files modified:** el-templo-api/src/modules/subscriptions/schemas.ts
- **Verification:** Tests pass (Fastify schema validation would fail otherwise)
- **Committed in:** b79a8ba6 (Task 2 commit)

**4. [Rule 1 - Bug] Fixed subscriptions.test.ts referencing removed fields**

- **Found during:** Task 2 (test updates)
- **Issue:** 3 tests in subscriptions.test.ts asserted fixedDays and graceCheckInsAfterExpiry which no longer exist
- **Fix:** Removed assertions for removed fields, updated test names
- **Files modified:** el-templo-api/test/subscriptions/subscriptions.test.ts
- **Verification:** All 465 tests pass
- **Committed in:** b79a8ba6 (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (4 Rule 1 bugs -- references to removed columns/enums)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

- Migration used `statement-breakpoint` delimiter format instead of semicolons because the test setup's semicolon-split approach would break on comment-only blocks sent to MySQL prepared statements
- Dev database didn't have fixedDays/graceCheckInsAfterExpiry columns (Phase 60 migration not applied to dev), but test environment creates fresh DB with all migrations so this was not an issue

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- subscription_schedules junction table ready for Plan 02 (fixed-plan schedule slot picker + auto-booking generation)
- Attendance simplified to single "confirmado" status for Plan 03 (admin Horarios attendance view)
- All services cleaned of grace period complexity

---

_Phase: 61-qr-access-control_
_Completed: 2026-03-17_
