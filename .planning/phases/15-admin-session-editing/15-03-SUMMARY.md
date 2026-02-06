---
phase: 15-admin-session-editing
plan: 03
subsystem: admin-api
tags: [fastify-routes, json-schema, exercise-pool, exercise-swap, prescription-update, format-change, member-preview]

# Dependency graph
requires:
  - phase: 15-01
    provides: session_edit_logs table, algorithmSnapshot JSON column, formatParams JSON column
  - phase: 15-02
    provides: PrescribeService, AdminEditService with 8 methods
provides:
  - All session editing API routes wired to AdminEditService
  - JSON schema validation for all editing endpoints
  - Member preview endpoint with level switching
affects: [15-04, 15-05, 15-06, 15-07, 15-08, 15-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handler enrichment: exercise pool handler looks up block context, SPOM pattern2, and exclude list before calling service"
    - "Try-catch error delegation: route handlers catch service errors and return appropriate HTTP status codes"
    - "Preview level switching: constructs target dayId from base session's week/day with new memberLevel"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-api/src/modules/admin/types.ts
    - el-templo-api/src/modules/admin/index.ts

key-decisions:
  - "Exercise pool route enriches query params from block context (role, pattern, excludeIds) and SPOM rules (pattern2)"
  - "Preview endpoint reuses adminService.getSessionWithDetails and transforms to simplified preview shape"
  - "Preview level switching finds session by constructing target dayId (same week/day, different memberLevel)"
  - "Reset endpoint returns 400 for missing snapshot, 404 for missing session"

patterns-established:
  - "Route handler enrichment pattern: simple query params in, service-ready params out via DB lookups"

# Metrics
duration: 5min
completed: 2026-02-06
---

# Phase 15 Plan 03: Editing API Routes Summary

**All 9 session editing endpoints wired to AdminEditService with JSON schema validation, exercise pool with SPOM pattern2 enrichment, and member preview with level switching**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-06T15:24:32Z
- **Completed:** 2026-02-06T15:29:50Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

### Task 1: JSON Schema Validation
- Added 9 new schemas to `schemas.ts`: getExercisePoolSchema, swapExerciseSchema, updatePrescriptionSchema, changeFormatSchema, addExerciseSchema, removeExerciseSchema, resetSessionSchema, getCompatibleFormatsSchema, getPreviewSchema
- Added EditAction type and preview types (PreviewBlock, PreviewExercise) to `types.ts`

### Task 2: Route Registration
- Registered all 9 editing endpoints under existing `/admin` prefix with role check hook
- Exercise pool handler enriches simple query params by looking up block context (role, pattern, exclude list) and SPOM rules (pattern2 for cross-route) from database
- All mutation endpoints (swap, update, format change, add, remove, reset) pass `userId` for audit logging
- Preview endpoint supports level switching: constructs target dayId from base session's week/day with requested memberLevel
- Error responses in Spanish consistent with existing patterns
- Exported AdminEditService from admin module index

## Endpoints Registered

| Method | Path | Schema | Service Method |
|--------|------|--------|----------------|
| GET | /admin/exercises/pool | getExercisePoolSchema | editService.getExercisePool |
| POST | /admin/sessions/:id/blocks/:bid/exercises/:pid/swap | swapExerciseSchema | editService.swapExercise |
| PATCH | /admin/sessions/:id/blocks/:bid/exercises/:pid | updatePrescriptionSchema | editService.updatePrescription |
| PATCH | /admin/sessions/:id/blocks/:bid/format | changeFormatSchema | editService.changeBlockFormat |
| POST | /admin/sessions/:id/blocks/:bid/exercises | addExerciseSchema | editService.addExercise |
| DELETE | /admin/sessions/:id/blocks/:bid/exercises/:pid | removeExerciseSchema | editService.removeExercise |
| POST | /admin/sessions/:id/reset | resetSessionSchema | editService.resetToAlgorithm |
| GET | /admin/formats/compatible | getCompatibleFormatsSchema | editService.getCompatibleFormats |
| GET | /admin/sessions/:id/preview | getPreviewSchema | adminService.getSessionWithDetails + transform |

## Task Commits

Each task was committed atomically:

1. **Task 1: Add JSON schema validation for editing endpoints** - `c048051` (feat)
2. **Task 2: Register all editing routes in admin routes module** - `1b83644` (feat)

## Files Modified
- `el-templo-api/src/modules/admin/schemas.ts` - 9 new validation schemas for editing endpoints
- `el-templo-api/src/modules/admin/types.ts` - EditAction type, PreviewBlock and PreviewExercise interfaces
- `el-templo-api/src/modules/admin/routes.ts` - 9 new route handlers with error handling and context enrichment
- `el-templo-api/src/modules/admin/index.ts` - Export AdminEditService and EditAction type

## Decisions Made
- Exercise pool route handler enriches query params from block context (role, pattern, exclude exercise IDs) and SPOM rules (pattern2) via database lookups, keeping the API surface simple for the frontend
- Preview endpoint reuses existing `adminService.getSessionWithDetails` and transforms to a simplified shape with prescription strings
- Level switching in preview constructs target dayId by replacing memberLevel suffix in the base session's dayId
- Reset endpoint distinguishes between missing snapshot (400) and missing session (404) for clear error reporting

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All editing API routes are live and ready for frontend integration
- Plan 15-04+ can build admin frontend components that call these endpoints
- Exercise pool endpoint supports contraction filtering and cross-route exercises with pattern badges
- Preview endpoint ready for MemberPreviewDialog component
- Compatible formats endpoint ready for format change dropdown

## Self-Check: PASSED
