---
phase: 137-m-quina-de-estados-de-validaci-n-cimiento
plan: 01
subsystem: finance
tags: [validation, ledger, migration, firm-money, audit-log]
requires:
  - financial_transactions (v4.8 ledger, soft-void axis)
  - audit-log helper (phase 111)
provides:
  - financial_transactions.validation_status (enum, orthogonal to soft-void)
  - migration 0153 (backfill DEFAULT 'validado')
  - firmMoneyConditions() / FIRM_MONEY_SQL (canonical firm-money predicate)
  - AuditAction transaction_validated/observed/corrected
  - Wave 0 test scaffolds (validation-state, validation-regression)
affects:
  - plan 02 (validate/observe/correct/void state machine)
  - plan 03 (refactor 14 call sites + regression gate)
tech-stack:
  added: []
  patterns:
    - "Orthogonal enum axis (validation_status) alongside soft-void (voided_at)"
    - "Single-source-of-truth predicate helper (firm-money.ts), two forms (Drizzle + raw-SQL)"
    - "Additive ALTER + DEFAULT backfill (non-destructive, zero number drift)"
key-files:
  created:
    - el-templo-api/src/db/migrations/0153_validation_status.sql
    - el-templo-api/src/modules/finance/firm-money.ts
    - el-templo-api/test/finance/validation-state.test.ts
    - el-templo-api/test/finance/validation-regression.test.ts
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/modules/shared/audit-log.ts
decisions:
  - "Migration 0153 hand-written instead of drizzle-kit generate (generate prompted for unrelated sessions.goal_plan_type schema drift; runner reads .sql by name + _migrations table is source of truth, so hand-written SQL is correct and avoids dragging unrelated drift)"
  - "firm-money.ts excludes direction/kind (caller-specific); only validation_status='validado' is the shared new predicate (per research call-site audit)"
  - "audit-log reused (D-08), no validation_events table"
metrics:
  duration: ~12min
  completed: 2026-06-24
---

# Phase 137 Plan 01: Máquina de estados de validación (cimiento) Summary

Data foundation for the validation state machine: orthogonal `validation_status` enum on `financial_transactions` (migration 0153, backfill `validado`), the canonical firm-money predicate helper, the 3 new audit action types, and the Wave 0 RED-ready test scaffolds plans 02/03 will fill.

## What Was Built

**Task 1 — `validation_status` column + migration 0153** (`7a55ec81`)

- Added `validationStatus: mysqlEnum("validation_status", ["pendiente","observado","corregido","validado"]).default("validado").notNull()` to `financial-transactions.ts`, after `voidReason` — a new axis orthogonal to the soft-void triplet.
- Added composite index `idx_financial_tx_validation_voided` on `(validation_status, voided_at)` for the firm-money read path.
- Hand-wrote `0153_validation_status.sql`: `ADD COLUMN ... DEFAULT 'validado'` + `ADD INDEX`. The `DEFAULT 'validado'` backfills all historical rows, so the 6 v5.0 management metrics keep identical numbers (VAL-05). No `;` inside SQL comments (em-dashes used). Enum order matches schema byte-for-byte.

**Task 2 — canonical firm-money helper + audit types** (`e85263f4`)

- Created `firm-money.ts` exporting `firmMoneyConditions(): SQL[]` (returns `[isNull(voidedAt), eq(validationStatus,'validado')]` for Drizzle call sites) and `FIRM_MONEY_SQL` (static string `voided_at IS NULL AND validation_status = 'validado'` for the 3 raw-SQL sites). `direction`/`kind` deliberately excluded — they stay caller-specific; the one new shared predicate is `validation_status='validado'`. This is the single place the firm-money predicate is expressed.
- Extended `AuditAction` with `transaction_validated`, `transaction_observed`, `transaction_corrected` (D-08, reusing audit-log; no new table). `AuditTargetKind` untouched (`transaction` already exists).

**Task 3 — Wave 0 test scaffolds** (`81a80009`)

- `validation-state.test.ts`: `it.todo` for validate/observe/correct/void, `keepMembershipActive`, RBAC (coach cannot validate/void), role→status derivation, and VAL-01 coexistence (a validado can still be voided). Plan 02 fills these.
- `validation-regression.test.ts`: `it.todo` R1-R4 (PENDIENTE doesn't move firm cash, validate adds it, 6 metrics identical after backfill, PENDIENTE settles balances). Plan 03 fills these.
- Both compile and run green: 15 todos, 0 failures (verified with a scoped vitest run on the two files only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm db:generate` blocked on unrelated interactive prompt**

- **Found during:** Task 1
- **Issue:** `drizzle-kit generate` prompted interactively about `sessions.goal_plan_type` (pre-existing schema drift unrelated to phase 137) — create vs rename. Interactive prompts are unsupported in this environment, and proceeding would have dragged unrelated drift into migration 0153.
- **Fix:** Cancelled the generate (no 0153 or `_journal.json` produced — verified clean). Hand-wrote `0153_validation_status.sql` following the 0151 enum-alter precedent. Confirmed via `run-migrations.ts` that the custom runner discovers `.sql` files by name from the migrations dir and tracks them in the `_migrations` DB table (NOT `meta/_journal.json`, per CLAUDE.md) — so a hand-written SQL file is the correct, source-of-truth-aligned approach.
- **Files modified:** `0153_validation_status.sql` (hand-written)
- **Commit:** `7a55ec81`
- **Scope note:** the `sessions.goal_plan_type` drift is pre-existing and out of scope — NOT fixed here. Logged for awareness; whoever next runs `db:generate` will face the same prompt.

## Known Stubs

The two test files are intentional Wave 0 scaffolds (`it.todo` only) — plans 02 and 03 implement the real cases. This is by design per the plan's Wave 0 task and is not a goal-blocking stub for plan 01 (whose goal is the data foundation, not the state machine).

## Self-Check: PASSED

- `el-templo-api/src/db/migrations/0153_validation_status.sql` — FOUND
- `el-templo-api/src/modules/finance/firm-money.ts` — FOUND
- `el-templo-api/test/finance/validation-state.test.ts` — FOUND
- `el-templo-api/test/finance/validation-regression.test.ts` — FOUND
- Schema change in `financial-transactions.ts` — FOUND (`validation_status`)
- Audit types in `audit-log.ts` — FOUND (3 new actions)
- Commits `7a55ec81`, `e85263f4`, `81a80009` — all FOUND in git log
- typecheck (`tsc --noEmit`) — clean across all 3 tasks
- No `;` in SQL comments — verified
