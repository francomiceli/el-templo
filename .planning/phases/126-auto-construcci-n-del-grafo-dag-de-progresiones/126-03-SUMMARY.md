---
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
plan: 03
subsystem: sessions
tags: [drizzle, mysql, dag, skill-tree, adjacency, neighbor, in-session, tdd]

# Dependency graph
requires:
  - phase: 126-01
    provides: "exercise_progressions table + exercises 3-dimension truth columns (subfamily_id, effort, dificultad_lineal)"
  - phase: sessions/fallback
    provides: "ExerciseCandidate return shape + Drizzle query idiom (effort eq + dl bound) reused per D-06"
provides:
  - "ExerciseProgressionService.getNeighbor(exerciseId, direction) — runtime adjacency primitive (one step easier/harder) over the skill-tree DAG"
  - "Integration test encoding the D-04/D-05 contracts (up/down, chain ends, effort-fixed, tiebreak, NULL-subfamily exclusion)"
affects: [131 in-session difficulty adjustment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DI-by-constructor module service (ProgramsService shape) for a runtime query primitive consumed by a later phase"
    - "Adjacency lookup: filter by (subfamily x fixed effort) + directional dl bound, pick dl-closest, stable id tiebreak, explicit terminal null"

key-files:
  created:
    - el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts
    - el-templo-api/test/exercises/exercise-progression-service.test.ts
  modified: []

key-decisions:
  - "Effort (contraction) is FIXED in the candidate query — no contraction substitution (D-04), unlike the fallback ladder. An EXC target only ever returns EXC neighbors."
  - "Reused ExerciseCandidate from exercise-fallback.ts (imported, not redefined) and its effort-eq + dl-bound query idiom (D-06) rather than reimplementing fallback machinery."
  - "dl-closest selection with stable id tiebreak (mirrors selectClosest); explicit terminal null at chain ends — never widens or crosses effort (D-05)."
  - "NULL subfamily_id and missing target both resolve null (not in the graph); cast effort varchar to Contraction since the graph only holds EXC/ISO/CON rows."

patterns-established:
  - "Runtime adjacency primitive over a regenerable edge graph, served directly from the exercises catalog (subfamily x effort x dl) rather than walking the persisted edges"

requirements-completed: [TREE-04]

# Metrics
duration: 5min
completed: 2026-06-05
---

# Phase 126 Plan 03: Neighbor adjacency primitive (getNeighbor) Summary

**Exposed `ExerciseProgressionService.getNeighbor(exerciseId, direction)` — the runtime "one step easier/harder" lookup Phase 131 consumes: it resolves the dl-adjacent exercise of the SAME effort within the SAME sub-family, fixes the contraction (D-04), and returns null at chain ends without crossing effort (D-05), reusing the exercise-fallback.ts ExerciseCandidate shape and query idiom (D-06).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-05T02:33:19Z
- **Completed:** 2026-06-05T02:38:xxZ
- **Tasks:** 2 completed (both `tdd="true"`)
- **Files modified:** 2 (2 created, 0 modified)

## Accomplishments

- `ExerciseProgressionService` (DI-by-constructor, copying the `ProgramsService` shape: `constructor(db, log?)`) exposing `async getNeighbor(exerciseId, direction): Promise<ExerciseCandidate | null>`.
- Adjacency logic: load target row → exclude if missing or NULL subfamily_id → query `(subfamilyId × effort)` candidates with a directional dl bound (`gt` for up, `lt` for down) → pick the dl-closest, tie-broken by smallest id → map into `ExerciseCandidate` carrying the fixed contraction.
- Seven-contract integration test (A–G) against real MySQL, self-scoped MARK seeding, FK-ordered `afterEach` cleanup (exercises then sub-families), real clock.

## Task Commits

1. **Task 1: ExerciseProgressionService.getNeighbor primitive** — `e0d6a687` (feat)
2. **Task 2: Integration test for getNeighbor** — `f5e5dd13` (test)

**Plan metadata:** final docs commit — see below.

## Files Created/Modified

- `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts` (created) — the `ExerciseProgressionService` class + `getNeighbor` adjacency primitive + `NeighborDirection` type.
- `el-templo-api/test/exercises/exercise-progression-service.test.ts` (created) — contracts A–G for up/down, both chain ends, effort-fixed, id tiebreak, and NULL-subfamily exclusion.

## Verification

- `pnpm tsc --noEmit` passes clean (exit 0) for el-templo-api — the project gate is green; my two new files produce no diagnostics. (The two known pre-existing unrelated diagnostics in `campaigns/templates.ts` and `test/helpers.ts:321` do not trip the gate, as documented in project policy.)
- `getNeighbor` filters by `subfamilyId` AND `effort` (effort fixed, D-04), uses `gt` (up) / `lt` (down) directional dl bounds, picks the dl-closest with a stable `id` tiebreak (D-05), and returns explicit `null` when the target is missing, has NULL `subfamily_id`, or has no candidate in the requested direction (no widening, no effort crossing).
- `ExerciseCandidate` is imported from `exercise-fallback.ts`, not redefined; no `any` types; no `console.log` (uses the injected `FastifyBaseLogger` for the one debug line).

## Test Execution Note

Per project policy + memory, the integration suite runs in CI, not locally — the local gate is `pnpm tsc --noEmit` only, which passes. The new test seeds `exercises` and `exercise_subfamilies` directly via Drizzle and is ready to run in CI on the next staging push (ask Franco before pushing).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the NOT NULL `route` column to the seeded sub-family**

- **Found during:** Task 2 typecheck
- **Issue:** `exercise_subfamilies` has a NOT NULL `route` column (no default). The first `seedSubfamily` helper omitted it, which would fail both the Drizzle insert type and the runtime insert.
- **Fix:** Added `route: "TEST"` to the sub-family seed values.
- **Files modified:** `el-templo-api/test/exercises/exercise-progression-service.test.ts`
- **Commit:** `f5e5dd13`

## Known Stubs

None. This plan is a pure backend query primitive + its test; no UI/data wiring involved.

## Threat Flags

None beyond the plan's threat_model. `getNeighbor` is a read-only primitive: `direction` is a typed union (no string interpolated into SQL — Drizzle parameterizes the effort/subfamily eq and dl bound), and both NULL subfamily_id and missing targets resolve to null (no rows outside the graph exposed, T-126-06/T-126-07). No new packages, no new network/auth/file surface.

## Self-Check: PASSED

- Files: `exercise-progression-service.ts` FOUND, `exercise-progression-service.test.ts` FOUND.
- Commits `e0d6a687` and `f5e5dd13` FOUND in git log.
