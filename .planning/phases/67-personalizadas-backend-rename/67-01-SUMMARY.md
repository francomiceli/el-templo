---
phase: 67-personalizadas-backend-rename
plan: 01
subsystem: api, database
tags: [drizzle, mysql, migration, rename, personalizadas]

# Dependency graph
requires: []
provides:
  - Renamed member_personalizadas DB table with personalizada_type column
  - Migration 0048 for table/column renames and dayId prefix update
  - Complete personalizadas/ module with types, constants, service, routes, schemas
  - PersonalizadasService class with lifecycle and session generation methods
  - API routes under /personalizadas/* and /admin/personalizadas/*
affects:
  [67-02-cross-references, sessions-pipeline, admin-module, app-ts-registration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Personalizada naming convention replaces Journey throughout backend"

key-files:
  created:
    - el-templo-api/src/db/migrations/0048_rename_journeys_to_personalizadas.sql
    - el-templo-api/src/db/schema/member-personalizadas.ts
    - el-templo-api/src/modules/personalizadas/types.ts
    - el-templo-api/src/modules/personalizadas/constants.ts
    - el-templo-api/src/modules/personalizadas/service.ts
    - el-templo-api/src/modules/personalizadas/routes.ts
    - el-templo-api/src/modules/personalizadas/schemas.ts
    - el-templo-api/src/modules/personalizadas/index.ts
  modified:
    - el-templo-api/src/db/schema/sessions.ts
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/migrations/meta/_journal.json

key-decisions:
  - "DayId prefix changed from J- to P- for personalizada sessions"
  - "Response keys renamed: journey -> personalizada, journeys -> personalizadas"
  - "journeyStats renamed to personalizadaStats in admin member detail response"
  - "Spanish error messages updated: journey -> personalizada (e.g. 'No tienes una personalizada activa')"

patterns-established:
  - "Personalizada naming: PersonalizadaType, PersonalizadasService, PERSONALIZADA_ROUTE_MAP"
  - "P-{type}-W{week}-{day}-{level} dayId format for personalizada sessions"

requirements-completed: [PERS-01, PERS-02, PERS-04, PERS-05, PERS-06]

# Metrics
duration: 6min
completed: 2026-03-18
---

# Phase 67 Plan 01: Backend Rename Summary

**Database migration and full module rename from journeys to personalizadas with updated schema, types, service, routes, and API paths**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-18T22:35:50Z
- **Completed:** 2026-03-18T22:41:50Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Created migration 0048 that renames member_journeys table, journey_type columns across 3 tables, and updates J- dayId prefixes to P-
- Built complete personalizadas/ module with 6 files replacing the old journeys/ module
- Updated all API route paths from /journeys/_ to /personalizadas/_ and /admin/personalizadas/\*
- Renamed all types, constants, service class, and response fields to use personalizada naming

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration + schema file renames** - `1124f0e2` (feat)
2. **Task 2: Rename journeys module folder to personalizadas** - `4f7fab41` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0048_rename_journeys_to_personalizadas.sql` - SQL migration for table/column renames and dayId prefix update
- `el-templo-api/src/db/schema/member-personalizadas.ts` - Renamed schema with memberPersonalizadas table
- `el-templo-api/src/db/schema/sessions.ts` - Column rename journeyType -> personalizadaType
- `el-templo-api/src/db/schema/completed-sessions.ts` - Column rename journeyType -> personalizadaType
- `el-templo-api/src/db/schema/index.ts` - Export updated to member-personalizadas
- `el-templo-api/src/modules/personalizadas/types.ts` - PersonalizadaType, PersonalizadaProgress, ArchivedPersonalizada, PersonalizadaMetadata
- `el-templo-api/src/modules/personalizadas/constants.ts` - PERSONALIZADA_ROUTE_MAP, ALL_PERSONALIZADA_TYPES, PERSONALIZADA_METADATA
- `el-templo-api/src/modules/personalizadas/service.ts` - PersonalizadasService with full lifecycle and generation methods
- `el-templo-api/src/modules/personalizadas/routes.ts` - All /personalizadas/_ and /admin/personalizadas/_ routes
- `el-templo-api/src/modules/personalizadas/schemas.ts` - Fastify JSON schemas for request/response validation
- `el-templo-api/src/modules/personalizadas/index.ts` - Module barrel exports

## Decisions Made

- DayId prefix changed from J- to P- for personalizada sessions (aligns with the P-{type} convention)
- All API response keys renamed: journey -> personalizada, journeys -> personalizadas (breaking change for clients, expected as part of v4.2 launch)
- Spanish error messages updated to use personalizada terminology
- journeyStats renamed to personalizadaStats in admin member detail response schema

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 67-02 can proceed: cross-module references (pipeline rename, admin/sessions imports, app.ts registration, tests)
- The service.ts import for personalizada-pipeline.ts points to a file that will be created in 67-02
- Zero old naming references remain in schema/ and modules/personalizadas/ directories

---

_Phase: 67-personalizadas-backend-rename_
_Completed: 2026-03-18_
