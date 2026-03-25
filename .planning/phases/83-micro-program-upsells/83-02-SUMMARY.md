---
phase: 83-micro-program-upsells
plan: 02
subsystem: api
tags: [fastify, drizzle, micro-programs, enrollments, service-layer, routes]

# Dependency graph
requires: [83-01]
provides:
  - ProgramsService class with 14 methods (CRUD, enrollment lifecycle, member queries, analytics)
  - 13 Fastify endpoints (11 admin + 2 member) with role-based authorization
  - Programs module registered in app.ts
affects: [83-03, 83-04, 83-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-route authenticate + role check (no onRequest hook) for mixed-role endpoint groups"
    - "Static route before parameterized route ordering to avoid param collision (/analytics before /:programId)"

key-files:
  created:
    - el-templo-api/src/modules/programs/service.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/programs/index.ts
  modified:
    - el-templo-api/src/app.ts

key-decisions:
  - "Per-route auth instead of onRequest hook because admin routes use ADMIN_ROLES while enrollment routes use COACH_ROLES (mixed permissions within one plugin)"
  - "Static routes (/analytics, /enroll, /enrollments/user/:userId) registered before parameterized /:programId to prevent param collision"
  - "daysUntilExpiry calculated from enrolledAt + durationWeeks*7 minus now, clamped to minimum 0"

patterns-established:
  - "Mixed-role route plugin: per-route authenticate + role check instead of global onRequest hook"

requirements-completed: [ENG-18, ENG-21]

# Metrics
duration: 4min
completed: 2026-03-25
---

# Phase 83 Plan 02: API Service & Routes Summary

**ProgramsService with 14 methods (CRUD, enrollment lifecycle, member catalog/progress, analytics) and 13 Fastify endpoints with ADMIN_ROLES/COACH_ROLES authorization, registered in app.ts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-25T17:47:26Z
- **Completed:** 2026-03-25T17:51:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created ProgramsService with full CRUD: createProgram (transactional with content blocks), listPrograms, getProgramDetail (with exercise join and enrollment count), updateProgram, addContentBlocks, deactivateProgram
- Implemented enrollment lifecycle: enrollMember (one-active-enrollment rule enforced per D-06, program existence/active validation), cancelEnrollment (active-only guard), advanceWeek (auto-completes when exceeding duration)
- Built member-facing methods: getCatalog (active programs with hasContent subquery per D-46), getMemberProgress (current week content blocks, exercise join, isWeekComplete calculation, daysUntilExpiry, programId per D-47)
- Added analytics method: getAnalytics with parallel COUNT queries for total/active/completed enrollments
- Created 13 Fastify route endpoints with JSON schema validation, proper role authorization (ADMIN_ROLES for CRUD, COACH_ROLES for enrollment management per D-35), and handleServiceError pattern
- Registered programRoutes in app.ts with /api prefix

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ProgramsService with CRUD and enrollment management** - `e6c22993` (feat)
2. **Task 2: Create Fastify routes and register in app.ts** - `d0b02044` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/programs/service.ts` - ProgramsService class with 14 methods
- `el-templo-api/src/modules/programs/routes.ts` - 13 Fastify endpoints (11 admin + 2 member)
- `el-templo-api/src/modules/programs/index.ts` - Module barrel export
- `el-templo-api/src/app.ts` - Added import and registration of programRoutes

## Decisions Made

- Per-route authenticate + role check instead of onRequest hook: the program routes plugin has mixed permissions (ADMIN_ROLES for CRUD, COACH_ROLES for enrollment management per D-35), so a single onRequest hook cannot enforce both. Each route handler calls authenticate and checks the appropriate role array.
- Static routes registered before parameterized routes: /admin/programs/analytics, /admin/programs/enroll, and /admin/programs/enrollments/* are registered before /admin/programs/:programId to prevent Fastify from matching "analytics" or "enroll" as a programId parameter.
- daysUntilExpiry is calculated as enrolledAt + (durationWeeks * 7 days) - now, clamped to minimum 0. This gives the member app a simple countdown for the renewal badge (D-16).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all methods are fully implemented with real database queries.

## Next Phase Readiness

- Service and routes are the foundation for admin UI (Plan 03) and member app (Plan 04)
- All 13 endpoints are ready for frontend consumption
- ProgramsService can be imported by other modules (e.g., session completion chain in Plan 05)

## Self-Check: PASSED

All 3 created files verified on disk. Both commit hashes (e6c22993, d0b02044) found in git log.

---
*Phase: 83-micro-program-upsells*
*Completed: 2026-03-25*
