---
phase: 150-cuentas-bancarias-flexibles
plan: 04
subsystem: finance
tags: [cash-registers, bank-accounts, admin-ui, vue, quasar, dialog]
requires:
  - "5 endpoints HTTP del ABM bajo /api/admin/finance/cash-registers (plan 03)"
  - "Tipos backend BankAccountRow/CreateBankAccountInput/UpdateBankAccountInput (plan 01)"
provides:
  - "Tipos frontend BankAccount/CreateBankAccountInput/UpdateBankAccountInput (Update sin currency)"
  - "5 métodos API del ABM en useTransactionsApi (list/create/update/close/reactivate)"
  - "CuentaBancariaFormDialog.vue reutilizable de alta/edición (CTA-01)"
affects:
  - "el-templo-admin fase 151 (COBRO-04 monta el dialog inline en el flujo de cobro, D-11)"
  - "el-templo-admin plan 150-05 (la pantalla del ABM lista/monta este dialog)"
tech-stack:
  added: []
  patterns:
    - "Métodos API espejo de registerExpense (loading/error + try api.* + catch extractError + finally reset)"
    - "Dialog reutilizable patrón RegistrarMovEgresoDialog (show computed, onShow prefill, resetAll @hide, onUnmounted cleanup)"
    - "Moneda fija post-creación: select :disable en edición + UpdateBankAccountInput sin currency (doble barrera con el backend)"
key-files:
  created:
    - "el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue"
  modified:
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
decisions:
  - "UpdateBankAccountInput OMITE currency — moneda fija post-creación (D-04), espeja el contrato backend"
  - "Sin campo 'Nombre' en el form — se deriva en el service (D-03)"
  - "Validación de formato liviana (CBU/CVU 22 díg., CUIT 11 díg.) NO bloqueante — no rechaza cuentas del exterior (Claude's Discretion)"
metrics:
  duration: ~8min
  completed: 2026-07-03
  tasks: 2
  files: 3
---

# Phase 150 Plan 04: Cuentas Bancarias Flexibles — Frontend ABM (tipos + API + dialog) Summary

Construyó la capa de datos del frontend del ABM (3 tipos + 5 métodos de `useTransactionsApi`) y el `CuentaBancariaFormDialog.vue` reutilizable de alta/edición, habilitando CTA-01 en la UI con un form flexible (3 obligatorios, sin campo Nombre, moneda fija al editar) listo para que la fase 151 lo monte inline en el flujo de cobro (D-11).

## What Was Built

**Task 1 — Tipos frontend + 5 métodos API** (`87112ba3`):

- 3 interfaces exportadas en `types/transaction.ts` sin `any`: `BankAccount` (forma de lectura con `balance` = saldo firme, CAJA-03), `CreateBankAccountInput` (3 obligatorios bankName/accountHolder/currency + opcionales nullable), `UpdateBankAccountInput` (mismos campos opcionales, SIN `currency` — moneda fija post-creación, D-04).
- 5 métodos en `useTransactionsApi.ts` siguiendo el patrón exacto de `registerExpense` (set loading/error → try `api.*` tipado → catch `extractError` + throw → finally reset loading): `listBankAccounts` (GET), `createBankAccount` (POST), `updateBankAccount` (PATCH, input sin currency), `closeBankAccount` (POST /:id/close → `{ account, balance }`), `reactivateBankAccount` (POST /:id/reactivate). Rutas bajo `/admin/finance/cash-registers`. Mensajes de `extractError` en español. Los 5 agregados al `return {}` del composable.

**Task 2 — CuentaBancariaFormDialog.vue reutilizable** (`d014e0f1`):

- SFC siguiendo el patrón de `RegistrarMovEgresoDialog.vue`. Props `{ modelValue, selectedCountry, isOwner, account? }` (account presente = edición, ausente = alta); emits `update:modelValue` + `saved`. `show` computed get/set; `isEditMode = computed(() => !!props.account)`.
- Form `reactive` con bankName, accountHolder, currency (default 'ARS'), cbuCvu, accountAlias, taxId, accountNumber. SIN campo "Nombre" (D-03). Banco/Titular/Moneda marcados obligatorios (asterisco + rules Quasar).
- Select de moneda renderizado siempre; en modo edición `:disable="isEditMode"` con hint explicativo (moneda FIJA post-creación, D-04).
- `canSubmit`: bankName + accountHolder + currency no vacíos y (cbuCvu O accountAlias) — espejo uno-de-dos del backend (D-02), con hint y mensaje de error en vivo.
- Validación de formato liviana no bloqueante: `cbuCvuRule` (avisa si son dígitos y no son 22), `taxIdRule` (avisa si no son 11 díg.) — no rechaza cuentas del exterior.
- Prefill desde `props.account` en `onShow`. `submit` ramifica: con account → `updateBankAccount(id, input)` (input `UpdateBankAccountInput`, sin currency); sin account → `createBankAccount(input)` (con currency). `$q.notify` positive → `show=false` → `emit('saved')`; catch `extractError` + notify negative. `resetAll` en `@hide`. `onUnmounted(() => transactionsApi.cleanup())` en el SFC. Sin `console.*`, sin `any`, logging vía `createLogger`.

## Verification

- `vue-tsc --noEmit` sin errores en los 3 archivos del plan (los únicos errores del check son pre-existentes en `src/utils/pdf/session-pdf-builder.ts` / `session-data-transformer.ts`, tipos de `@types/pdfmake`, ajenos a este plan y registrados en `deferred-items.md`).
- `eslint` limpio sobre `CuentaBancariaFormDialog.vue` (props declaradas no marcadas como unused; lint-staged corrió eslint --fix + prettier en ambos commits sin errores).
- `UpdateBankAccountInput` no declara `currency`; el PATCH del dialog nunca la envía.
- 5 métodos expuestos y retornados por el composable con rutas `/admin/finance/cash-registers` (+/close, +/reactivate).

## Deviations from Plan

Ninguna — el plan se ejecutó exactamente como estaba escrito. Los errores TS pre-existentes de `src/utils/pdf/*` son fuera de scope (no causados por este plan) y quedaron registrados en `deferred-items.md`.

## Threat Model Compliance

- **T-150-10** (elevation acceso al form): aceptado — la superficie es admin/owner-only pero la seguridad real la impone la API (plan 03); el gate del frontend es solo UX.
- **T-150-11** (tampering uno-de-dos): `canSubmit` valida por UX; el backend re-valida en el service (plan 02) — no se confía en el gate del cliente.
- **T-150-12** (info disclosure): errores mapeados a español vía `extractError` sin exponer internals; `createLogger` en vez de console.
- **T-150-16** (tampering moneda en edición): select deshabilitado al editar + `UpdateBankAccountInput` sin `currency` + el PATCH nunca la envía; el backend re-enforcea la inmutabilidad (D-04).

## Known Stubs

Ninguno. El dialog está cableado a los 5 métodos reales del composable, que apuntan a los endpoints del plan 03. La pantalla que lista/monta el dialog viene en el plan 150-05.

## Self-Check: PASSED

- FOUND: el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue
- FOUND: el-templo-admin/src/types/transaction.ts (BankAccount/CreateBankAccountInput/UpdateBankAccountInput)
- FOUND: el-templo-admin/src/composables/useTransactionsApi.ts (5 métodos ABM)
- FOUND commit: 87112ba3 (Task 1)
- FOUND commit: d014e0f1 (Task 2)
