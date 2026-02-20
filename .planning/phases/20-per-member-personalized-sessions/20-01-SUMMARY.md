---
phase: 20-per-member-personalized-sessions
plan: 01
subsystem: database
tags: [drizzle, mysql, journey, schema, migration, types]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "users table for FK reference"
provides:
  - "member_journeys Drizzle table schema with per-duration semana tracking"
  - "sessions.journey_type nullable column for journey-scoped sessions"
  - "completed_sessions.journey_type and duration columns for journey completion tracking"
  - "JourneyType union type with 6 journey types"
  - "JOURNEY_ROUTE_MAP mapping journeys to exercise route codes"
  - "JOURNEY_METADATA with Spanish display content for all journeys"
  - "JOURNEY_TIER_MAP, ALL_JOURNEY_TYPES, JOURNEY_DURATIONS constants"
affects: [20-02, 20-03, 20-04, 20-05, 20-06, 20-07, 20-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "per-duration semana tracking (semana20/40/60)",
      "nullable journey_type for session scoping",
    ]

key-files:
  created:
    - "el-templo-api/src/db/schema/member-journeys.ts"
    - "el-templo-api/src/db/migrations/0016_member_journeys.sql"
    - "el-templo-api/src/modules/journeys/types.ts"
    - "el-templo-api/src/modules/journeys/constants.ts"
  modified:
    - "el-templo-api/src/db/schema/sessions.ts"
    - "el-templo-api/src/db/schema/completed-sessions.ts"
    - "el-templo-api/src/db/schema/index.ts"

key-decisions:
  - "Per-duration semana tracking with semana20/semana40/semana60 columns for independent progression"
  - "Nullable journey_type on sessions and completed_sessions for backward-compatible scoping"
  - "FLR route verified as existing in routes reference table for front_lever journey"
  - "Static JOURNEY_METADATA hardcoded per user decision (not coach-managed)"

patterns-established:
  - "Journey type as varchar(30) column pattern for session scoping"
  - "JOURNEY_ROUTE_MAP as source of truth for zone-to-route mapping"

requirements-completed: [JOURNEY-SCHEMA, JOURNEY-TYPES]

# Metrics
duration: 3min
completed: 2026-02-20
---

# Phase 20 Plan 01: Database Foundation & Type System Summary

**member_journeys table with per-duration semana tracking, journey_type columns on sessions/completed_sessions, and 6-type JOURNEY_ROUTE_MAP with verified route codes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-20T17:27:01Z
- **Completed:** 2026-02-20T17:30:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created member_journeys table with userId, journeyType, per-duration semana tracking (20/40/60), isActive flag, and timestamps
- Extended sessions and completed_sessions tables with nullable journey columns for backward-compatible scoping
- Established complete JourneyType system with 6 types across 3 tiers (principiante, intermedio, avanzado)
- Created JOURNEY_ROUTE_MAP mapping each journey to verified exercise route codes from the routes reference table

## Task Commits

Each task was committed atomically:

1. **Task 1: Create member_journeys schema, extend sessions and completed_sessions tables** - `403815e` (feat)
2. **Task 2: Create journey types and JOURNEY_ROUTE_MAP constants** - `b294e29` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/member-journeys.ts` - New Drizzle table for member journey tracking with per-duration semana columns
- `el-templo-api/src/db/schema/sessions.ts` - Added nullable journey_type column for session scoping
- `el-templo-api/src/db/schema/completed-sessions.ts` - Added nullable journey_type and duration columns
- `el-templo-api/src/db/schema/index.ts` - Re-exports member-journeys schema
- `el-templo-api/src/db/migrations/0016_member_journeys.sql` - SQL migration for all schema changes
- `el-templo-api/src/modules/journeys/types.ts` - JourneyType, JourneyTier, JourneyDuration, JourneyProgress, ArchivedJourney, JourneyMetadata types
- `el-templo-api/src/modules/journeys/constants.ts` - JOURNEY_ROUTE_MAP, JOURNEY_METADATA, JOURNEY_TIER_MAP, ALL_JOURNEY_TYPES, JOURNEY_DURATIONS

## Decisions Made

- Per-duration semana tracking with dedicated columns (semana20, semana40, semana60) rather than a separate tracking table -- simpler queries, matches the 3 fixed duration values
- Nullable journey_type on sessions/completed_sessions for backward compatibility with existing Entrenamiento sessions (null = general)
- FLR route verified as existing in seed-spom.ts route codes, confirming front_lever journey can use both FL and FLR
- Static JOURNEY_METADATA hardcoded in constants.ts per user decision that journey descriptions are not coach-managed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database foundation ready for journey pipeline (Plan 02) to build session generation logic
- Type system ready for API endpoints (Plan 03) and frontend integration (Plans 04-08)
- All route codes in JOURNEY_ROUTE_MAP verified against routes reference table
- Migration must be applied to staging/production databases before deployment

---

_Phase: 20-per-member-personalized-sessions_
_Completed: 2026-02-20_
