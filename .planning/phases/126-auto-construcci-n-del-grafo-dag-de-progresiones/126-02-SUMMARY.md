---
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
plan: 02
subsystem: batch
tags: [drizzle, mysql, dag, skill-tree, graph-constructor, batch, idempotent]

# Dependency graph
requires:
  - phase: 126-01
    provides: "exercise_progressions edge table (source auto|manual enum) + migration 0139 + barrel export"
  - phase: 124-125
    provides: "exercises 3-dimension truth columns (subfamily_id, effort, dificultad_lineal) + canonical_exercise_id"
provides:
  - "runRebuildProgressionGraph(db) — deterministic batch constructor that writes the linear auto backbone (one chain per subfamily × effort) into exercise_progressions"
  - "CLI entry (npx tsx rebuild-progression-graph.ts) mirroring bootstrap-dimensions.ts"
  - "Integration test encoding the D-02/D-03/D-04/D-05 contracts (backbone, idempotency, manual-preservation, effort-not-crossed, exclusion, tiebreak)"
affects:
  [
    126-03 neighbor primitive,
    127,
    128 manual overrides,
    131 in-session adjustment,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regenerable batch constructor: read confirmed catalog → in-memory deterministic transform → DELETE source='auto' + bulk INSERT inside a transaction (scoped regeneration, manual-preserving)"
    - "Composite (subfamily × effort) partition key guarantees effort is never crossed in the auto backbone"
    - "Stable chain ordering: sort by dl ascending, tiebreak by id ascending, so the backbone is identical across runs"

key-files:
  created:
    - el-templo-api/rebuild-progression-graph.ts
    - el-templo-api/test/exercises/rebuild-progression-graph.test.ts
  modified: []

key-decisions:
  - "DELETE scoped WHERE source='auto' inside db.transaction, then bulk INSERT — manual edges (authored by profes in 128) are never touched (D-03)"
  - "Partition by composite key subfamilyId|effort so EXC and CON in the same sub-family live in separate partitions and never share an auto edge (D-04)"
  - "dl ties broken by ascending id (smaller first) so the chain orientation is stable across runs (D-05)"
  - "READ filters subfamily_id IS NOT NULL AND canonical_exercise_id IS NULL — only confirmed canonical exercises are graph nodes (D-01)"
  - "Backbone is strictly consecutive (element[i]→element[i+1]); NO speculative cross-edges — those are profe work in 128 (D-02)"
  - "console.log carve-out for the standalone CLI maintenance tool (same as bootstrap-dimensions.ts); no any (CLAUDE.md TS rule)"

patterns-established:
  - "Graph-constructor batch script: exported run<TSchema>(db) for test injection + guarded CLI entry; read-report-before-mutate; scoped transactional regeneration"

requirements-completed: [TREE-04]

# Metrics
duration: 6min
completed: 2026-06-05
---

# Phase 126 Plan 02: Constructor del grafo de progresiones (backbone) Summary

**Built `runRebuildProgressionGraph(db)`, a deterministic, idempotent batch constructor that reads confirmed canonical exercises, partitions them by (subfamily × effort), orders each partition by dificultad_lineal with a stable id tiebreak, and atomically writes the consecutive linear backbone as `source='auto'` edges — regenerating only auto edges and leaving manual profe overrides untouched.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 2 completed
- **Files modified:** 2 (2 created)

## Accomplishments

- `runRebuildProgressionGraph<TSchema>(db)` exported with the generic-db signature (mirrors `bootstrap-dimensions.ts`), so the integration test drives it against the per-worker test DB without spawning a process.
- READ step filters confirmed canonical exercises only (`subfamily_id IS NOT NULL AND canonical_exercise_id IS NULL`, D-01), narrowed into typed rows without `any`.
- TRANSFORM step is pure and deterministic: group by composite `subfamilyId|effort` key (D-04), sort by `dl` ascending with `id` tiebreak (D-05), emit consecutive backbone edges only (D-02), no inference, no cross-edges.
- WRITE step runs inside `db.transaction`: `DELETE ... WHERE source='auto'` then bulk INSERT the recomputed auto edges — scoped regeneration that never touches `source='manual'` (D-03); the edge UNIQUE backs the dedupe.
- Guarded CLI entry (dotenv + createSingleConnection + run + close) that does NOT execute when the module is imported by the test.
- Integration test with seven cases (A backbone, A2 single-node, B idempotency, C manual-preserved, D effort-not-crossed, E exclusion, F tiebreak determinism), MARK-scoped seed/cleanup of sub-families + exercises + edges in FK order, real clock.

## Task Commits

1. **Task 1: runRebuildProgressionGraph constructor** — `21a61063` (feat)
2. **Task 2: Integration test for the constructor** — `71b04233` (test)

**Plan metadata:** final docs commit — see below.

## Files Created/Modified

- `el-templo-api/rebuild-progression-graph.ts` (created) — exported `runRebuildProgressionGraph` batch constructor + guarded CLI entry; the deterministic auto-backbone writer.
- `el-templo-api/test/exercises/rebuild-progression-graph.test.ts` (created) — integration test encoding the D-02/D-03/D-04/D-05 contracts; runs in CI.

## Verification

- `pnpm tsc --noEmit` (the project's defined local gate, per CLAUDE.md) passes (exit 0) with both files present.
- Explicit `tsc` over the two out-of-`src` files (root constructor + test) reports **no errors in either file** — the only diagnostics surfaced were pre-existing, unrelated files (`mjml` lib types in `templates.ts`, a spread-overwrite in `helpers.ts`) caught only because the explicit invocation bypassed the project's type-resolution config.
- The integration test runs against real MySQL in CI, not locally (project policy + memory: local gate is `tsc` only).

## Test DB Application Note

Per Plan 01's note, the per-worker test DBs (`eltemplo_test_<POOL_ID>`) are rebuilt from all committed `.sql` migrations on every CI run, so `exercise_progressions` (migration 0139, committed in Plan 01) is present for this plan's test. The test seeds its own `exercise_subfamilies` rows because `exercises.subfamily_id` is a real FK — seeding a confirmed exercise requires a valid sub-family target.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical setup] Test seeds `exercise_subfamilies` rows before seeding confirmed exercises**

- **Found during:** Task 2
- **Issue:** `exercises.subfamily_id` carries a real FK to `exercise_subfamilies.id` (schema confirmed). The plan's seed helper sketch set `subfamilyId` directly to an integer, which would violate the FK for a confirmed exercise with no matching sub-family row.
- **Fix:** Added a `seedSubfamily()` helper that inserts a MARK-tagged `exercise_subfamilies` row via `$returningId()`, tracks the id, and the `afterEach` deletes sub-families last (after edges and exercises) in correct FK order. Tests pass real sub-family ids to `seedExercise`.
- **Files modified:** `el-templo-api/test/exercises/rebuild-progression-graph.test.ts`
- **Commit:** `71b04233`

## Known Stubs

None. This plan is a pure batch-constructor addition with full test coverage; no UI/data wiring involved.

## Deferred Issues

Out-of-scope, pre-existing typecheck diagnostics observed during the explicit (non-gate) `tsc` invocation, NOT caused by this task and NOT fixed:

- `src/modules/campaigns/templates.ts` — `mjml` has no declaration file (implicit any); plus an implicit-any parameter `e`. Surfaced only without the project's `skipLibCheck`/types resolution.
- `test/helpers.ts:321` — `id` specified more than once in an object spread (overwrite warning).

The project's defined gate `pnpm tsc --noEmit` does not flag these; they are noted for awareness only.

## Threat Flags

None beyond the plan's threat_model. T-126-03 (manual-edge tampering during rebuild) is mitigated by the `source='auto'`-scoped DELETE and asserted by Test C. No new network/auth/file surface introduced — internal batch over the internal catalog.

## Self-Check: PASSED

- Files: `rebuild-progression-graph.ts` FOUND, `rebuild-progression-graph.test.ts` FOUND.
- Commits `21a61063` and `71b04233` FOUND in git log.
