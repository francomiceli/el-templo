---
phase: 151-registrar-cobro-pagos-cobros
plan: 01
subsystem: payments
tags:
  [
    finance,
    cash-registers,
    bank-accounts,
    coach-load,
    subscriptions,
    fastify,
    drizzle,
  ]

# Dependency graph
requires:
  - phase: 138-entidad-caja-saldos
    provides: cash_registers entity + resolveCashRegister choke-point
  - phase: 146-mejoras-caja (v5.3)
    provides: recorderBranchId suggested-caja threading + multibanco
  - phase: 148-pos-profe-alta-alumno
    provides: coach-load /alta orchestrator + assignPlan createdMemberId
  - phase: 150-cuentas-bancarias
    provides: flexible bank-account ABM (type=banco cajas)
provides:
  - "listActiveBankAccounts(currency?) + assertChosenBankAccount(id,currency) on CashRegisterService"
  - "cashRegisterIdOverride on AssignPlanInput + RenewSubscriptionInput, honored in both caja-resolution blocks"
  - "bankAccountId field on the 3 PoS body schemas + server-side validation on all 4 charge paths"
  - "GET /coach-load/bank-accounts (coach-reachable, lean id/name/currency)"
affects: [152-caja, 154-alumnos, 157-referidos, cobros-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "PoS-sourced imputation validated server-side (assertChosenBankAccount) then threaded as a trusted-internal override — body never sets cashRegisterId (v5.3 invariant preserved)"
    - "Thunk-based currency resolution in the shared guard so the charge currency is only queried when a bank account is actually required (transfer/card)"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/subscriptions/types.ts
    - el-templo-api/src/modules/subscriptions/service.ts
    - el-templo-api/src/modules/finance/coach-load-routes.ts
    - el-templo-api/test/finance/coach-load.test.ts

key-decisions:
  - "assertChosenBankAccount rejects inactive/wrong-type/currency-mismatch as BadRequestError (400), distinct from getBankAccountById's NotFound-only guard — reused nowhere, purpose-built for the PoS choke-point"
  - "cashRegisterIdOverride short-circuits BEFORE the recorderBranchId suggestion in both service blocks (explicit PoS choice wins over sede-derived suggestion)"
  - "Single shared validateBankAccountForCharge guard (thunk currency) used by all 4 handler paths (DRY) instead of inlining the transfer/card/cash matrix four times"

patterns-established:
  - "Body-sourced-but-server-validated field: additionalProperties:false keeps cashRegisterId/validationStatus rejected; only bankAccountId is newly body-sourced and it is always run through assertChosenBankAccount before use"

requirements-completed: [COBRO-04]

# Metrics
duration: ~30min
completed: 2026-07-03
---

# Phase 151 Plan 01: Registrar Cobro — Bank-account imputation at the PoS Summary

**COBRO-04 backend: transfer/card charges from the Cobros PoS now carry a server-validated `bankAccountId` (type=banco + active + currency-match) persisted as the charge's `cashRegisterId` on all four code paths (settle, renew, misc, alta), plus a coach-reachable `GET /bank-accounts` — with the v5.3 server-derived invariant intact.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-03
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Two new `CashRegisterService` methods: `listActiveBankAccounts(currency?)` (lean, no balances) and `assertChosenBankAccount(id, currency)` (400 on missing/inactive/wrong-type/currency-mismatch).
- `cashRegisterIdOverride` threaded through `AssignPlanInput` + `RenewSubscriptionInput`; both internal caja-resolution blocks short-circuit on it, bypassing `resolveCashRegister` while leaving the advance-payment imputation branch untouched.
- Shared `validateBankAccountForCharge` guard wired into all 4 PoS handler paths — direct `cashRegisterId` override for settle/misc, `cashRegisterIdOverride` input for the delegated renew/alta paths.
- `GET /coach-load/bank-accounts` (inherits the plugin's FINANCE_LOAD_ROLES gate, coach-reachable) returning `{ accounts: [{id,name,currency}] }`.
- 12 new integration cases: full 400 rejection matrix on /misc, one persisted-imputation assertion per code path, renew+alta reject-without-account, the new endpoint's coach reachability + lean shape, and a coach 403 on the admin `/cash-registers` list.

## Task Commits

Each task was committed atomically:

1. **Task 1: Service layer — cash-register methods + cashRegisterIdOverride threading** - `a0b05291` (feat)
2. **Task 2: Wire bankAccountId into 3 PoS schemas + 4 handler paths + GET /bank-accounts** - `d3b95833` (feat)
3. **Task 3: Integration tests — 4 code paths + rejection matrix + new endpoint** - `906357ef` (test)

## Files Created/Modified

- `el-templo-api/src/modules/finance/cash-register-service.ts` - Added `listActiveBankAccounts` + `assertChosenBankAccount`.
- `el-templo-api/src/modules/subscriptions/types.ts` - Added `cashRegisterIdOverride?` to `AssignPlanInput` + `RenewSubscriptionInput`.
- `el-templo-api/src/modules/subscriptions/service.ts` - Both caja-resolution blocks (assignPlan + renewSubscription) short-circuit on the override.
- `el-templo-api/src/modules/finance/coach-load-routes.ts` - `bankAccountId` on 3 schemas + interfaces, shared guard + currency resolvers, imputation wiring on all 4 paths, new GET route.
- `el-templo-api/test/finance/coach-load.test.ts` - New `bankAccountId (COBRO-04)` describe block.

## Decisions Made

- **assertChosenBankAccount is purpose-built, not a reuse of getBankAccountById** — the plan flagged that getBankAccountById only guards NotFound + type, and does not reject inactive/currency-mismatch. The new assert throws `BadRequestError` (→ 400) for all four failure modes so the route returns a client error, not a 404/500.
- **Override precedes the sede-suggestion** in both service blocks: an explicit PoS bank choice must win over the `recorderBranchId`-derived suggestion, so the `if (cashRegisterIdOverride !== undefined)` branch is first.
- **Thunk-based currency resolution** in the shared guard: currency is only queried (renew: renewable-sub currency; alta: plan currency) when the method is transfer/card AND an id was supplied — avoids an unnecessary query and a spurious NotFound on cash renewals of members with no renewable sub.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `pnpm tsc --noEmit` passed after each task. Per project convention (CLAUDE.md + MEMORY) the integration suite runs in CI on push to staging, not locally; `tsconfig.json` scopes `tsc` to `src/**/*` so the new test file is validated by vitest/esbuild in CI, not by the local typecheck.

## Threat Model Coverage

All `mitigate` dispositions from the plan's threat register are implemented and tested:

- **T-151-01** (bankAccountId tampering/IDOR): `assertChosenBankAccount` on all 4 paths; rejection matrix in tests.
- **T-151-02** (coach elevation via GET /bank-accounts): endpoint under FINANCE_LOAD_ROLES gate, lean shape, coach still 403s on admin `/cash-registers` — both asserted.
- **T-151-03 / T-151-11** (v5.3 invariant / override field): `additionalProperties:false` retained on all 3 POST schemas; `cashRegisterIdOverride` lives only on internal service inputs, set only by the coach-load route after validation.

No new threat surface introduced beyond the planned `bankAccountId` body field.

## Next Phase Readiness

- Backend contract for COBRO-04 is complete and CI-testable. The Cobros PoS frontend (admin) can now call `GET /coach-load/bank-accounts?currency=<c>` to populate the account selector and send `bankAccountId` on transfer/card charges across pay-plan / misc / alta.
- No migrations, no new dependencies — ships with the v5.4 train on staging.

---

## Self-Check: PASSED

All 5 modified source/test files and the SUMMARY exist on disk; all 4 commits (`a0b05291`, `d3b95833`, `906357ef`, `402f6be5`) are present in git history.

---

_Phase: 151-registrar-cobro-pagos-cobros_
_Completed: 2026-07-03_
