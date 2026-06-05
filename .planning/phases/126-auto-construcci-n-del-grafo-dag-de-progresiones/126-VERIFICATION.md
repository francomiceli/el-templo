---
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
verified: 2026-06-05T03:30:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the integration test suite in CI by pushing to staging"
    expected: "All tests in rebuild-progression-graph.test.ts (A, A2, B, C, D, E, F, G, WR-04, WR-05) and exercise-progression-service.test.ts (A, B, C, D, E, F, F2, G, H, I) pass against real MySQL"
    why_human: "Project policy: integration suite runs in CI, not locally. Tests require real MySQL with the exercise_progressions table from migration 0139. Local gate (pnpm tsc --noEmit) passes but runtime contracts require CI execution."
---

# Phase 126: Auto-construcción del grafo (DAG) de progresiones — Verification Report

**Phase Goal:** El sistema construye automáticamente el grafo ramificado (DAG) de progresiones de ejercicios a partir del orden del SPOM/`dificultadLineal` y las 3 dimensiones ya estructuradas, sin que nadie cablee aristas a mano. End state: existe un grafo navegable donde cada ruta contiene sus sub-familias paralelas ordenadas por palanca y contracción, regenerable de forma determinística, y para cualquier ejercicio se puede resolver su vecino un escalón arriba/abajo en su cadena (ruta × contracción) — la primitiva que consumirá el Eje 3.

**Verified:** 2026-06-05T03:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| #    | Truth                                                                                                                                                     | Status   | Evidence                                                                                                                                                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | Existe un grafo (DAG) de progresiones donde cada ruta contiene sus sub-familias paralelas                                                                 | VERIFIED | `exercise_progressions` table (schema + migration 0139) + `runRebuildProgressionGraph` constructor writes consecutive edges per (subfamily × effort) partition. Schema file line 40, migration line 44.                                             |
| SC-2 | Dentro de cada sub-familia, los nodos están ordenados por palanca y contracción de forma consistente con el orden del SPOM                                | VERIFIED | Constructor partitions by `subfamilyId\|effort` (effort = contraction axis D-04), sorts each partition by `dl` ascending with stable `id` tiebreak (D-05). `rebuild-progression-graph.ts` lines 124-148.                                            |
| SC-3 | El grafo se regenera de forma determinística a partir de los datos, no de una lista cableada a mano                                                       | VERIFIED | Transaction-scoped DELETE WHERE source='auto' + bulk INSERT (lines 100-111) regenerates only auto edges. Manual edges survive (D-03). Test B (idempotency) and Test C (manual-preserved) encode this contract.                                      |
| SC-4 | Para cualquier ejercicio del grafo se puede resolver su vecino un escalón arriba/abajo dentro de su cadena (ruta × contracción) — primitiva para el Eje 3 | VERIFIED | `ExerciseProgressionService.getNeighbor(exerciseId, direction)` exists, does an adjacency lookup over `exercise_progressions` (D-03 — NOT catalog re-derivation), fixes effort/contraction (D-04), returns null at chain ends (D-05). Lines 86-209. |

**Score:** 4/4 truths verified

---

### Critical Decision D-03 Verification (WR-01 fix)

The code review identified that the original `getNeighbor` re-derived adjacency from the `exercises` catalog, contradicting D-03 ("la primitiva vecino = lookup de adyacencia sobre esta tabla") and making manual phase-128 edges invisible.

**Current code (commit a5d0a227) — VERIFIED as fixed:**

`exercise-progression-service.ts` lines 124-137 perform an explicit adjacency lookup over `schema.exerciseProgressions`:

- `up`: selects `toExerciseId` from rows where `fromExerciseId = target.id`
- `down`: selects `fromExerciseId` from rows where `toExerciseId = target.id`

The service header (lines 1-31) documents this explicitly: "getNeighbor resolves the neighbor by walking the PERSISTED exercise_progressions graph (NOT by re-deriving order from the exercises catalog)."

Test H (`exercise-progression-service.test.ts` lines 372-415) encodes the D-03 contract: after replacing the auto edge b→c with a manual edge a→c, `getNeighbor(c,'down')` must return `a` (the manual override) and NOT `b` (what catalog re-derivation would return). This test would fail under the pre-fix implementation.

---

### Required Artifacts

| Artifact                                                                          | Expected                                                                                                 | Status   | Details                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/exercise-progressions.ts`                            | Drizzle table definition + source enum for graph edges                                                   | VERIFIED | Exports `exerciseProgressions` table and `exerciseProgressionSource` enum; both FKs to `exercises.id` with CASCADE; edge UNIQUE; 3 indexes. Lines 20-61.                                                                  |
| `el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql`           | Hand-written additive CREATE TABLE migration                                                             | VERIFIED | Contains `CREATE TABLE exercise_progressions`, both FK constraint names match Drizzle convention, no semicolons in comments, no IF NOT EXISTS guard. Migration safety script: MIGRATION_SAFE.                             |
| `el-templo-api/rebuild-progression-graph.ts`                                      | Exported `runRebuildProgressionGraph(db)` batch constructor + CLI entry                                  | VERIFIED | Exports the function with generic TSchema signature (line 62); CLI entry guarded by `process.argv[1]` check (lines 207-215); partitions by (subfamily × effort), sorts by dl+id, writes inside transaction.               |
| `el-templo-api/test/exercises/rebuild-progression-graph.test.ts`                  | Integration test for backbone, idempotency, manual-preservation, effort-not-crossed, exclusion, tiebreak | VERIFIED | Tests A, A2, B, C, D, E, F present + 3 unit tests (WR-04, WR-05, existing contract). After-each cleanup in FK order. No fake timers. Imports `runRebuildProgressionGraph` and `readExerciseNodes`.                        |
| `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts` | `ExerciseProgressionService.getNeighbor(exerciseId, direction)` runtime adjacency primitive              | VERIFIED | DI-by-constructor class; `getNeighbor(number, "up" \| "down"): Promise<ExerciseCandidate \| null>`; adjacency lookup over `exercise_progressions`; effort fixed via `asContraction()` guard; explicit null at chain ends. |
| `el-templo-api/test/exercises/exercise-progression-service.test.ts`               | Integration test for up/down neighbor, chain-end null, effort-fixed, tiebreak, NULL-subfamily exclusion  | VERIFIED | Tests A–I (9 tests) present, including WR-02 regression (F2), D-03 manual-edge (H), WR-03 empty-effort (I). Imports `ExerciseProgressionService` and seeds edges via the persisted table.                                 |

### Key Link Verification

| From                                     | To                                              | Via                                                                                                 | Status   | Details                                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/db/schema/index.ts`   | `exercise-progressions.ts`                      | barrel re-export                                                                                    | VERIFIED | Line 14: `export * from "./exercise-progressions";` — directly after the `exercise-dimension-proposals` export (line 13) as specified.                                                                                        |
| `exercise_progressions.fromExerciseId`   | `exercises.id`                                  | FK constraint                                                                                       | VERIFIED | Schema: `.references(() => exercises.id, { onDelete: "cascade" })`. Migration: `CONSTRAINT exercise_progressions_from_exercise_id_exercises_id_fk FOREIGN KEY (from_exercise_id) REFERENCES exercises(id) ON DELETE CASCADE`. |
| `exercise_progressions.toExerciseId`     | `exercises.id`                                  | FK constraint                                                                                       | VERIFIED | Same pattern with `to_exercise_id` constraint named `exercise_progressions_to_exercise_id_exercises_id_fk`.                                                                                                                   |
| `rebuild-progression-graph.ts`           | `exercise_progressions (source=auto)`           | DELETE auto then bulk INSERT inside transaction                                                     | VERIFIED | Lines 100-111: `db.transaction(async (tx) => { tx.execute(sql\`DELETE ... WHERE source = 'auto'\`); for each edge: tx.execute(INSERT ... 'auto') })`                                                                          |
| `rebuild-progression-graph.ts`           | `exercises (canonical, confirmed)`              | SELECT WHERE subfamily_id IS NOT NULL AND canonical_exercise_id IS NULL AND effort IN (CON/EXC/ISO) | VERIFIED | Lines 73-79 — READ filter includes WR-04 fix (effort IN clause).                                                                                                                                                              |
| `ExerciseProgressionService.getNeighbor` | `exercise_progressions`                         | adjacency lookup (D-03 — table, not catalog)                                                        | VERIFIED | Lines 124-137: selects directly from `schema.exerciseProgressions` by `fromExerciseId` or `toExerciseId`. This is the D-03 / WR-01 critical fix confirmed in code.                                                            |
| `ExerciseProgressionService`             | `ExerciseCandidate` (from exercise-fallback.ts) | import, not redefinition (D-06)                                                                     | VERIFIED | Line 37: `import type { ExerciseCandidate } from "../fallback/exercise-fallback";` — no local redefinition of the shape.                                                                                                      |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces backend batch tooling and a query primitive. No UI rendering or dynamic data display. The data flows are: exercises catalog → constructor → `exercise_progressions` table → `getNeighbor` → `ExerciseCandidate`. All wiring is verified above.

### Behavioral Spot-Checks

| Behavior                                         | Command                                               | Result                                 | Status |
| ------------------------------------------------ | ----------------------------------------------------- | -------------------------------------- | ------ |
| TypeScript gate                                  | `pnpm tsc --noEmit`                                   | Exit 0 (no output)                     | PASS   |
| Migration safety                                 | Node inline safety script                             | `MIGRATION_SAFE`                       | PASS   |
| `exerciseProgressionSource` exported from barrel | `grep "exercise-progressions" src/db/schema/index.ts` | Line 14 match                          | PASS   |
| No `any` type in service                         | `grep -n "any\b"` in `.ts` files                      | Only comment references, no type usage | PASS   |
| No `console.log` in service (server module)      | `grep -n "console.log"` in service                    | 0 results; uses `this.log?.debug()`    | PASS   |
| No debt markers (TBD/FIXME/XXX)                  | `grep -n "TBD\|FIXME\|XXX"`                           | 0 results across all 3 source files    | PASS   |

### Probe Execution

Not applicable — phase 126 has no probe scripts. The integration tests serve as the CI-executed proof.

### Requirements Coverage

| Requirement | Source Plan            | Description                                                                                             | Status    | Evidence                                                                                                                                                                                                                                     |
| ----------- | ---------------------- | ------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TREE-04     | 126-01, 126-02, 126-03 | Auto-construir el grafo ramificado (DAG) desde el orden del SPOM/`dificultadLineal` + las 3 dimensiones | SATISFIED | `exercise_progressions` table (persistence), `runRebuildProgressionGraph` (auto backbone), `getNeighbor` (neighbor primitive) — all 3 components implement TREE-04 end-to-end. Runtime behavior confirmed by integration tests (pending CI). |

### Anti-Patterns Found

No blocking anti-patterns.

| File                           | Line    | Pattern                                                     | Severity | Impact                                                      |
| ------------------------------ | ------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------- |
| `rebuild-progression-graph.ts` | 104-109 | Per-edge INSERT loop inside transaction (IN-02 from review) | Info     | Performance only; correctness is fine. Not a blocker.       |
| `exercise-progressions.ts`     | 59      | Low-cardinality `source` index (IN-01 from review)          | Info     | Minor write overhead; no correctness impact. Not a blocker. |

Both Info items were noted in the code review (IN-01, IN-02) and accepted as non-blocking.

### Human Verification Required

#### 1. Integration Test Suite in CI

**Test:** Push the staging branch to `origin/staging` and allow the CI pipeline to run the full integration suite.

**Expected:** All tests in `rebuild-progression-graph.test.ts` (tests A, A2, B, C, D, E, F, G plus 3 unit tests for WR-04/WR-05) and `exercise-progression-service.test.ts` (tests A, B, C, D, E, F, F2, G, H, I) pass against real MySQL with the `exercise_progressions` table created by migration 0139.

**Why human:** Project policy explicitly prohibits running the integration suite locally (CLAUDE.md + memory: "no correr el suite de tests local — cuando los tests estén listos, avisar y preguntar para pushear a staging y que corra CI ahí"). The local gate (`pnpm tsc --noEmit`) passes and confirms the contracts are correctly typed, but the runtime correctness of the SQL queries against real MySQL (adjacency lookup, transaction scoping, FK cascade, idempotency) requires CI execution. This applies to all 3 test files added in this phase.

---

## Gaps Summary

No gaps. All 4 ROADMAP success criteria are observably implemented in the code:

1. The `exercise_progressions` table (DAG edges) exists with schema, migration, and barrel export.
2. The `runRebuildProgressionGraph` constructor deterministically builds the linear backbone per (subfamily × effort), sorted by `dificultadLineal` + `id` tiebreak, writing only `source='auto'` edges.
3. The constructor is regenerable: DELETE auto + re-INSERT inside a transaction, never touching `source='manual'` edges. The `source` enum enforces the distinction.
4. `ExerciseProgressionService.getNeighbor` resolves the adjacent exercise by walking the persisted `exercise_progressions` table (not re-deriving from catalog) — D-03 is correctly implemented after commit a5d0a227 fixed the WR-01 deviation. Effort/contraction is fixed (D-04), chain ends return null (D-05), `ExerciseCandidate` is reused not redefined (D-06).

All 5 code-review warnings (WR-01 through WR-05) are fixed: commits a5d0a227 (getNeighbor adjacency over table, asContraction guard) and 48b6f211 (effort IN filter + NaN-dl skip in constructor).

The only outstanding item is CI execution of the integration tests, which is a project-policy gate, not a code defect.

---

_Verified: 2026-06-05T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
