---
phase: 78-onboarding-user-profiling
plan: 01
subsystem: api
tags: [fastify, drizzle, mysql, onboarding, aura, member-profiles]

# Dependency graph
requires:
  - phase: 69-personalizadas-subscription-aura-enable
    provides: AURA service and source type enum patterns
provides:
  - member_profiles table with 4 enum columns (goal, experience, focus, motivation)
  - onboarding_analytics table for quiz funnel tracking
  - POST /api/onboarding/complete endpoint (profile creation + 50 AURA award)
  - GET /api/onboarding/profile endpoint (200 with profile or 204 No Content)
  - POST /api/onboarding/analytics endpoint (funnel event recording)
  - onboardingCompleted boolean on GET /api/auth/me and POST /api/auth/login
  - onboardingProfile object on GET /api/admin/members/:id
  - OnboardingService with completeOnboarding, getProfile, hasCompletedOnboarding, recordAnalyticsEvent
  - Onboarding type definitions with Spanish display label maps
affects: [78-02 frontend quiz, 78-03 tu-camino card, 79-behavioral-segmentation]

# Tech tracking
tech-stack:
  added: []
  patterns: [onboarding module pattern, graceful AURA degradation, 204 No Content for empty profile]

key-files:
  created:
    - el-templo-api/src/db/schema/member-profiles.ts
    - el-templo-api/src/db/schema/onboarding-analytics.ts
    - el-templo-api/src/modules/onboarding/types.ts
    - el-templo-api/src/modules/onboarding/service.ts
    - el-templo-api/src/modules/onboarding/routes.ts
    - el-templo-api/src/modules/onboarding/index.ts
    - el-templo-api/scripts/seed-onboarding-aura.ts
    - el-templo-api/test/onboarding/onboarding.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/members/schemas.ts
    - el-templo-api/src/app.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "onboarding_completion added to both aura_transactions.sourceTypeEnum and aura_config.auraConfigSourceTypeEnum for consistency"
  - "GET /profile returns 204 No Content (not 404) when profile not yet created, matching API conventions for absent-but-expected resources"
  - "AURA award failure is gracefully degraded -- onboarding succeeds even if AURA service fails"
  - "Service instantiation without logger, matching existing pattern (AuraService, SubscriptionService)"

patterns-established:
  - "204 No Content for absent onboarding profile: signals not-yet-completed vs error"
  - "Graceful AURA degradation: try/catch on auraService.award with log.error, never failing primary operation"

requirements-completed: [ENG-02, ENG-01]

# Metrics
duration: 13min
completed: 2026-03-24
---

# Phase 78 Plan 01: Onboarding Backend Summary

**member_profiles schema with 4 enum columns, onboarding API (complete/profile/analytics), 50 AURA reward, extended auth/me and admin member detail with profile data**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-24T14:01:07Z
- **Completed:** 2026-03-24T14:14:00Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments
- Created member_profiles table with goalType, experienceLevel, trainingFocus, motivationStyle enums and onboardingCompletedAt timestamp
- Created onboarding_analytics table for quiz funnel event tracking (start, answer, complete, abandon)
- Built OnboardingService with DuplicateOnboardingError, 50 AURA award via existing AuraService
- Registered three onboarding endpoints: POST /complete (201), GET /profile (200/204), POST /analytics (204)
- Extended GET /auth/me and POST /auth/login with onboardingCompleted boolean
- Extended GET /admin/members/:id with onboardingProfile including Spanish display labels
- All 530 integration tests pass (14 new onboarding tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema, migration, and onboarding service** - `4cf6e955` (feat)
2. **Task 2: Routes, app registration, /auth/me extension, admin profile, integration tests** - `5137a4f2` (feat)

## Files Created/Modified
- `el-templo-api/src/db/schema/member-profiles.ts` - member_profiles table with 4 enum columns, userId FK, timestamps
- `el-templo-api/src/db/schema/onboarding-analytics.ts` - onboarding_analytics table for quiz funnel events
- `el-templo-api/src/db/schema/index.ts` - Re-exports for new schemas
- `el-templo-api/src/db/schema/aura-config.ts` - Added onboarding_completion to auraConfigSourceTypeEnum
- `el-templo-api/src/db/schema/aura-transactions.ts` - Added onboarding_completion to sourceTypeEnum
- `el-templo-api/src/modules/aura/types.ts` - Added onboarding_completion to AuraSourceType union
- `el-templo-api/src/modules/onboarding/types.ts` - GoalType, ExperienceLevel, TrainingFocus, MotivationStyle types + Spanish label maps
- `el-templo-api/src/modules/onboarding/service.ts` - OnboardingService with completeOnboarding, getProfile, hasCompletedOnboarding, recordAnalyticsEvent
- `el-templo-api/src/modules/onboarding/routes.ts` - POST /complete, GET /profile, POST /analytics endpoints
- `el-templo-api/src/modules/onboarding/index.ts` - Barrel export for onboardingRoutes
- `el-templo-api/src/modules/auth/routes.ts` - onboardingCompleted on GET /me and POST /login
- `el-templo-api/src/modules/members/routes.ts` - onboardingProfile on GET /:userId
- `el-templo-api/src/modules/members/schemas.ts` - onboardingProfileSchema added to memberProfileSchema
- `el-templo-api/src/app.ts` - Register onboardingRoutes at /api/onboarding
- `el-templo-api/scripts/seed-onboarding-aura.ts` - One-time seed for aura_config onboarding_completion row
- `el-templo-api/test/helpers.ts` - cleanAllTestData includes member_profiles and onboarding_analytics
- `el-templo-api/test/onboarding/onboarding.test.ts` - 14 integration tests for all endpoints

## Decisions Made
- Added `onboarding_completion` to aura_transactions sourceTypeEnum (in addition to aura_config) -- both enums must stay in sync for the AURA ledger to accept the new source type
- GET /profile returns 204 No Content (not 404) for missing profile -- semantically correct for "not yet completed" vs "resource not found"
- AURA award failure is gracefully degraded with log.error -- onboarding profile creation succeeds regardless
- Service instantiated without Pino logger (matching existing patterns for AuraService, SubscriptionService in other routes)
- POST /auth/login also includes onboardingCompleted so the app has the flag immediately after login (not just on /me refresh)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added onboarding_completion to aura_transactions sourceTypeEnum**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Plan only specified adding to aura_config enum and AuraSourceType, but aura_transactions has its own sourceTypeEnum that also needed the new value
- **Fix:** Added "onboarding_completion" to sourceTypeEnum in aura-transactions.ts
- **Files modified:** el-templo-api/src/db/schema/aura-transactions.ts
- **Verification:** TypeScript compilation passed
- **Committed in:** 4cf6e955 (Task 1 commit)

**2. [Rule 3 - Blocking] Added onboardingProfile to member response schema**
- **Found during:** Task 2 (integration tests failing)
- **Issue:** Fastify's response serialization was stripping the onboardingProfile field because it wasn't defined in memberProfileSchema (JSON Schema)
- **Fix:** Added onboardingProfileSchema to memberProfileSchema in members/schemas.ts
- **Files modified:** el-templo-api/src/modules/members/schemas.ts
- **Verification:** Admin member detail tests pass with onboardingProfile in response
- **Committed in:** 5137a4f2 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were necessary for correctness -- the enum sync prevents runtime DB errors and the schema fix enables proper response serialization. No scope creep.

## Issues Encountered
None

## User Setup Required
- Run `npx tsx scripts/seed-onboarding-aura.ts` on staging/production after migration to seed aura_config with onboarding_completion row (50 AURA default)
- Run `drizzle-kit push` or apply generated migration to create member_profiles and onboarding_analytics tables

## Known Stubs
None -- all endpoints are fully wired to the database and AURA service.

## Next Phase Readiness
- Backend is complete for Plan 02 (frontend quiz) to consume POST /complete and POST /analytics
- Backend is complete for Plan 03 (Tu Camino card) to consume GET /profile
- onboardingCompleted flag on /auth/me is ready for router guard implementation in Plan 02

## Self-Check: PASSED

- All 8 created files verified present on disk
- Both task commits verified in git log (4cf6e955, 5137a4f2)
- TypeScript compiles cleanly (tsc --noEmit exits 0)
- All 530 tests pass (14 new onboarding tests)

---
*Phase: 78-onboarding-user-profiling*
*Completed: 2026-03-24*
