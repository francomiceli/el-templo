---
phase: 138-entidad-caja-saldos
plan: 02
subsystem: finance
tags: [cash-registers, resolver, currency-guard, ledger, dependency-injection]
requires:
  - "138-01: cash_registers table + cash_register_id FK + Wave 0 test scaffold"
  - "Phase 137: PaymentMethod enum on financial_transactions"
provides:
  - "CashRegisterService.resolveCashRegister(paymentMethod, branchId, currency) — the single reusable caja resolver (D-01/D-02), reused by phase 140"
  - "Currency guard (D-09/CAJA-04) embedded in the efectivo branch: throws BadRequestError 'Moneda inconsistente'"
  - "create() auto-stamps cash_register_id at the single insert site, covering all 9 create paths (CAJA-02)"
  - "CreateTransactionInput.cashRegisterId? — server-derived optional override slot, never from request body (T-138-04)"
  - "ensureEfectivoCaja() test helper + setup.ts caja seed for the integration suite"
affects:
  - "el-templo-api finance write-side (every cash/transfer/card payment now lands in the correct caja)"
  - "All 6 TransactionService instantiation sites (DI: new 4th constructor arg)"
tech-stack:
  added: []
  patterns:
    - "Single choke-point resolver wired at the one create() insert site (option A) — zero per-caller edits"
    - "Currency guard mirrors balance-service.ts:154-158 (applyDelta precedent)"
    - "Test-env caja seeding (setup.ts for seed-time branches + ensureEfectivoCaja for runtime branches)"
key-files:
  created:
    - el-templo-api/src/modules/finance/cash-register-service.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/index.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/auth/routes.ts
    - el-templo-api/src/modules/members/routes.ts
    - el-templo-api/src/modules/programs/routes.ts
    - el-templo-api/src/modules/subscriptions/routes.ts
    - el-templo-api/src/jobs/auto-resume-pauses.ts
    - el-templo-api/test/setup.ts
    - el-templo-api/test/helpers.ts
    - el-templo-api/test/finance/cash-register-service.test.ts
decisions:
  - "Currency guard lives inside resolveCashRegister (the efectivo branch) — the single reusable choke-point (D-02), so 139/140 inherit it for free. Banco resolves BY currency, so no guard is needed there."
  - "Resolver wired via option A (inside create()) rather than per-caller — the single insert site makes it both safer and DRYer; no caller edits."
  - "Test caja seeding: setup.ts seeds efectivo for ALL seed-time branches (broader than the prod migration's active+non-virtual filter) because the suite freely assigns cash charges against any branch (incl. inactive PARK / virtual ONLINE)."
metrics:
  duration: ~75min
  completed: 2026-06-24
---

# Phase 138 Plan 02: Entidad caja + saldos (resolver write-side) Summary

The runtime write-side of the cash-register module: a new `CashRegisterService` housing the reusable `resolveCashRegister(paymentMethod, branchId, currency)` (D-01) with the currency guard (D-09/CAJA-04) embedded in its efectivo branch, wired into the single `TransactionService.create()` insert site so every create path auto-stamps `cash_register_id` server-side, plus DI of `CashRegisterService` into all 6 `TransactionService` instantiation sites. After this, every cash/transfer/card payment lands in the correct caja automatically; cross-currency contamination is rejected; `aura_credit`/`internal` resolve to NULL.

## What Was Built

- **`CashRegisterService`** (`cash-register-service.ts`): facade-pattern service `constructor(db, log)` (mirrors `BalanceService`). `resolveCashRegister`:
  - `aura_credit`/`internal` → `null` (no caja).
  - `transfer`/`card` → banco caja `WHERE type='banco' AND currency=C AND is_active` (resolved BY currency, so no guard needed); throws `BadRequestError("No existe caja banco para {C}")` if absent.
  - `cash` → efectivo caja `WHERE type='efectivo' AND branch_id=X AND is_active`; throws `"No existe caja efectivo para la sucursal {X}"` if absent; then the **currency guard** (D-09): if the resolved caja's currency ≠ tx currency, throws `BadRequestError("Moneda inconsistente: la caja es {caja}, el cobro es {tx}")` (mirrors `balance-service.ts:154-158`). Documented as the single reusable choke-point reused by phase 140. No `any`.
- **Input plumbing** (`types.ts`): added optional `cashRegisterId?: number | null` to `CreateTransactionInput`, documented as SERVER-DERIVED (never from the raw request body, like `validationStatus`; D-03). `null` is a valid override meaning "no caja".
- **create() wiring** (`transaction-service.ts`): new constructor param `private readonly cashRegisterService: CashRegisterService`. Before the single `.insert(financialTransactions).values({...})`, computes `cashRegisterId = input.cashRegisterId !== undefined ? input.cashRegisterId : await resolveCashRegister(paymentMethod, branchId, currency ?? "ARS")` and stamps it in the values block next to the existing `currency`/`validationStatus` defaults. This covers all 9 create paths (REST, `recordAssignmentCharge` ×4, enrollment add-on, `correct()` re-create) with one edit — zero caller changes.
- **DI into 6 sites** (5 routes + 1 job): `finance/routes.ts`, `auth/routes.ts`, `members/routes.ts`, `programs/routes.ts`, `subscriptions/routes.ts`, `jobs/auto-resume-pauses.ts` each construct `new CashRegisterService(...)` and pass it as the 4th arg. `CashRegisterService` exported from `modules/finance/index.ts`.
- **Tests** (`cash-register-service.test.ts`): filled the resolver + currency-guard + create-stamps groups (RED→GREEN). 13 real tests pass (cash→efectivo, transfer/card→banco, aura_credit/internal→NULL, missing-caja throws, currency-guard throws, create() stamps the right caja per method, aura_credit persists NULL). 6 `it.todo` remain for plan 03 (getBalance + cutoff).

## Verification

- `npx tsc --noEmit` (the project typecheck — there is no `pnpm typecheck` script): **PASSED** across all 9 modified src files.
- Plan grep gates: `class CashRegisterService` + `resolveCashRegister` + `Moneda inconsistente` present; `cashRegisterId` in `types.ts`; `private readonly cashRegisterService` + `resolveCashRegister` in `transaction-service.ts`; `new CashRegisterService` present in all 6 instantiation files (count = 6). **All pass.**
- Targeted integration tests (run locally per-file; full suite runs in CI on push): cash-register-service (13 pass / 6 todo), transaction-service (43 pass), charge-on-assign, lifecycle, validation-state, validation-regression, user-status-history, user-status-transitions, branch-access, transactions-api, financial-history-api, export-transactions — **all green** after the test-env caja seeding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resolver wiring broke every existing create()-path test (no caja in test DB)**

- **Found during:** Task 2/3 verification.
- **Issue:** `resolveCashRegister` hard-throws `"No existe caja efectivo para la sucursal X"` when a `cash` payment hits a branch with no efectivo caja. The migration-0154 seed is SELECT-driven off branches that exist AT MIGRATION TIME, but the test branches (TEST/ONLINE) are inserted by `seedTestData` AFTER migrations run, so no caja existed for them — 38 transaction-service tests plus the subscriptions/charge tests began throwing. This is the same failure mode production would hit for any branch lacking a caja.
- **Fix:** `test/setup.ts` `seedTestData` now seeds an efectivo caja for EVERY seed-time branch (currency derived from `country`) + efectivo central + banco ARS + banco EUR, idempotently. Broader than the prod migration filter (active + non-virtual) on purpose: the suite freely charges against any branch (incl. inactive PARK / virtual ONLINE).
- **Files modified:** `test/setup.ts`.
- **Commit:** `08cd6a61`.

**2. [Rule 3 - Blocking] Tests that create branches at runtime + route cash charges had no caja**

- **Found during:** Task 3 verification (transactions-api S3, export-transactions E4, financial-history).
- **Issue:** Several finance API tests insert an AR + ES branch in-test, then POST cash transactions to them via the route → `create()` → resolver throw. The setup-time seed cannot cover branches created after it runs.
- **Fix:** Added a DRY `ensureEfectivoCaja(app, branchId, currency)` helper in `test/helpers.ts` and called it right after the in-test branch inserts (transactions-api, financial-history-api, export-transactions, and the `seedEsBranch`/`seedArBranch2`/L2 helpers in transaction-service.test.ts). For the country-scope fixtures (transactions-api / export / financial-history) whose ES-branch cash payloads use currency `ARS`, the ES efectivo caja is seeded as ARS to match the payload (those fixtures exercise COUNTRY scoping, not currency; cross-currency isolation is covered by the dedicated EUR resolver/SUM5/L2 tests).
- **Files modified:** `test/helpers.ts`, `test/finance/transaction-service.test.ts`, `test/finance/transactions-api.test.ts`, `test/finance/financial-history-api.test.ts`, `test/finance/export-transactions.test.ts`.
- **Commit:** `08cd6a61`.

**3. [Rule 3 - Blocking] All in-test TransactionService instantiations needed the new 4th arg**

- **Found during:** Task 3 (constructor arity change).
- **Issue:** The new `CashRegisterService` constructor param made every `new TransactionService(db, log, balances)` in tests a runtime-undefined `cashRegisterService` (and broke arity expectations). 8 test files construct it directly.
- **Fix:** Updated all in-test instantiations to pass `new CashRegisterService(db, log)` as the 4th arg (branch-access, charge-on-assign, lifecycle ×2, user-status-history, user-status-transitions, validation-state, validation-regression, transaction-service).
- **Files modified:** the 8 test files above.
- **Commit:** `08cd6a61`.

> Note: tests are NOT typechecked by the project tsconfig (`include: ["src/**/*"]`), so these test-arity issues surfaced at runtime rather than via `tsc`. They are fixed regardless so CI's test run stays green.

## Known Stubs

None. The resolver, currency guard, input plumbing, and DI are fully wired. The 6 remaining `it.todo` placeholders in `cash-register-service.test.ts` cover `getBalance` + the cutoff/opening-balance arithmetic — explicitly plan 03's scope (CAJA-03), per the documented Wave-0 division of labor, not an unresolved stub.

## Threat Flags

None. The plan's `<threat_model>` dispositions were all honored:

- **T-138-04 (spoofing cash_register_id):** mitigated — server-derived in `create()`; the route schema does not accept it (the optional input slot is internal-only).
- **T-138-05 (cross-currency):** mitigated — currency guard in `resolveCashRegister` throws "Moneda inconsistente"; banco resolves by currency by construction.
- **T-138-06 (missed create path):** mitigated — single insert site covers all 9 paths.

No new security surface (no new endpoint, no schema change) was introduced beyond what the plan specified.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/cash-register-service.ts
- FOUND: el-templo-api/src/modules/finance/transaction-service.ts (modified — resolver wired)
- FOUND: el-templo-api/src/modules/finance/types.ts (modified — cashRegisterId)
- FOUND commit a70e586b (Task 1: resolver + guard)
- FOUND commit 57dad97a (Task 2: create() wiring)
- FOUND commit 08cd6a61 (Task 3: DI + test seed)
