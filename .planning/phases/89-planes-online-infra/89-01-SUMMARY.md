---
phase: 89-planes-online-infra
plan: 01
subsystem: database
tags: [drizzle, mysql, migration, schema, enum, rename]

requires:
  - phase: 83-micro-program-upsells
    provides: micro_programs table, program_enrollments table, AURA enum values
  - phase: 86-qr-promo-free-month-campaign
    provides: manual migration SQL pattern, promo_plans table
provides:
  - "Migration 0067: plan_category enum on subscription_plans (presencial/online_regular/online_goal/online_coach)"
  - "linkedProgramId FK on subscription_plans referencing micro_programs"
  - "member_personalizadas table renamed to member_goal_plans"
  - "personalizada_type columns renamed to goal_plan_type on sessions, completed_sessions, member_goal_plans"
  - "goalPlanType column added to micro_programs"
  - "AURA enums updated: personalizada_completion -> goal_plan_completion"
  - "Session dayIds updated from P- prefix to GP- prefix"
  - "isPersonalizada + isOnline booleans eliminated from subscription_plans"
affects: [89-02, 89-03, 89-04, 89-05, 89-06, 89-07]

tech-stack:
  added: []
  patterns: [safe AURA enum migration with 3-step expand/migrate/shrink]

key-files:
  created:
    - el-templo-api/src/db/migrations/0067_goal_plan_rename.sql
    - el-templo-api/src/db/schema/member-goal-plans.ts
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/db/schema/sessions.ts
    - el-templo-api/src/db/schema/completed-sessions.ts
    - el-templo-api/src/db/schema/aura-config.ts
    - el-templo-api/src/db/schema/aura-transactions.ts
    - el-templo-api/src/db/schema/micro-programs.ts
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Safe 3-step AURA enum migration: expand enum with both old+new values, UPDATE rows, then shrink enum to remove old value -- prevents silent data loss"
  - "personalizada_type DROPPED (not renamed) on subscription_plans per D-07 REVISED -- goalPlanType lives on micro_programs only"

patterns-established:
  - "Safe enum value rename: expand -> migrate -> shrink (avoids MySQL silent row data loss on MODIFY COLUMN)"

requirements-completed: [MON-01, MON-02]

duration: 5min
completed: 2026-04-04
---

# Phase 89 Plan 01: DB Migration + Schema Summary

**Complete DDL migration 0067 replacing personalizada booleans with planCategory enum, renaming tables/columns to goalPlan, and Drizzle schema TS files matching post-migration state**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-04T18:40:00Z
- **Completed:** 2026-04-04T18:45:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Created migration 0067 with 9 sections covering: plan_category enum addition + population + constraint, boolean drops, column renames on 3 tables, table rename, dayId prefix updates, AURA enum value migration (safe 3-step), micro_programs column addition, and linked_program_id FK
- Updated all 7 Drizzle schema TS files to match post-migration state: subscription-plans, member-goal-plans (new), sessions, completed-sessions, aura-config, aura-transactions, micro-programs
- Deleted member-personalizadas.ts and replaced with member-goal-plans.ts; updated schema barrel export

## Task Commits

Each task was committed atomically:

1. **Task 1: Write migration SQL file 0067_goal_plan_rename.sql** - `4f43ba01` (feat)
2. **Task 2: Update all Drizzle schema TypeScript files to match post-migration state** - `ed7ee324` (feat)

## Files Created/Modified
- `el-templo-api/src/db/migrations/0067_goal_plan_rename.sql` - Complete DDL migration (179 lines, 9 sections)
- `el-templo-api/src/db/schema/subscription-plans.ts` - Added planCategoryEnum + linkedProgramId, removed isPersonalizada/isOnline/personalizadaType
- `el-templo-api/src/db/schema/member-goal-plans.ts` - New file replacing member-personalizadas.ts with goalPlanType column
- `el-templo-api/src/db/schema/sessions.ts` - personalizadaType -> goalPlanType
- `el-templo-api/src/db/schema/completed-sessions.ts` - personalizadaType -> goalPlanType
- `el-templo-api/src/db/schema/aura-config.ts` - personalizada_completion -> goal_plan_completion
- `el-templo-api/src/db/schema/aura-transactions.ts` - personalizada_completion -> goal_plan_completion
- `el-templo-api/src/db/schema/micro-programs.ts` - Added goalPlanType column
- `el-templo-api/src/db/schema/index.ts` - Updated barrel export from member-personalizadas to member-goal-plans
- `el-templo-api/src/db/schema/member-personalizadas.ts` - DELETED

## Decisions Made
- Used safe 3-step AURA enum migration (expand with both values -> UPDATE rows -> shrink to remove old value) to prevent MySQL's silent data loss on MODIFY COLUMN with enum
- personalizada_type on subscription_plans DROPPED entirely (not renamed) per D-07 REVISED -- goalPlanType lives on micro_programs only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Migration SQL ready to apply (pnpm db:migrate)
- All Drizzle schema TS files declare new column/table names
- Subsequent plans (89-02 through 89-07) can now build on the new naming: service renames, route updates, admin UI changes, member app changes
- TypeScript compilation will show errors in service/route files that still reference old names -- these are addressed in subsequent plans

## Self-Check: PASSED

All artifacts verified:
- Migration SQL file exists at 0067_goal_plan_rename.sql
- member-goal-plans.ts created, member-personalizadas.ts deleted
- SUMMARY.md created
- Commits 4f43ba01 and ed7ee324 found in git log

---
*Phase: 89-planes-online-infra*
*Completed: 2026-04-04*
