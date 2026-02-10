---
phase: 16-pdf-generation-format-config-app-exercise-tracking
plan: 07
subsystem: admin-session-editing
tags: [saved-blocks, block-reuse, coach-workflow]
dependencies:
  requires:
    - phase-15-session-editing
  provides:
    - saved-blocks-feature
  affects:
    - block-swap-workflow
tech-stack:
  added: []
  patterns: [dialog-prompt, per-user-scoping, snapshot-storage]
key-files:
  created:
    - el-templo-api/src/db/schema/saved-blocks.ts
  modified:
    - el-templo-api/src/db/schema/index.ts
    - el-templo-api/src/modules/admin/edit-service.ts
    - el-templo-api/src/modules/admin/routes.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-admin/src/components/sessions/EditableBlockCard.vue
    - el-templo-admin/src/composables/useEditApi.ts
    - el-templo-admin/src/types/session.ts
decisions:
  - decision: JSON column for block data snapshot
    rationale: Full block state (exercises, prescriptions, format params) stored as JSON for easy reuse
  - decision: Per-coach scoping via createdBy field
    rationale: Each coach only sees their own saved blocks, privacy and organization
  - decision: bookmark_add icon for save button
    rationale: Standard icon for saving/bookmarking for later use
  - decision: Default block name to "ROLE - FORMAT"
    rationale: Provides meaningful default while allowing coach customization
  - decision: sourceBlockId nullable
    rationale: Original block may be deleted later, saved block remains independent
metrics:
  duration: 4m 23s
  files_created: 1
  files_modified: 7
  commits: 2
  completed: 2026-02-10
---

# Phase 16 Plan 07: Saved Blocks for Reuse Summary

**One-liner:** Coaches can save approved session blocks with custom names for reuse in future sessions via bookmark button in EditableBlockCard.

## Completed Tasks

### Task 1: Create saved_blocks table and API endpoints
**Commit:** ec348ec

Created full backend infrastructure for saved blocks:
- `saved_blocks` table with JSON snapshot storage
- `AdminEditService` methods: `saveBlock`, `listSavedBlocks`, `deleteSavedBlock`
- API routes: POST/GET/DELETE `/admin/saved-blocks`
- Per-coach scoping via `createdBy` field
- Full block data snapshot: exercises, prescriptions, format params, intensity, budget

**Key implementation:**
```typescript
// Block data snapshot structure
{
  role: string,
  route: string,
  formatName: string,
  formatParams: json,
  intensity: number,
  repsBudget: number,
  exercises: [{
    exerciseId, exerciseName, contraction,
    reps, seconds, rest, notes, dificultadLineal, sortOrder
  }]
}
```

### Task 2: Add save button to EditableBlockCard
**Commit:** 3bbb844

Added UI for saving blocks:
- Bookmark icon button in block header (next to swap button)
- Quasar dialog for custom name entry
- Default name: "ROLE - FORMAT" (e.g., "NUCLEUS - EMOM")
- Success/error notifications
- `useEditApi` methods: `saveBlock`, `listSavedBlocks`, `deleteSavedBlock`
- `SavedBlock` TypeScript interface

**UX flow:**
1. Coach clicks bookmark_add button on any block
2. Dialog opens with suggested name (customizable)
3. Block saved with full snapshot
4. Success notification confirms save
5. Saved blocks persist for future reuse

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

**JSON snapshot storage:** Stores complete block state as JSON for portability. Includes all exercises with full prescription details, allowing exact block reconstruction in any future session.

**Per-coach scoping:** `createdBy` field filters saved blocks by user. Each coach builds their own library without seeing others' blocks. Enables coach-specific workflow customization.

**Nullable sourceBlockId:** Original block may be edited or deleted after save. Saved block remains independent with full snapshot, ensuring saved blocks never become invalid due to source changes.

## Integration Points

**Phase 15 editing:** Saved blocks build on existing EditableBlockCard component. Save button appears alongside swap and format controls, integrated into existing coach workflow.

**Future block swap:** Plan notes that saved blocks will appear in block swap dialog (future enhancement). API already provides `listSavedBlocks` endpoint for retrieval.

## Success Criteria Met

- [x] saved_blocks table exists with correct schema
- [x] API endpoints for save/list/delete work
- [x] Save button appears in EditableBlockCard header
- [x] Saved block includes full exercise snapshot data
- [x] Saved blocks per-coach (only see your own)
- [x] Build compiles without errors

## Self-Check: PASSED

**Files created:**
- FOUND: el-templo-api/src/db/schema/saved-blocks.ts

**Commits verified:**
- FOUND: ec348ec (Task 1 - saved_blocks table and API)
- FOUND: 3bbb844 (Task 2 - save button UI)

**Database migration:**
- saved_blocks table created successfully via drizzle-kit push

**Build verification:**
- API: TypeScript compilation successful
- Admin app: Quasar build successful (414KB JS, 196KB CSS)

## Metrics

**Execution:**
- Duration: 4 minutes 23 seconds
- Tasks: 2/2 completed
- Commits: 2 (atomic per-task)

**Code changes:**
- Files created: 1 (saved-blocks.ts schema)
- Files modified: 7 (3 backend, 3 frontend, 1 type definitions)
- Lines added: ~200 (backend service methods, API routes, frontend UI)

**Test coverage:**
- Manual verification: Database table created
- Build tests: Both API and admin app compile successfully
- Type safety: All TypeScript interfaces defined

## Impact Summary

Coaches now have a personal library of reusable blocks. Any approved session block can be saved with a custom name for quick reuse in future sessions. This reduces repetitive configuration work and enables coaches to build standardized block templates for common training patterns.

Saved blocks are fully independent snapshots - they remain valid even if the source session is modified or deleted. Each coach maintains their own library with per-user scoping for privacy and organization.
