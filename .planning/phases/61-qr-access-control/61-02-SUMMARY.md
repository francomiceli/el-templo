---
phase: 61-qr-access-control
plan: 02
subsystem: api, database
tags:
  [
    subscriptions,
    bookings,
    attendance,
    fixed-schedules,
    holidays,
    bulk-generation,
    slot-attendance,
  ]

# Dependency graph
requires:
  - phase: 61-qr-access-control
    plan: 01
    provides: subscription_schedules junction table, simplified confirmado attendance, AURA on check-in
  - phase: 60-plan-configuration
    provides: classesPerWeek, bookingMode, budget calculation
provides:
  - Fixed schedule slot validation and storage in subscription_schedules
  - Bulk booking generation for fixed-plan subscription period with holiday skip
  - Subscription cancel/change cancels all future bookings
  - Slot attendance API (GET bookings+attendance per slot+date)
  - Coach manual check-in from slot with subscription warnings
  - Coach undo check-in (removes attendance, restores budget, reverses AURA)
  - replacementCredits column on subscriptions (migration 0042)
affects: [61-03 (admin Horarios attendance view uses slot attendance endpoints)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      setter-di-for-circular-deps,
      bulk-booking-with-holiday-skip,
      coach-check-in-with-warnings,
      attendance-undo-reversal,
    ]

key-files:
  created:
    - el-templo-api/src/db/migrations/0042_replacement_credits.sql
  modified:
    - el-templo-api/src/db/schema/subscriptions.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/scheduling/booking-service.ts
    - el-templo-api/src/modules/scheduling/routes.ts
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/attendance/schemas.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts
    - el-templo-api/test/scheduling/scheduling.test.ts

key-decisions:
  - "Setter DI pattern for SubscriptionService<->BookingService circular dependency (setBookingService method)"
  - "Bulk booking generation fetches all holidays upfront for the date range (single query, not per-date)"
  - "Coach check-in from slot always allows check-in but returns subscription warnings (coach override)"
  - "Attendance undo uses AURA spend for reversal (graceful if insufficient balance)"
  - "cancelFutureBookings only cancels reservado/lista_espera status (not confirmed/scanned past bookings)"

patterns-established:
  - "Setter DI: use setBookingService() to break circular constructor dependency between services"
  - "Coach override pattern: always allow action but return warnings array for UI display"
  - "Attendance reversal: delete record + restore budget + AURA spend reversal + booking status revert"

requirements-completed: [ACCESS-04, ACCESS-05]

# Metrics
duration: 25min
completed: 2026-03-17
---

# Phase 61 Plan 02: Fixed Schedule Subscriptions & Slot Attendance Summary

**Fixed-plan subscriptions with schedule slot storage, holiday-aware bulk booking generation, cancel cleanup, and slot-based attendance endpoints for coach check-in/undo**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-17T16:31:45Z
- **Completed:** 2026-03-17T16:56:45Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Fixed-plan subscriptions validate scheduleIds count matches classesPerWeek, store references in subscription_schedules, and enrich all GET responses with scheduleIds array
- Bulk booking generation creates bookings for entire subscription period, skipping holidays and tracking replacement credits on the subscription
- Subscription cancel/change automatically cancels all future bookings while preserving past records
- Three new admin attendance endpoints: slot attendance view, coach manual check-in with subscription warnings, and coach undo (full reversal of attendance + AURA + budget)
- All 476 tests pass including 12 new integration tests (5 subscription, 7 scheduling)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fixed schedule slot storage, validation, and subscription enrichment** - `100530e9` (feat)
2. **Task 2: Bulk booking generation, cancel cleanup, and slot attendance API** - `d4ad1390` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0042_replacement_credits.sql` - Adds replacement_credits column to subscriptions
- `el-templo-api/src/db/schema/subscriptions.ts` - Added replacementCredits column to Drizzle schema
- `el-templo-api/src/modules/subscriptions/types.ts` - Added scheduleIds, replacementCredits to SubscriptionDetail; scheduleIds to AssignPlanInput and ClassUsageInfo
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Added scheduleIds and replacementCredits to Fastify JSON schemas
- `el-templo-api/src/modules/subscriptions/service.ts` - Fixed schedule slot validation, subscription_schedules storage, booking generation call, cancel future bookings, scheduleIds enrichment
- `el-templo-api/src/modules/subscriptions/routes.ts` - Wired BookingService into subscription routes for fixed-plan generation
- `el-templo-api/src/modules/scheduling/booking-service.ts` - generateFixedBookings (bulk generation with holiday skip), cancelFutureBookings
- `el-templo-api/src/modules/scheduling/routes.ts` - Wired circular DI with setBookingService
- `el-templo-api/src/modules/attendance/service.ts` - getSlotAttendance, coachCheckIn (with warnings), removeCheckIn (full reversal)
- `el-templo-api/src/modules/attendance/routes.ts` - Three new admin endpoints (slot attendance, slot check-in, remove check-in)
- `el-templo-api/src/modules/attendance/schemas.ts` - Fastify schemas for new endpoints
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - 5 new tests for fixed schedule slot subscriptions
- `el-templo-api/test/scheduling/scheduling.test.ts` - 7 new tests for bulk generation, holiday skip, cancel, slot attendance

## Decisions Made

- Used setter DI pattern (setBookingService) instead of constructor param to resolve SubscriptionService<->BookingService circular dependency
- Bulk booking generation fetches all holidays for the date range in one query (Set lookup) rather than per-date queries
- Coach check-in from slot always allows the action but returns subscription status warnings for the admin UI to display (coach override pattern)
- Attendance undo uses AURA spend for reversal; if insufficient balance, logs a warning but doesn't block the undo
- cancelFutureBookings only cancels reservado/lista_espera bookings (not qr_escaneado/confirmado which represent past attendance)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added subscription_schedules cleanup to all 6 test suites**

- **Found during:** Task 1 (test cleanup failing due to FK constraint)
- **Issue:** Test cleanup tried to delete from schedules before subscription_schedules, which has a FK to schedules
- **Fix:** Added subscriptionSchedules import and delete to cleanup functions in all 6 test files (subscriptions, scheduling, attendance, payments, members, analytics)
- **Files modified:** All 6 test files
- **Verification:** All tests pass with proper cleanup ordering
- **Committed in:** 100530e9 (Task 1 commit)

**2. [Rule 3 - Blocking] Wired BookingService into subscription routes**

- **Found during:** Task 2 (bulk generation not running via subscription assign endpoint)
- **Issue:** SubscriptionService in subscription routes lacked BookingService, so fixed-plan assignment through subscription routes couldn't generate bookings
- **Fix:** Added PaymentService and BookingService instantiation and setBookingService wiring in subscription routes plugin
- **Files modified:** el-templo-api/src/modules/subscriptions/routes.ts
- **Verification:** Tests creating fixed-plan subscriptions via subscription API now generate bookings
- **Committed in:** d4ad1390 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking issues)
**Impact on plan:** Both auto-fixes necessary for correct operation. No scope creep.

## Issues Encountered

- Test date arithmetic required adjusting expected booking counts: 14-day duration from June 1 produces end date June 15 (inclusive), generating 5 bookings not 4 for a Mon+Wed schedule

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Slot attendance endpoints ready for Plan 03 admin Horarios attendance view integration
- Fixed-plan bulk bookings generate correctly and cancel on subscription changes
- All 476 tests pass with full coverage of new functionality

---

_Phase: 61-qr-access-control_
_Completed: 2026-03-17_
