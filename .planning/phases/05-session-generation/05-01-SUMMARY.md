---
phase: 05-session-generation
plan: 01
subsystem: session-engine
tags: [pipeline, determinism, session-generation, spom]
dependency-graph:
  requires: [04-01, 04-02, 04-03]
  provides: [SessionGeneratorService, runBlockPipeline, BlockContext]
  affects: [05-02, 05-03]
tech-stack:
  added: []
  patterns: [immutable-context-pipeline, deterministic-tie-breakers, trace-events]
key-files:
  created:
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/sessions/pipeline/context.ts
    - el-templo-api/src/modules/sessions/pipeline/index.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-1-rotator.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-2-spom.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-3-budget.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-4-contraction.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-7-prescription.ts
  modified:
    - el-templo-api/src/modules/spom/service.ts
decisions: []
metrics:
  duration: 6min
  completed: 2026-01-24
---

# Phase 05 Plan 01: Session Generator Core Summary

7-stage deterministic pipeline generating complete daily sessions from SPOM tables with immutable context passing and trace events.

## What Was Built

### Session Generation Pipeline
- **7 sequential stages** transforming (week, day, levelGroup) into complete DaySession
- **Immutable context pattern**: each stage returns new context with additional data
- **Trace events** emitted at every decision point for auditability
- **Deterministic tie-breakers**: compatibility DESC then formatId ASC for formats, id ASC for exercises

### Domain Types (types.ts - 95 lines)
- `LevelGroup`: 'alfa_delta' | 'sigma' | 'omega'
- `BlockRole`: 'INITIUM' | 'NUCLEUS' | 'DEUTEROS_1' | 'DEUTEROS_2' | 'ATHLOS_EPIKOS'
- `Contraction`: 'CON' | 'EXC' | 'ISO'
- `TraceEvent`: Structured audit trail with timestamp, severity, location, decision data
- `ExercisePrescription`: Exercise with reps, rest, contraction type
- `BlockPlan`: Complete block output with route, format, exercises
- `DaySession`: Complete day with 5 blocks (or 4 if DEUTEROS_2 null)

### Pipeline Stages
| Stage | Function | Input | Output |
|-------|----------|-------|--------|
| 1 | resolveRotator | BlockContext | + route |
| 2 | resolveSpom | + route | + intensity, pattern, category |
| 3 | deriveBudget | + intensity | + repsBudget, exerciseCount range |
| 4 | deriveContraction | + budget | + exerciseCount, contractionMix |
| 5 | selectFormat | + contraction | + format |
| 6 | selectExercises | + format | + exercises |
| 7 | generatePrescriptions | + exercises | + prescriptions |

### SessionGeneratorService
- `generateDailySession({ week, day, levelGroup })`: Generates complete DaySession
- Creates 5 blocks (INITIUM through ATHLOS_EPIKOS)
- Skips DEUTEROS_2 if rotator has null route
- Collects block traces into session-level trace
- Pure generation only (no persistence)

### SpomService Enhancement
- Added `getRouteById(routeId)`: Converts route FK to route code string
- Needed by stage-1-rotator to map weekly_rotator FK columns to route codes

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Use exerciseCountMin for determinism | Avoids randomness in exercise count selection |
| Rest time scales with intensity | 30s (low) to 90s (high) matches training principles |
| Budget distributed with remainder to first exercises | Deterministic integer division |
| INITIUM fixed to MOV route | Mobility warmup doesn't use rotator |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| d98e816 | feat | Create session generation types and immutable BlockContext |
| 5d73fee | feat | Add getRouteById and implement pipeline stages 1-4 |
| 35a3ea1 | feat | Implement pipeline stages 5-7 for exercise selection |
| f09ef15 | feat | Create pipeline orchestrator and SessionGeneratorService |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- TypeScript compiles without errors in new files (pre-existing error in seed-spom.ts unrelated)
- All exports verified: SessionGeneratorService, runBlockPipeline, createInitialContext
- types.ts exceeds 50 line minimum (95 lines)
- Context immutability enforced with readonly modifiers

## Next Phase Readiness

**Ready for 05-02 (Session Storage & Retrieval):**
- SessionGeneratorService returns complete DaySession objects
- Session IDs formatted as `W{week}-{day}-{levelGroup}`
- Trace events included for debugging

**Integration points:**
- `runBlockPipeline` can be called independently for testing
- `createInitialContext` exported for test fixtures
- SpomService extended without breaking existing endpoints
