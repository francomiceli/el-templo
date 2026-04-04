---
phase: 89-planes-online-infra
plan: 06
subsystem: api
tags: [subscriptions, enrollments, drizzle, business-logic, constraints]

# Dependency graph
requires:
  - phase: 89-01
    provides: planCategory enum and linkedProgramId FK on subscription_plans schema
  - phase: 89-02
    provides: GoalPlanService integration in SubscriptionService, module rename
  - phase: 89-03
    provides: renamed test suite (goal-plans.test.ts)
  - phase: 89-04
    provides: admin restructure for plan categories
provides:
  - Auto-create program_enrollment on online plan assignment via linkedProgramId
  - Dual subscription constraint (one presencial + one online per member)
  - Enrollment lifecycle in changePlan and renewSubscription
  - linkedProgramId field in PlanListItem, CreatePlanInput, UpdatePlanInput
affects: [89-07, admin-plan-creation, member-subscription-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Category-group subscription constraint using plan FK join"
    - "Auto-enrollment pattern: plan assignment cascades to program_enrollment"
    - "Enrollment lifecycle: changePlan cancels old + creates new, renewSubscription checks existing"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/schemas.ts
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/modules/goal-plans/routes.ts
    - el-templo-api/test/subscriptions/subscriptions.test.ts
    - el-templo-api/test/goal-plans/goal-plans.test.ts
    - el-templo-api/test/helpers.ts

key-decisions:
  - "Category-group constraint via subscription-plan JOIN: presencial group vs online group, not per planCategory"
  - "Enrollment created through plan assignment only, not standalone -- matches D-34/D-39"
  - "renewSubscription preserves active enrollment (no re-creation if already active)"
  - "Application-level constraint sufficient for admin-only operation (no DB unique constraint needed)"

patterns-established:
  - "Dual subscription constraint: query active subs joined to plans, filter by planCategory group"
  - "Auto-enrollment cascade: linkedProgramId triggers program_enrollment insert after subscription creation"
  - "Enrollment lifecycle: changePlan cancels old enrollment via linkedProgramId, creates new; renewSubscription checks existing before creating"

requirements-completed: [MON-03, MON-09, MON-10]

# Metrics
duration: 37min
completed: 2026-04-04
---

# Phase 89 Plan 06: Online Plan Assignment Business Logic Summary

**Unified plan+program model: auto-enrollment on online plan assignment, dual presencial/online subscription constraint, enrollment lifecycle in changePlan/renewSubscription**

## Performance

- **Duration:** 37 min
- **Started:** 2026-04-04T19:38:36Z
- **Completed:** 2026-04-04T20:15:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Subscription constraint updated from "one per member" to "one presencial + one online per member" (D-35)
- Auto-create program_enrollment when assigning online plan with linkedProgramId (D-34/D-39)
- Enrollment lifecycle in changePlan (cancel old, create new) and renewSubscription (check existing)
- 7 new tests covering dual constraint, auto-enrollment, enrollment lifecycle, price override, and online regular session access
- Fixed 4 merge artifacts: duplicate PlanCategory type, duplicate planCategory schema field, duplicate /goal-plans/stats route, wrong goalPlanType enum values in createPlanSchema

## Task Commits

Each task was committed atomically:

1. **Task 1: Auto-enrollment on plan assignment + dual subscription constraint** - `9059fc80` (feat)
2. **Task 2: Add tests for auto-enrollment and dual constraint + verify online session access** - `336d97ef` (test)

## Files Created/Modified
- `el-templo-api/src/modules/subscriptions/service.ts` - Updated assignPlan, changePlan, renewSubscription with auto-enrollment and category-group constraint
- `el-templo-api/src/modules/subscriptions/types.ts` - Added linkedProgramId to PlanListItem/CreatePlanInput/UpdatePlanInput, removed duplicate PlanCategory
- `el-templo-api/src/modules/subscriptions/schemas.ts` - Added linkedProgramId to planSchema response, fixed goalPlanType enum in createPlanSchema
- `el-templo-api/src/db/schema/subscription-plans.ts` - Removed duplicate planCategory field
- `el-templo-api/src/modules/goal-plans/routes.ts` - Removed duplicate /goal-plans/stats route registration
- `el-templo-api/test/subscriptions/subscriptions.test.ts` - Added 6 tests for dual constraint, auto-enrollment, plan change enrollment, price override
- `el-templo-api/test/goal-plans/goal-plans.test.ts` - Added online_regular session access test (MON-09)
- `el-templo-api/test/helpers.ts` - Fixed cleanAllTestData FK ordering for linkedProgramId constraint

## Decisions Made
- Category-group constraint via subscription-plan JOIN rather than per-planCategory: presencial group vs online group (any non-presencial category is "online")
- Application-level uniqueness check is sufficient for this admin-only operation; DB-level unique constraint not practical due to JOIN dependency
- Enrollment through plan assignment only (not standalone) per D-34/D-39 -- enrollment is a cascade effect of plan assignment
- renewSubscription preserves active enrollment rather than re-creating (idempotent behavior)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate PlanCategory type export in types.ts**
- **Found during:** Task 1 (reading merged code)
- **Issue:** Merge artifact: PlanCategory type, isOnlinePlan, isGoalPlan declared twice (lines 22-36 and 52-66)
- **Fix:** Removed duplicate block at lines 52-66
- **Files modified:** el-templo-api/src/modules/subscriptions/types.ts
- **Committed in:** 9059fc80 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed duplicate planCategory field in subscription_plans schema**
- **Found during:** Task 1 (reading merged code)
- **Issue:** Merge artifact: planCategory defined on both lines 35 and 45 of subscription-plans.ts
- **Fix:** Removed duplicate on line 45
- **Files modified:** el-templo-api/src/db/schema/subscription-plans.ts
- **Committed in:** 9059fc80 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed wrong goalPlanType enum in createPlanSchema**
- **Found during:** Task 1 (reading merged code)
- **Issue:** goalPlanType enum in createPlanSchema had plan category values instead of goal plan type values
- **Fix:** Replaced with correct values: tren_superior, tren_inferior, empuje, traccion, planche, front_lever
- **Files modified:** el-templo-api/src/modules/subscriptions/schemas.ts
- **Committed in:** 9059fc80 (Task 1 commit)

**4. [Rule 3 - Blocking] Fixed duplicate /goal-plans/stats route registration**
- **Found during:** Task 2 (running tests)
- **Issue:** Merge artifact: /goal-plans/stats registered twice in routes.ts, causing Fastify startup crash
- **Fix:** Removed first duplicate (which also had a bug: returned { goalPlans } instead of { stats })
- **Files modified:** el-templo-api/src/modules/goal-plans/routes.ts
- **Committed in:** 336d97ef (Task 2 commit)

**5. [Rule 3 - Blocking] Fixed cleanAllTestData FK ordering for linkedProgramId**
- **Found during:** Task 2 (running tests)
- **Issue:** cleanAllTestData deleted micro_programs before subscription_plans, but subscription_plans now has linkedProgramId FK to micro_programs
- **Fix:** Moved micro_programs deletion after subscription_plans in the cleanup order
- **Files modified:** el-templo-api/test/helpers.ts
- **Committed in:** 336d97ef (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (3 bug fixes, 2 blocking)
**Impact on plan:** All 5 are merge artifacts from parallel Plan 01-05 execution. No scope creep -- all fixes required for code to compile and tests to run.

## Issues Encountered
- Pre-existing failure in programs.test.ts: 2 tests use old URL `/api/members/programs/has-personalizada-access` but route was renamed to `has-goal-plan-access` in Plan 89-02. Not caused by this plan, logged as deferred item.
- Tests require running from main project directory (not worktree) due to DB connection and node_modules location. Symlinked node_modules in worktree for verification.

## Known Stubs
None -- all enrollment logic is fully wired with real DB operations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 89-07 can build on the auto-enrollment mechanism to add UI for online plan management
- The programs.test.ts URL rename issue should be fixed (deferred from this plan, pre-existing)

## Self-Check: PASSED
- All 9 key files verified present
- Both task commits verified: 9059fc80, 336d97ef
- 645/647 tests pass (2 pre-existing failures in programs.test.ts)

---
*Phase: 89-planes-online-infra*
*Completed: 2026-04-04*
