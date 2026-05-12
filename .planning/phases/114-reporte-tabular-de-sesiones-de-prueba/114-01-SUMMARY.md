---
phase: 114
plan: 01
subsystem: api/db
tags: [schema, migration, drizzle, leads, trial-sessions-report]
requires: []
provides:
  - users.lead_status enum column (en_seguimiento, cerrado, perdido)
  - users.lead_notes text column
  - users.created_by int self-ref FK with ON DELETE SET NULL
  - idx_users_lead_status, idx_users_created_by
affects:
  - el-templo-api/src/db/schema/users.ts
  - el-templo-api/src/db/migrations/0121_users_lead_fields.sql
  - el-templo-api/test/migrations/0121-users-lead-fields.test.ts
tech-stack:
  added:
    - none (no new packages)
  patterns:
    - Hand-written DDL migration (drizzle-kit journal desynced at 0059, DB at 0120 — same as 0107, 0108, 0111)
    - Drizzle self-ref FK via AnyMySqlColumn callback to break circular init
    - SQL comments without semicolons (project runner splits on ; before stripping --)
    - FK named to match Drizzle's auto-generated convention (users_created_by_users_id_fk) so a future db:generate run converges
key-files:
  created:
    - el-templo-api/src/db/migrations/0121_users_lead_fields.sql
    - el-templo-api/test/migrations/0121-users-lead-fields.test.ts
  modified:
    - el-templo-api/src/db/schema/users.ts
decisions:
  - "D-15..D-20 implemented as locked: lead_status enum nullable no default, lead_notes text nullable, created_by int nullable with self-ref FK ON DELETE SET NULL, two indexes, no backfill."
  - "Hand-wrote SQL rather than pnpm db:generate (drizzle meta journal at 0059, DB at 0120 — generator would either fail interactively or pollute the file with unrelated drift)."
  - "FK constraint named users_created_by_users_id_fk to match Drizzle's auto-naming convention so future generator runs converge."
metrics:
  tasks_completed: 3
  files_modified: 1
  files_created: 2
  completed_date: 2026-05-12
---

# Phase 114 Plan 01: users.lead_status / lead_notes / created_by schema migration Summary

Add three nullable lead lifecycle columns + two indexes + one self-referencing FK to the `users` table so downstream Plans 02-05 can wire the trial-sessions report (auto-stamp `created_by` and `lead_status='en_seguimiento'` on POST /admin/members/trial, flip to `cerrado` on conversion, render the tabular report, expose PATCH /admin/leads/:userId, populate the UI). Schema is the source of truth — no behavioral code in this plan.

## Tasks Completed

| Task | Name                                               | Commit   | Files                                                                                                 |
| ---- | -------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| T1   | Extend Drizzle schema with lead fields             | 50c1252e | el-templo-api/src/db/schema/users.ts                                                                  |
| T2   | Generate, sanitize, and apply migration 0121       | 50c1252e | el-templo-api/src/db/migrations/0121_users_lead_fields.sql (T1+T2 committed together per Plan step E) |
| T3   | Integration test for migration shape + idempotency | 2b6200cc | el-templo-api/test/migrations/0121-users-lead-fields.test.ts                                          |

## SQL Source: hand-written (not db:generate)

`pnpm db:generate` was NOT used. Drizzle's meta journal is at `0059_*` while the DB is at `0120_*` (same drift pattern observed by Phases 86, 90, 103-01, 111). Running the generator on this drift either fails interactively or emits unrelated drift. The plan anticipated this and prescribed hand-writing as Step B; that path was taken. The `users.ts` Drizzle schema is the canonical mirror.

## MySQL Version

Local dev DB: `8.0.45-0ubuntu0.22.04.1`. Inline `IF NOT EXISTS` on ADD COLUMN/INDEX is available in this version but was intentionally NOT used (project pattern: rely on the `_migrations` row for idempotency at the runner level, see precedents in 0108, 0111).

## Migration Applied (Local)

```
Applying: 0121_users_lead_fields.sql (6 statements)
  Applied successfully
Applied 1 migration(s)
```

DB state post-migration (verified directly):

- `users.lead_status` — `enum('en_seguimiento','cerrado','perdido')`, NULL=YES, Default=NULL.
- `users.lead_notes` — `text`, NULL=YES.
- `users.created_by` — `int`, NULL=YES.
- FK `users_created_by_users_id_fk` → `users(id)`, DELETE_RULE=`SET NULL`.
- Index `idx_users_lead_status` on `lead_status`.
- Index `idx_users_created_by` on `created_by`.
- `_migrations.name = '0121_users_lead_fields.sql'` row present (count=1).

## Self-Ref FK Note (Downstream Lesson)

The Drizzle self-reference is expressed as:

```ts
createdBy: int("created_by").references(
  (): AnyMySqlColumn => users.id,
  { onDelete: "set null" },
),
```

The explicit `AnyMySqlColumn` return type on the lazy callback is the canonical workaround for the circular-init TS error when a column references its own table. No alternative pattern (`as unknown as ...`, `// @ts-ignore`) was needed. `pnpm tsc --noEmit` is clean.

## Test Results

- `pnpm test test/migrations/0121-users-lead-fields.test.ts` → 7 tests, 7 passed (column shape × 3, FK + DELETE_RULE, index shape, drizzle round-trip insert/select with self-ref, `_migrations` row count = 1).
- `pnpm tsc --noEmit` → exit 0, no errors.

## Deviations from Plan

None — plan executed exactly as written. The hand-written SQL fallback (Step B) was taken as anticipated.

## Pre-existing Issues Observed (Out of Scope)

When running broader test suites (`pnpm test test/members test/migrations`), failures occurred unrelated to Plan 114-01:

1. **Untracked migration files in repo:** `0101_extend_tren_superior_full_body_4_weeks.sql` and `0102_replicate_tren_inferior_w12_to_w13.sql` are present in `el-templo-api/src/db/migrations/` but not git-tracked. They share filenames with previously-applied migrations of the same number. Worker DB provisioning emits errors like `Unknown column 'inactive_reason'` because subsequent migrations (0115) cannot apply cleanly when the filename order is corrupted. **Not caused by this plan** — files predate the session per the initial `git status`.

2. **Provisioning hook timeout (120s):** With the global setup dropping all `eltemplo_test_*` DBs at the start of a run, parallel workers each must apply 121 migrations from scratch in `beforeAll`, occasionally exceeding the 120s hook timeout under load. Environmental flakiness, not a regression.

Logged here for visibility — both are pre-existing and orthogonal to Plan 114-01.

## Downstream Unblocked

- **Plan 114-02:** Members service can now write `createdBy: request.user.userId` and `leadStatus: 'en_seguimiento'` at trial creation.
- **Plan 114-03:** Subscription create hook can flip `leadStatus = 'cerrado'` and prefix `leadNotes` with the plan name.
- **Plan 114-04:** PATCH `/api/admin/leads/:userId` has columns to update.
- **Plan 114-05:** Reports service can join/filter on the new columns + indexes.

## Self-Check: PASSED

- File `el-templo-api/src/db/schema/users.ts` exists and contains `leadStatusEnum`, `leadStatus`, `leadNotes`, `createdBy`, `idx_users_lead_status`, `idx_users_created_by`.
- File `el-templo-api/src/db/migrations/0121_users_lead_fields.sql` exists with 4 ALTER TABLE + 2 CREATE INDEX statements; no `;` inside `--` comment lines.
- File `el-templo-api/test/migrations/0121-users-lead-fields.test.ts` exists, 7 tests passing.
- Commit `50c1252e` present (`git log --oneline -3` confirms).
- Commit `2b6200cc` present (`git log --oneline -3` confirms).
- Local DB has post-migration shape verified.
- `_migrations` table contains `0121_users_lead_fields.sql` row.
