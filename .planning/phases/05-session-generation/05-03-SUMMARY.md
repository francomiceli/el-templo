---
phase: 05-session-generation
plan: 03
subsystem: api
tags: [fallback, validation, graceful-degradation, drizzle, pipeline]

# Dependency graph
requires:
  - phase: 05-01
    provides: Session generation pipeline stages 1-7
provides:
  - 4-tier exercise fallback ladder with scope widening
  - 2-tier format fallback with default formats
  - Block and session validators for coherence checks
  - Fallback action tracing in pipeline
affects: [phase-8, phase-9, coach-overrides]

# Tech tracking
tech-stack:
  added: []
  patterns: [fallback-ladder, discriminated-unions, validation-pipeline]

key-files:
  created:
    - el-templo-api/src/modules/sessions/fallback/types.ts
    - el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts
    - el-templo-api/src/modules/sessions/fallback/format-fallback.ts
    - el-templo-api/src/modules/sessions/validators/block-validator.ts
    - el-templo-api/src/modules/sessions/validators/session-validator.ts
  modified:
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/service.ts

key-decisions:
  - "4-tier exercise fallback: difficulty -> level -> scope -> contraction"
  - "2-tier format fallback: intensity range -> default per block type"
  - "FallbackResult discriminated union for exhaustive handling"
  - "Validation warnings logged but don't fail; errors throw"
  - "10% budget tolerance for reps"

patterns-established:
  - "FallbackResult<T> discriminated union: exact | fallback | failed"
  - "FallbackAction trace recording for auditability"
  - "Validators return { valid, warnings, errors } not throw"
  - "VALIDATION_PASSED/FAILED trace events in session generation"

# Metrics
duration: 8min
completed: 2026-01-24
---

# Phase 5 Plan 3: Fallback Ladder and Validation Summary

**4-tier exercise fallback with scope widening, 2-tier format fallback with defaults, and session coherence validators integrated into pipeline**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-24T05:37:36Z
- **Completed:** 2026-01-24T05:46:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Exercise fallback ladder handles sparse data gracefully (difficulty -> level -> scope -> contraction)
- Format fallback ensures session generation succeeds with intensity relaxation and defaults
- Block validation checks exercise count, budget adherence, and format compatibility
- Session validation checks deduplication, intensity progression, and block structure
- All fallback decisions traced for pipeline auditability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fallback types and exercise fallback ladder** - `7ddc8ac` (feat)
2. **Task 2: Create format fallback and integrate fallbacks into pipeline** - `cb34f36` (feat)
3. **Task 3: Create session validators for coherence checks** - `417bea6` (feat)

## Files Created/Modified

**Created:**
- `el-templo-api/src/modules/sessions/fallback/types.ts` - FallbackResult, FallbackAction, FallbackPolicy types
- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` - 4-tier exercise selection with fallback
- `el-templo-api/src/modules/sessions/fallback/format-fallback.ts` - 2-tier format selection with fallback
- `el-templo-api/src/modules/sessions/validators/block-validator.ts` - Block coherence validation
- `el-templo-api/src/modules/sessions/validators/session-validator.ts` - Session coherence validation

**Modified:**
- `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts` - Integrated format fallback
- `el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts` - Integrated exercise fallback
- `el-templo-api/src/modules/sessions/service.ts` - Added validation after generation

## Decisions Made

1. **4-tier exercise fallback order:** Difficulty first (cheapest relaxation), then level widening, then scope widening via parent category prefix, finally contraction substitution (ISO->EXC->CON)

2. **2-tier format fallback:** First relax intensity by +/-5, then use default format per block type (Movilidad for INITIUM, Straight Sets for NUCLEUS/DEUTEROS, AMRAP for ATHLOS/EPIKOS)

3. **FallbackResult discriminated union:** Three states (exact/fallback/failed) with tier tracking and action recording for exhaustive pattern matching

4. **Validation philosophy:** Warnings are logged (via WARNING trace events) but don't fail; errors throw with VALIDATION_FAILED trace. This allows partial success while flagging concerns.

5. **10% budget tolerance:** Reps can exceed budget by up to 10% without error (warning only). Beyond 10% is an error.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all implementations straightforward.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready:**
- Complete fallback system for sparse data handling
- Validation ensures generated sessions are coherent
- All pipeline stages now resilient to missing data
- Full traceability of fallback decisions

**Note:**
- Pre-existing TypeScript error in `seed-spom.ts` (null type issue) unrelated to this plan

---
*Phase: 05-session-generation*
*Completed: 2026-01-24*
