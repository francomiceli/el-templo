---
phase: 138-entidad-caja-saldos
plan: 03
subsystem: finance
tags:
  [cash-registers, getBalance, derived-saldo, cutoff, firm-money, tests, tdd]
requires:
  - "138-01: cash_registers table + cash_register_id FK + idx_financial_tx_cash_register + Wave 0 test scaffold"
  - "138-02: CashRegisterService.resolveCashRegister + currency guard wired into create()"
  - "Phase 137: firmMoneyConditions() (canonical firm-money filter)"
provides:
  - "CashRegisterService.getBalance(cashRegisterId) — derived firm balance (opening + Σ validados since cutoff) with pendientes returned SEPARATELY (CAJA-03)"
  - "CashRegisterBalance type (cashRegisterId/currency/firmeBalance/pendienteAmount)"
  - "Complete integration test suite for CAJA-01..04 (18 tests) — seed shape, resolver, create-stamping, backfill labeling, getBalance arithmetic, cutoff exclusion, EUR currency guard"
affects:
  - "el-templo-api finance read-side (per-caja saldo, backend-only — no REST endpoint, no UI per D-10)"
tech-stack:
  added: []
  patterns:
    - "Derived (not materialized) saldo hidden behind the getBalance signature (D-08) so phase 139 extends the body (outflows) without changing the contract"
    - "firmeBalance reuses firmMoneyConditions() verbatim — inherits the phase-137 canonical filter, never inlined (T-138-09)"
    - "Two separate SUMs (firme vs pendiente) so pendientes are NEVER summed into the firm total (CAJA-03/T-138-07)"
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
decisions:
  - "ONLINE-virtual invariant (CAJA-01) is asserted against the MIGRATION 0154 SQL (its seed SELECT filters is_virtual=false), NOT the per-worker test DB — test/setup.ts deliberately seeds an efectivo for every branch (138-02 deviation #1), so the runtime DB carries an ONLINE caja and the migration file is the true source of the invariant."
  - "getBalance is inflow-only for 138 with a // TODO 139 outflow marker; the signature is final so phase 139 adds signed cash_transfer/expense without touching callers (D-08)."
metrics:
  duration: ~30min
  completed: 2026-06-24
---

# Phase 138 Plan 03: Entidad caja + saldos (read-side getBalance + full test suite) Summary

The read-side close of the cash-register module: `CashRegisterService.getBalance(cashRegisterId)` derives a caja's firm balance as `opening_balance + Σ(validados, non-voided) since cutoff_date` — reusing the phase-137 `firmMoneyConditions()` filter verbatim — and returns the PENDIENTE total in a separate field that is never summed into the firm total (CAJA-03). The complete integration suite (18 tests) now locks every CAJA-01..04 invariant against real per-worker MySQL: seed shape, resolver mapping, create-stamping, the migration-0154 backfill labeling, the firm/pendiente/cutoff/voided arithmetic of getBalance, and the EUR currency guard. Backend-only (D-10) — no REST endpoint, no UI (phases 141/142).

## What Was Built

- **`CashRegisterBalance` type** (`types.ts`): `{ cashRegisterId, currency, firmeBalance, pendienteAmount }`. Documented as a derived saldo (D-06/D-08): `firmeBalance = opening_balance + Σ validados since cutoff`; `pendienteAmount` reported separately, never added.
- **`getBalance(cashRegisterId)`** (`cash-register-service.ts`): SELECTs the caja (openingBalance/currency/cutoffDate; throws `NotFoundError` if absent). **firmeBalance** = clone of getSummary's firm SUM (`COALESCE(SUM(amount),0)`) scoped to `cash_register_id` + `direction='inflow'` + spread `firmMoneyConditions()` + `gte(transactionDate, cutoffDate)`, then `openingBalance + Number(total)`. **pendienteAmount** = a SEPARATE SUM (`validation_status='pendiente'` AND `voided_at IS NULL` AND `gte cutoff`), inflow-only, never added to firme. Carries a `// TODO 139: subtract outflows` marker so phase 139 extends the body without changing the signature. No `any`.
- **Full integration suite** (`cash-register-service.test.ts`, 18 tests, all green): converted the remaining `it.todo` groups into real tests —
  - **seed shape (CAJA-01):** every efectivo caja has a fixed 3-char currency; a banco caja exists per currency (ARS+EUR) with `branch_id` NULL; the ONLINE-virtual exclusion is asserted against the migration SQL filter.
  - **backfill labeling (CAJA-02/D-01):** inserts three pre-cutoff rows (cash/transfer/aura_credit), applies the same derivation migration 0154 uses, and asserts cash→branch efectivo id, transfer→banco caja, aura_credit→NULL.
  - **getBalance (CAJA-03):** against a dedicated `opening_balance=1000` caja — `firmeBalance` = 1000 + 500 + 300 = 1800 (a voided 444 and a pre-cutoff 9999 excluded); `pendienteAmount` = 200 reported separately, firme unchanged; `NotFoundError` for unknown id.
  - **cutoff exclusion (CAJA-03):** a pre-cutoff validado row is labeled with its caja but absent from `firmeBalance` (proven by re-reading the labeled row).
  - **EUR currency guard (CAJA-04):** the already-present test resolves a `cash` ARS tx against the directly-inserted EUR efectivo caja and asserts the "Moneda inconsistente" throw (guard exercised, non-vacuous).

## Verification

- `npx tsc --noEmit` (the project typecheck — there is no `pnpm typecheck` script): **PASSED**.
- Grep gates: `async getBalance`, `firmMoneyConditions`, `cutoffDate` in cash-register-service.ts; `CashRegisterBalance` in types.ts; `// TODO 139` marker present. **All pass.**
- `pnpm test test/finance/cash-register-service.test.ts`: **18 passed / 0 failed**. RED was confirmed first (5 getBalance tests failed with `service.getBalance is not a function` before the impl).
- No REST endpoint / UI added (backend-only, D-10). Full suite runs in CI on push to staging (project rule: not locally).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ONLINE-virtual seed assertion was wrong for the test environment**

- **Found during:** Task 2 (GREEN) test run — the "no efectivo for virtual ONLINE" test failed (expected 0 cajas, got 1).
- **Issue:** The plan's CAJA-01 invariant "no efectivo for the virtual ONLINE branch" is a property of the **migration 0154 seed** (its SELECT filters `is_virtual = false`). But `test/setup.ts` deliberately seeds an efectivo caja for EVERY seed-time branch (incl. ONLINE) so the suite can charge against any branch (138-02 deviation #1). So a runtime query against the per-worker DB legitimately finds an ONLINE efectivo caja — the runtime DB is broader than prod by design.
- **Fix:** Re-pointed the assertion at the source of truth: the test now reads `src/db/migrations/0154_cash_registers.sql` and asserts its seed SELECT filters `is_virtual = false`. This proves the prod invariant without coupling to the broader test seed. The other 17 tests are unchanged.
- **Files modified:** `el-templo-api/test/finance/cash-register-service.test.ts`.
- **Commit:** `8d74bc04`.

> Note (not a deviation): `pnpm typecheck` does not exist in this repo (only `build` = `tsc`); used `npx tsc --noEmit` per the standing project rule, consistent with plans 01/02.

## Threat Flags

None. The plan's `<threat_model>` dispositions were all honored:

- **T-138-07 (pendientes leaking into firme):** mitigated — `firmMoneyConditions()` requires `validado`; `pendienteAmount` is a separate SUM never added. Asserted by the "pendienteAmount reported separately" test.
- **T-138-08 (backfilled history inflating saldo):** mitigated — `gte(transactionDate, cutoffDate)` on both SUMs; the "cutoff excludes history" test proves a pre-cutoff validado row is labeled but excluded.
- **T-138-09 (firm filter drift vs phase 137):** mitigated — getBalance spreads `firmMoneyConditions()` verbatim, never inlined.

No new security surface (no new endpoint, no schema change) was introduced.

## Known Stubs

None. getBalance is fully wired and tested. The `// TODO 139` outflow marker is an explicit, planned forward-extension point (phase 139 adds signed movements) documented in the plan's `<implementation>`, not an unresolved stub — the inflow-only saldo is correct and complete for phase 138's scope (CAJA-03 says "derivado en v1").

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/cash-register-service.ts (getBalance added)
- FOUND: el-templo-api/src/modules/finance/types.ts (CashRegisterBalance added)
- FOUND: el-templo-api/test/finance/cash-register-service.test.ts (18 tests)
- FOUND commit 55b445f1 (Task 1: RED tests)
- FOUND commit 8d74bc04 (Task 2: GREEN getBalance + impl)
