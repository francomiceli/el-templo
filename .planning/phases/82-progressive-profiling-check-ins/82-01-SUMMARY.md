---
phase: 82-progressive-profiling-check-ins
plan: 01
subsystem: api
tags: [fastify, drizzle, mysql, check-ins, progressive-unlock, enum]

requires:
  - phase: 78-onboarding-user-profiling
    provides: member_profiles table, onboarding module pattern
  - phase: 81-streaks-engagement-mechanics
    provides: streak columns on member_profiles, session completion hooks

provides:
  - check_in_responses table with daily uniqueness constraint
  - CheckInService with progressive unlock logic (energy/soreness/sleep)
  - POST /api/check-ins and GET /api/check-ins/today endpoints
  - 14 integration tests for check-in behaviors

affects: [82-02 frontend check-in cards, 82-03 tu-dia-messaging-adaptation, 84-push-notifications]

tech-stack:
  added: []
  patterns: [drizzle-cause-unwrap-for-duplicate-key, progressive-trigger-by-session-count]

key-files:
  created:
    - el-templo-api/src/db/schema/check-in-responses.ts
    - el-templo-api/src/db/migrations/0059_check_in_responses.sql
    - el-templo-api/src/modules/check-ins/types.ts
    - el-templo-api/src/modules/check-ins/service.ts
    - el-templo-api/src/modules/check-ins/routes.ts
    - el-templo-api/src/modules/check-ins/schemas.ts
    - el-templo-api/src/modules/check-ins/index.ts
    - el-templo-api/test/check-ins/check-ins.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/migrations/meta/_journal.json
    - el-templo-api/src/app.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "Drizzle wraps MySQL errors in err.cause -- duplicate key detection must check cause.code/cause.sqlMessage, not just err.message"
  - "Body area for soreness forced to null when value is 'ninguna' regardless of client input (data consistency)"

patterns-established:
  - "Drizzle duplicate key detection: check err.cause.code === 'ER_DUP_ENTRY' or cause.sqlMessage.includes('Duplicate entry')"
  - "Progressive trigger pattern: count-based (completed sessions) and time-based (user createdAt) unlock logic"

requirements-completed: [ENG-04, ENG-15, ENG-16]

duration: 16min
completed: 2026-03-25
---

# Phase 82 Plan 01: Backend Check-In System Summary

**Check-in API with progressive unlock triggers (energy/soreness/sleep), daily uniqueness, body area validation, and 14 integration tests**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-25T01:51:35Z
- **Completed:** 2026-03-25T02:07:53Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Created check_in_responses table with composite unique index (userId, questionType, date) enforcing one answer per question per day
- Implemented CheckInService with progressive unlock: energy after 1 session, soreness after 3, sleep after 7 days of membership
- Built POST /api/check-ins and GET /api/check-ins/today with full validation, error handling, and Fastify schema validation
- 14 integration tests covering all behaviors: submission, progressive unlock, duplicates, body area, auth, invalid inputs

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema, migration, CheckInService, types, and route registration** - `b5555738` (feat)
2. **Task 2: Integration tests and test helper cleanup** - `ce460f56` (test)

## Files Created/Modified

- `el-templo-api/src/db/schema/check-in-responses.ts` - check_in_responses table definition with userId/questionType/date unique constraint
- `el-templo-api/src/db/migrations/0059_check_in_responses.sql` - SQL migration with CREATE TABLE, FK, unique index, user index
- `el-templo-api/src/modules/check-ins/types.ts` - CheckInQuestionType, value types, VALID_VALUES map, VALID_BODY_AREAS
- `el-templo-api/src/modules/check-ins/service.ts` - CheckInService: submitAnswer, getTodayState, getUnlockedQuestions
- `el-templo-api/src/modules/check-ins/routes.ts` - POST / and GET /today with auth, validation, error mapping
- `el-templo-api/src/modules/check-ins/schemas.ts` - Fastify JSON schemas for request/response validation
- `el-templo-api/src/modules/check-ins/index.ts` - Barrel export for checkInRoutes
- `el-templo-api/test/check-ins/check-ins.test.ts` - 14 integration tests
- `el-templo-api/src/db/schema/index.ts` - Added check-in-responses export
- `el-templo-api/src/db/migrations/meta/_journal.json` - Added migration 0059 entry
- `el-templo-api/src/app.ts` - Registered checkInRoutes at /api/check-ins
- `el-templo-api/test/helpers.ts` - Added checkInResponses cleanup in Layer 0

## Decisions Made

- Drizzle wraps MySQL errors in `err.cause` -- duplicate key detection checks `cause.code === 'ER_DUP_ENTRY'` and `cause.sqlMessage.includes('Duplicate entry')`, matching the existing pattern from members/routes.ts
- Body area for soreness is forced to null when value is 'ninguna' even if the client sends a bodyArea value, ensuring data consistency
- ENG-16 (goal reassessment) explicitly deferred per D-18 -- marked in requirements for traceability only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Drizzle duplicate key error detection**
- **Found during:** Task 2 (integration tests)
- **Issue:** Service checked `err.message.includes('Duplicate entry')` but Drizzle wraps MySQL errors in `err.cause`, so `err.message` never contains the MySQL error text
- **Fix:** Updated to check `err.cause.code === 'ER_DUP_ENTRY'` and `err.cause.sqlMessage.includes('Duplicate entry')` matching the established pattern from members/routes.ts
- **Files modified:** el-templo-api/src/modules/check-ins/service.ts
- **Verification:** Duplicate answer test now correctly returns 409
- **Committed in:** ce460f56 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Bug fix essential for duplicate prevention. No scope creep.

## Issues Encountered

- Worktree was behind master and missing phases 78-81 code -- cherry-picked the squash commit to sync before starting work
- Pre-existing streak test failures (5 files, 8 tests) unrelated to check-in changes -- these existed before this plan

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all data flows are fully wired.

## Next Phase Readiness

- Backend API complete and tested, ready for Plan 02 (frontend check-in cards on Tu Dia)
- GET /api/check-ins/today provides all data the frontend needs: unlocked questions and today's answers
- POST /api/check-ins handles all validation server-side, frontend just sends questionType + value + optional bodyArea

---
*Phase: 82-progressive-profiling-check-ins*
*Completed: 2026-03-25*

## Self-Check: PASSED

All 8 created files exist. Both commit hashes (b5555738, ce460f56) verified in git log.
