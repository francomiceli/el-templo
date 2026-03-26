---
phase: 84-push-notifications
plan: 04
subsystem: api
tags: [cron, notifications, segmentation, push, scheduling, node-cron]

# Dependency graph
requires:
  - phase: 84-01
    provides: NotificationService, notification tables, SEGMENT_TRANSITION_TEMPLATES, TEMPLATE_SEEDS
  - phase: 79-behavioral-segmentation
    provides: SegmentationService.calculateSegment, memberProfiles.segment, ghost reattempt columns
  - phase: 82-progressive-profiling-check-ins
    provides: check_in_responses table for morning energy deduplication
  - phase: 83-micro-program-upsells
    provides: program_enrollments table, ProgramsService.enrollMember, recordSessionForProgram
provides:
  - Notification cron jobs file with 4 scheduled crons and auto-seed
  - Queue processor (every 15 min) with auto-purge
  - Batch segment recalculation with transition detection and notification queueing
  - Morning energy reminder excluding already-answered members
  - Weekly summary notifications for all onboarded members (Saturday 15:00)
  - Program renewal warning (7-day) integrated into daily batch
  - Ghost monthly re-attempt with max 3 limit
  - Post-session soreness notification trigger (2h delay) in sessions route
  - Program enrollment confirmation notification in programs route
affects: [84-07 (integration tests)]

# Tech tracking
tech-stack:
  added: []
  patterns: [cron-based notification scheduling with Argentina timezone, event-driven notification triggers with graceful degradation, batch segment recalculation bypassing cooldown via calculateSegment direct call]

key-files:
  created:
    - el-templo-api/src/jobs/notification-cron.ts
  modified:
    - el-templo-api/src/index.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/programs/routes.ts

key-decisions:
  - "Direct calculateSegment() call in batch cron to bypass 1-hour cooldown (avoids modifying SegmentationService API)"
  - "Program renewal warning integrated into daily 03:00 batch cron (not a separate cron) for simplicity"
  - "Purge runs inside queue processor cron (not separate schedule) to keep cron count lean"
  - "Morning energy uses date column comparison (not answered_at timestamp) since check_in_responses stores date as varchar YYYY-MM-DD"

patterns-established:
  - "Notification trigger pattern: try/catch around queueNotification with warn-level log on failure (graceful degradation)"
  - "Batch cron with per-member error isolation: individual member failures don't abort the batch"

requirements-completed: [ENG-22, ENG-23]

# Metrics
duration: 4min
completed: 2026-03-26
---

# Phase 84 Plan 04: Notification Scheduling & Triggers Summary

**Cron-based notification scheduling with 4 scheduled jobs (queue processor, segment recalc, morning energy, weekly summary), event-driven triggers in session/program routes, and ghost re-attempt with max 3 limit**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-26T18:51:40Z
- **Completed:** 2026-03-26T18:55:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created notification-cron.ts with 4 scheduled cron jobs and auto-seed on startup
- Batch segment recalculation detects all 4 transition types and queues appropriate notifications
- Ghost monthly re-attempt respects max 3 limit with 30-day interval check
- Post-session soreness notification queued 2h after session completion via scheduledAt
- Program enrollment confirmation notification queued immediately after admin enrolls member
- Program renewal warning (7-day) checks active enrollments in daily batch
- Morning energy reminder efficiently excludes members who already answered via single SQL subquery

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification cron jobs** - `e69d6ec4` (feat)
2. **Task 2: Add event-driven notification triggers** - `211f254e` (feat)

## Files Created/Modified
- `el-templo-api/src/jobs/notification-cron.ts` - All notification cron jobs: queue processor, segment recalc, morning energy, weekly summary, renewal warning, auto-seed
- `el-templo-api/src/index.ts` - Added startNotificationJobs import and call
- `el-templo-api/src/modules/sessions/routes.ts` - Post-session soreness notification trigger (2h delay)
- `el-templo-api/src/modules/programs/routes.ts` - Program enrollment confirmation notification trigger

## Decisions Made
- Used `calculateSegment` directly instead of `calculateAndUpdate` to bypass 1-hour cooldown in batch cron (preserves SegmentationService API)
- Combined program renewal warning into daily 03:00 batch cron instead of separate schedule
- Combined purge into queue processor cron instead of separate schedule
- Morning energy uses `DATE_FORMAT(NOW(), '%Y-%m-%d')` comparison since check_in_responses stores date as varchar

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added program renewal warning to daily batch cron**
- **Found during:** Task 1 (notification cron creation)
- **Issue:** Plan mentioned program_renewal_warning notifications should be added to cron but left specifics to executor
- **Fix:** Added renewal warning check in the daily 03:00 batch cron: queries active enrollments expiring within 6-7 days via SQL DATE_ADD calculation
- **Files modified:** el-templo-api/src/jobs/notification-cron.ts
- **Verification:** Code reviews active enrollments with expiry window query
- **Committed in:** e69d6ec4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Renewal warning was called out in plan as "add to cron if needed" -- implemented as part of daily batch for completeness.

## Issues Encountered
- TypeScript compilation not verifiable in parallel worktree (missing node_modules). Verified against main project: only pre-existing firebase-admin error (pending installation per D-39). No errors from new code.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All notification scheduling infrastructure in place
- Queue processor, batch recalc, timed notifications, and event triggers ready
- Templates auto-seeded on startup
- Ready for Plan 05 (admin notification management UI) and Plan 06 (member app push integration)

## Self-Check: PASSED

- el-templo-api/src/jobs/notification-cron.ts: FOUND
- .planning/phases/84-push-notifications/84-04-SUMMARY.md: FOUND
- Commit e69d6ec4: FOUND
- Commit 211f254e: FOUND

---
*Phase: 84-push-notifications*
*Completed: 2026-03-26*
