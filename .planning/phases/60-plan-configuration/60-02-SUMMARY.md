---
phase: 60-plan-configuration
plan: 02
subsystem: api
tags:
  [
    fastify,
    drizzle,
    mysql,
    attendance,
    booking,
    class-tracking,
    grace-period,
    enforcement,
  ]

requires:
  - phase: 60-plan-configuration
    plan: 01
    provides: "classesRemaining, fixedDays, graceCheckInsAfterExpiry columns; SettingsService; budget calculation"
provides:
  - "Attendance enforcement: weekly limit, monthly budget, fixed-day, grace period at check-in"
  - "Budget decrement on each confirmed check-in"
  - "Force check-in endpoint (POST /api/attendance/force) with admin bypass"
  - "Booking enforcement: fixed-day, monthly budget, grace period at booking"
  - "Grace-period-aware auto-expire in SubscriptionService"
affects: [60-03-PLAN, admin-ui, member-app]

tech-stack:
  added: []
  patterns:
    [
      "Grace period intercept before auto-expire for attendance and booking",
      "Multi-layer enforcement: fixed-day > weekly limit > monthly budget > grace period",
      "Force check-in as admin override with reason logging",
    ]

key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/attendance/service.ts"
    - "el-templo-api/src/modules/attendance/types.ts"
    - "el-templo-api/src/modules/attendance/routes.ts"
    - "el-templo-api/src/modules/attendance/schemas.ts"
    - "el-templo-api/src/modules/attendance/index.ts"
    - "el-templo-api/src/modules/scheduling/booking-service.ts"
    - "el-templo-api/src/modules/scheduling/routes.ts"
    - "el-templo-api/src/modules/subscriptions/service.ts"
    - "el-templo-api/src/modules/subscriptions/routes.ts"
    - "el-templo-api/test/attendance/attendance.test.ts"
    - "el-templo-api/test/scheduling/scheduling.test.ts"

key-decisions:
  - "Grace period bypass auto-expire: getSubscriptionWithGracePeriod queries raw subscription status, avoiding auto-expire so grace logic can intercept"
  - "SettingsService as optional param on SubscriptionService (backward-compatible) for grace-period-aware auto-expire"
  - "Weekly limit counted from attendance records (not bookings) for check-in enforcement; booking still uses booking count"
  - "Force check-in still decrements classesRemaining to keep budget accurate"

patterns-established:
  - "Multi-layer enforcement order: subscription > overdue > branch > fixed-day > weekly limit > monthly budget > one-per-day"
  - "Grace period three-stage: transparent during grace days, first-warning increment, hard block on second attempt"
  - "Force check-in pattern: admin endpoint bypasses all enforcement but maintains budget integrity"

requirements-completed: [PLANS-01, PLANS-02, PLANS-06]

duration: 22min
completed: 2026-03-17
---

# Phase 60 Plan 02: Attendance & Booking Enforcement Summary

**Class tracking enforcement at check-in and booking: weekly limits, monthly budget decrement, fixed-day restrictions, three-stage grace period, and admin force check-in override**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-17T00:55:12Z
- **Completed:** 2026-03-17T01:17:50Z
- **Tasks:** 2 (both TDD: RED + GREEN)
- **Files modified:** 11

## Accomplishments

- Attendance check-in now enforces weekly class limit (Mon-Sun calendar week), monthly budget (blocks at 0), and fixed-day restrictions
- Each confirmed check-in decrements classesRemaining by 1 to track budget consumption
- Grace period three-stage logic: transparent access during grace days, first warning (admin-visible), hard block on second attempt
- Force check-in endpoint (POST /api/attendance/force) bypasses all limits with reason logging
- BookingService enforces same fixed-day, monthly budget, and grace period restrictions as check-in
- Auto-expire now grace-period-aware: subscriptions within grace window are NOT auto-expired
- 8 new integration tests (6 attendance + 2 booking enforcement), all 474 tests pass

## Task Commits

Each task was committed atomically (TDD: test + implementation):

1. **Task 1: Attendance enforcement**
   - `630bd826` (test) - Failing tests for weekly limit, monthly budget, fixed-day, force check-in, grace period
   - `5bfb7b4a` (feat) - Full enforcement implementation with SettingsService integration

2. **Task 2: Booking enforcement**
   - `e836e199` (test) - Failing tests for fixed-day and monthly budget booking enforcement
   - `94351b8b` (feat) - Fixed-day, monthly budget, and grace period checks in BookingService

## Files Modified

- `el-templo-api/src/modules/attendance/service.ts` - Added enforcement layers, grace period, force check-in, budget decrement
- `el-templo-api/src/modules/attendance/types.ts` - Added ForceCheckInInput interface
- `el-templo-api/src/modules/attendance/routes.ts` - Added POST /force endpoint, SettingsService DI
- `el-templo-api/src/modules/attendance/schemas.ts` - Added forceCheckInSchema
- `el-templo-api/src/modules/attendance/index.ts` - Export ForceCheckInInput
- `el-templo-api/src/modules/scheduling/booking-service.ts` - Fixed-day, budget, grace period enforcement
- `el-templo-api/src/modules/scheduling/routes.ts` - SettingsService DI for booking
- `el-templo-api/src/modules/subscriptions/service.ts` - Grace-period-aware autoExpireSubscriptions
- `el-templo-api/src/modules/subscriptions/routes.ts` - SettingsService DI
- `el-templo-api/test/attendance/attendance.test.ts` - 6 new enforcement tests
- `el-templo-api/test/scheduling/scheduling.test.ts` - 2 new booking enforcement tests

## Decisions Made

- **Grace period intercept pattern**: The attendance service queries raw subscription status directly (bypassing getMemberSubscription's auto-expire) so the grace period logic can evaluate the expired subscription before it gets auto-expired. This avoids the "no active subscription" false negative for members within the grace window.
- **SettingsService as optional constructor param**: Added as optional 4th parameter to SubscriptionService to maintain backward compatibility with existing callsites while enabling grace-period-aware auto-expire where needed.
- **Weekly limit uses attendance count (not booking count)**: Check-in enforcement counts actual attendance records for the current week, independent of bookings. BookingService continues to use its own booking count for weekly limit (already existed).
- **Force check-in decrements budget**: Even though force check-in bypasses all checks, it still decrements classesRemaining to keep the budget accurate. The admin can always force again if needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing expired-subscription test for grace period behavior**

- **Found during:** Task 1 (Attendance enforcement)
- **Issue:** Pre-existing test "POST rejects check-in with expired subscription (no active sub)" expected "suscripcion activa" error, but grace period now intercepts before auto-expire
- **Fix:** Updated test to set graceCheckInsAfterExpiry=1 and expect "vencida" error (hard block after first warning)
- **Files modified:** test/attendance/attendance.test.ts
- **Committed in:** 5bfb7b4a (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in pre-existing test)
**Impact on plan:** Test correction necessary for grace period behavior. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All enforcement logic operational for Plans 60-03 (admin UI)
- Force check-in endpoint ready for admin panel integration
- Grace period fully functional with the settings API from Plan 01
- All 474 tests pass, TypeScript compiles clean

## Self-Check: PASSED

- All 11 modified files verified on disk
- All 4 task commits verified in git log (630bd826, 5bfb7b4a, e836e199, 94351b8b)

---

_Phase: 60-plan-configuration_
_Completed: 2026-03-17_
