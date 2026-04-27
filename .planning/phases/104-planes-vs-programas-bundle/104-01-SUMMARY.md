---
phase: 104
plan: 01
subsystem: subscriptions / programs / users
tags: [schema, migration, foundation, blocking]
requires: []
provides:
  - subscription_plans.grants_all_programs (boolean column)
  - subscription_plans seed row "Todos los Programas" (id=29 in dev)
  - users.current_program_enrollment_id (nullable int FK)
affects:
  - el-templo-api/src/db/schema/subscription-plans.ts
  - el-templo-api/src/db/schema/users.ts
tech-stack:
  added: []
  patterns:
    - Hand-written SQL migrations applied via custom runner (run-migrations.ts)
    - Drizzle schema kept in lockstep with SQL but FK enforced at SQL level only
key-files:
  created:
    - el-templo-api/src/db/migrations/0103_subscription_plans_grants_all_programs.sql
    - el-templo-api/src/db/migrations/0104_seed_todos_los_programas_plan.sql
    - el-templo-api/src/db/migrations/0105_users_current_program_enrollment_id.sql
  modified:
    - el-templo-api/src/db/schema/subscription-plans.ts
    - el-templo-api/src/db/schema/users.ts
decisions:
  - Drizzle column for currentProgramEnrollmentId is plain int (no .references()) — FK lives in SQL only because db:push is not used in this project
  - Bundle plan seeded as plan_tier='other', booking_mode='flexible', plan_category='online_regular' per SPEC R2
  - No UNIQUE constraint added on subscription_plans.grants_all_programs — service layer enforces "single canonical bundle" via the seed row alone
metrics:
  duration: ~5 min
  tasks_completed: 3
  files_changed: 5
  completed_date: 2026-04-27
---

# Phase 104 Plan 01: Schema foundation for Planes vs Programas + Bundle — Summary

One-liner: Three SQL migrations and two Drizzle schema edits land the subscription_plans.grants_all_programs flag, the canonical "Todos los Programas" bundle seed row, and the users.current_program_enrollment_id pointer that downstream plans (02 service, 04 endpoints, 03 gating, 07 admin UI) depend on.

## What was built

### Migration 0103 — `subscription_plans.grants_all_programs`

```sql
ALTER TABLE `subscription_plans`
  ADD COLUMN `grants_all_programs` BOOLEAN NOT NULL DEFAULT FALSE;
```

Verified via `DESCRIBE subscription_plans`: column shows as `tinyint(1) NO  0` (NOT NULL, default 0). All pre-existing plans automatically default to false — no backfill required.

### Migration 0104 — Seed "Todos los Programas" bundle plan

Single `INSERT INTO subscription_plans` statement with the values locked by SPEC R2:

| Column                 | Value                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| `name`                 | `'Todos los Programas'`                                             |
| `description`          | `'Acceso a todos los programas virtuales activos durante 30 dias.'` |
| `plan_tier`            | `'other'`                                                           |
| `booking_mode`         | `'flexible'`                                                        |
| `plan_category`        | `'online_regular'`                                                  |
| `linked_program_id`    | `NULL`                                                              |
| `price_regular`        | `20000`                                                             |
| `price_zero`           | `20000`                                                             |
| `duration_days`        | `30`                                                                |
| `country` / `currency` | `'AR'` / `'ARS'`                                                    |
| `is_active`            | `TRUE`                                                              |
| `grants_all_programs`  | `TRUE`                                                              |

Verified — exactly 1 row exists in the dev DB with `grants_all_programs=TRUE` (id=29).

### Migration 0105 — `users.current_program_enrollment_id`

```sql
ALTER TABLE `users`
  ADD COLUMN `current_program_enrollment_id` INT NULL,
  ADD CONSTRAINT `fk_users_current_program_enrollment`
    FOREIGN KEY (`current_program_enrollment_id`)
    REFERENCES `program_enrollments`(`id`)
    ON DELETE SET NULL;
```

Verified via `DESCRIBE users` (`int YES MUL NULL`) and information_schema lookup confirming the FK constraint is in place pointing at `program_enrollments(id)`.

### Drizzle schema updates

- `el-templo-api/src/db/schema/subscription-plans.ts`: added `grantsAllPrograms: boolean("grants_all_programs").default(false).notNull()` between `currency` and `createdAt`.
- `el-templo-api/src/db/schema/users.ts`: added `currentProgramEnrollmentId: int("current_program_enrollment_id")` (plain nullable int, no `.references()` — FK lives in SQL only because `db:push` is not used in this project) between `convertedAt` and `createdAt`.

## Migration runner output (apply step)

```
Applying: 0101_extend_tren_superior_full_body_4_weeks.sql (6 statements)
  Applied successfully
Applying: 0102_replicate_tren_inferior_w12_to_w13.sql (3 statements)
  Applied successfully
Applying: 0103_subscription_plans_grants_all_programs.sql (1 statements)
  Applied successfully
Applying: 0104_seed_todos_los_programas_plan.sql (1 statements)
  Applied successfully
Applying: 0105_users_current_program_enrollment_id.sql (1 statements)
  Applied successfully
Applied 5 migration(s)
```

Re-running `pnpm db:migrate` is a no-op (`No new migrations to apply`) — idempotency confirmed via the `_migrations` tracker table.

Note: 0101 and 0102 were unapplied untracked migrations from a prior session; they applied cleanly alongside the three new ones. They are unrelated to phase 104 (tren superior / tren inferior content extensions).

## Commits

| Task | Commit     | Message                                                         |
| ---- | ---------- | --------------------------------------------------------------- |
| 1    | `3ab44c6c` | feat(104-01): add subscription_plans.grants_all_programs column |
| 2    | `2180d4fa` | feat(104-01): seed 'Todos los Programas' bundle plan            |
| 3    | `7fe49664` | feat(104-01): add users.current_program_enrollment_id pointer   |

## Verification results

- `pnpm build` (tsc) — clean, no errors after both schema edits.
- `pnpm db:migrate` — applied 5 migrations cleanly, then idempotent on re-run.
- `DESCRIBE subscription_plans` shows `grants_all_programs tinyint(1) NO ... 0`.
- `DESCRIBE users` shows `current_program_enrollment_id int YES MUL NULL`.
- `SELECT COUNT(*) FROM subscription_plans WHERE grants_all_programs = TRUE` returns 1 (id=29).
- `information_schema.KEY_COLUMN_USAGE` confirms `fk_users_current_program_enrollment` → `program_enrollments(id)`.
- No SQL comment line in any of the three migrations contains `;` (runner constraint respected).

## Deviations from Plan

None — plan executed exactly as written.

The plan's `<verify>` block referenced `pnpm typecheck`, which does not exist in this workspace. Used `pnpm build` (which runs `tsc`) — equivalent and project-standard. This is a documentation nit in the plan, not a code deviation.

The orchestrator hint suggested verifying against `eltemplo_test`, but that database does not exist locally (presumably created on demand by the test harness). Verification ran against the dev DB `eltemplo` instead — the schema/seed are now in dev and the migrations will run identically against `eltemplo_test` when tests bootstrap.

## Known Stubs

None.

## Threat Flags

None — schema-only plan, no new endpoints, no new auth surface.

## Self-Check: PASSED

- File `el-templo-api/src/db/migrations/0103_subscription_plans_grants_all_programs.sql` — FOUND
- File `el-templo-api/src/db/migrations/0104_seed_todos_los_programas_plan.sql` — FOUND
- File `el-templo-api/src/db/migrations/0105_users_current_program_enrollment_id.sql` — FOUND
- Schema edit in `el-templo-api/src/db/schema/subscription-plans.ts` — FOUND (line 50)
- Schema edit in `el-templo-api/src/db/schema/users.ts` — FOUND (line 92)
- Commit `3ab44c6c` — FOUND
- Commit `2180d4fa` — FOUND
- Commit `7fe49664` — FOUND
