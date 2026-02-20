---
phase: 20-per-member-personalized-sessions
plan: 02
subsystem: api
tags: [pipeline, session-generation, journey, spom, drizzle, service]

# Dependency graph
requires:
  - phase: 20-per-member-personalized-sessions
    provides: "member_journeys table, journey_type column on sessions, JourneyType types, JOURNEY_ROUTE_MAP"
provides:
  - "runJourneyBlockPipeline function replacing Stage 1 with journey route resolution"
  - "JourneyService with journey CRUD and session generation"
  - "SPOM fallback for missing route/week rules in journey pipeline"
  - "Zone-specific Initium warmup via journeyRoutes parameter"
  - "Duration-based block filtering for 20/40/60 min sessions"
  - "DaySession.journeyType field and saveSession journeyType passthrough"
affects: [20-03, 20-04, 20-05, 20-06, 20-07, 20-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "Journey pipeline reuses stages 2-7 with route override at Stage 1",
      "SPOM fallback ladder: exact week -> nearest week -> default 50%",
      "pattern2=null to disable cross-route for 100% zone bias",
      "journeyRoutes parameter for zone-specific Initium contextual selection",
      "J-{journeyType}-W{week}-{day}-{memberLevel} dayId format for journey sessions",
    ]

key-files:
  created:
    - "el-templo-api/src/modules/sessions/pipeline/journey-pipeline.ts"
    - "el-templo-api/src/modules/journeys/service.ts"
  modified:
    - "el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts"
    - "el-templo-api/src/modules/sessions/service.ts"
    - "el-templo-api/src/modules/sessions/types.ts"

key-decisions:
  - "Deterministic hash-based route selection from JOURNEY_ROUTE_MAP for reproducible journey routing"
  - "SPOM fallback: nearest week first, then default 50% intensity for routes without any SPOM rules"
  - "Cross-route disabled by setting pattern2=null (leverages existing exercise selection logic)"
  - "Journey Initium uses pre-computed mobility routes from ROUTE_TO_MOBILITY_ROUTES mapping"
  - "DEUTEROS_2 always generated for journey sessions (no rotator null-route check)"

patterns-established:
  - "Journey pipeline as thin wrapper over existing SPOM stages 2-7"
  - "Zone bias via pattern2=null preventing cross-route exercise selection"
  - "JourneyService follows AdminSessionService pattern for session generation"

requirements-completed:
  [JOURNEY-PIPELINE, JOURNEY-GENERATION, JOURNEY-BIAS, JOURNEY-WARMUP]

# Metrics
duration: 5min
completed: 2026-02-20
---

# Phase 20 Plan 02: Journey Pipeline & Service Summary

**Journey session generation engine with zone-biased SPOM pipeline, SPOM fallback for missing rules, 100% zone bias via cross-route disablement, zone-specific Initium warmup, and full journey lifecycle management service**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-20T17:32:59Z
- **Completed:** 2026-02-20T17:38:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created journey pipeline that replaces Stage 1 (rotator) with deterministic hash-based route selection from JOURNEY_ROUTE_MAP while reusing all stages 2-7
- Implemented SPOM fallback ladder: exact week -> nearest week for same route -> default 50% intensity, preventing crashes for routes with missing SPOM rules
- Enforced 100% zone bias by setting pattern2=null on all journey sessions, disabling cross-route exercise mixing
- Extended Initium pipeline with journeyRoutes parameter for zone-specific warmup exercises matching the journey zone
- Created JourneyService with complete lifecycle management (select, archive, switch, advance) and session generation following AdminSessionService pattern

## Task Commits

Each task was committed atomically:

1. **Task 1: Create journey pipeline extending the SPOM pipeline** - `2cde35b` (feat)
2. **Task 2: Create JourneyService with lifecycle management and session generation** - `f7f6ff5` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/sessions/pipeline/journey-pipeline.ts` - Journey pipeline orchestrator: route resolution, SPOM fallback, cross-route disablement, stages 2-7 reuse
- `el-templo-api/src/modules/journeys/service.ts` - JourneyService with 6 methods: getActiveJourney, getArchivedJourneys, selectJourney, advanceSemana, generateJourneySessions, getJourneySession
- `el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts` - Extended runInitiumPipeline with optional journeyRoutes parameter and selectJourneyContextualExercises function
- `el-templo-api/src/modules/sessions/service.ts` - saveSession now passes journeyType to DB insert
- `el-templo-api/src/modules/sessions/types.ts` - Added optional journeyType field to DaySession interface

## Decisions Made

- Deterministic hash-based route selection (sum of char codes \* position) provides reproducible routing that varies across days/blocks while remaining deterministic
- SPOM fallback uses three tiers: exact week match, nearest available week for the same route, default 50% intensity with route code as pattern -- ensures journey sessions never crash due to missing SPOM data
- Cross-route disabled by nullifying pattern2 rather than modifying selectExercises -- leverages existing behavior where pattern2=null skips the queryCrossRouteExercises call
- Journey Initium uses pre-computed mobility routes from all journey routes via ROUTE_TO_MOBILITY_ROUTES mapping, providing zone-relevant warmup
- DEUTEROS_2 always generated for journey sessions (routes come from journey map, not rotator) -- no null-route check needed since route assignment is always deterministic
- filterBlocksByDuration placed in JourneyService (not frontend) for server-side duration-based session retrieval

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Journey pipeline and service ready for API endpoints (Plan 03) to expose journey CRUD and session retrieval
- Session generation fully functional: coaches can generate journey sessions via JourneyService.generateJourneySessions
- Duration-based block filtering ready for member app session retrieval via getJourneySession
- All TypeScript types compile cleanly, ready for downstream integration

---

_Phase: 20-per-member-personalized-sessions_
_Completed: 2026-02-20_
