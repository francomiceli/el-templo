---
phase: 69-personalizadas-subscription-aura-enable
plan: 01
subsystem: api
tags: [drizzle, mysql, fastify, subscription, aura, personalizadas, gating]

# Dependency graph
requires:
  - phase: 67-personalizadas-backend-rename
    provides: Personalizadas API endpoints and service layer
  - phase: 59-schema-extensions-data-import
    provides: Subscription plans schema with boolean flags pattern
provides:
  - isPersonalizada boolean on subscription_plans (schema, migration, types, CRUD)
  - personalizada_completion AURA source type across all enum definitions
  - Subscription enforcement on select/session/complete endpoints (403 gating)
  - AURA award on personalizada session completion
  - Integration tests for subscription enforcement behavior
affects: [69-02-admin-plan-ui, personalizadas-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subscription gating via service-level checkSubscription with SubscriptionRequiredError"
    - "AURA award in route handler with graceful failure logging"

key-files:
  created:
    - el-templo-api/src/db/migrations/0049_personalizada_subscription_aura.sql
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/personalizadas/service.ts
    - el-templo-api/src/modules/personalizadas/routes.ts
    - el-templo-api/test/personalizadas/personalizadas.test.ts

key-decisions:
  - "checkSubscription queries subscriptions joined to plans where isPersonalizada=true and status is active or paused"
  - "AURA award failure is logged but does not fail the session completion (graceful degradation)"
  - "completionId tracked through both insert and update branches for AURA referenceId"

patterns-established:
  - "Subscription gating: SubscriptionRequiredError + checkSubscription pattern for feature-gated endpoints"

requirements-completed: [PERS-13, PERS-14, PERS-16]

# Metrics
duration: 13min
completed: 2026-03-19
---

# Phase 69 Plan 01: Personalizada Subscription + AURA Summary

**isPersonalizada flag on subscription plans with 403 gating on select/session/complete endpoints and AURA award on session completion**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-19T00:00:34Z
- **Completed:** 2026-03-19T00:13:39Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- isPersonalizada boolean column added to subscription_plans with full CRUD support end-to-end
- personalizada_completion AURA source type added to all enum definitions (schema, types, config seed)
- Subscription enforcement on select/session/complete returning 403 with Spanish message
- AURA award on personalizada session completion with config-based amount (10 points)
- 6 new subscription enforcement integration tests proving gating behavior
- Metadata, active, and archived endpoints remain ungated (public access)

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema migration + Drizzle schema + type updates** - `a89ecab8` (feat)
2. **Task 2: Subscription enforcement + AURA award + tests** - `e49200fd` (feat)

## Files Created/Modified

- `el-templo-api/src/db/migrations/0049_personalizada_subscription_aura.sql` - Migration: is_personalizada column, AURA enum extension, config seed
- `el-templo-api/src/db/schema/subscription-plans.ts` - Added isPersonalizada boolean field
- `el-templo-api/src/db/schema/aura-config.ts` - Added personalizada_completion to enum
- `el-templo-api/src/db/schema/aura-transactions.ts` - Added personalizada_completion to enum
- `el-templo-api/src/modules/aura/types.ts` - Added personalizada_completion to AuraSourceType union
- `el-templo-api/src/modules/subscriptions/types.ts` - isPersonalizada in PlanListItem, CreatePlanInput, UpdatePlanInput
- `el-templo-api/src/modules/subscriptions/schemas.ts` - isPersonalizada in planSchema, createPlanSchema, updatePlanSchema
- `el-templo-api/src/modules/subscriptions/service.ts` - createPlan, updatePlan, mapPlanRow support isPersonalizada
- `el-templo-api/src/modules/personalizadas/service.ts` - SubscriptionRequiredError + checkSubscription method
- `el-templo-api/src/modules/personalizadas/routes.ts` - Subscription checks on 3 endpoints, AuraService integration
- `el-templo-api/test/personalizadas/personalizadas.test.ts` - 6 enforcement tests + subscription setup in beforeAll

## Decisions Made

- checkSubscription queries subscriptions joined to plans where isPersonalizada=true, checking active or paused status
- AURA award failure is logged at warn level but does not fail the session completion (graceful degradation pattern)
- completionId is tracked through both the insert (new completion) and update (existing record) branches for use as AURA referenceId
- SubscriptionRequiredError uses Spanish message for direct client display

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AuraService constructor call (no log parameter)**

- **Found during:** Task 2 (route changes)
- **Issue:** Plan specified `new AuraService(fastify.db, fastify.log)` but FastifyBaseLogger is not assignable to Pino Logger
- **Fix:** Used `new AuraService(fastify.db)` matching all other route files in the codebase
- **Files modified:** el-templo-api/src/modules/personalizadas/routes.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** e49200fd (Task 2 commit)

**2. [Rule 1 - Bug] Fixed test payload using invalid personalizada type**

- **Found during:** Task 2 (test execution)
- **Issue:** Test used "calistenia" as personalizadaType but Fastify schema enum validation rejects it with 400 before reaching handler
- **Fix:** Changed test payload to use valid type "empuje" to properly test subscription enforcement (403)
- **Files modified:** el-templo-api/test/personalizadas/personalizadas.test.ts
- **Verification:** All 507 tests pass
- **Committed in:** e49200fd (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend foundation complete for personalizada subscription gating
- Migration 0049 ready to apply to staging/production databases
- Admin plan UI (69-02) can now expose isPersonalizada toggle in plan CRUD forms
- Frontend can detect 403 responses and show subscription upsell messaging

---

_Phase: 69-personalizadas-subscription-aura-enable_
_Completed: 2026-03-19_
