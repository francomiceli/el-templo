---
phase: 151-registrar-cobro-pagos-cobros
plan: 04
subsystem: admin-finance-pos
tags: [cobro-wizard, bank-account-selector, quick-create, vue, quasar, cobro-04]
requires:
  - "GET /coach-load/bank-accounts + bankAccountId validation (Plan 01)"
  - "useFinanceLoadApi.listBankAccounts + bankAccountId on the 3 PoS inputs (Plan 02)"
  - "CobrosPage.vue step-3 (¿Cómo se paga?) built in Plan 03"
  - "CuentaBancariaFormDialog.vue (phase 150) — reused for quick-create"
provides:
  - "Step-3 bank-account selector: currency-filtered q-select for transfer/card only"
  - "Finish gate: transfer/card blocked without a selected account (canConfirm + step-3 gate)"
  - "bankAccountId sent in payPlan/miscCharge/altaConPlan only for transfer/card"
  - "Inline + Nueva cuenta / Crear cuenta quick-create (admin/owner-gated) with auto-select on save"
  - "CuentaBancariaFormDialog optional defaultCurrency prop (charge-currency preselect)"
affects: [152-caja, cobros-pos]
tech-stack:
  added: []
  patterns:
    - "Client-side convenience filtering (currency + role) layered over server-side authority (assertChosenBankAccount)"
    - "Auto-select-newest after quick-create by diffing account ids across the refetch"
    - "Charge currency → country map (ARS→AR, EUR→ES) to satisfy the dialog's required selectedCountry prop"
key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/CobrosPage.vue
    - el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
decisions:
  - "Selector renders ONLY for transfer/card (needsBankAccount); Efectivo path untouched and never sends bankAccountId"
  - "Added an optional defaultCurrency prop to CuentaBancariaFormDialog because selectedCountry was unused for currency — needed to genuinely preselect the charge currency per must-have #4 (additive, backward-compatible)"
  - "canCreateBankAccount = role owner|admin, mirroring the server ADMIN_ROLES gate on the create route (149 D-04); the button is UX only"
metrics:
  duration: ~12min
  completed: 2026-07-03
requirements-completed: [COBRO-04]
---

# Phase 151 Plan 04: Bank-account selector in Cobros step 3 (COBRO-04 frontend) Summary

Completed the COBRO-04 client on top of Plan 03's step-3: a currency-filtered bank-account
selector shown only for Transferencia/Tarjeta that blocks finishing without a selection and
carries `bankAccountId` on confirm, plus an admin/owner-only inline quick-create that reuses
phase-150's `CuentaBancariaFormDialog` and auto-selects the newly created account. Server-side
`assertChosenBankAccount` (Plan 01) remains the authority; the UI only guides and hides the
create button.

## What Was Built

### Task 1 — Step-3 selector + states + finish gate + payload (commit d5d0b322)

- New reactive state in `CobrosPage.vue`: `bankAccounts`, `loadingBankAccounts`,
  `selectedBankAccountId`, plus `needsBankAccount` (transfer|card) and `bankAccountOptions`
  computeds and a `canCreateBankAccount` (owner|admin) computed.
- `loadBankAccounts()` calls `financeApi.listBankAccounts(resumenCurrency)` (the charge
  currency) and stores the lean `{id,name,currency}` list. A `watch(paymentMethod)` loads on
  transfer/card; a `watch(resumenCurrency)` clears `selectedBankAccountId` (so a stale-currency
  account can't leak) and reloads when a bank account is needed.
- Template: a `q-select` labelled `Cuenta banco` renders **only** when `needsBankAccount`.
  Three states beyond the loaded list: accounts exist → selector + the block hint
  `Elegí una cuenta bancaria para cobrar por transferencia o tarjeta.` while unselected;
  no accounts + admin/owner → `No hay cuentas de esta moneda. Creá una para continuar.`;
  no accounts + profe/recepción → the `bg-warning text-dark` notice keeping Efectivo available.
- Finish gate: `canConfirm` and the step-3 branch of `canContinueStep` both return false when
  `needsBankAccount && selectedBankAccountId == null`.
- Confirm dispatch: a single `chosenBankAccountId` (defined only for transfer/card with a
  selection) is spread into `payPlan`, `miscCharge`, and the `CoachAltaInput` body. Efectivo
  never includes it.

### Task 2 — Inline quick-create, admin/owner-gated (commit 80ffeb39)

- Imported + mounted `CuentaBancariaFormDialog` in `CobrosPage.vue`, rendered `v-if=canCreateBankAccount`.
- `+ Nueva cuenta` exposed both as a `q-select` trailing action (`#after` slot) AND an inline
  text button below the selector; `Crear cuenta` button added to the admin/owner empty state —
  all gated on `canCreateBankAccount`.
- The dialog opens with `selected-country` (charge currency → AR/ES), `is-owner`, and the new
  `default-currency` (charge currency) prop. On `saved`: close, refetch
  `listBankAccounts(chargeCurrency)`, and auto-select the account that wasn't present before the
  refetch.
- Extended `CuentaBancariaFormDialog.vue` with an optional `defaultCurrency?: 'ARS' | 'EUR'`
  prop applied in `onShow()` for alta mode only (edit mode still locks currency, D-04).

## Verification

- Admin typecheck (`vue-tsc --noEmit`): no errors in `CobrosPage.vue` or `CuentaBancariaFormDialog.vue`.
- Task 1 greps: `listBankAccounts|selectedBankAccountId|Cuenta banco` = 13; `Elegí una cuenta bancaria` = 1; `bankAccountId` = 3; `text-caption` = 0.
- Task 2 greps: `CuentaBancariaFormDialog` = 3 (import + mount + saved wiring); `Nueva cuenta|Crear cuenta` = 5; `@saved="onBankAccountSaved"` present; create affordances guarded by `canCreateBankAccount`; `text-caption` = 0.

## Deviations from Plan

### Auto-added functionality

**1. [Rule 2 - Missing functionality] Added `defaultCurrency` prop to CuentaBancariaFormDialog**

- **Found during:** Task 2
- **Issue:** Must-have #4 and the plan require opening the dialog "with the charge currency
  preselected", but the dialog's `selectedCountry` prop is unused for currency and there was no
  lever to preselect it — the form always defaulted to `ARS`. For EUR charges the created
  account would not match the currency-filtered refetch and auto-select would silently fail.
- **Fix:** Added an optional `defaultCurrency?: 'ARS' | 'EUR'` prop, applied in `onShow()` only
  in alta mode (edit mode still locks currency per 150 D-04). Additive and backward-compatible —
  the existing `CuentasTab.vue` caller is unaffected (prop omitted → prior `ARS` default).
- **Files modified:** `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue`
- **Commit:** 80ffeb39

The plan's `files_modified` listed only `CobrosPage.vue`; this one additive prop on the reused
dialog was required to honor the stated preselect behavior faithfully.

## Threat Model Coverage

All `mitigate` dispositions implemented as UX-only guides backed by server authority:

- **T-151-04** (Elevation, quick-create): the `+ Nueva cuenta` / `Crear cuenta` affordances and
  the dialog mount are all gated on `canCreateBankAccount` (owner|admin) mirroring the server
  `ADMIN_ROLES` gate; hiding is UX only.
- **T-151-09** (Tampering/IDOR, selectedBankAccountId): only forwarded; `assertChosenBankAccount`
  (Plan 01) re-validates banco+active+currency server-side (400 on mismatch).
- **T-151-10** (Business-logic, transfer/card without account): UI disables finishing; the
  server independently rejects a missing/invalid bankAccountId (Plan 01).
- **T-151-SC** (package installs): no new dependencies; reused the phase-150 dialog + existing composable.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/pages/CobrosPage.vue (modified)
- FOUND: el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue (modified)
- FOUND commit: d5d0b322 (Task 1)
- FOUND commit: 80ffeb39 (Task 2)

---

_Phase: 151-registrar-cobro-pagos-cobros_
_Completed: 2026-07-03_
