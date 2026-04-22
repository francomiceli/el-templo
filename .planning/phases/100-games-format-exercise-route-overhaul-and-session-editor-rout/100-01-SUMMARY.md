---
phase: 100
plan: 1
subsystem: api / db-schema
tags: [schema, migration, session-blocks, formats, games]
requires:
  - existing session_blocks table
  - existing formats table
provides:
  - session_blocks.custom_title column (nullable varchar(100))
  - formats row with name='games', type='technical'
affects:
  - el-templo-api/src/db/schema/session-blocks.ts
  - el-templo-api/src/db/migrations/0094_session_blocks_custom_title.sql (new)
  - el-templo-api/src/db/migrations/0095_insert_games_format.sql (new)
tech-stack:
  added: []
  patterns:
    - additive-nullable-column-for-backward-compat
    - hand-written-data-migration-with-where-not-exists-idempotency
key-files:
  created:
    - el-templo-api/src/db/migrations/0094_session_blocks_custom_title.sql
    - el-templo-api/src/db/migrations/0095_insert_games_format.sql
  modified:
    - el-templo-api/src/db/schema/session-blocks.ts
decisions:
  - Renumbered planned migrations 0092→0094 and 0093→0095 because 0091/0092 were claimed by Phase 98 and 0093 by Phase 99 before this plan executed
  - Used hand-written SQL for both migrations (matches Phase 86 precedent; drizzle-kit generate is interactive and doesn't emit data migrations anyway)
  - Applied the column ALTER and the INSERT to eltemplo_test manually, because the test DB is dropped+recreated per test run via drizzle-kit push + seedTestData, so it doesn't consume the _migrations runner
metrics:
  duration_minutes: ~30
  completed: 2026-04-22
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 100 Plan 1: Games Format + Custom Title Schema Foundation — Summary

## One-liner

Added nullable `session_blocks.custom_title varchar(100)` and inserted a `games` row into `formats` — the DB foundation downstream plans need for games-format authoring and INITIUM custom titles.

## Outcome

- Drizzle schema extended with `customTitle: varchar('custom_title', { length: 100 })` (no `.notNull()`, no default).
- Migration `0094_session_blocks_custom_title.sql` (ALTER TABLE, additive, idempotent-safe via runner) applied to `eltemplo` via `pnpm db:migrate`.
- Migration `0095_insert_games_format.sql` (@data-only, hand-written, `WHERE NOT EXISTS` idempotent) applied to `eltemplo` via `pnpm db:migrate`.
- Both changes manually applied to `eltemplo_test` for symmetry. Test DB is recreated each `pnpm test` run via `drizzle-kit push` + `seedTestData`, so the `custom_title` column re-appears automatically (schema push reads `session-blocks.ts`), and the `games` row is seeded per-test-file by `cleanAllTestData` + explicit INSERTs where needed.
- `pnpm typecheck` passes (no tsc output = success; drizzle-orm Select/Insert types now include `customTitle`).
- Full `pnpm test` run: **742 tests / 40 files, all pass**. Plan is backward-compatible — the nullable column does not break any existing code path.

## Tasks Executed

| Task | Description                                                           | Commit     | Files                                                                                                                   |
| ---- | --------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1    | Add `customTitle` column to `session_blocks` schema + apply migration | `ebd518c6` | `el-templo-api/src/db/schema/session-blocks.ts`, `el-templo-api/src/db/migrations/0094_session_blocks_custom_title.sql` |
| 2    | Hand-written data migration inserting the `games` format row          | `551eabbc` | `el-templo-api/src/db/migrations/0095_insert_games_format.sql`                                                          |

## Acceptance Criteria — Verification

- [x] Schema file carries `customTitle: varchar("custom_title", { length: 100 })` (nullable). _Note: prettier normalized single quotes → double quotes on commit; grep for `"custom_title"` returns 1._
- [x] Migration 0094 is additive `ALTER TABLE`, nullable column, no `DEFAULT`, no `NOT NULL` (grep for `NOT NULL|DEFAULT` returns 0).
- [x] Migration 0095 is hand-written data-only migration, idempotent via `WHERE NOT EXISTS`, inserts one `games` row.
- [x] `eltemplo.session_blocks` — `SHOW COLUMNS LIKE 'custom_title'` returns `custom_title varchar(100) YES NULL`.
- [x] `eltemplo_test.session_blocks` — same column exists (added manually after migration run; also re-created on every test run by `drizzle-kit push`).
- [x] `eltemplo.formats WHERE name='games'` — exactly 1 row, id=144, type=technical.
- [x] `eltemplo_test.formats WHERE name='games'` — exactly 1 row (manually re-inserted after post-test-run recreation).
- [x] `_migrations` table contains both `0094_session_blocks_custom_title.sql` and `0095_insert_games_format.sql`.
- [x] Re-running `pnpm db:migrate` is a no-op (`No new migrations to apply`).
- [x] `pnpm typecheck` passes (no `tsc --noEmit` output).
- [x] `pnpm test` — 742 tests across 40 files, all pass (backward compatibility confirmed).
- [x] No `drizzle-kit push` or `drizzle-kit migrate` used.

## Deviations from Plan

### 1. [Rule 3 — Blocking] Migration numbering collision — renumbered 0092→0094 and 0093→0095

**Found during:** Pre-execution context load.

**Issue:** Plan 100-01 instructed using `0092_session_blocks_custom_title.sql` and `0093_insert_games_format.sql`. Those slots were already taken: Phase 98 shipped `0091_multi_currency_and_country_scope.sql` and `0092_normalize_es_prices_to_whole_eur.sql`; Phase 99 shipped `0093_rename_level_at_completion_to_session_level.sql`.

**Fix:** Used the next sequential slots: `0094` and `0095`. Added a `Migration numbering note` comment inside each SQL file explaining the renumber, following the precedent set by `0093_rename_level_at_completion_to_session_level.sql`.

**Impact:** No semantic or runtime impact — the migration runner orders files lexically and tracks applied names, so the semantic meaning is preserved. Downstream plans (100-02 and beyond) must be aware the column exists regardless of filename.

### 2. [Formatter — Benign] Prettier normalized schema quote style from single to double quotes

**Found during:** Task 1 commit via husky + lint-staged.

**Issue:** The original file used single quotes (`varchar('custom_title', ...)`). The plan's acceptance grep pattern was `"customTitle: varchar('custom_title'"` (single-quote). Prettier rewrote the entire file to double-quoted strings per project style.

**Fix:** None required — the double-quoted style matches the rest of the codebase and is enforced by the pre-commit hook (CLAUDE.md documents this). Acceptance was re-verified with the double-quoted grep (`grep -c 'customTitle: varchar("custom_title"' … → 1`). The semantic requirement (nullable varchar(100) column named `custom_title`) is preserved.

**Impact:** None. This is exactly the behavior CLAUDE.md expects and is not a functional deviation.

### 3. [Implementation] Hand-wrote the ALTER migration instead of running `pnpm db:generate`

**Found during:** Task 1 execution planning.

**Issue:** The plan instructed running `pnpm db:generate` and renaming the output. Drizzle-kit generate is interactive for MySQL schemas with FK references (the codebase has had pain with this — see STATE precedent noted in the plan's Task 2 read_first). Running in a non-interactive AFK session risks hanging.

**Fix:** Hand-wrote `0094_session_blocks_custom_title.sql` with semantics that match what drizzle-kit would have produced (`ALTER TABLE session_blocks ADD custom_title varchar(100);`). Rationale: the plan itself documents this pattern under Task 2 (`This follows the Phase 86 manual-migration precedent`), and the same reasoning applies to the schema-driven additive change — the runtime source of truth is the `_migrations` DB table, not `meta/_journal.json`.

**Impact:** No runtime difference. The schema file is still the source-of-truth for TypeScript types (drizzle-orm infers `customTitle: string | null`). Removing the interactive step lets the AFK chain progress without stalling.

## Test DB Lifecycle Note

The test DB (`eltemplo_test`) is dropped and recreated on every `pnpm test` invocation by `test/setup.ts` (`globalSetup`), which runs `drizzle-kit push --force` against the TS schema and then seeds a minimal dataset via `seedTestData` (admin user, branches, spom_config only — no formats). Consequently:

- The `custom_title` column re-appears on every test run because it is in the Drizzle schema file.
- The `games` format row does NOT persist across test runs, but this is irrelevant: `cleanAllTestData` (in `test/helpers.ts`) deletes `formats` in `beforeEach`, and tests that need formats insert them explicitly. Plan 100-02 will cover test helpers for games-format test coverage.

This matches the existing pattern for every other seeded row (Acropolis, EMOM, etc.) — none of them persist across test runs either. The per-DB verification of `games_count=1` is only meaningful at the moment of migration application; steady-state in the test DB will show whatever the individual test has set up.

## Follow-ups (Out of Scope for This Plan)

- Plan 100-02: API serialization + Zod/JSON schema for `custom_title` field on session-block payloads; unit/integration tests for games format round-trip.
- Plan 100-03: Admin session editor — always-visible custom_title input + FormatParamsEditor `games` entry.
- Plan 100-04: PDF rendering of custom_title subtitle.
- Plan 100-05: Spanish route label mapping (admin + member duplicate), games route addition.

## Self-Check: PASSED

- File `el-templo-api/src/db/schema/session-blocks.ts` — FOUND, contains `customTitle: varchar("custom_title"`.
- File `el-templo-api/src/db/migrations/0094_session_blocks_custom_title.sql` — FOUND.
- File `el-templo-api/src/db/migrations/0095_insert_games_format.sql` — FOUND.
- Commit `ebd518c6` — FOUND in `git log`.
- Commit `551eabbc` — FOUND in `git log`.
- `eltemplo` DB — column present, games row present (id=144), both migrations in `_migrations`.
- `eltemplo_test` DB — column present, games row present (re-inserted post-test-run).
- `pnpm typecheck` — passed.
- `pnpm test` — 742/742 passed.
