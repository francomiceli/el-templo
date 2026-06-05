---
phase: 124-estructura-de-datos-de-las-3-dimensiones-saneo
plan: 01
subsystem: training-system / exercise-catalog
tags: [schema, migration, drizzle, exercise-tree, v5.1]
requires: []
provides:
  - "exercise_subfamilies catalog table (gesto/sub-familia node, D-01)"
  - "exercises.subfamily_id nullable FK to the sub-family catalog"
  - "exercises.leverage nullable varchar (palanca, per-family vocabulary)"
  - "exercises.canonical_exercise_id nullable self-FK (soft-merge pointer, D-07)"
  - "exercises.route_pending boolean marker for saneo route detection (D-08)"
  - "migration 0137 (additive DDL, reversible, idempotent)"
affects:
  - "el-templo-api/src/db/schema/exercises.ts"
  - "el-templo-api/src/db/schema/index.ts (barrel)"
tech-stack:
  added: []
  patterns:
    - "Self-referencing FK via AnyMySqlColumn thunk (refresh-tokens idiom)"
    - "Hand-written additive migration tracked by _migrations (no IF NOT EXISTS, no ; in comments)"
    - "First-class catalog/lookup table for a tree node (routes/gladius-products shape)"
key-files:
  created:
    - el-templo-api/src/db/schema/exercise-subfamilies.ts
    - el-templo-api/src/db/migrations/0137_exercise_dimensions_and_saneo.sql
  modified:
    - el-templo-api/src/db/schema/exercises.ts
    - el-templo-api/src/db/schema/index.ts
decisions:
  - "leverage modeled as nullable varchar(50), NOT a global enum (D-03/D-05)"
  - "canonical_exercise_id + route_pending added in 124 as schema only; the saneo writes (pointers/flags) are deferred to Plan 02 TS script"
  - "Migration is pure additive DDL: zero row mutations, so historical FKs (session_prescriptions, program_content_blocks) stay intact (D-07)"
metrics:
  duration: ~6min
  completed: 2026-06-05
---

# Phase 124 Plan 01: Estructura de datos de las 3 dimensiones Summary

Created the bedrock schema for the v5.1 skill tree: a first-class `exercise_subfamilies` catalog plus four new structured columns on `exercises` (sub-family FK, nullable `leverage`, canonical self-pointer, route-pending marker), shipped as a single additive/reversible migration 0137 — without touching any legacy dimension field. Covers TREE-01.

## What Was Built

- **`exercise_subfamilies` catalog** (`exercise-subfamilies.ts`): id / route (varchar 20, mirrors `exercises.route`) / name / sort_order, indexed by route. The gesto dimension as a first-class node so the editor (128) and graph (126) can reorder/reference it (D-01). Empty/minimal in 124 (D-10); populated by the bootstrap (125).
- **`exercises` new columns** (`exercises.ts`): `subfamilyId` (nullable FK → catalog), `leverage` (nullable varchar 50, per-family vocabulary, not a global enum — D-03/D-05), `canonicalExerciseId` (nullable self-FK via `AnyMySqlColumn` thunk, soft-merge pointer — D-07), `routePending` (boolean default false, saneo route marker — D-08). Two new indexes (`exercises_subfamily_idx`, `exercises_canonical_idx`) appended; existing indexes preserved.
- **Barrel** (`index.ts`): re-exports `./exercise-subfamilies` so Drizzle resolves the FK.
- **Migration 0137** (hand-written, additive): `CREATE TABLE exercise_subfamilies` + 4 `ADD COLUMN` + 2 `ADD CONSTRAINT` (Drizzle naming convention) + 2 `CREATE INDEX`. Exactly 9 statements, no `;` in comments, no `IF NOT EXISTS`, reversible (rollback documented in header). No data backfill — saneo writes deferred to Plan 02.

The 3 dimensions now read as structured data: gesto via `subfamily_id` FK, palanca via `leverage`, contracción via the existing `effort` field (reused, D-02). `position` stays intact as legacy (D-11).

## Deviations from Plan

None — plan executed exactly as written. The pre-commit lint-staged hook (Prettier) reformatted the multi-line `.references(...)` calls in `exercises.ts` (cosmetic only; content identical).

## Verification

- `pnpm exec tsc --noEmit` (el-templo-api): exit 0, no errors — the `AnyMySqlColumn` thunk avoids the circular self-FK type error.
- Migration gate: exactly 9 non-comment `;`-terminated statements; zero `;` inside `--` comments; zero `IF NOT EXISTS`.
- `grep -c "canonicalExerciseId\|subfamilyId\|routePending\|leverage" exercises.ts` = 6 (>= 4).
- Diff confirms `position`/`effort`/`level`/`dificultad_lineal`/`route` lines unmodified.
- Migration NOT applied to any DB (per project policy — applies in CI/prod via pipeline).

## Threat Model Compliance

- **T-124-01 (DoS / migration):** mitigated — no `;` in comments (verified), no `IF NOT EXISTS`, tracked by `_migrations` filename.
- **T-124-02 (Tampering / historical FKs):** mitigated — migration is pure additive DDL, zero DELETE/UPDATE of existing rows; canonical pointers deferred to Plan 02 with IS NULL guards.
- **T-124-03 (Rollback):** accepted — additive + reversible, rollback documented in SQL header.
- **T-124-SC:** N/A — no package installs.

No new threat surface introduced (DDL only, no endpoints/auth/network).

## Commits

- `f28f7fb7` feat(124-01): exercise_subfamilies catalog + 3-dimension columns on exercises
- `f9d267b5` feat(124-01): migration 0137 — additive DDL for 3-dimension structure

## Known Stubs

None. The empty/minimal `exercise_subfamilies` catalog and the unwritten `canonical_exercise_id`/`route_pending` values are intentional structure-only state (D-10); population + saneo writes are explicitly Plan 02 and Phase 125, not stubs.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/schema/exercise-subfamilies.ts
- FOUND: el-templo-api/src/db/migrations/0137_exercise_dimensions_and_saneo.sql
- FOUND commit f28f7fb7
- FOUND commit f9d267b5
