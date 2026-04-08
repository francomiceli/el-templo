---
phase: 096-full-body-goal-plan-equipment-tagging
plan: 01
subsystem: goal-plans, exercises, admin
tags: [goal-plans, exercises, equipment, api, database]
dependency_graph:
  requires: []
  provides: [full_body goal plan type, exercise equipment column, equipment API endpoints]
  affects: [goal-plans module, admin exercise management, exercise schema]
tech_stack:
  added: []
  patterns: [equipment enum column with nullable for organic tagging, bulk-update endpoint pattern]
key_files:
  created:
    - el-templo-api/src/db/migrations/0078_exercise_equipment.sql
    - el-templo-api/test/admin/exercises-equipment.test.ts
  modified:
    - el-templo-api/src/modules/goal-plans/types.ts
    - el-templo-api/src/modules/goal-plans/constants.ts
    - el-templo-api/src/modules/goal-plans/schemas.ts
    - el-templo-api/src/db/schema/exercises.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/exercise-service.ts
    - el-templo-api/src/modules/admin/video-schemas.ts
    - el-templo-api/test/goal-plans/goal-plans.test.ts
decisions:
  - "Added paralelas to equipment enum (plan had inconsistency: Drizzle schema omitted it but migration SQL and all API code included it)"
metrics:
  duration: 10min
  completed: "2026-04-08T15:41:55Z"
  tasks: 4
  files: 10
---

# Phase 96 Plan 01: Full Body Goal Plan Type & Exercise Equipment Schema Summary

Backend foundation for full body goal plans and exercise equipment tagging -- full_body GoalPlanType with all 24 routes at principiante tier, nullable equipment enum column on exercises table, PATCH/bulk-update/filter API endpoints, and 9 integration tests.

## Tasks Completed

### Task 1: Add full_body goal plan type and equipment DB schema
- **Commit:** 717fc9a3
- Added `full_body` to `GoalPlanType` union in types.ts
- Added full_body route map (all 24 routes), tier map (principiante), metadata (Spanish name/description/zones/idealFor) in constants.ts
- Added `full_body` to generateGoalPlanSessions schema enum in schemas.ts
- Added `exerciseEquipmentEnum` (barras/anillas/paralelas/cajon/ninguno) and nullable `equipment` column to exercises schema
- Created migration 0078_exercise_equipment.sql for the equipment column

### Task 2: Extend exercise API endpoints for equipment field and filter
- **Commit:** 37a265ae
- Added `equipment` to `ExerciseListFilters` and `ExerciseListItem` interfaces
- Added equipment filter logic in `listExercises` (including `empty` for untagged exercises)
- Added equipment to select/return in exercise listing response
- Added equipment to `listExercisesSchema` querystring validation
- Extended PATCH `/exercises/:id` to accept equipment field (string or null)
- Added POST `/exercises/bulk-update-equipment` endpoint for batch tagging with `inArray` WHERE clause

### Task 3: Apply database migration
- Migration 0078 applied successfully via `pnpm db:migrate`
- TypeScript compiles cleanly with `tsc --noEmit` (zero errors)

### Task 4: Integration tests for exercise equipment endpoints
- **Commit:** 5f0c3d81
- Created exercises-equipment.test.ts with 9 tests
- Tests cover: PATCH valid enum, PATCH null clear, PATCH invalid rejection, bulk update success, bulk empty array rejection, bulk invalid enum rejection, bulk nonexistent IDs (0 count), GET equipment filter, GET equipment=empty filter
- Updated goal-plans.test.ts to expect 9 goal plan types (was 8)
- All 662 tests pass across 36 test files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added paralelas to Drizzle equipment enum**
- **Found during:** Task 1
- **Issue:** Plan had inconsistency -- exercises.ts enum definition omitted `paralelas` but migration SQL, video-schemas.ts, routes.ts, and exercise-service.ts all included it. Without paralelas in Drizzle schema, runtime would reject valid DB values.
- **Fix:** Added `paralelas` to both `exerciseEquipmentEnum` in exercises.ts and migration SQL
- **Files modified:** el-templo-api/src/db/schema/exercises.ts, el-templo-api/src/db/migrations/0078_exercise_equipment.sql
- **Commit:** 717fc9a3

**2. [Rule 1 - Bug] Updated goal-plans test expected count from 8 to 9**
- **Found during:** Task 4
- **Issue:** Existing test in goal-plans.test.ts expected exactly 8 goal plan types in metadata response, but adding full_body made it 9
- **Fix:** Changed `toHaveLength(8)` to `toHaveLength(9)`
- **Files modified:** el-templo-api/test/goal-plans/goal-plans.test.ts
- **Commit:** 5f0c3d81

## Self-Check: PASSED

All 10 files verified present. All 3 task commits verified in git log.
