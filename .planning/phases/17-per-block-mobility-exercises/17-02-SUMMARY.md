---
phase: 17-per-block-mobility-exercises
plan: 02
subsystem: api
tags: [fastify, mobility, session-response, admin-editing, exercise-pool, swap]

# Dependency graph
requires:
  - phase: 17-per-block-mobility-exercises
    plan: 01
    provides: "exercise_type discriminator column, selectMobilityExercise, mobility persistence"
  - phase: 15-session-editing
    provides: "AdminEditService, exercise pool/swap patterns, algorithm snapshot system"
provides:
  - "mobilityExercise field in member API response per block"
  - "exerciseType in admin session detail for separating mobility from main exercises"
  - "GET /admin/exercises/mobility-pool endpoint (route-relevant first)"
  - "POST /admin/sessions/:id/blocks/:id/mobility/swap endpoint"
  - "resetToAlgorithm preserves exerciseType from snapshot"
affects: [17-03 member-app-display, 17-04 pdf-mobility-data]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "API response separation: mobilityExercise as distinct nullable field per block"
    - "Mobility pool query: MOVILIDAD pattern with route-relevant sorting via ROUTE_TO_MOBILITY_ROUTES"
    - "Mobility swap: simplified prescription (no PrescribeService, hardcoded ISO/CON defaults)"

key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/sessions/routes.ts"
    - "el-templo-api/src/modules/admin/service.ts"
    - "el-templo-api/src/modules/admin/edit-service.ts"
    - "el-templo-api/src/modules/admin/routes.ts"
    - "el-templo-api/src/modules/admin/schemas.ts"

key-decisions:
  - "mobilityExercise as separate nullable field (not in exercises array) for clean client consumption"
  - "Mobility swap uses hardcoded ISO=20s/CON=10reps defaults, not PrescribeService"
  - "Route-relevant mobility exercises sorted first (pattern_1) in pool, others after (pattern_2)"
  - "Old snapshots without exerciseType default to 'main' for backward compatibility"

patterns-established:
  - "API response separation: filter by exerciseType discriminator, expose mobility as distinct field"
  - "Mobility-specific endpoints: separate pool and swap from main exercise editing"

# Metrics
duration: 3min
completed: 2026-02-12
---

# Phase 17 Plan 02: API Response & Admin Editing Summary

**mobilityExercise field exposed per block in member/admin responses, mobility pool endpoint with route-relevant sorting, mobility swap endpoint with ISO/CON defaults, exerciseType preserved in reset-to-algorithm**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-12T14:27:34Z
- **Completed:** 2026-02-12T14:30:26Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Member API response now includes `mobilityExercise` per block as separate nullable field, main exercises array excludes mobility
- Admin session detail includes `exerciseType` in prescription data and `mobilityExercise` as separate field per block
- New `GET /admin/exercises/mobility-pool?blockRoute=XX` endpoint returns MOVILIDAD exercises with route-relevant first
- New `POST /admin/sessions/:id/blocks/:id/mobility/swap` endpoint replaces mobility exercise preserving exerciseType='mobility'
- `resetToAlgorithm` now includes `exerciseType` when restoring from snapshot (backward compatible with old snapshots)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update sessionToResponse and admin getSessionWithDetails** - `dabdab8` (feat)
2. **Task 2: Mobility pool, swap endpoint, and reset exerciseType** - `7ec7bb3` (feat)

## Files Created/Modified
- `el-templo-api/src/modules/sessions/routes.ts` - sessionToResponse splits exercises by exerciseType, adds mobilityExercise per block
- `el-templo-api/src/modules/admin/service.ts` - getSessionWithDetails includes exerciseType in projection, mobilityExercise field
- `el-templo-api/src/modules/admin/edit-service.ts` - getMobilityPool, swapMobilityExercise methods, exerciseType in resetToAlgorithm
- `el-templo-api/src/modules/admin/routes.ts` - mobility-pool GET and mobility swap POST routes
- `el-templo-api/src/modules/admin/schemas.ts` - getMobilityPoolSchema, swapMobilityExerciseSchema

## Decisions Made
- mobilityExercise as separate nullable field rather than keeping in exercises array: clean client consumption, impossible to accidentally render mobility as main exercise
- Mobility swap uses hardcoded ISO=20s/CON=10reps defaults (same as pipeline selection), not PrescribeService: mobility is active rest with fixed simple prescription
- Route-relevant exercises shown first in pool via ROUTE_TO_MOBILITY_ROUTES mapping, all others after
- Old snapshots without exerciseType field default to 'main' for backward compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- API layer complete: both member and admin responses include mobility exercise data
- Ready for Plan 03: Member app "Descanso Activo" display section can consume mobilityExercise field
- Ready for Plan 04: PDF mobility data substitution can use exerciseType to find mobility in block data
- Admin editing endpoints ready for Plan 03 UI integration (mobility swap dialog)

---
*Phase: 17-per-block-mobility-exercises*
*Completed: 2026-02-12*
