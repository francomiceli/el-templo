---
phase: 84-push-notifications
plan: 03
subsystem: api
tags: [push-notifications, fastify, routes, fcm, notification-preferences, admin-templates]

# Dependency graph
requires:
  - phase: 84-push-notifications
    plan: 01
    provides: NotificationService, notification schema tables, types, NOTIFICATION_CATEGORIES
provides:
  - Notification API routes plugin (8 endpoints: 4 member, 4 admin)
  - Fastify app registration at /api/notifications prefix
  - Updated barrel export from notifications module
affects: [84-04 (admin UI consumes template/segment endpoints), 84-05 (member app consumes token/preferences/opened endpoints), 84-07 (integration tests)]

# Tech tracking
tech-stack:
  added: []
  patterns: [per-route auth pattern for mixed ADMIN_ROLES/OWNER_ROLES, MemberSegment type cast for drizzle enum inArray]

key-files:
  created:
    - el-templo-api/src/modules/notifications/routes.ts
  modified:
    - el-templo-api/src/modules/notifications/index.ts
    - el-templo-api/src/app.ts

key-decisions:
  - "Inline JSON schemas in routes.ts (following programs/routes.ts pattern) rather than separate schemas file for module self-containment"
  - "MemberSegment type alias for drizzle inArray type safety on segment enum column"
  - "OWNER_ROLES for seed-templates endpoint (stricter than ADMIN_ROLES) for safety"
  - "Computed openRate in template list response (openedCount/sentCount*100, rounded to 2 decimals)"

patterns-established:
  - "MemberSegment type cast pattern: typed string union for drizzle enum inArray queries to avoid string[] type mismatch"

requirements-completed: [ENG-22, ENG-24]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 84 Plan 03: Notification API Routes Summary

**8 notification API endpoints (token registration, preferences CRUD, opened tracking, admin templates, segment send) wired into Fastify at /api/notifications**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T18:52:17Z
- **Completed:** 2026-03-26T18:56:32Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 4 member endpoints: POST /token, GET /preferences, PUT /preferences, POST /:id/opened
- 4 admin endpoints: GET /admin/templates, PUT /admin/templates/:id, POST /admin/send-segment, POST /admin/seed-templates
- Full JSON schema validation on all request bodies and params
- ADMIN_ROLES auth for template management, OWNER_ROLES for seed-templates safety gate

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification API routes (member endpoints)** - `f32f8430` (feat)
2. **Task 2: Wire notification routes into Fastify app** - `a8e10e0e` (feat)

## Files Created/Modified
- `el-templo-api/src/modules/notifications/routes.ts` - Fastify plugin with 8 notification endpoints (4 member, 4 admin) and inline JSON schemas
- `el-templo-api/src/modules/notifications/index.ts` - Added notificationRoutes barrel export
- `el-templo-api/src/app.ts` - Registered notificationRoutes at /api/notifications prefix

## Decisions Made
- Inline JSON schemas in routes.ts following programs/routes.ts pattern (module self-containment over separate schema files)
- OWNER_ROLES for seed-templates endpoint to restrict template seeding to owner only
- Computed openRate field in template list response for admin dashboard display
- MemberSegment type alias to satisfy drizzle inArray type constraint on enum column

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed MemberSegment type for drizzle inArray query**
- **Found during:** Task 2 (TypeScript compilation)
- **Issue:** `segmentIds: string[]` failed drizzle's `inArray()` type check against `memberSegmentEnum` column (expects specific union type, not generic string[])
- **Fix:** Added `MemberSegment` type alias matching enum values, typed `segmentIds` as `MemberSegment[]` in the route handler generic
- **Files modified:** el-templo-api/src/modules/notifications/routes.ts
- **Verification:** TypeScript compiles without errors (excluding pre-existing firebase-admin)
- **Committed in:** a8e10e0e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Type safety fix required for compilation. No scope creep.

## Issues Encountered
None beyond the type fix documented above.

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- All 8 notification endpoints are registered and accessible
- Admin UI (Plan 05) can consume GET /admin/templates, PUT /admin/templates/:id, POST /admin/send-segment
- Member app (Plan 06) can consume POST /token, GET/PUT /preferences, POST /:id/opened
- Integration tests (Plan 07) can test all endpoints

## Self-Check: PASSED

All created/modified files verified on disk. Both task commits (f32f8430, a8e10e0e) verified in git log.

---
*Phase: 84-push-notifications*
*Completed: 2026-03-26*
