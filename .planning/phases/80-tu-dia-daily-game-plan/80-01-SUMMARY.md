---
phase: 80-tu-dia-daily-game-plan
plan: 01
subsystem: api, ui
tags: [progression, weekly-summary, segment, pinia, fastify, drizzle, mysql]

# Dependency graph
requires:
  - phase: 79-behavioral-segmentation
    provides: MemberSegment type and segment on /auth/me response
provides:
  - GET /progression/weekly-summary endpoint (Mon-Sun aggregates with session budget)
  - WeeklySummary TypeScript interface for frontend
  - UserProfile.segment field in member app
  - fetchWeeklySummary composable function
  - progressionStore weekly summary state management
affects: [80-02 (Tu Dia page components), 80-03 (RPE message and rest day card)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TIMESTAMPDIFF for duration calculation in SQL aggregates"
    - "Inline error display pattern (no Notify toast) for non-critical card loading"

key-files:
  created:
    - el-templo-api/test/progression/weekly-summary.test.ts
  modified:
    - el-templo-api/src/modules/progression/routes.ts
    - el-templo-api/src/modules/progression/schemas.ts
    - el-templo-app/src/stores/useUserStore.ts
    - el-templo-app/src/modules/progression/types.ts
    - el-templo-app/src/modules/progression/stores/progressionStore.ts
    - el-templo-app/src/modules/progression/composables/useProgressionApi.ts

key-decisions:
  - "TIMESTAMPDIFF(MINUTE, startedAt, completedAt) for duration instead of JS math -- consistent DB-level calculation"
  - "No Notify toast on weekly summary error -- inline card error text per UI-SPEC"
  - "MemberSegment type duplicated in member app (same pattern as admin app from Phase 79)"

patterns-established:
  - "Weekly summary inline error pattern: composable catches but does not toast, store holds error for card display"

requirements-completed: [ENG-10]

# Metrics
duration: 6min
completed: 2026-03-24
---

# Phase 80 Plan 01: Weekly Summary Endpoint + Frontend Data Layer

**GET /progression/weekly-summary returning Mon-Sun session aggregates with subscription budget, plus UserProfile.segment and WeeklySummary type/store/composable in member app**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T18:58:51Z
- **Completed:** 2026-03-24T19:05:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Backend endpoint with parallel queries: session count, total minutes (TIMESTAMPDIFF), avg RPE, and sessionBudget from active subscription
- 7 integration tests covering: auth guard, zeroed stats, multi-session aggregates, cross-week boundary exclusion, subscription budget, null budget
- Frontend data layer complete: MemberSegment type on UserProfile, WeeklySummary interface, progressionStore state/actions, fetchWeeklySummary composable

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend weekly summary endpoint** - TDD (3 commits)
   - `5810b343` (test) - Failing tests for weekly summary endpoint
   - `88bd509c` (feat) - Implement GET /progression/weekly-summary endpoint
2. **Task 2: Frontend types and store extensions** - `be2d0640` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/progression/routes.ts` - Added GET /weekly-summary with parallel aggregate + subscription queries
- `el-templo-api/src/modules/progression/schemas.ts` - Added weeklySummaryResponseSchema
- `el-templo-api/test/progression/weekly-summary.test.ts` - 7 integration tests
- `el-templo-app/src/stores/useUserStore.ts` - Added MemberSegment type, segment field on UserProfile, segment computed getter
- `el-templo-app/src/modules/progression/types.ts` - Added WeeklySummary interface
- `el-templo-app/src/modules/progression/stores/progressionStore.ts` - Added weeklySummary/loading/error state + actions + reset
- `el-templo-app/src/modules/progression/composables/useProgressionApi.ts` - Added fetchWeeklySummary (no toast, inline error)

## Decisions Made

- Used TIMESTAMPDIFF SQL function for duration calculation instead of JavaScript date math -- keeps computation in the DB for consistency
- Weekly summary error uses inline card display pattern, not Notify toast -- per UI-SPEC, the card shows "No pudimos cargar tu resumen semanal"
- MemberSegment type duplicated in member app useUserStore (same pattern established by Phase 79 for admin app)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Weekly summary endpoint tested and ready for Plan 02 to build the Tu Dia page cards
- UserProfile.segment available for segment-driven greeting and card ordering
- fetchWeeklySummary composable ready for MiCamino.vue to call on mount
- WeeklySummary type matches backend response shape exactly

## Self-Check: PASSED

All 7 files verified present. All 3 commits verified in git log.

---

_Phase: 80-tu-dia-daily-game-plan_
_Completed: 2026-03-24_
