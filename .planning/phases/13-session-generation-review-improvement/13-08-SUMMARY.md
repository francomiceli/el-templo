---
phase: 13-session-generation-review-improvement
plan: 08
subsystem: api
tags: [session-generation, cross-route, exercise-selection, spom, pattern2]

# Dependency graph
requires:
  - phase: 13-07
    provides: Complete format prescriber coverage
provides:
  - Cross-route exercise selection via SPOM pattern_2
  - 2+1 split for non-INITIUM blocks (2 block-route + 1 cross-route)
  - queryCrossRouteExercises fallback function
affects: [session-generation, exercise-selection, pipeline-stage-6]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Cross-route exercise selection via SPOM pattern_2 lookup
    - Two-level pattern matching (exercises.pattern, then exercises.category)
    - Adjusted contraction mix for 2+1 split

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/sessions/pipeline/context.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-2-spom.ts
    - el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-6-exercises.ts
    - el-templo-api/src/modules/sessions/types.ts

key-decisions:
  - "2+1 split: 2 exercises from block route, 1 from cross-route via pattern_2"
  - "Cross-route uses last contraction type with count > 0 (ISO > EXC > CON)"
  - "Pattern lookup: try exercises.pattern first, then exercises.category"
  - "Route-specific pattern_2 values (PL, FL, HT) yield empty pool — all 3 from block route"
  - "Cross-route exercise marked with crossRoute: true for traceability"
  - "Empty effort fallback included in cross-route queries"

patterns-established:
  - "pattern2 flows through pipeline context from stage 2 to stage 6"
  - "Adjusted contraction mix pattern: copy mix, modify, use modified in main loop"
  - "CROSS_ROUTE_EXERCISE_SELECTED and CROSS_ROUTE_POOL_EMPTY trace events"

# Metrics
duration: manual
completed: 2026-02-05
---

# Phase 13 Plan 08: Cross-Route Exercise Selection via SPOM Pattern_2

**Non-INITIUM blocks with 3 exercises now use a 2+1 split: 2 from block route + 1 from SPOM pattern_2 cross-route pool**

## Problem Solved

Previously all 3 exercises in a non-INITIUM block came from the block's own route (e.g., HT block -> 3 HT exercises). The SPOM engine defines `pattern_2` per route+week which specifies a broader exercise pattern pool. At lower/mid intensities, this pool spans multiple routes, but was not being used.

## Rule Implemented

For non-INITIUM blocks with 3 exercises:
- **2 exercises**: from the block's own route (existing behavior)
- **1 exercise**: from SPOM's `pattern_2` pool, **excluding** the block's own route

When `pattern_2` yields no cross-route candidates (high intensity / route-specific pattern), all 3 come from the block's route.

## Changes

1. **context.ts** — Added `pattern2: string | null` to `BlockContextWithSpom` interface
2. **stage-2-spom.ts** — Passes `pattern2` from SPOM rule into context and trace event
3. **exercise-fallback.ts** — New `queryCrossRouteExercises()` function:
   - Queries `exercises.pattern = pattern2 AND route != excludeRoute`
   - Falls back to `exercises.category = pattern2` if no results
   - Includes empty effort fallback for each query level
4. **stage-6-exercises.ts** — 2+1 split logic before contraction loop:
   - Finds last contraction type with count > 0 for cross-route exercise
   - Decrements that contraction in adjusted mix so main loop selects 2
   - Emits `CROSS_ROUTE_EXERCISE_SELECTED` or `CROSS_ROUTE_POOL_EMPTY` trace events
5. **types.ts** — Added optional `crossRoute?: boolean` to `SelectedExercise`

## Commit

- `e916957` — feat(sessions): add cross-route exercise selection via SPOM pattern_2

## Intensity Behavior

| Intensity Range | pattern_2 Type | Cross-Route? | Example |
|----------------|---------------|-------------|---------|
| 55-65% | Broad (PUSH, PULL, LOWER) | Yes — 7-9 routes | HT block gets 1 exercise from any PUSH route |
| 70-80% | Mid (PUSH HORIZONTAL, etc.) | Yes — 2-5 routes | HT block gets 1 exercise from PUSH HORIZONTAL routes |
| 85-95% | Route-specific (PL, FL, HT) | No — pool empty | All 3 from block's own route |

---
*Phase: 13-session-generation-review-improvement*
*Plan: 08*
*Completed: 2026-02-05*
