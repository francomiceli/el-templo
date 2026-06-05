---
phase: 125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n
plan: 01
subsystem: database
tags:
  [
    drizzle,
    mysql,
    migration,
    heuristic,
    exercises,
    skill-tree,
    bootstrap,
    cli,
    vitest,
  ]

# Dependency graph
requires:
  - phase: 124-estructura-de-datos-de-las-3-dimensiones-saneo
    provides: "exercises truth columns (subfamily_id, leverage, route, route_pending), exercise_subfamilies catalog, route_pending markers"
provides:
  - "exercise_dimension_proposals table (Drizzle schema + migration 0138) holding pending reviewable proposals"
  - "Idempotent heuristic CLI bootstrap-dimensions.ts exporting runBootstrap(db) — route->sub-family, name keyword->leverage, route guess only for route_pending"
  - "CI integration tests for the bootstrap contract (insert / idempotency / route_pending / nullable leverage / no-truth-write)"
affects: [126-graph-dag, 128-tree-editor, 125-02-profe-review-screen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reviewable-proposal table separate from truth columns (proposals never mutate exercises until a profe accepts)"
    - "Deterministic heuristic engine (route-code map + keyword matching), zero-dependency, no LLM/API"
    - "UNIQUE(exercise_id) + INSERT...WHERE NOT EXISTS for an idempotent/resumable one-off CLI"

key-files:
  created:
    - el-templo-api/src/db/schema/exercise-dimension-proposals.ts
    - el-templo-api/src/db/migrations/0138_create_exercise_dimension_proposals.sql
    - el-templo-api/bootstrap-dimensions.ts
    - el-templo-api/test/exercises/bootstrap-dimensions.test.ts
  modified:
    - el-templo-api/src/db/schema/index.ts

key-decisions:
  - "Engine is HEURISTIC, NO LLM/API (D-05): route-code->sub-family map + leverage keyword match; unmapped route codes fall back to the raw code so families still cluster"
  - "UNIQUE(exercise_id) on the proposals table backs the script NOT-EXISTS guard at the DB level (belt-and-suspenders idempotency)"
  - "proposed_route is guessed ONLY for route_pending=1 exercises; a routed exercise gets proposed_route = NULL (never overwrites an existing route)"
  - "Proposed-column widths mirror the 124 truth columns so the future accept flow never truncates"
  - "Migration 0138 committed but NOT applied to any DB; CI/prod pipeline applies it"

patterns-established:
  - "Heuristic proposal engine: documented const maps (ROUTE_TO_SUBFAMILY, LEVERAGE_KEYWORDS, NAME_TO_ROUTE_GUESS) keep the vocabulary in-code and auditable"
  - "One-off idempotent CLI: exported run*(db) + filename-guarded main().catch + report-before-mutate (analog saneo-exercises.ts / backfill-gender.ts)"

requirements-completed: [TREE-02]

# Metrics
duration: ~8min
completed: 2026-06-04
---

# Phase 125 Plan 01: Bootstrap (heurístico) — data layer + engine Summary

**`exercise_dimension_proposals` table (migration 0138) plus an idempotent, zero-dependency heuristic CLI (`runBootstrap`) that writes reviewable pending proposals (route→sub-family, name keyword→leverage, route guess only for `route_pending`) without ever touching the `exercises` truth columns.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-04T22:00 (approx, first task commit 22:03)
- **Completed:** 2026-06-04T22:06:16Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- New Drizzle model `exerciseDimensionProposals` + named status enum (`pending|accepted|rejected`), FK to `exercises` ON DELETE CASCADE, UNIQUE(exercise_id), status/route indexes; barrel re-export so Drizzle resolves the FK.
- Hand-written additive migration `0138_create_exercise_dimension_proposals.sql` following all project SQL conventions (no `;` in comments, no `IF NOT EXISTS`, Drizzle-convention FK name, documented rollback) — committed, NOT applied to any DB.
- Idempotent heuristic CLI `bootstrap-dimensions.ts` exporting `runBootstrap(db)`: deterministic `ROUTE_TO_SUBFAMILY` + `LEVERAGE_KEYWORDS` + `NAME_TO_ROUTE_GUESS` maps, `INSERT ... WHERE NOT EXISTS` backed by the UNIQUE constraint, writes only `pending` proposals, never any `exercises` truth column or `effort`.
- CI integration tests covering behaviors A–E (insert + mapping, idempotency, route_pending guess vs NULL, nullable leverage, no-truth-write).

## Task Commits

1. **Task 1: Proposals schema + barrel + migration 0138** - `4fc21a17` (feat)
2. **Task 2 (RED): bootstrap-dimensions contract tests A–E** - `cb8d1931` (test)
3. **Task 2 (GREEN): heuristic dimension bootstrap CLI** - `6efddeaf` (feat)

**Plan metadata:** _(this commit)_ `docs(125-01): complete plan`

_TDD task 2 split into test (RED) then feat (GREEN); REFACTOR not needed._

## Files Created/Modified

- `el-templo-api/src/db/schema/exercise-dimension-proposals.ts` - Drizzle model + status enum for pending proposals (created)
- `el-templo-api/src/db/migrations/0138_create_exercise_dimension_proposals.sql` - Additive CREATE TABLE migration (created, NOT applied)
- `el-templo-api/bootstrap-dimensions.ts` - Idempotent heuristic CLI exporting `runBootstrap` (created)
- `el-templo-api/test/exercises/bootstrap-dimensions.test.ts` - CI integration tests A–E (created)
- `el-templo-api/src/db/schema/index.ts` - Barrel re-export of the new schema (modified)

## Decisions Made

- **Heuristic, no LLM/API (D-05):** route already encodes the family, so a documented route-code→name map + leverage keyword match is deterministic and zero-cost. Unmapped route codes fall back to the raw upper-cased code so same-family proposals still cluster (the profe renames in review, D-04).
- **DB-enforced idempotency:** added a `uniqueIndex` on `exercise_id` (UNIQUE KEY in the migration) so "one live proposal per exercise" is enforced by the DB, backing the script's `WHERE NOT EXISTS` guard. The bootstrap inserts one row at a time so a mid-run failure is resumable (D-06).
- **route guess scoped to `route_pending`:** `proposed_route` is computed only for `route_pending=1` rows; a normally-routed exercise gets NULL, never overwriting an existing route (D-03).

## Deviations from Plan

None - plan executed exactly as written. (The `uniqueIndex` import was the correct Drizzle primitive for the plan's stated "UNIQUE index on `exercise_id`" decision — `index()` would have created a non-unique index; this is the plan's intent, not a deviation. Prettier reformatted three files on commit via lint-staged, no logic change.)

## Issues Encountered

- A doc comment originally stated the negative policy using the literal tokens `@anthropic-ai/sdk` / `ANTHROPIC_API_KEY`, which would trip the plan's `! grep -rq "anthropic\|ANTHROPIC_API_KEY"` verify gate. Reworded to "imports no AI SDK and reads no AI API key" — same documented intent, gate now passes with zero matches.

## Local verification (CI suite deferred per project policy)

- `cd el-templo-api && pnpm exec tsc --noEmit` → clean (both tasks).
- Migration: 0 `;` inside `--` comment lines; 0 `IF NOT EXISTS` in non-comment SQL; single `CREATE TABLE`; Drizzle-convention FK name with ON DELETE CASCADE.
- `bootstrap-dimensions.ts`: exports `runBootstrap`, filename-guarded CLI, documented const maps, 0 anthropic/AI-SDK references.
- The integration suite was NOT run locally (project policy — tests run in CI). Ask before pushing to staging for CI.

## User Setup Required

None - no external service configuration required. Migration 0138 is applied by the CI/prod pipeline, not manually.

## Next Phase Readiness

- Plan 02 (profe review screen + accept/reject service) can build on `exercise_dimension_proposals`: list/filter by route, accept writes the 124 truth columns (resolve-or-create `exercise_subfamilies`, set `exercises.subfamily_id` / `leverage` / `route` + `route_pending=0`), reject flips status only.
- **Blocker before any data exists:** migration 0138 must be applied (pipeline) and `bootstrap-dimensions.ts` run by a dev (`npx tsx bootstrap-dimensions.ts`) — neither was done in this plan per policy.
- Downstream (126 graph / 128 tree editor) read only CONFIRMED dimensions on `exercises`, never these pending proposals — the separate table enforces that boundary.

## Self-Check: PASSED

All 4 created files present on disk; all 3 task commits (`4fc21a17`, `cb8d1931`, `6efddeaf`) found in git history.

---

_Phase: 125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n_
_Completed: 2026-06-04_
