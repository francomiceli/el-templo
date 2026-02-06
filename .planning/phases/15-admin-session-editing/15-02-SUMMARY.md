---
phase: 15-admin-session-editing
plan: 02
subsystem: admin-api
tags: [prescribe-service, edit-service, exercise-pool, format-change, audit-log]
depends_on:
  requires: [15-01]
  provides: [PrescribeService, AdminEditService]
  affects: [15-03, 15-04, 15-05, 15-06]
tech-stack:
  added: []
  patterns: [service-extraction, pipeline-wrapper, cross-route-query]
key-files:
  created:
    - el-templo-api/src/modules/admin/prescribe-service.ts
    - el-templo-api/src/modules/admin/edit-service.ts
  modified: []
decisions:
  - PrescribeService is a thin wrapper importing prescribeByFormat directly from pipeline
  - calculateRest replicated (not exported from pipeline) with exact same logic
  - Exercise pool sorted by proximity to target difficulty for best swap suggestions
  - Cross-route exercises labeled with patternSource for badge display
  - New exercises added with blank prescription (reps=0, seconds=0, rest=0) for coach manual fill
  - resetToAlgorithm reads from sessions.algorithmSnapshot JSON column
  - Format compatibility maps spartan to omega level per existing convention
metrics:
  duration: 3min
  completed: 2026-02-06
---

# Phase 15 Plan 02: Prescribe & Edit Service Summary

**One-liner:** PrescribeService wrapping pipeline prescribeByFormat for on-demand use, plus AdminEditService with 8 methods covering exercise pool, swap, CRUD, format change, reset-to-algorithm, and audit logging.

## What Was Done

### Task 1: PrescribeService (prescribe-service.ts)
Created a service that wraps the pipeline's prescription logic for on-demand use outside the full 9-stage generation pipeline.

**Methods:**
- `prescribeExerciseInBlock()` - Re-prescribe a single exercise within block context. Maps database exercise data to pipeline's SelectedExercise type, runs prescribeByFormat, extracts result for target exercise.
- `prescribeBlock()` - Re-prescribe all exercises in a block. Used after format change. Calls prescribeByFormat with full exercise list, falls back to standard inverse difficulty distribution.

**Key design:**
- Imports `prescribeByFormat` directly from `format-prescribers.ts` (no logic duplication)
- Imports `roundToNearest5`, `calculateInverseDifficultyWeights`, `MIN_REPS_PER_EXERCISE` from pipeline utils
- Replicates `calculateRest` (intensity-to-rest mapping) since it's not exported from stage-7
- `toSelectedExercise` helper maps DB exercise shape to pipeline's readonly SelectedExercise type
- Standalone fallback for exercises not yet in the block list (equal budget share)

### Task 2: AdminEditService (edit-service.ts)
Created the core editing service with 8 public methods and 2 private helpers.

**Methods:**
1. `getExercisePool()` - Queries exercises table for swap candidates filtered by route, contraction type, with cross-route support (pattern_2 for non-INITIUM blocks). Sorted by closest dificultadLineal to target.
2. `swapExercise()` - Replaces one exercise, uses PrescribeService for re-prescription within block budget.
3. `updatePrescription()` - Updates individual prescription fields (reps, seconds, rest, notes).
4. `changeBlockFormat()` - Changes block format, re-prescribes all exercises via PrescribeService.prescribeBlock().
5. `addExercise()` - Adds exercise with blank prescription (reps=0), coach fills manually.
6. `removeExercise()` - Removes exercise, resequences sortOrder for remaining.
7. `resetToAlgorithm()` - Restores session from algorithmSnapshot JSON column, deletes all blocks/prescriptions and re-inserts from snapshot.
8. `getCompatibleFormats()` - Queries format_compatibility table with block/level/intensity mapping, returns formats sorted by compatibility score descending.

**Helpers:**
- `revertToPendingIfApproved()` - Auto-reverts approved sessions to pending_review on any edit.
- `logEdit()` - Inserts into session_edit_logs with action type.

**Cross-cutting:**
- Every mutation method calls both `revertToPendingIfApproved()` and `logEdit()`
- Spanish error messages throughout ("Ejercicio no encontrado", "Bloque no encontrado", etc.)
- Same constructor pattern as AdminSessionService: `db: MySql2Database<typeof schema>`

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4516df7 | PrescribeService wrapping pipeline prescription logic |
| 2 | 7910738 | AdminEditService with exercise pool, CRUD, format change, reset |

## Deviations from Plan

None - plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Replicate calculateRest instead of exporting from pipeline | Function is private in stage-7-prescription.ts, exact same logic replicated to avoid modifying pipeline code |
| Exercise pool sorts by difficulty proximity | Best UX for coaches - closest difficulty matches appear first |
| Cross-route exercises labeled with patternSource field | Enables pattern badge display in swap dialog per CONTEXT.md |
| Blank prescription for added exercises | Per CONTEXT.md: "New exercises added to a block start with blank prescription -- coach fills in manually" |
| Format compatibility maps spartan->omega | Consistent with decision from 09-02, format_compatibility table has no spartan row |
| Exercise count updated via SQL expression | `exerciseCount + 1` / `exerciseCount - 1` avoids race conditions vs read-then-write |

## Verification

- [x] TypeScript compiles without errors (both tasks verified)
- [x] PrescribeService imports prescribeByFormat from pipeline (3 import references)
- [x] AdminEditService has all 8 methods with proper type signatures
- [x] Auto-revert to pending_review called in all 5 mutation methods
- [x] Edit logging called in all 6 mutation methods (including resetToAlgorithm)
- [x] schema.exercises queried for exercise pool (22 references in edit-service)

## Next Phase Readiness

Plan 15-02 delivers the backend business logic layer. The next plans can:
- **15-03**: Wire these services to API route handlers (import PrescribeService, AdminEditService)
- **15-04+**: Build frontend components that call the API endpoints backed by these services

No blockers identified. Both services are self-contained and ready for route integration.

## Self-Check: PASSED
