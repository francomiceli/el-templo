---
phase: 90-onboarding-quiz-redesign-avatar-profiling
plan: 01
subsystem: api
tags: [onboarding, avatar, drizzle, fastify, mysql, migration]

# Dependency graph
requires:
  - phase: 78-onboarding-quiz-aura
    provides: "Onboarding module (service, routes, types, analytics), member_profiles table"
  - phase: 88-gender-based-notification-personalization
    provides: "Gender field on users table"
provides:
  - "5 new nullable columns on member_profiles (ageRange, trainingBackground, painPoint, trainingFrequency, avatarType)"
  - "Deterministic avatar resolution function mapping quiz answers to avatar A-K"
  - "V2 onboarding endpoint accepting 5-field payload, returning avatarType + suggestedProgram"
  - "Gender field exposed on GET /auth/me"
  - "avatar_assigned analytics event type"
  - "AvatarLetter, AgeRange, TrainingBackground, GoalChoice, PainPoint, TrainingFrequency types"
  - "AVATAR_LABELS and AVATAR_PROGRAM_MAP constants"
affects: [90-02-member-app-onboarding-ui, 90-03-admin-avatar-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      "Deterministic decision tree for avatar resolution (pure function, no DB)",
      "V2 service method pattern alongside V1 for backward compat",
      "Server-side gender read for security (T-90-02)",
    ]

key-files:
  created:
    - "el-templo-api/src/modules/onboarding/avatar-resolution.ts"
    - "el-templo-api/src/db/migrations/0068_onboarding_avatar_profiling.sql"
  modified:
    - "el-templo-api/src/db/schema/member-profiles.ts"
    - "el-templo-api/src/db/schema/onboarding-analytics.ts"
    - "el-templo-api/src/modules/onboarding/types.ts"
    - "el-templo-api/src/modules/onboarding/service.ts"
    - "el-templo-api/src/modules/onboarding/routes.ts"
    - "el-templo-api/src/modules/auth/routes.ts"
    - "el-templo-api/test/onboarding/onboarding.test.ts"

key-decisions:
  - "Manual migration SQL (0068) instead of drizzle-kit generate to avoid interactive prompts, consistent with Phase 86 precedent"
  - "Type casts on nullable old columns in getProfile for backward compatibility with existing OnboardingProfile interface"
  - "avatar_assigned analytics event recorded automatically inside completeOnboardingV2 with graceful degradation"

patterns-established:
  - "V2 service method pattern: add new method alongside old one, keep old for backward compat"
  - "Avatar decision tree: priority-ordered if/else chain, first match wins, fallback to A"

requirements-completed: [AVA-03, AVA-04, AVA-05, AVA-08]

# Metrics
duration: 12min
completed: 2026-04-06
---

# Phase 90 Plan 01: API Foundation for Avatar Profiling Summary

**Deterministic avatar resolution service with 11-archetype decision tree, V2 onboarding endpoint accepting 5 new quiz fields, gender on /auth/me, and migration SQL for 9 column changes**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-06T17:56:52Z
- **Completed:** 2026-04-06T18:09:10Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Schema migration making 4 old quiz columns nullable and adding 5 new avatar profiling columns
- Pure deterministic avatar resolution function mapping gender + 5 quiz answers to one of 11 avatar archetypes (A-K), each with suggested program
- V2 onboarding endpoint reading gender server-side (T-90-02 mitigation), resolving avatar, storing profile, awarding AURA, and recording avatar_assigned analytics
- Gender field added to GET /auth/me response
- 19 integration tests passing (including avatar K resolution, avatar_assigned analytics, questionIndex 4, gender on /me)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + new types + analytics enum** - `b05b7e18` (feat)
2. **Task 2: Updated service, routes, /me gender, migration SQL, and tests** - `6eb94335` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/onboarding/avatar-resolution.ts` - Pure deterministic avatar resolution with 11-archetype decision tree and AVATAR_PROGRAM_MAP
- `el-templo-api/src/db/schema/member-profiles.ts` - 4 old columns made nullable, 5 new nullable columns added
- `el-templo-api/src/db/schema/onboarding-analytics.ts` - avatar_assigned added to event type enum, answerValue length increased to 100
- `el-templo-api/src/modules/onboarding/types.ts` - V2 type aliases, interfaces (CompleteOnboardingInputV2, OnboardingProfileV2), AVATAR_LABELS
- `el-templo-api/src/modules/onboarding/service.ts` - completeOnboardingV2 and getProfileV2 methods with avatar resolution
- `el-templo-api/src/modules/onboarding/routes.ts` - V2 complete schema, server-side gender read, analytics schema with avatar_assigned + questionIndex max 4
- `el-templo-api/src/modules/auth/routes.ts` - Gender field added to /me select query and response
- `el-templo-api/src/db/migrations/0068_onboarding_avatar_profiling.sql` - ALTER TABLE statements for all schema changes
- `el-templo-api/test/onboarding/onboarding.test.ts` - 19 tests updated for V2 payload, new tests for avatar K, avatar_assigned analytics, gender /me

## Decisions Made

- Manual migration SQL (0068) instead of drizzle-kit generate to avoid interactive prompts, consistent with Phase 86 precedent
- Type casts on nullable old columns in getProfile for backward compatibility with existing OnboardingProfile interface
- avatar_assigned analytics event recorded automatically inside completeOnboardingV2 with graceful degradation (try/catch)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Type cast on nullable old columns in getProfile**

- **Found during:** Task 2 (service update)
- **Issue:** Making old columns nullable changed drizzle return types to `string | null`, but `OnboardingProfile` interface expects non-nullable `GoalType`, `ExperienceLevel`, etc.
- **Fix:** Added `as OnboardingProfile["goalType"]` casts since this method is only called for existing users who have these values populated
- **Files modified:** el-templo-api/src/modules/onboarding/service.ts
- **Committed in:** 6eb94335

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Type cast necessary for TypeScript compilation after making columns nullable. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- API contract complete: POST /onboarding/complete accepts V2 payload, returns avatarType + suggestedProgram
- GET /auth/me returns gender for member app to use in Q3 option filtering
- avatar_assigned analytics event ready for tracking
- Next plans can build: member app onboarding UI (90-02), admin avatar display (90-03)

## Self-Check: PASSED

All 9 files verified present. Both task commits (b05b7e18, 6eb94335) found in git log.

---

_Phase: 90-onboarding-quiz-redesign-avatar-profiling_
_Completed: 2026-04-06_
