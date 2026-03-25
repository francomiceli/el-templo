---
phase: 83-micro-program-upsells
plan: 05
subsystem: api
tags: [fastify, programs, sessions, aura, integration-tests, personalizadas]

# Dependency graph
requires:
  - phase: 83-01
    provides: micro_programs and program_enrollments schema, AURA source types
  - phase: 83-02
    provides: ProgramsService with CRUD and enrollment methods, 13 Fastify endpoints
  - phase: 83-03
    provides: Admin UI for program management
  - phase: 83-04
    provides: Member app integration with program cards and Personalizadas gating
provides:
  - recordSessionForProgram method with dual-condition gating (sessions + calendar week)
  - AURA weekly bonus and completion bonus awards on program progression
  - Session completion route wired to program progression service
  - has-personalizada-access endpoint for member Personalizadas gate check
  - hasActiveProgramEnrollment method for D-08 enrollment gate
  - 18 integration tests covering CRUD, enrollment, member endpoints, auth, analytics
affects: [training, personalizadas, aura, member-app]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-condition week advancement: sessions threshold AND calendar-week gating per D-04"
    - "Graceful AURA degradation: program bonus award failures logged but don't fail session completion"
    - "Transaction-wrapped progression: session count increment + week advancement atomic per enrollment"

key-files:
  created:
    - el-templo-api/test/programs.test.ts
  modified:
    - el-templo-api/src/modules/programs/service.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "Calendar-week gating calculates nextWeekStartDate from enrolledAt + (currentWeek * 7 days), compared against current date"
  - "AURA awards wrapped in individual try/catch blocks -- weekly bonus and completion bonus awarded independently so one failure doesn't prevent the other"
  - "Test helpers updated to clean program tables (program_enrollments, micro_program_content_blocks, micro_programs) in FK-safe order"

patterns-established:
  - "Session-to-program progression: session completion hook calls recordSessionForProgram after streak update, with graceful degradation"
  - "Dual-condition advancement check: both sessionsThresholdMet AND calendarWeekArrived must be true before week advances"

requirements-completed: [ENG-18, ENG-20]

# Metrics
duration: 16min
completed: 2026-03-25
---

# Phase 83 Plan 05: Session Progression, AURA Awards, and Integration Tests Summary

**Session completion drives program progression with dual-condition gating (sessions threshold + calendar week), AURA weekly/completion bonuses, Personalizadas gate endpoint, and 18 integration tests covering the full programs module**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-25T18:10:23Z
- **Completed:** 2026-03-25T18:26:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Implemented recordSessionForProgram with dual-condition week advancement: sessions threshold (sessionsCompletedThisWeek >= sessionsPerWeekToAdvance) AND calendar-week gating (current date >= enrolledAt + currentWeek * 7 days) per D-04
- AURA awards on week completion (program_week_completion) and program completion (program_completion) with independent try/catch for graceful degradation
- Wired session completion route to call programsService.recordSessionForProgram after streak update, following existing graceful degradation pattern
- Added has-personalizada-access endpoint returning { hasAccess: boolean } for member Personalizadas gate per D-08
- Created 18 integration tests: program CRUD (5), enrollment lifecycle (5), member endpoints including programId and has-personalizada-access (5), auth/permissions (2), analytics (1) -- all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add session counting with calendar-week gating, AURA integration, and Personalizadas gate** - `0196ce76` (feat)
2. **Task 2: Create integration tests for programs module** - `2b170b2f` (test)

## Files Created/Modified

- `el-templo-api/src/modules/programs/service.ts` - Added recordSessionForProgram (dual-condition gating, AURA awards) and hasActiveProgramEnrollment methods
- `el-templo-api/src/modules/programs/routes.ts` - Added /members/programs/has-personalizada-access endpoint
- `el-templo-api/src/modules/sessions/routes.ts` - Wired programsService.recordSessionForProgram into session completion handler
- `el-templo-api/test/programs.test.ts` - 18 integration tests covering full programs module lifecycle
- `el-templo-api/test/helpers.ts` - Added program table cleanup (programEnrollments, microProgramContentBlocks, microPrograms) in FK-safe order

## Decisions Made

- Calendar-week gating uses enrolledAt + (currentWeek * 7 * 24h) as the earliest date the next week can start, compared against Date.now(). This allows catch-up per D-05 -- if a member completes sessions late, the next session completion will trigger advancement if both conditions are met.
- AURA weekly bonus and completion bonus are awarded in separate try/catch blocks. If the weekly bonus fails, the completion bonus still has a chance to succeed. Both use the graceful degradation pattern (log.warn on failure, don't fail the request).
- Test helpers updated to include program tables in cleanAllTestData, placed at Layer 0 before other tables since programEnrollments references users.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all methods are fully implemented with real database queries and the test suite verifies end-to-end behavior.

## Next Phase Readiness

- Programs module is fully functional: admin CRUD, enrollment management, session-driven progression, AURA rewards, Personalizadas gating, and comprehensive test coverage
- Phase 83 (micro-program-upsells) is complete -- all 5 plans executed
- Member app and admin app integrations (Plans 03, 04) consume the API endpoints verified by these tests

## Self-Check: PASSED

---
*Phase: 83-micro-program-upsells*
*Completed: 2026-03-25*
