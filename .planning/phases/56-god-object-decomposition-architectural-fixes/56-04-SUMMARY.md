---
phase: 56-god-object-decomposition-architectural-fixes
plan: 04
subsystem: api, ui
tags: [vue, composable, dependency-injection, shallowRef, fastify]

# Dependency graph
requires:
  - phase: 50-attendance
    provides: AttendanceService with PaymentService/SubscriptionService usage
  - phase: 48-subscriptions
    provides: SubscriptionService with AuraService usage
provides:
  - Constructor DI for AttendanceService (PaymentService, SubscriptionService, AuraService)
  - Constructor DI for SubscriptionService (AuraService)
  - Composable-inside-computed anti-pattern eliminated in DayPlayer and JourneySession
affects: [56-god-object-decomposition-architectural-fixes]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      shallowRef-watch-composable-instantiation,
      constructor-dependency-injection,
    ]

key-files:
  created: []
  modified:
    - el-templo-app/src/modules/training/pages/DayPlayer.vue
    - el-templo-app/src/modules/journey/pages/JourneySession.vue
    - el-templo-api/src/modules/attendance/service.ts
    - el-templo-api/src/modules/attendance/routes.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/modules/scheduling/service.ts

key-decisions:
  - "shallowRef + watch replaces computed for composable instantiation -- prevents reactive instance leaks"
  - "AuraService instantiated without log (optional param) to avoid FastifyBaseLogger vs pino Logger type mismatch"
  - "SchedulingService updated to pass AuraService to SubscriptionService (Rule 3 blocking fix for Plan 03 dependency)"

patterns-established:
  - "shallowRef + watch for composable-returns-object: use shallowRef to hold composable result, watch dependencies to re-instantiate"
  - "Constructor DI for services: dependencies injected via constructor, instantiated in route plugins"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-11
---

# Phase 56 Plan 04: Composable Instantiation Fix + Service Constructor DI Summary

**shallowRef+watch pattern replaces composable-inside-computed in player pages; constructor DI eliminates new-inside-constructor in AttendanceService and SubscriptionService**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-11T22:47:15Z
- **Completed:** 2026-03-11T22:53:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Eliminated composable-inside-computed anti-pattern in DayPlayer.vue and JourneySession.vue, preventing reactive instance leaks on every computed recomputation
- AttendanceService and SubscriptionService now receive dependencies via constructor parameters instead of newing them internally
- All 394 API tests pass, TypeScript compiles cleanly in both app and API

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix composable-inside-computed in DayPlayer and JourneySession** - `fa3ad8be` (refactor)
2. **Task 2: Introduce constructor DI in AttendanceService and SubscriptionService** - `214119d1` (refactor)

**Plan metadata:** (pending) (docs: complete plan)

## Files Created/Modified

- `el-templo-app/src/modules/training/pages/DayPlayer.vue` - shallowRef + watch replaces computed for useSessionPlayer
- `el-templo-app/src/modules/journey/pages/JourneySession.vue` - shallowRef + watch replaces computed for useJourneySession
- `el-templo-api/src/modules/attendance/service.ts` - Constructor accepts PaymentService, SubscriptionService, AuraService
- `el-templo-api/src/modules/attendance/routes.ts` - Instantiates dependencies and injects into AttendanceService
- `el-templo-api/src/modules/subscriptions/service.ts` - Constructor accepts AuraService
- `el-templo-api/src/modules/subscriptions/routes.ts` - Instantiates AuraService and injects into SubscriptionService
- `el-templo-api/src/modules/subscriptions/member-routes.ts` - Instantiates AuraService and injects into SubscriptionService
- `el-templo-api/src/modules/scheduling/service.ts` - Passes AuraService to SubscriptionService constructor (Rule 3 fix)

## Decisions Made

- Used shallowRef (not ref) to hold composable return value -- avoids deep unwrapping of nested reactive refs inside the composable object
- AuraService instantiated without log parameter to avoid type mismatch between FastifyBaseLogger and pino.Logger (log is optional in AuraService)
- SchedulingService updated as Rule 3 deviation to maintain compatibility after SubscriptionService constructor change

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated SchedulingService to pass AuraService to SubscriptionService**

- **Found during:** Task 2 (Constructor DI for SubscriptionService)
- **Issue:** SchedulingService also instantiates SubscriptionService internally with old 2-arg constructor; changing SubscriptionService's signature breaks it
- **Fix:** Added AuraService import and instantiation in SchedulingService constructor, passed to SubscriptionService
- **Files modified:** el-templo-api/src/modules/scheduling/service.ts
- **Verification:** TypeScript compiles cleanly, all 394 tests pass
- **Committed in:** 214119d1 (part of Task 2 commit)

**2. [Rule 1 - Bug] Fixed AuraService type mismatch in route instantiation**

- **Found during:** Task 2 (wiring dependencies in routes)
- **Issue:** AuraService constructor takes pino.Logger (optional), but routes pass FastifyBaseLogger which has different type signature
- **Fix:** Omitted log parameter when instantiating AuraService (parameter is optional)
- **Files modified:** attendance/routes.ts, subscriptions/routes.ts, subscriptions/member-routes.ts, scheduling/service.ts
- **Verification:** TypeScript compiles with zero errors
- **Committed in:** 214119d1 (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 (SchedulingService god object decomposition) can proceed -- depends_on this plan
- Plan 05 can proceed -- constructor DI patterns established for remaining services

---

_Phase: 56-god-object-decomposition-architectural-fixes_
_Completed: 2026-03-11_
