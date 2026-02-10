---
phase: 16-pdf-generation-format-config-app-exercise-tracking
plan: 03
subsystem: admin-app
tags: [exercise-swap, category-filter, ux]
completed: 2026-02-10
duration: 2min

dependency-graph:
  requires:
    - "15-06: Exercise swap dialog foundation"
  provides:
    - "Category-based exercise filtering in swap dialog"
  affects:
    - "Admin session editing UX"

tech-stack:
  added: []
  patterns:
    - "Category field from exercises table for semantic grouping"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/admin/edit-service.ts
    - el-templo-admin/src/types/session.ts
    - el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue

decisions: []

metrics:
  tasks: 1
  commits: 1
  files_modified: 3
---

# Phase 16 Plan 03: Category-based Exercise Swap Dialog Summary

Exercise swap dialog now groups exercises by semantic category field instead of first word of exercise name, providing fewer, cleaner pill selections for coaches.

## What Was Done

### Task 1: Switch Dialog to Category Grouping

**Backend (edit-service.ts):**
- Added `category` field to `ExercisePoolItem` interface
- Updated both primary and cross-route exercise queries to select `category: schema.exercises.category`
- Pool API now returns category string alongside exercise, effort, difficulty, pattern, and route

**Frontend Type (session.ts):**
- Added `category: string` to `PoolExercise` interface

**Frontend Dialog (ExerciseSwapDialog.vue):**
- Removed `exerciseGroup()` helper function that extracted first word of name
- Renamed `selectedGroup` to `selectedCategory` throughout component
- Updated section label from "Patron" to "Categoria"
- Replaced `patternChips` computed with `categoryChips`:
  - Groups by `ex.category || 'Sin categoria'`
  - Sorts by count descending (most common categories first)
- Updated `displayedExercises` to filter by `ex.category` instead of first word
- Modified dialog open watcher to auto-select current exercise's category in swap mode
- Updated `fetchPool()` to look up current exercise's category from pool after loading

**Result:**
- Dialog shows semantic categories (e.g., "Press", "Sentadilla", "Tiron") instead of first-word abbreviations (e.g., "HT", "P.U")
- Fewer filter pills (10-15 categories vs 30+ first-word groups)
- Better coach UX with meaningful groupings

## Deviations from Plan

None - plan executed exactly as written.

## Verification

**Build Verification:**
```bash
cd el-templo-admin && npx quasar build
```
- Compiled successfully with no TypeScript errors
- All type definitions consistent between API and frontend

**Expected Runtime Behavior:**
- Category section shows "Categoria" label (not "Patron")
- Filter chips display semantic category names from exercises.category field
- Fewer chips than previous first-word approach
- In swap mode, dialog defaults to current exercise's category
- In add mode, dialog defaults to "Todos" (all categories)
- Contraction + category + search filters all work together

## Commits

| Hash | Message |
|------|---------|
| e5ede4b | feat(16-03): switch exercise swap dialog to category-based grouping |

## Self-Check: PASSED

**Files exist:**
```
FOUND: el-templo-api/src/modules/admin/edit-service.ts
FOUND: el-templo-admin/src/types/session.ts
FOUND: el-templo-admin/src/components/sessions/ExerciseSwapDialog.vue
```

**Commits exist:**
```
FOUND: e5ede4b
```

**Build status:**
```
Build succeeded - no TypeScript errors
```
