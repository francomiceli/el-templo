---
phase: 138-entidad-caja-saldos
plan: 01
subsystem: finance
tags: [schema, migration, cash-registers, ledger, backfill]
requires:
  - "Phase 137 firm-money.ts + validation_status (the saldo filters by validado)"
provides:
  - "cash_registers table (efectivo/banco, nullable branch_id, NOT NULL currency, opening_balance, cutoff_date, is_active)"
  - "financial_transactions.cash_register_id nullable FK + idx_financial_tx_cash_register"
  - "Migration 0154 (table + column + seed + backfill)"
  - "Wave 0 test scaffold test/finance/cash-register-service.test.ts"
affects:
  - "el-templo-api ledger schema (additive, non-destructive)"
tech-stack:
  added: []
  patterns:
    - "SELECT-driven seed keyed on branches (data-driven, future-proof) skipping virtual branches"
    - "Hand-written migration to bypass the sessions.goal_plan_type db:generate drift"
key-files:
  created:
    - el-templo-api/src/db/schema/cash-registers.ts
    - el-templo-api/src/db/migrations/0154_cash_registers.sql
    - el-templo-api/test/finance/cash-register-service.test.ts
  modified:
    - el-templo-api/src/db/schema/financial-transactions.ts
    - el-templo-api/src/db/schema/index.ts
decisions:
  - "cutoff_date is a per-caja column seeded with one global value (Research A5 / Open Q1) — keeps 138 self-contained, no settings-table dependency"
  - "Seed is SELECT-driven off the live branches table rather than a hardcoded 8 INSERTs — produces exactly 8 on prod baseline, scales with branch count, future-proofs ES/EUR"
metrics:
  duration: ~10min
  completed: 2026-06-24
---

# Phase 138 Plan 01: Entidad caja + saldos (schema layer) Summary

Database foundation for the cash-register module: a new `cash_registers` entity (efectivo per branch + efectivo central + banco per currency), a nullable `cash_register_id` FK on the ledger decoupled from `branchId`, hand-written migration 0154 that creates the table, seeds the cajas, and backfills historical rows with their derived caja (labels only, excluded from the saldo by the cutoff), plus a runnable Wave 0 test scaffold for plans 02/03 to fill.

## What Was Built

- **`cash_registers` schema** (`cash-registers.ts`): `type` mysqlEnum efectivo/banco (column literal `"type"`), nullable `branch_id` FK to branches, NOT NULL `currency`, `opening_balance` default 0, `cutoff_date` (date), `is_active`, timestamps, plus `cashRegistersRelations` (`one(branches)`). Two indexes: `(type, currency)` and `(branch_id)`.
- **Ledger extension** (`financial-transactions.ts`): added nullable `cash_register_id` FK (after `branch_id`), index `idx_financial_tx_cash_register (cash_register_id, transaction_date)` backing the per-caja SUM+cutoff range, and a `cashRegister: one(cashRegisters)` relation. `branchId` stays NOT NULL (D-04).
- **Schema index** (`index.ts`): `export * from "./cash-registers"` placed right after branches (dependency order).
- **Migration 0154** (hand-written, 4-step ordering: CREATE TABLE → ALTER ADD column+FK+index → SEED → BACKFILL). Seed is SELECT-driven on `branches` (efectivo per `is_virtual=false AND is_active=true` branch, currency from `country`) + efectivo central (branch_id NULL) + banco ARS + banco EUR, all `opening_balance=0`, `cutoff_date=CURDATE()`. Backfill: cash→efectivo(branch,currency), transfer/card→banco(currency), aura_credit/internal→NULL. Seed precedes backfill for FK ordering.
- **Wave 0 test scaffold** (`cash-register-service.test.ts`): boots `createTestApp`, lays out the 6 Test Map describe groups with `it.todo` placeholders (13 todos), runs green.

## Verification

- `tsc --noEmit` (the project typecheck; there is no `pnpm typecheck` script — `build` is `tsc`): PASSED after schema changes and after the scaffold.
- `pnpm db:migrate`: applied 0154 cleanly (10 statements), recorded in `_migrations`. (0153 also applied — the dev DB was one migration behind; both now recorded.)
- Seed verified directly against the dev DB: produced cajas with the correct type/currency/branch_id, all opening_balance 0 and a single global cutoff_date. On this local DB the branches table has 8 non-virtual branches, so the data-driven seed produced 11 cajas; on the production baseline (5 physical AR + ONLINE virtual) the identical SQL yields exactly 8. See Deviations.
- Grep gates: enum literal `enum('efectivo','banco')` byte-for-byte; no `;` inside any SQL comment (`! grep -nE '^\s*--.*;'` passes).
- `pnpm test test/finance/cash-register-service.test.ts`: 13 todo, 0 failures, exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm typecheck` script does not exist**

- **Found during:** Task 1 verification.
- **Issue:** The plan's `<automated>` gate calls `pnpm typecheck`, but `el-templo-api/package.json` has no `typecheck` script (it has `build` = `tsc`).
- **Fix:** Ran `npx tsc --noEmit` (non-emitting typecheck, equivalent to the intended gate). Passed cleanly. No code change.
- **Files modified:** none.

### Notes (not deviations)

**Seed count: 8 on prod, 11 on this dev DB — by design, not a bug.**
The plan's "exactly 8 cajas" reflects the production branch baseline. The migration is intentionally **data-driven** (SELECT off `branches` with `is_virtual=false AND is_active=true`, per the plan's own instruction to key the seed on branch codes and skip virtual branches — Pitfall 6). The local dev DB carries extra/test branches (Park, Chapadmalal, and an ONLINE row flagged `is_virtual=false` locally), so the same SQL legitimately emits 11 cajas here. On the prod schema (5 physical AR branches all `is_virtual=false` + ONLINE `is_virtual=true`, which is correctly skipped) it emits exactly: 5 efectivo + 1 efectivo central + 1 banco ARS + 1 banco EUR = 8. The data-driven form is strictly more correct than a hardcoded 8 INSERTs and future-proofs ES/EUR branches. No change made — the WHERE filter is correct; the count differential is purely local-data shape.

## Known Stubs

None. The schema, migration, and column are fully wired. The test file is an intentional Wave 0 scaffold (`it.todo` placeholders) that plans 02 (resolver + guard, wiring into `create()`) and 03 (`getBalance` + filled tests) will complete — this is the planned division of labor, documented in the plan, not an unresolved stub.

## Self-Check: PASSED

- FOUND: el-templo-api/src/db/schema/cash-registers.ts
- FOUND: el-templo-api/src/db/schema/financial-transactions.ts (modified)
- FOUND: el-templo-api/src/db/schema/index.ts (modified)
- FOUND: el-templo-api/src/db/migrations/0154_cash_registers.sql
- FOUND: el-templo-api/test/finance/cash-register-service.test.ts
- FOUND commit 1bf0f8f6 (schema), 0ee511c8 (migration), a5254c6c (test scaffold)
