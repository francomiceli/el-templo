---
phase: 096-full-body-goal-plan-equipment-tagging
plan: 02
subsystem: admin, exercises, goal-plans
tags: [admin-frontend, equipment-tagging, exercises, goal-plans, full-body]
dependency_graph:
  requires: [096-01]
  provides: [admin full_body goal plan type, exercise equipment inline editing, equipment filter, auto-tagging splash]
  affects: [ExercisesPage, SessionEditPage, GeneratePage, ProgramWizardDialog]
tech_stack:
  added: []
  patterns: [inline-editable QSelect column, post-approval splash dialog for bulk operations]
key_files:
  created: []
  modified:
    - el-templo-admin/src/types/goal-plan.ts
    - el-templo-admin/src/types/exercise.ts
    - el-templo-admin/src/composables/useExercisesApi.ts
    - el-templo-admin/src/pages/ExercisesPage.vue
    - el-templo-admin/src/pages/SessionEditPage.vue
decisions: []
metrics:
  duration: 3min
  completed: "2026-04-08T15:48:43Z"
  tasks: 2
  files: 5
---

# Phase 96 Plan 02: Admin Frontend for Equipment Tagging & Full Body Goal Plan Summary

Admin frontend for full_body goal plan type (propagated to GeneratePage and ProgramWizardDialog via shared types), exercise equipment inline editing with filter on ExercisesPage, and auto-tagging splash dialog on SessionEditPage triggered after full_body day approval.

## Tasks Completed

### Task 1: Add full_body to admin types and equipment to exercise types/API
- **Commit:** 38f47213
- Added `full_body` to GoalPlanType union, ALL_GOAL_PLAN_TYPES array, GOAL_PLAN_TIER_MAP (principiante), GOAL_PLAN_TYPE_LABELS, GOAL_PLAN_TYPE_OPTIONS, GOAL_PLAN_TYPE_COLORS (green-7)
- Added `equipment: string | null` to Exercise interface
- Added `equipment: string` to ExerciseFilters interface
- Extended `updateExercise` fields parameter to accept `equipment?: string | null`
- Added `bulkUpdateEquipment` method to useExercisesApi composable with cache invalidation
- Added equipment filter param to fetchExercises query builder
- full_body automatically propagates to GeneratePage (via ALL_GOAL_PLAN_TYPES) and ProgramWizardDialog (via GOAL_PLAN_TYPE_OPTIONS)

### Task 2: Add equipment column and filter to ExercisesPage and auto-tagging splash to SessionEditPage
- **Commit:** 385d2b6f
- Added equipment filter dropdown (Equipo) to ExercisesPage filter bar with options: Todos, Sin asignar, Barras, Anillas, Paralelas, Cajon, Ninguno
- Added equipment column to table with inline-editable QSelect (always visible, clearable, shows "Sin asignar" label when empty)
- Added `onInlineEquipmentChange` handler for per-exercise equipment updates
- Equipment filter param sent to GET /admin/exercises?equipment=X API endpoint
- Added auto-tagging splash to SessionEditPage: triggers after successful day approval when goalPlanType is full_body
- Splash collects unique exercises (including mobility) from all sessions in the day
- Splash offers "Marcar como Ninguno" (bulk-tags as ninguno via bulkUpdateEquipment) or "Omitir" (skip)
- Added state refs: showEquipmentSplash, splashExercises, taggingInProgress

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 5 files verified present. Both task commits verified in git log.
