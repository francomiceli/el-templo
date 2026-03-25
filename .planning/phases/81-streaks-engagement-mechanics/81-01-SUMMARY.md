---
phase: 81-streaks-engagement-mechanics
plan: 01
subsystem: api
tags: [streaks, aura, drizzle, mysql, fastify, member-profiles]

requires:
  - phase: 61-qr-access-control
    provides: subscription_schedules junction table for schedule slot references
  - phase: 60-plan-configuration
    provides: system_settings table and SettingsService pattern
  - phase: 49-personalizada-subscription-aura
    provides: AuraService, aura_config, streak_bonus source type

provides:
  - StreakService module with plan-aware streak tracking
  - member_profiles table with currentStreak, longestStreak, streakUpdatedAt
  - Migration 0056 creating member_profiles table
  - Session completion AURA award (10 AURA per training_completion)
  - Streak milestone AURA bonuses via system_settings (7, 14, 30, 60, 100 day milestones)
  - Persisted streak in GET /progression/stats (replaces on-the-fly calculation)
  - longestStreak field in progression stats response

affects:
  [
    81-02,
    78-onboarding-user-profiling,
    79-behavioral-segmentation,
    82-progressive-profiling,
  ]

tech-stack:
  added: []
  patterns:
    - "member_profiles as extensible member data table (streak columns, future onboarding/segmentation)"
    - "Plan-aware streak: subscription_schedules -> schedules.dayOfWeek determines expected training days"
    - "Streak milestone config via system_settings with STREAK_SETTINGS_KEYS constants"

key-files:
  created:
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/src/db/migrations/0056_member_profiles_streaks.sql
    - el-templo-api/src/modules/streaks/service.ts
    - el-templo-api/src/modules/streaks/types.ts
    - el-templo-api/src/modules/streaks/index.ts
    - el-templo-api/test/streaks/streak-service.test.ts
    - el-templo-api/test/sessions/session-complete-streak.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/src/modules/progression/routes.ts
    - el-templo-api/src/modules/progression/schemas.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/src/db/migrations/meta/_journal.json

key-decisions:
  - "Created member_profiles table from scratch (Phase 78 was reverted) with streak columns only"
  - "StreakService owns milestone config reading (not SettingsService) to avoid cross-module dependency"
  - "AuraService instantiated without logger in sessions routes (matches existing pattern across codebase)"
  - "calculateStreak() left in progression/service.ts because unit tests still import it"

patterns-established:
  - "member_profiles as the extensible per-member data table — future phases add columns via migrations"
  - "Plan-aware streak tolerance: uses subscription_schedules join for fixed plans, classesPerWeek fallback for flexible plans"
  - "Graceful degradation chain: session completion -> AURA award (try/catch) -> streak update (try/catch)"

requirements-completed: [ENG-11, ENG-12, ENG-13, ENG-14]

duration: 14min
completed: 2026-03-25
---

# Phase 81 Plan 01: Backend Streak Tracking Summary

**Plan-aware streak tracking with member_profiles persistence, 10 AURA per session, configurable milestone bonuses, and persisted streak in progression stats**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-25T00:47:26Z
- **Completed:** 2026-03-25T01:02:09Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Created member_profiles table with streak columns and migration 0056
- Built StreakService with plan-aware rest day tolerance (subscription_schedules -> schedules.dayOfWeek)
- POST /sessions/complete now awards 10 AURA and updates streak (both with graceful degradation)
- GET /progression/stats returns persisted currentStreak and longestStreak (no more on-the-fly calculation)
- Milestone AURA bonuses configurable via system_settings (7-day: 20, 14-day: 35, 30-day: 50, 60-day: 100, 100-day: 200)
- Integration tests covering streak increment, longestStreak tracking, AURA award, and graceful degradation
- All 521 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema, migration, StreakService, and streak types** - `915d658b` (feat)
2. **Task 2: Integrate streak into session completion + AURA baseline + tests** - `944c3456` (feat)

## Files Created/Modified

- `el-templo-api/src/db/schema/member-profiles.ts` - New table: member_profiles with userId, currentStreak, longestStreak, streakUpdatedAt
- `el-templo-api/src/db/migrations/0056_member_profiles_streaks.sql` - CREATE TABLE migration with FK, unique constraint, index
- `el-templo-api/src/modules/streaks/service.ts` - StreakService: updateStreak, getExpectedTrainingDays, getStreakMilestoneConfig
- `el-templo-api/src/modules/streaks/types.ts` - STREAK_SETTINGS_KEYS, STREAK_DEFAULTS, STREAK_MILESTONES, StreakMilestoneConfig
- `el-templo-api/src/modules/streaks/index.ts` - Module barrel export
- `el-templo-api/src/db/schema/index.ts` - Added member-profiles export
- `el-templo-api/src/modules/sessions/routes.ts` - Added AURA award + streak update to POST /sessions/complete
- `el-templo-api/src/modules/progression/routes.ts` - Replaced calculateStreak() with persisted member_profiles query, added longestStreak
- `el-templo-api/src/modules/progression/schemas.ts` - Added longestStreak to stats response schema
- `el-templo-api/test/helpers.ts` - Added memberProfiles cleanup to cleanAllTestData
- `el-templo-api/test/streaks/streak-service.test.ts` - 4 integration tests for streak logic
- `el-templo-api/test/sessions/session-complete-streak.test.ts` - 2 E2E tests for session+AURA+streak pipeline

## Decisions Made

1. **Created member_profiles from scratch** - Phase 78 (onboarding) was reverted from master, so the member_profiles table didn't exist. Created it with only streak columns (userId, currentStreak, longestStreak, streakUpdatedAt). Future phases will add onboarding/segmentation columns via migrations.
2. **StreakService owns milestone config** - Rather than adding to SettingsService, StreakService has its own `getStreakMilestoneConfig()` that reads system_settings directly. Avoids cross-module dependency.
3. **AuraService without logger** - Followed the existing codebase pattern where all AuraService instantiations pass only `db` (logger is optional and causes type mismatch with FastifyBaseLogger).
4. **Kept calculateStreak()** - The old on-the-fly function remains in progression/service.ts because `test/unit/progression.test.ts` imports it. No callers in production code, but keeping it avoids breaking existing unit tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created member_profiles table from scratch**

- **Found during:** Task 1 (Schema creation)
- **Issue:** Plan assumed member_profiles existed (from Phase 78). Phase 78 was reverted, so the table and schema file didn't exist.
- **Fix:** Created the table with just streak columns + userId + timestamps. Used migration 0056 (CREATE TABLE instead of ALTER TABLE).
- **Files modified:** el-templo-api/src/db/schema/member-profiles.ts, el-templo-api/src/db/migrations/0056_member_profiles_streaks.sql
- **Verification:** TypeScript compiles, migration SQL valid
- **Committed in:** 915d658b (Task 1 commit)

**2. [Rule 1 - Bug] Fixed AuraService logger type mismatch**

- **Found during:** Task 2 (Session route integration)
- **Issue:** AuraService constructor accepts `Logger` from pino, but `fastify.log` is `FastifyBaseLogger` (incompatible types).
- **Fix:** Passed only `fastify.db` to AuraService (no logger), matching all other AuraService instantiations in the codebase.
- **Files modified:** el-templo-api/src/modules/sessions/routes.ts
- **Verification:** TypeScript compiles clean
- **Committed in:** 944c3456 (Task 2 commit)

**3. [Rule 1 - Bug] Fixed aura_config duplicate key in tests**

- **Found during:** Task 2 (Test execution)
- **Issue:** Test beforeEach inserted aura_config entries, but cleanAllTestData didn't delete aura_config, causing duplicate key errors when tests ran after other test suites.
- **Fix:** Added explicit `delete(schema.auraConfig)` before seeding in streak test beforeEach blocks.
- **Files modified:** el-templo-api/test/streaks/streak-service.test.ts, el-templo-api/test/sessions/session-complete-streak.test.ts
- **Verification:** All 521 tests pass
- **Committed in:** 944c3456 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. The table creation deviation was expected given Phase 78 revert. No scope creep.

## Issues Encountered

- `.env.development` not available in worktree (gitignored). Copied from main project to enable test execution. Not a code issue.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all data sources are wired and functional.

## Next Phase Readiness

- StreakService and member_profiles ready for Plan 02 (frontend streak display on Tu Dia)
- GET /progression/stats returns currentStreak and longestStreak for frontend consumption
- member_profiles table ready for future onboarding (Phase 78 re-implementation) and segmentation (Phase 79) columns

---

_Phase: 81-streaks-engagement-mechanics_
_Completed: 2026-03-25_

## Self-Check: PASSED

All 7 created files verified present. Both task commits (915d658b, 944c3456) verified in git log.
