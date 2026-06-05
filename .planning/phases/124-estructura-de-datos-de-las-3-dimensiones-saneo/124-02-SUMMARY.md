---
phase: 124-estructura-de-datos-de-las-3-dimensiones-saneo
plan: 02
subsystem: training-system / exercise-catalog
tags: [saneo, soft-merge, drizzle, exercise-tree, idempotent-script, v5.1]
requires:
  - phase: 124-01
    provides: "exercises.canonical_exercise_id (self-FK), exercises.route_pending (bool), migration 0137"
provides:
  - "saneo-exercises.ts — idempotent, non-destructive one-off CLI saneo of the exercise catalog"
  - "runSaneo(db) exported function: soft-merge exact dupes + detect/mark empty routes"
  - "Integration test contract (test/exercises/saneo-exercises.test.ts) covering A–E"
  - "TREE-05 structural coverage (dupes resolved by canonical pointer, routes detected)"
affects:
  - "125 (LLM bootstrap — populates dimensions on a saneado catalog)"
  - "126 (DAG graph — collapses dupes via canonical_exercise_id; excludes route_pending nodes)"
  - "131 (in-session adjustment — relies on clean chain, no garbage dupe nodes)"
tech-stack:
  added: []
  patterns:
    - "One-off tsx CLI maintenance script with exported testable core (runSaneo) + guarded CLI entrypoint (analog backfill-gender.ts)"
    - "Correlated UPDATE...JOIN derived-table soft-merge to MIN(id) canonical, guarded by IS NULL (idempotent)"
    - "import-safe CLI entrypoint guard (process.argv[1] ends-with check) so the test can import without spawning main()"
    - "Schema-generic runSaneo<TSchema>(db: MySql2Database<TSchema>) so both app.db and createSingleConnection() db are accepted without any"
key-files:
  created:
    - el-templo-api/saneo-exercises.ts
    - el-templo-api/test/exercises/saneo-exercises.test.ts
  modified: []
key-decisions:
  - "Saneo lives in a TS script (not migration SQL) so it reports dupe-group/empty-route counts BEFORE mutating, for human inspection"
  - "Exact-dupe key is exactly exercise + dificultad_lineal + route + effort (4 fields, D-06); distinct dificultad_lineal stays a separate chain step"
  - "Empty route detected as route = '' OR route IS NULL; literal placeholder tokens left as a documented TODO to confirm against prod, non-blocking (D-08)"
  - "runSaneo made schema-generic so it types-cleanly against both the bare connection db and the app's typed db without any"
patterns-established:
  - "Import-safe CLI: gate main().catch on process.argv[1].endsWith(scriptName) so importing the module for tests does not run the CLI"
  - "readCount() narrows a mysql2 [rows, fields] aggregate result without any (unknown + Array/object guards)"
requirements-completed: [TREE-05]
duration: ~12min
completed: 2026-06-05
---

# Phase 124 Plan 02: Saneo del catálogo de ejercicios Summary

**Authored an idempotent, zero-delete `saneo-exercises.ts` that soft-merges exact dupes to a MIN-id canonical pointer and detects/marks routeless exercises, with a real-MySQL integration test pinning the contract (A–E) — covering TREE-05 at the structural level without touching a single legacy field or row id.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2/2 (both `tdd="true"`)
- **Files created:** 2
- **Files modified:** 0

## Accomplishments

- **Soft-merge of exact dupes (D-06/D-07):** a correlated `UPDATE ... JOIN` derived table sets `canonical_exercise_id = MIN(id)` for every non-canonical row of each exact-dupe group (`exercise + dificultad_lineal + route + effort`), guarded by `canonical_exercise_id IS NULL`. Zero `DELETE`, zero `id` reassignment — historical FKs (`session_prescriptions.exercise_id`, `program_content_blocks.exercise_id`) stay intact.
- **Route detection + marking (D-08):** empty/placeholder routes flip `route_pending = 1`, guarded by `route_pending = 0`. The `route` column itself is never written — detection only; real assignment is deferred to 125/128.
- **Idempotent + reportable:** both writes no-op on a second run (Test D); the script prints the dupe-group and empty-route counts before mutating so a human can inspect before it runs against prod.
- **Testable core:** `runSaneo(db)` is exported and schema-generic, and the CLI entrypoint is import-safe (only runs when invoked directly), so the integration test drives it against the per-worker test DB without spawning a process.

## Task Commits

1. **Task 1: Integration test (RED)** — `87640a1c` (test) — covers A (soft-merge exact dupe), B (distinct step not collapsed), C (route marking), D (idempotency), E (FK-intact row count). RED confirmed: imports `runSaneo` from a not-yet-existing module.
2. **Task 2: saneo-exercises.ts (GREEN)** — `509e4415` (feat) — `runSaneo` + import-safe CLI entrypoint satisfying the contract.

_TDD ordering: test committed first (RED), implementation second (GREEN). No REFACTOR commit needed._

## Files Created/Modified

- `el-templo-api/saneo-exercises.ts` — one-off CLI saneo. `runSaneo(db)` does detect+report → soft-merge → route-mark, all idempotent and non-destructive. CLI entrypoint guarded so importing it (for tests) does not execute `main()`.
- `el-templo-api/test/exercises/saneo-exercises.test.ts` — real-MySQL integration test (CI-only) seeding exercises via Drizzle, asserting on `canonical_exercise_id`, `route_pending`, and row count across the 5 behaviors. Cleans up only its own seeded rows.

## Deviations from Plan

**1. [Rule 2 — Missing critical functionality] Import-safe CLI entrypoint guard**

- **Found during:** Task 2
- **Issue:** The analog `backfill-gender.ts` runs `main().catch(...)` unconditionally at module top level. Since Task 1's test _imports_ `runSaneo` from this module, an unconditional `main()` would open a real `createSingleConnection()` and run the saneo as a side effect of importing — corrupting the test's per-worker DB at import time.
- **Fix:** Gated the CLI invocation behind `if (process.argv[1] && process.argv[1].endsWith("saneo-exercises.ts"))` so `main()` runs only when the file is executed directly via `tsx`, never when imported by the test.
- **Files modified:** `el-templo-api/saneo-exercises.ts`
- **Commit:** `509e4415`

**2. [Rule 3 — Blocking issue] Schema-generic `runSaneo` signature**

- **Found during:** Task 2
- **Issue:** The test calls `runSaneo(app.db)` where `app.db` is `MySql2Database<typeof schema>`, while the CLI calls it with `createSingleConnection()`'s `MySql2Database<Record<string, never>>`. The two are invariant in `TSchema` — a single concrete generic argument would type-error against one caller.
- **Fix:** Made `runSaneo<TSchema extends Record<string, unknown>>(db: MySql2Database<TSchema>)` generic; both callers type cleanly, and no `any` is introduced (CLAUDE.md TS rule honored).
- **Files modified:** `el-templo-api/saneo-exercises.ts`
- **Commit:** `509e4415`

Note: the pre-commit lint-staged hook (Prettier) reflowed a few long `console.log` lines in `saneo-exercises.ts` (cosmetic only; logic identical).

## Verification

- `pnpm exec tsc --noEmit` (el-templo-api): exit 0 — the project's local gate (per project policy, the integration test runs in CI against real MySQL, not locally).
- Explicit type-check of the two new files (outside the `src/**`-only root tsconfig) confirms `runSaneo` resolves and types are sound; the earlier RED `Cannot find module '../../saneo-exercises'` is gone.
- Grep gates: zero DELETE / zero `SET id =` in executable SQL (the 3 literal matches are doc-comment prose explaining their absence); `canonical_exercise_id IS NULL` and `route_pending = 0` guards present; zero writes to `route`/`effort`/`position`/`level`/`dificultad_lineal`; zero `any`; `runSaneo` exported.
- The saneo was NOT executed against any database (per project policy — it runs intentionally later). Nothing pushed; commits stay local on `staging`.

## Threat Model Compliance

- **T-124-04 (Tampering / soft-merge UPDATE):** mitigated — exact 4-field dupe key (Test B proves a distinct step does NOT collapse); zero DELETE / id reassignment (Test E + grep gate).
- **T-124-05 (DoS / re-run):** mitigated — IS NULL / route_pending=0 guards → idempotent (Test D); counts printed before mutating for human inspection.
- **T-124-06 (Info Disclosure / console.log):** accept — one-off CLI script (analog backfill-gender.ts); no secrets printed.
- **T-124-SC:** N/A — no package installs (drizzle-orm/tsx already present).

No new threat surface introduced — no endpoints, no auth, no network; a standalone maintenance script only.

## Known Stubs

None. The script is fully implemented and idempotent. The empty `exercise_subfamilies` catalog and unpopulated `subfamily_id`/`leverage` are explicitly Phase 125 scope (not this plan), and the saneo intentionally does NOT write them (D-08/D-10). The "confirm literal placeholder route token against prod" TODO is a documented, non-blocking note (empty-string detection covers the schema-guaranteed case).

## Self-Check: PASSED

- FOUND: el-templo-api/saneo-exercises.ts
- FOUND: el-templo-api/test/exercises/saneo-exercises.test.ts
- FOUND commit 87640a1c
- FOUND commit 509e4415
