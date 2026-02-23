---
phase: 26-app-video-integration
plan: 01
subsystem: api
tags: [drizzle, fastify, video, exercises, session-api, admin-api]

# Dependency graph
requires: []
  # Note: Originally depended on Phase 26 (Video Hosting & Content Tooling) which was removed.
  # The video_url column migration (0014) was created directly in this plan.
provides:
  - "videoUrl field in session API response per exercise"
  - "videoUrl field in admin exercise pool queries"
  - "Drizzle schema + migration for exercises.video_url column"
affects: [26-02-PLAN, el-templo-app, el-templo-admin]

# Tech tracking
tech-stack:
  added: []
  patterns: ["leftJoin for read-time field resolution from reference tables"]

key-files:
  created:
    - "el-templo-api/src/db/migrations/0014_add_video_url.sql"
  modified:
    - "el-templo-api/src/db/schema/exercises.ts"
    - "el-templo-api/src/modules/sessions/types.ts"
    - "el-templo-api/src/modules/sessions/service.ts"
    - "el-templo-api/src/modules/sessions/routes.ts"
    - "el-templo-api/src/modules/admin/edit-types.ts"
    - "el-templo-api/src/modules/admin/exercise-swap-service.ts"

key-decisions:
  - "videoUrl resolved at read time via leftJoin, not stored in prescriptions"
  - "Response uses null (not undefined) for missing videoUrl to preserve JSON field presence"
  - "Added videoUrl column to Drizzle schema + migration 0014 (was missing from master)"

patterns-established:
  - "leftJoin pattern for resolving reference data at read time without denormalization"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 26 Plan 01: API Video URL Wiring Summary

**Session and admin pool APIs return videoUrl per exercise via leftJoin on exercises table at read time**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T22:14:51Z
- **Completed:** 2026-02-15T22:18:32Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Session API response includes videoUrl for each main exercise and mobility exercise
- Admin exercise pool queries (getExercisePool, searchExercises, getMobilityPool) return videoUrl
- videoUrl resolved at query time from exercises table, not stored in prescriptions
- TypeScript compiles with zero errors, all 33 integration tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Add videoUrl to session API response via exercises table join** - `f205730` (feat)
2. **Task 2: Add videoUrl to admin exercise pool queries** - `c38ddeb` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/exercises.ts` - Added videoUrl column to Drizzle schema
- `el-templo-api/src/db/migrations/0014_add_video_url.sql` - Migration to add video_url column
- `el-templo-api/src/modules/sessions/types.ts` - Added videoUrl to ExercisePrescription interface
- `el-templo-api/src/modules/sessions/service.ts` - reconstructSession uses leftJoin for videoUrl
- `el-templo-api/src/modules/sessions/routes.ts` - sessionToResponse threads videoUrl through exercises and mobility mappings
- `el-templo-api/src/modules/admin/edit-types.ts` - Added videoUrl to ExercisePoolItem interface
- `el-templo-api/src/modules/admin/exercise-swap-service.ts` - All three pool queries return videoUrl

## Decisions Made

- videoUrl resolved at read time via leftJoin (not stored in prescriptions) so newly uploaded videos are immediately reflected
- Response uses `?? null` (not `?? undefined`) because JSON serialization drops undefined but preserves null, and frontends need to distinguish "no video" from "field missing"
- Added videoUrl column to Drizzle schema + migration 0014 since it was missing from master branch

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added videoUrl column to Drizzle schema and created migration**

- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan referenced exercises.videoUrl from Phase 26 migration 0014, but the column was not in the Drizzle schema on master branch. TypeScript compilation failed.
- **Fix:** Added `videoUrl: varchar('video_url', { length: 500 })` to exercises schema and created migration 0014_add_video_url.sql
- **Files modified:** el-templo-api/src/db/schema/exercises.ts, el-templo-api/src/db/migrations/0014_add_video_url.sql
- **Verification:** TypeScript compiles, all 33 tests pass
- **Committed in:** f205730 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Schema column was prerequisite for all queries. No scope creep.

## Issues Encountered

None beyond the schema deviation documented above.

## User Setup Required

Migration 0014 must be applied to production database:

```sql
ALTER TABLE `exercises` ADD COLUMN `video_url` varchar(500) DEFAULT NULL;
```

## Next Phase Readiness

- API layer complete, ready for frontend integration (Phase 26 Plan 02)
- Frontend apps can now consume videoUrl from session and exercise pool responses

## Self-Check: PASSED

All 7 created/modified files verified present. Both task commits (f205730, c38ddeb) verified in git log.

---

_Phase: 27-app-video-integration_
_Completed: 2026-02-15_
