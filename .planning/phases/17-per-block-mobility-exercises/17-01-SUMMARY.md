---
phase: 17-per-block-mobility-exercises
plan: 01
subsystem: api, database
tags: [drizzle, mobility, session-generation, pipeline, discriminator]

# Dependency graph
requires:
  - phase: 13-session-generation-review
    provides: "ROUTE_TO_MOBILITY_ROUTES mapping, mobilityRelated column, MOVILIDAD pattern exercises"
  - phase: 15-session-editing
    provides: "Algorithm snapshot system for revert capability"
provides:
  - "exercise_type discriminator column on session_prescriptions"
  - "selectMobilityExercise function for route-based mobility selection"
  - "Mobility persistence with exerciseType='mobility' and sortOrder=999"
  - "Algorithm snapshot includes mobility exercises with exerciseType"
  - "BlockPlan.mobilityExercise field for post-pipeline mobility"
  - "ExercisePrescription.exerciseType field ('main' | 'mobility')"
affects: [17-02 api-response-admin-editing, 17-03 member-app-display, 17-04 pdf-mobility-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Post-pipeline mobility selection (separate from 7-stage pipeline)"
    - "exercise_type discriminator column for prescription type separation"
    - "mobilityExercise field on BlockPlan for generation-time attachment"

key-files:
  created:
    - "el-templo-api/src/db/migrations/0012_exercise_type.sql"
    - "el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts"
  modified:
    - "el-templo-api/src/db/schema/session-prescriptions.ts"
    - "el-templo-api/src/modules/sessions/types.ts"
    - "el-templo-api/src/modules/sessions/service.ts"
    - "el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts"

key-decisions:
  - "Post-pipeline mobility selection rather than new pipeline stage"
  - "exercise_type discriminator column instead of separate table"
  - "ISO=20s, CON=10reps defaults from examples.txt analysis"
  - "sortOrder=999 for mobility exercises to always appear last"
  - "rest=0 for mobility (active rest, no prescribed rest after)"

patterns-established:
  - "Post-pipeline enrichment: attach data to BlockPlan after pipeline completes"
  - "Discriminator column pattern for prescription type separation"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 17 Plan 01: Data Foundation Summary

**exercise_type discriminator column, selectMobilityExercise function with route-based filtering and ISO/CON defaults, full pipeline wiring with persistence and snapshot support**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T14:21:36Z
- **Completed:** 2026-02-12T14:25:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added exercise_type discriminator column to session_prescriptions with 'main' default (all existing rows unaffected)
- Created selectMobilityExercise function: queries MOVILIDAD exercises, filters by ROUTE_TO_MOBILITY_ROUTES mapping, random selection with full-pool fallback
- Wired mobility selection into generateDailySession for all non-INITIUM blocks with structured logging
- Updated saveSession to persist mobility exercises with exerciseType='mobility' and sortOrder=999
- Algorithm snapshot captures mobility exercises for revert capability
- reconstructSession loads exerciseType from DB for downstream consumers
- Fixed missing LS route in ROUTE_TO_MOBILITY_ROUTES

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + schema + types** - `f887b0f` (feat)
2. **Task 2: Mobility selection + pipeline wiring + persistence** - `f8f2b8b` (feat)

## Files Created/Modified
- `el-templo-api/src/db/migrations/0012_exercise_type.sql` - Migration adding exercise_type column with index
- `el-templo-api/src/db/schema/session-prescriptions.ts` - Drizzle schema with exerciseType column
- `el-templo-api/src/modules/sessions/types.ts` - ExercisePrescription.exerciseType and BlockPlan.mobilityExercise fields
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts` - Mobility exercise selection function
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-routes.ts` - Added LS route mapping
- `el-templo-api/src/modules/sessions/service.ts` - Pipeline wiring, persistence, snapshot, reconstruction

## Decisions Made
- Post-pipeline mobility selection: mobility selection runs after the 7-stage pipeline completes, not as a new stage. The pipeline's type progression and budget system don't apply to mobility.
- Discriminator column over separate table: mobility prescriptions share exact same structure as main prescriptions, making a single table with type discriminator the cleanest approach.
- ISO=20s, CON=10reps: defaults derived from examples.txt statistical analysis of 21 coach-built sessions.
- rest=0 for mobility: mobility is active rest between blocks, no prescribed rest period after.
- sortOrder=999: ensures mobility always appears last within a block regardless of main exercise count.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data foundation complete: exercise_type column exists, mobility selection function works, persistence layer includes exerciseType
- Ready for Plan 02: API response separation (mobilityExercise field in response) and admin editing (swap-only mobility)
- Ready for Plan 03: Member app "Descanso Activo" display section
- Ready for Plan 04: PDF mobility data substitution

## Self-Check: PASSED

All 7 files verified present. Both task commits (f887b0f, f8f2b8b) verified in git log.

---
*Phase: 17-per-block-mobility-exercises*
*Completed: 2026-02-12*
