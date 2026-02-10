---
phase: 16-pdf-generation-format-config-app-exercise-tracking
plan: 01
subsystem: sessions
tags: [format-params, type-system, generation-pipeline]
dependency-graph:
  requires: []
  provides: [format-params-type-system, format-params-population]
  affects: [session-generation, session-storage]
tech-stack:
  added: []
  patterns: [discriminated-union, factory-pattern, default-values]
key-files:
  created:
    - el-templo-api/src/modules/admin/format-params.ts
  modified:
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/pipeline/context.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-7-prescription.ts
    - el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts
    - el-templo-api/src/modules/sessions/pipeline/index.ts
    - el-templo-api/src/modules/sessions/service.ts
decisions:
  - "FormatParams uses discriminated union with type field for exhaustiveness checking"
  - "Unknown formats default to { type: 'standard' } rather than throwing errors"
  - "Default values aligned with existing constants.ts decisions (AMRAP 10min, EMOM 60s, Tabata 20/10)"
  - "Ladder direction determined by 75% intensity threshold per decision 13-07"
  - "EMOM totalMinutes calculated as exerciseCount * 1 minute"
  - "Interval work/rest periods scaled by intensity (high/medium/low thresholds)"
  - "Old sessions with null formatParams default to { type: 'standard' } in reconstructSession"
metrics:
  duration: 448
  tasks-completed: 2
  commits: 2
  files-created: 1
  files-modified: 6
  completed-date: 2026-02-10
---

# Phase 16 Plan 01: FormatParams Type System and Generation Integration Summary

**One-liner:** FormatParams discriminated union type system with default factory integrated into session generation pipeline, populating formatParams for all blocks during generation.

## Overview

This plan establishes the foundation for format parameter configuration by creating a type-safe FormatParams system and integrating it into the session generation pipeline. The `formatParams` JSON column on session_blocks now gets populated during generation with sensible defaults for all HIGH and MEDIUM importance formats.

## Tasks Completed

### Task 1: Create FormatParams Type System and Default Factory
- Created `el-templo-api/src/modules/admin/format-params.ts` with:
  - FormatParams discriminated union covering 16 format types (amrap, emom, complex, tabata, interval, for_time, chipper, buy_in_cash_out, cluster, ladder, unbroken, couplet, triplet, for_max, time_cap, standard)
  - `getDefaultFormatParams()` factory function with context-aware defaults
  - `formatParamsLabel()` helper for human-readable strings
- Aligned defaults with existing constants.ts decisions:
  - AMRAP: 10 minutes (decision 08-01)
  - EMOM: 60s interval, exerciseCount * 1 minute total (decision 08-01)
  - Tabata: 20s/10s (decision 13-07)
  - Ladder: 75% intensity threshold for descending direction (decision 13-07)
  - Interval: intensity-scaled work/rest periods
- Verified factory function returns correct defaults for all format types
- **Commit:** `a3b456d`

### Task 2: Wire formatParams Population into Session Generation Pipeline
- Added FormatParams to core types:
  - Re-exported FormatParams from sessions/types.ts
  - Added formatParams to BlockPlan interface
  - Added formatParams to BlockContextComplete interface
- Modified stage-7-prescription.ts:
  - Imported getDefaultFormatParams
  - Generate formatParams in all code paths (format-specific, standard, edge cases)
  - Return formatParams as part of BlockContextComplete
- Modified initium-pipeline.ts:
  - Generate formatParams for INITIUM blocks
  - Include in final BlockPlan
- Modified pipeline/index.ts:
  - Include formatParams in BlockPlan assembly
- Modified service.ts:
  - Save formatParams to session_blocks.formatParams column
  - Include formatParams in algorithm snapshot
  - Handle null formatParams in reconstructSession (default to standard)
- TypeScript compilation verified with no errors
- **Commit:** `416fd00`

## Deviations from Plan

None - plan executed exactly as written.

## Technical Details

### FormatParams Type Structure

```typescript
export type FormatParams =
  | { type: 'amrap'; minutes: number }
  | { type: 'emom'; intervalSeconds: number; totalMinutes: number }
  | { type: 'complex'; rounds: number }
  | { type: 'tabata'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'interval'; workSeconds: number; restSeconds: number; rounds: number }
  | { type: 'for_time'; timeCapMinutes?: number }
  | { type: 'chipper'; rounds: number }
  | { type: 'buy_in_cash_out'; rounds?: number }
  | { type: 'cluster'; clusterSize: number; restBetweenClusters: number }
  | { type: 'ladder'; direction: 'ascending' | 'descending' }
  | { type: 'unbroken' }
  | { type: 'couplet' }
  | { type: 'triplet' }
  | { type: 'for_max' }
  | { type: 'time_cap'; minutes: number }
  | { type: 'standard' };
```

### Default Value Logic

The `getDefaultFormatParams()` factory function:
1. Normalizes format name (lowercase, trim, replace spaces with underscores)
2. Maps to appropriate FormatParams type
3. Uses context for intelligent defaults:
   - `intensity >= 80` → high-intensity interval (30s work / 30s rest)
   - `intensity >= 75` → descending ladder
   - `exerciseCount` → EMOM total minutes
4. Returns `{ type: 'standard' }` for unknown formats

### Integration Points

**Generation Flow:**
1. Stage 7 (prescription) calls `getDefaultFormatParams(format.name, { intensity, exerciseCount })`
2. Returns formatParams as part of BlockContextComplete
3. Pipeline assembles BlockPlan with formatParams included
4. Service.saveSession writes formatParams to session_blocks.formatParams JSON column

**Backward Compatibility:**
- Existing sessions with `formatParams = null` handled gracefully
- `reconstructSession()` defaults null to `{ type: 'standard' }`
- No migration needed

## Verification

- TypeScript compilation: ✓ No errors
- FormatParams factory test: ✓ Correct defaults for AMRAP, EMOM, Ladder (high/low), unknown formats
- Code paths covered: ✓ Standard prescription, format-specific prescription, edge cases, INITIUM pipeline

## Next Steps

- Plan 16-02: PDF generation using formatParams
- Plan 16-03: Format parameter configuration UI in admin app
- Plan 16-04+: Exercise swap UX improvements and per-exercise completion tracking

## Files Changed

**Created (1):**
- `el-templo-api/src/modules/admin/format-params.ts` - FormatParams type system and factory

**Modified (6):**
- `el-templo-api/src/modules/sessions/types.ts` - Added FormatParams to BlockPlan
- `el-templo-api/src/modules/sessions/pipeline/context.ts` - Added formatParams to BlockContextComplete
- `el-templo-api/src/modules/sessions/pipeline/stage-7-prescription.ts` - Generate formatParams during prescription
- `el-templo-api/src/modules/sessions/pipeline/initium-pipeline.ts` - Generate formatParams for INITIUM
- `el-templo-api/src/modules/sessions/pipeline/index.ts` - Include formatParams in BlockPlan assembly
- `el-templo-api/src/modules/sessions/service.ts` - Save/load formatParams, handle null defaults

## Self-Check

Verifying created files and commits exist:

```bash
# Check files exist
[ -f "el-templo-api/src/modules/admin/format-params.ts" ] && echo "FOUND: format-params.ts" || echo "MISSING: format-params.ts"
```

```bash
# Check commits exist
git log --oneline --all | grep -q "a3b456d" && echo "FOUND: a3b456d (Task 1)" || echo "MISSING: a3b456d"
git log --oneline --all | grep -q "416fd00" && echo "FOUND: 416fd00 (Task 2)" || echo "MISSING: 416fd00"
```

## Self-Check: PASSED

All files created and commits verified.
