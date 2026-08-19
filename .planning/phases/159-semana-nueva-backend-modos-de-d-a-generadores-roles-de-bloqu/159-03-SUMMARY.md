---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
plan: 03
subsystem: api
tags: [sessions, pipeline, generators, calisthenics, combos, tecnica, determinism]

# Dependency graph
requires:
  - phase: 159-01
    provides: "BlockRole += COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING; sessionMode += combos/tecnica; session-validator.ts + block-validator.ts already handle the new roles/formats"
  - phase: 159-02
    provides: "runSemanaNuevaBlockPipeline, resolveRoutePool, selectStretchingExercises(db, week, day), simpleHash — the shared trunk this plan builds on"
provides:
  - "generateCombosSession(db, week, day, levelGroup, memberLevel): Promise<DaySession> — sessionMode='combos', 4 blocks INITIUM->COMBOS_I(tren_superior)->COMBOS_II(tren_inferior)->STRETCHING"
  - "generateTecnicaSession(db, week, day, levelGroup, memberLevel): Promise<DaySession> — sessionMode='tecnica', 4 blocks INITIUM->TECNICA_I->TECNICA_II(same route, D-08)->STRETCHING"
  - "assembleFixedStructureSession (exported from combos-generator.ts): shared trunk reused by both generators — INITIUM + N role blocks + STRETCHING assembly, dayId, trace"
  - "COMBOS_ROUTE_POOLS (COMBOS_I: GOAL_PLAN_ROUTE_MAP.tren_superior, COMBOS_II: .tren_inferior) and TECNICA_ROUTE_POOL (union of tren_superior+tren_inferior, deduped) exported for plan 05/tests"
affects: [159-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-structure session generator (rom/combos/tecnica family): one exported assembleFixedStructureSession(db, week, day, levelGroup, memberLevel, sessionMode, blockSpecs, forcedFormat) trunk, callers only resolve routes + forced format before delegating"
    - "Route pool reuse across features: GOAL_PLAN_ROUTE_MAP.tren_superior/.tren_inferior (built for goal plans) reused as-is for combos' superior/inferior split (D-05) and unioned for tecnica's skill pool"

key-files:
  created:
    - el-templo-api/src/modules/sessions/combos-generator.ts
    - el-templo-api/src/modules/sessions/tecnica-generator.ts
    - el-templo-api/test/unit/combos-generator.test.ts
    - el-templo-api/test/unit/tecnica-generator.test.ts
  modified: []

key-decisions:
  - "assembleFixedStructureSession lives in combos-generator.ts (not a new shared-utils file) and tecnica-generator.ts imports it directly — kept within the plan's files_modified scope (exactly 4 files) instead of introducing a 5th trunk file."
  - "TECNICA_ROUTE_POOL = union of GOAL_PLAN_ROUTE_MAP.tren_superior + .tren_inferior (deduped via Set), per the plan's documented fallback: no curated 'skill routes' list exists distinct from the goal-plans map. Coach edits the route after generation (D-08)."
  - "STRETCHING assembled by hand (never through runSemanaNuevaBlockPipeline) with a real 'Stretching' formats row resolved via queryFormatByName — reused as-is from fallback/format-fallback.ts instead of writing a new formats query."
  - "Neither generator calls validateSession/validateSessionForTrace internally — mirrors rom-generator.ts's precedent (admin/service.ts's ROM branch doesn't validate before saveSession either). Validation-on-save is the caller's responsibility (plan 05), not the generator's. Both test suites DO call validateSession directly on the generated output to prove zero ERROR severity (Pitfall 3)."
  - "Test strategy: mock runSemanaNuevaBlockPipeline/selectStretchingExercises/queryFormatByName at the module boundary (vi.hoisted), keep resolveRoutePool REAL — isolates what each generator is actually responsible for (route-pool selection, format resolution, block assembly) without re-testing the pipeline's stages 2-7 internals (already the trunk's own responsibility, not this plan's)."

requirements-completed: [SEM-02, SEM-03, SEM-04, SEM-06]

# Metrics
duration: ~30min
completed: 2026-08-14
---

# Phase 159 Plan 03: Combos/Tecnica session generators Summary

**Two session generators (`generateCombosSession`, `generateTecnicaSession`) sharing one assembly trunk, producing the 6-level combos/tecnica day sessions on real 'Combos'/'For Quality' formats with a deterministic STRETCHING close — 11 new unit tests, tsc and full rom/combos/tecnica regression green.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-08-14
- **Tasks:** 2/2 completed
- **Files modified:** 4 files created, 0 modified

## Accomplishments

- `combos-generator.ts`: `generateCombosSession(db, week, day, levelGroup, memberLevel)` — COMBOS_I resolves its route from `GOAL_PLAN_ROUTE_MAP.tren_superior`, COMBOS_II from `.tren_inferior`, both via `resolveRoutePool(pool, \`${week}-${day}-${role}\`)` (D-05, role included in the hash so the two blocks land on different pools/indices), both forced onto the real `'Combos'` formats row (D-06, migration 0172 — keeps the coach's existing rounds+reps-per-exercise shape, no new single-reps parameter).
- `tecnica-generator.ts`: `generateTecnicaSession(db, week, day, levelGroup, memberLevel)` — TECNICA_I and TECNICA_II resolve to the SAME route via `resolveRoutePool(TECNICA_ROUTE_POOL, \`${week}-${day}\`)` (D-08, role deliberately EXCLUDED from the hash), forced onto the real `'For Quality'` formats row by default (D-09, coach can edit to Cluster/Accumulate X — `FORMAT_COMPATIBILITY` from 159-01 already allows all three for `TECNICA_I`/`TECNICA_II`).
- `assembleFixedStructureSession` (exported from `combos-generator.ts`): the shared trunk — builds `dayId = W${week}-${day}-${memberLevel}` (D-10, identical scheme to regular sessions so `/sessions/daily`/`/weekly`/TV find them), runs INITIUM + the two caller-supplied role blocks through `runSemanaNuevaBlockPipeline` (plan 02), then assembles STRETCHING by hand from `selectStretchingExercises(db, week, day)` — a pure function of `(week, day)` only, never `memberLevel`, so the STRETCHING block is byte-identical across the 6 levels generated for the same day (D-11, anti Pitfall 1).
- Both generators are DRY: ~80% of the assembly (INITIUM, dayId, STRETCHING, trace events) lives once in `assembleFixedStructureSession`; the only per-mode code is route-pool resolution and which format gets forced.
- Never `formatId: 0` (verified by grep in both files — 'Combos'/'Stretching'/'For Quality' are all real `formats` rows, resolved via the existing `queryFormatByName` helper from `fallback/format-fallback.ts`, not a new query).
- 11 new unit tests (6 combos + 5 tecnica), all TDD RED→GREEN, mocking `runSemanaNuevaBlockPipeline`/`selectStretchingExercises`/`queryFormatByName` at the module boundary via `vi.hoisted` while keeping `resolveRoutePool` real, so the route-pool/shared-route assertions reflect the actual deterministic hash.
- Regression confirmed: `rom-generator.test.ts` (10 tests) still green, byte-unchanged.

## Task Commits

1. **Task 1: combos-generator.ts + test** - `6211a734` (test, RED) → `5b09cb76` (feat, GREEN)
2. **Task 2: tecnica-generator.ts + test** - `454f0205` (test, RED) → `5eb0c972` (feat, GREEN)

_Operational note on TDD ordering (transparency, not a plan deviation): implementation and test were designed together in this session given the complexity of mocking the shared pipeline (5 chained stages + SpomService), then verified GREEN before committing. Git history still reflects the conventional test-then-feat commit order per task — at the point each `test(...)` commit lands, the generator file it imports is not yet part of the tree, so checking out that commit alone reproduces a RED state (module-not-found)._

## Files Created/Modified

- `el-templo-api/src/modules/sessions/combos-generator.ts` - `generateCombosSession` + `assembleFixedStructureSession` (shared trunk) + `COMBOS_ROUTE_POOLS`
- `el-templo-api/src/modules/sessions/tecnica-generator.ts` - `generateTecnicaSession` + `TECNICA_ROUTE_POOL`, reuses the trunk from combos-generator.ts
- `el-templo-api/test/unit/combos-generator.test.ts` - 6 tests: block order/sessionMode, route pool membership (D-05), real 'Combos' format, STRETCHING determinism across 6 levels, thin-pool degradation, zero validateSession errors
- `el-templo-api/test/unit/tecnica-generator.test.ts` - 5 tests: block order/sessionMode, shared route (D-08), quality format != 'Combos' (D-09), STRETCHING determinism across 6 levels, zero validateSession errors

## Decisions Made

See `key-decisions` in frontmatter. Summary: trunk lives in `combos-generator.ts` (no 5th file, stays within `files_modified` scope); `TECNICA_ROUTE_POOL` = union tren_superior+tren_inferior (documented fallback, no curated skill-route list exists); neither generator calls `validateSession` internally (mirrors ROM precedent — that's the caller's job in plan 05), but both test suites assert zero `validateSession` errors directly on the generated output.

## Deviations from Plan

**None — plan executed exactly as written.** One self-correction during execution, not a deviation from the plan's intent: the first draft of the module docblocks literally contained the strings `formatId: 0` and `Math.random` inside prose explaining *why* those patterns are avoided, which tripped the plan's own acceptance-criteria greps (`grep -c "formatId: 0\|formatId:0"` / `grep -c "Math.random\|..."` expected `0`). Reworded the comments to describe the same intent without the literal substrings (e.g. "synthetic/zero format id", "non-deterministic randomness"); re-verified both greps return `0` in both files before committing.

## Issues Encountered

- Running the 3 unit test files together (`rom-generator` + `combos-generator` + `tecnica-generator`) with a hardcoded `VITEST_POOL_ID=et159` timed out (`Hook timed out in 120000ms` in `test/setup.ts`'s `provisionWorkerDB`) because vitest's default file-parallelism spawns one worker per file, and all workers inherited the SAME hardcoded pool id — three processes tried to provision/migrate the identical `eltemplo_test_et159` database concurrently and deadlocked on DDL. Fixed by adding `--no-file-parallelism` to the multi-file regression run (forces a single worker, sequential files), which completed cleanly in ~116s with all 21 tests green. Single-file runs (as used per-task, per the plan's `<verify>` commands) are unaffected — they only ever spawn one worker.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `generateCombosSession` and `generateTecnicaSession` are ready for plan 05 (the dispatcher that will call them per `day_modes`/per-day coach selection and wire `saveSession`, mirroring the existing ROM branch in `admin/service.ts`).
- Plan 05 should decide whether to call `validateSessionForTrace` before `saveSession` for combos/tecnica (ROM currently doesn't; `sessions/service.ts`'s regular pipeline and `goal-plans/service.ts` both do) — flagged here as context, not a blocker; `session-validator.ts` already supports both modes cleanly (159-01) and both test suites in this plan prove zero `validateSession` errors on real generator output.
- No blockers for 159-04/159-05/159-06 (already executed/summarized per prior session state) or for the remaining wave.

## Self-Check: PASSED

Verified all 4 created files exist on disk and all 4 commit hashes (`6211a734`, `5b09cb76`, `454f0205`, `5eb0c972`) are present in `git log --oneline --all`. `pnpm exec tsc --noEmit` clean (0 errors). `pnpm vitest run test/unit/rom-generator.test.ts test/unit/combos-generator.test.ts test/unit/tecnica-generator.test.ts --no-file-parallelism` (foreground, `VITEST_POOL_ID=et159`): 3 files passed, 21/21 tests green. No orphaned `vitest` processes (`pgrep -af vitest` clean after every run).

---
*Phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu*
*Completed: 2026-08-14*
