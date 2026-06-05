---
phase: 126-auto-construcci-n-del-grafo-dag-de-progresiones
plan: 01
subsystem: database
tags: [drizzle, mysql, migration, dag, skill-tree, exercise-progressions]

# Dependency graph
requires:
  - phase: 124-125
    provides: "exercises 3-dimension truth columns (subfamily_id, effort, dificultad_lineal) + exercise-dimension-proposals analog for table/migration shape"
provides:
  - "exercise_progressions Drizzle table — directed graph edges (from/to) with auto|manual source enum"
  - "Migration 0139 creating the table with two CASCADE FKs to exercises, edge UNIQUE, and 3 indexes"
  - "Persistence layer for Plan 02 (graph constructor) and Plan 03 (neighbor primitive + tests)"
affects:
  [
    126-02 graph constructor,
    126-03 neighbor primitive,
    127,
    128 manual overrides,
    131 in-session adjustment,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Regenerable edge table: source enum partitions auto (regenerated) vs manual (preserved) for non-destructive rebuild"
    - "Both endpoint FKs ON DELETE CASCADE — an edge is meaningless without both exercises"

key-files:
  created:
    - el-templo-api/src/db/schema/exercise-progressions.ts
    - el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "source enum (auto|manual) with default 'auto' so Plan 02 can DELETE/re-insert only auto edges, never touching manual (D-03)"
  - "Both from/to FKs ON DELETE CASCADE — edge has no historical weight, meaningless without both endpoints (T-126-01 mitigation)"
  - "UNIQUE on (from_exercise_id, to_exercise_id) backs the Plan 02 regenerate/dedupe (D-03)"
  - "Hand-written migration 0139 (NOT drizzle-kit generate) — drizzle meta journal desynced ~0059 while DB is past 0130"

patterns-established:
  - "Graph-edge table: id PK + two FKs to the same target table + source provenance enum + edge UNIQUE"

requirements-completed: [TREE-04]

# Metrics
duration: 2min
completed: 2026-06-05
---

# Phase 126 Plan 01: Persistencia del grafo de progresiones (DAG) Summary

**Created the `exercise_progressions` edge table (Drizzle + hand-written migration 0139) with auto|manual provenance and dual CASCADE FKs to exercises, laying the regenerable persistence layer for the v5.1 skill-tree DAG.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-05T02:23:25Z
- **Completed:** 2026-06-05T02:25:30Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Drizzle table `exerciseProgressions` with `exerciseProgressionSource` enum (auto|manual), two `exercises.id` FKs (CASCADE), edge UNIQUE, and from/to/source indexes.
- Hand-written additive migration `0139_create_exercise_progressions.sql` following all project safety rules; verified to apply cleanly against a throwaway MySQL DB (correct columns, indexes, CASCADE FKs with Drizzle-convention names).
- Barrel re-export wired in `schema/index.ts` directly after the `exercise-dimension-proposals` line.

## Task Commits

Both tasks committed atomically together (migration alongside schema per project memory rule):

1. **Task 1: Drizzle schema + barrel export** — `da096de8` (feat)
2. **Task 2 [BLOCKING]: Migration 0139 + applied/verified** — `da096de8` (feat)

**Plan metadata:** (final docs commit — see below)

## Files Created/Modified

- `el-templo-api/src/db/schema/exercise-progressions.ts` (created) — `exerciseProgressions` table + `exerciseProgressionSource` enum; the graph-edge persistence model.
- `el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql` (created) — additive CREATE TABLE with two CASCADE FKs to exercises, edge UNIQUE, three indexes.
- `el-templo-api/src/db/schema/index.ts` (modified) — added `export * from "./exercise-progressions";`.

## Verification

- `pnpm tsc --noEmit` passes (exit 0), no error referencing exercise-progressions.
- Migration safety script reports `MIGRATION_SAFE` (no separator in comments, no existence-guard DDL, both Drizzle FK names present).
- Migration applied against a throwaway MySQL DB confirms: 4 columns, `source` enum('auto','manual'), PRIMARY + edge UNIQUE + 3 indexes, both FKs with `DELETE_RULE=CASCADE` and the exact constraint names `exercise_progressions_(from|to)_exercise_id_exercises_id_fk`.

## Test DB Application Note

The project runs its integration suite in CI, not locally (per project policy + memory). The test databases are **ephemeral per-worker** (`eltemplo_test_<POOL_ID>`): `test/setup.ts` drops and recreates each worker DB and applies **all committed `.sql` migration files from scratch on every run** (the `_migrations` table is the source of truth). Therefore committing `0139` IS the mechanism by which it lands in the test DB — there is no persistent static test DB to `pnpm db:migrate` against. To avoid a false positive for Plans 02/03, I verified the DDL applies cleanly by running just this file (mimicking the runner's split-then-strip-comments logic) against a throwaway DB, then dropped it. The local `eltemplo` dev DB was intentionally NOT migrated (out of scope; dev migration is a separate operational action).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded migration comment to satisfy the safety verification script**

- **Found during:** Task 2 verification
- **Issue:** The `<automated>` safety script greps the whole file for `/if\s+not\s+exists/i`. My explanatory comment originally read "MySQL 8 inline IF NOT EXISTS support is version-flaky", which the regex matched (false positive) even though no DDL used a guard.
- **Fix:** Reworded the comment to "Statement-level existence guards are intentionally NOT used ... MySQL 8 inline guard support is version-flaky" — same meaning, no literal phrase. Re-ran the script: `MIGRATION_SAFE`.
- **Files modified:** `el-templo-api/src/db/migrations/0139_create_exercise_progressions.sql`
- **Commit:** `da096de8`

## Known Stubs

None. This plan is a pure persistence-layer addition; no UI/data wiring involved.

## Threat Flags

None beyond the plan's threat_model. T-126-01 (orphan/tamper edges) is mitigated by NOT NULL FKs + ON DELETE CASCADE on both endpoints. No new network/auth/file surface introduced.

## Self-Check: PASSED

- Files: `exercise-progressions.ts` FOUND, `0139_create_exercise_progressions.sql` FOUND, `index.ts` barrel export FOUND.
- Commit `da096de8` FOUND in git log.
