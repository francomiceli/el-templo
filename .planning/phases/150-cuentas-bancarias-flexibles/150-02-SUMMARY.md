---
phase: 150-cuentas-bancarias-flexibles
plan: 02
subsystem: finance
tags: [cash-registers, bank-accounts, crud, json-schema, fastify]
requires:
  - "6 columnas bancarias en cash_registers (plan 01)"
  - "CreateBankAccountInput/UpdateBankAccountInput/BankAccountRow domain types (plan 01)"
  - "getBalance(firmeBalance) de CashRegisterService (phase 138)"
provides:
  - "CRUD de cuentas bancarias en CashRegisterService (create/update/close/reactivate/list)"
  - "4 JSON Schemas Fastify del ABM (create/update/close/reactivate)"
  - "helpers deriveBankAccountName (D-03) + assertTransferIdentifier uno-de-dos (D-02)"
affects:
  - "el-templo-api finance routes (plan 03 monta los handlers sobre estos schemas + métodos)"
tech-stack:
  added: []
  patterns:
    - "Validación uno-de-dos en el service (no en el schema), espejo de registerExpense"
    - "Moneda fija post-creación: doble barrera (schema sin currency + service nunca la incluye en el SET)"
    - "Baja lógica vía is_active (sin DELETE) — conserva historial y saldo firme"
key-files:
  created: []
  modified:
    - "el-templo-api/src/modules/finance/schemas.ts"
    - "el-templo-api/src/modules/finance/cash-register-service.ts"
decisions:
  - "Nombre de cuenta derivado en el service (D-03): 'Banco · alias' o fallback 'Banco ····NNNN' (últimos 4 dígitos de CBU/CVU o número)"
  - "Regla uno-de-dos (CBU/CVU o Alias) vive en el service, no en el JSON Schema (D-02)"
  - "currency inmutable en update: doble barrera schema (sin la propiedad) + service (nunca en el SET), D-04/T-150-17"
  - "listBankAccounts NO filtra por is_active — incluye cerradas (D-07)"
metrics:
  duration: ~3min
  completed: 2026-07-03
  tasks: 2
  files: 2
---

# Phase 150 Plan 02: Cuentas Bancarias Flexibles — Service ABM Summary

Concentró las reglas de negocio del ABM de cuentas bancarias en `CashRegisterService` (CRUD + derivación de nombre D-03 + validación uno-de-dos D-02 + ciclo de vida is_active D-06/D-07 + moneda inmutable D-04) y agregó sus 4 JSON Schemas de validación Fastify, dejando la lógica lista para que los routes del plan 03 la monten.

## What Was Built

**Task 1 — 4 JSON Schemas del ABM** (`df22190a`, `schemas.ts`):

- `createBankAccountSchema`: body con `required: ["bankName","accountHolder","currency"]` (solo 3 obligatorios a nivel schema, D-02), `currency` restringido a enum `["ARS","EUR"]`, campos bancarios opcionales `["string","null"]` con maxLength coherente con las columnas (bankName 100, accountHolder 120, taxId 20, cbuCvu 34, accountAlias 60, accountNumber 50), `additionalProperties: false`, response con `errorSchema` en 400/401/403/404/500.
- `updateBankAccountSchema`: mismo body pero SIN `required` y OMITIENDO por completo `currency` de las `properties` (con `additionalProperties: false`, un PATCH que traiga `currency` es rechazado a nivel schema — moneda fija post-creación, D-04) + `params: { id }`.
- `closeBankAccountSchema` / `reactivateBankAccountSchema`: solo `params: { id }` + response `errorSchema`.
- Fragmentos compartidos `BANK_ACCOUNT_OPTIONAL_PROPS` y `BANK_ACCOUNT_ID_PARAMS` (DRY entre los 4 schemas).

**Task 2 — CRUD en `CashRegisterService`** (`1ee654a5`, `cash-register-service.ts`):

- `createBankAccount(input)`: INSERT con `type:'banco'`, `branchId:null`, `openingBalance:0`, `cutoffDate` = hoy, `name` derivado (D-05); valida uno-de-dos ANTES de escribir; devuelve `BankAccountRow` con `balance = firmeBalance`.
- `updateBankAccount(id, input)`: guard NotFound + `type='banco'` (T-150-04), mergea SOLO campos bancarios, recalcula name, revalida uno-de-dos sobre el estado resultante; `currency` NUNCA entra al SET (D-04/T-150-17, defensa en profundidad además del schema).
- `closeBankAccount(id)`: `is_active=false` sin DELETE (D-06); devuelve el saldo FIRME actual (no bloquea el cierre con saldo≠0 — el front arma la advertencia).
- `reactivateBankAccount(id)`: `is_active=true` (D-07).
- `listBankAccounts()`: cuentas `type='banco'` activas Y cerradas (sin filtrar `is_active`, D-07), cada una con `balance = firmeBalance` (CAJA-03).
- Helpers privados: `deriveBankAccountName` (D-03), `assertTransferIdentifier` (D-02), `getBankAccountRow` (lectura + guard + mapeo a `BankAccountRow`), `today()`.

## Verification

- `pnpm build` (tsc) verde tras cada task.
- `grep -c` de los 5 métodos CRUD ≥ 5 (acceptance criterion Task 2).
- `createBankAccountSchema.required === ["bankName","accountHolder","currency"]`; `updateBankAccountSchema` no declara `currency`.
- `currency` enum `["ARS","EUR"]` en create; ningún schema declara `required` para cbuCvu/accountAlias.
- `updateBankAccount` no incluye `currency` en el `.set()`; close/reactivate solo alternan `is_active` vía UPDATE (sin DELETE); `listBankAccounts` no filtra por `is_active`.
- Sin `any`; errores tipados desde `../shared/errors`; logging vía `this.log` (Pino), nunca console.

## Deviations from Plan

Ninguna — el plan se ejecutó exactamente como estaba escrito. Los tests corren en CI al pushear (suite local no se corre por preferencia del proyecto); typecheck local verde.

## Threat Model Compliance

- **T-150-04** (tampering id): guard `NotFoundError` + verificación `type='banco'` en `getBankAccountRow`, reusado por update/close/reactivate — no se pueden mutar cajas efectivo por este camino.
- **T-150-05** (info disclosure formato): validación liviana (solo presencia de identificador), maxLength en el schema acota el tamaño persistido.
- **T-150-06** (repudiation): operaciones loggeadas con `this.log`; baja lógica conserva el registro (no DELETE).
- **T-150-17** (tampering currency): doble barrera schema (sin la propiedad) + service (nunca en el SET).

El control de autorización (admin/owner-only) se aplica en el handler (plan 03), no en el service — como indica el plan.

## Known Stubs

Ninguno. Los métodos del service están completamente cableados a `cash_registers` y a `getBalance`; los routes que los exponen vienen en el plan 03.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/schemas.ts (4 schemas del ABM)
- FOUND: el-templo-api/src/modules/finance/cash-register-service.ts (5 métodos CRUD + helpers)
- FOUND commit: df22190a (Task 1)
- FOUND commit: 1ee654a5 (Task 2)
