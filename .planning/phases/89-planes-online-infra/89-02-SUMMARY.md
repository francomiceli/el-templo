---
phase: 89-planes-online-infra
plan: 02
subsystem: api
tags: [rename, refactor, drizzle, fastify, planCategory, goalPlan]

requires:
  - phase: 89-01
    provides: DB migration for goalPlan rename, planCategory enum, linkedProgramId FK

provides:
  - GoalPlanService replacing PersonalizadasService
  - goal-plans/ module directory with all renamed types, constants, schemas, routes
  - planCategory enum on subscription plan types replacing isPersonalizada/isOnline booleans
  - goal-plan-pipeline.ts replacing personalizada-pipeline.ts
  - Updated admin, programs, progression, sessions, shared, aura modules

affects: [89-03, 89-04, 89-05, 89-06]

tech-stack:
  added: []
  patterns:
    - "PlanCategory enum pattern: 4-value union type with isOnlinePlan/isGoalPlan helpers"
    - "GP- dayId prefix for goal plan sessions (was P-)"
    - "goal_plan_completion AURA source type (was personalizada_completion)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/goal-plans/service.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/src/modules/goal-plans/types.ts
    - el-templo-api/src/modules/goal-plans/constants.ts
    - el-templo-api/src/modules/goal-plans/schemas.ts
    - el-templo-api/src/modules/goal-plans/index.ts
    - el-templo-api/src/modules/sessions/pipeline/goal-plan-pipeline.ts
    - el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/progression/routes.ts
    - el-templo-api/src/modules/shared/training-constants.ts
    - el-templo-api/src/modules/aura/types.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/member-routes.ts
    - el-templo-api/src/app.ts

key-decisions:
  - "GoalPlanService replaces PersonalizadasService via constructor DI in SubscriptionService"
  - "planCategory enum replaces isPersonalizada + isOnline boolean flags on subscription plans"
  - "linkedProgramId replaces personalizadaType on subscription plans (per D-07 REVISED)"
  - "Online plans require linkedProgramId; validation added to createPlan and updatePlan"
  - "DayId prefix changed from P- to GP- for goal plan sessions"
  - "parseDayId updated to handle GP-, P-, and J- prefixes for backward compatibility"
  - "Auto-assign personalizada replaced with TODO Plan 06 comments for program enrollment"

patterns-established:
  - "PlanCategory enum: presencial | online_regular | online_goal | online_coach"
  - "isOnlinePlan() / isGoalPlan() helper functions for category checks"

requirements-completed: [MON-01, MON-02, MON-03, MON-08, MON-09, MON-10]

duration: 19min
completed: 2026-04-04
---

# Phase 89 Plan 02: API Module Rename and planCategory Migration Summary

**Full API codebase rename from personalizadas to goal-plans with planCategory enum replacing boolean flags across all modules**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-04T18:48:12Z
- **Completed:** 2026-04-04T19:07:00Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Renamed personalizadas/ module to goal-plans/ using git mv for file history preservation
- Renamed personalizada-pipeline.ts to goal-plan-pipeline.ts with full content rewrite
- Migrated all subscription plan types from boolean flags (isPersonalizada/isOnline) to planCategory enum
- Updated all 8 API modules with zero personalizada references remaining (verified via repo-wide grep)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename personalizadas/ module to goal-plans/ and update all API modules** - `2c6c87ea` (feat)
2. **Task 2: Update subscriptions module to use planCategory + GoalPlanService** - `973a124c` (feat)

## Files Created/Modified

- `el-templo-api/src/modules/goal-plans/*` - Fully renamed module: GoalPlanService, GoalPlanType, GOAL_PLAN_ROUTE_MAP, etc.
- `el-templo-api/src/modules/sessions/pipeline/goal-plan-pipeline.ts` - Renamed pipeline with goalPlanType references
- `el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts` - goalPlanMobilityRoutes parameter
- `el-templo-api/src/modules/sessions/types.ts` - DaySession.goalPlanType field
- `el-templo-api/src/modules/sessions/service.ts` - goalPlanType in session save
- `el-templo-api/src/modules/admin/service.ts` - goalPlanType filter in SessionFilter and response
- `el-templo-api/src/modules/admin/routes.ts` - goalPlanType query parameter
- `el-templo-api/src/modules/admin/schemas.ts` - goalPlanType in JSON schemas
- `el-templo-api/src/modules/programs/routes.ts` - has-goal-plan-access endpoint
- `el-templo-api/src/modules/progression/routes.ts` - goalPlanType null filter
- `el-templo-api/src/modules/shared/training-constants.ts` - GP- dayId format, parseDayId updated
- `el-templo-api/src/modules/aura/types.ts` - goal_plan_completion source type
- `el-templo-api/src/modules/subscriptions/types.ts` - PlanCategory type, isOnlinePlan/isGoalPlan helpers
- `el-templo-api/src/modules/subscriptions/schemas.ts` - planCategory/linkedProgramId in plan schemas
- `el-templo-api/src/modules/subscriptions/service.ts` - GoalPlanService DI, planCategory validation
- `el-templo-api/src/modules/subscriptions/member-routes.ts` - planCategory/linkedProgramId in responses
- `el-templo-api/src/app.ts` - goalPlanRoutes import and registration

## Decisions Made

- Per D-07 REVISED: goalPlanType does NOT appear on plan types; it lives on micro_programs only. Subscription plans use planCategory + linkedProgramId instead.
- Auto-assign personalizada logic replaced with TODO Plan 06 comments for future program enrollment auto-creation.
- parseDayId handles GP-, P-, and J- prefixes for backward compatibility with existing session data.
- Online plan validation added: all online planCategory values require a linkedProgramId.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all data sources are wired. The TODO Plan 06 comments for auto-enrollment are intentional deferral per the plan.

## Next Phase Readiness

- API speaks "goalPlan" language exclusively with zero personalizada references
- Ready for admin app rename (Plan 03) and member app rename (Plan 04)
- Frontend plans can safely import from goal-plans module path
- planCategory enum available for admin plan creation UI

## Self-Check: PASSED

All created files verified, all commits found, SUMMARY.md exists.

---

_Phase: 89-planes-online-infra_
_Completed: 2026-04-04_
