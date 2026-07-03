---
phase: 150-cuentas-bancarias-flexibles
plan: 03
subsystem: finance
tags: [cash-registers, bank-accounts, routes, rbac, integration-tests, fastify]
requires:
  - "CRUD de cuentas bancarias en CashRegisterService (plan 02)"
  - "4 JSON Schemas del ABM: create/update/close/reactivate (plan 02)"
  - "Tipos CreateBankAccountInput/UpdateBankAccountInput/BankAccountRow (plan 01)"
  - "Migración 0163: 6 columnas bancarias + seed 'Retiros' (plan 01)"
provides:
  - "5 endpoints HTTP del ABM bajo /api/admin/finance (POST/PATCH/close/reactivate/GET /cash-registers)"
  - "Guard admin/owner-only (ADMIN_ROLES) en-handler sobre las 4 escrituras (D-12)"
  - "Suite de integración bank-accounts.test.ts (10 casos: CRUD, guard, seed, moneda inmutable)"
affects:
  - "el-templo-admin (planes 04/05 consumen estos endpoints para el ABM de cuentas)"
tech-stack:
  added: []
  patterns:
    - "Guard en-handler stricter (ADMIN_ROLES) sobre el hook de módulo (FINANCE_READ_ROLES), espejo de POST /expenses"
    - "Cuentas banco = branchId=null country-agnostic → sin filtro de country scope (a diferencia de egresos/cost-centers)"
    - "Response del ABM sin response-schema 2xx registrado → la forma { account } / { accounts } no se filtra"
key-files:
  created:
    - "el-templo-api/test/finance/bank-accounts.test.ts"
  modified:
    - "el-templo-api/src/modules/finance/routes.ts"
decisions:
  - "GET /cash-registers NO lleva guard stricter — el hook de módulo (FINANCE_READ_ROLES) ya excluye a coach; solo las escrituras exigen ADMIN_ROLES (D-12)"
  - "close devuelve { account, balance }: re-fetch vía listBankAccounts para honrar el contrato del <interfaces> del plan (el service solo devuelve balance)"
  - "ADMIN_ROLES (no FINANCE_VOID_ROLES) en todas las escrituras — gestion queda EXCLUIDO del ABM (T-150-07)"
metrics:
  duration: ~15min
  completed: 2026-07-03
  tasks: 2
  files: 2
---

# Phase 150 Plan 03: Cuentas Bancarias Flexibles — Routes ABM + Tests Summary

Expuso el CRUD de cuentas bancarias (plan 02) como 5 endpoints HTTP bajo `/api/admin/finance` con guard admin/owner-only en las escrituras (D-12) y los cubrió con una suite de integración obligatoria (CTA-01/CTA-02 end-to-end, incluyendo autorización, ciclo de vida, seed 'Retiros' y moneda inmutable D-04).

## What Was Built

**Task 1 — 5 endpoints ABM en routes.ts** (`dba9a3ad`):

- Registrados dentro del plugin `financeRoutes` (prefijo real `/api/admin/finance`):
  - `POST /cash-registers` → `createBankAccount` → 201 `{ account }`
  - `PATCH /cash-registers/:id` → `updateBankAccount` → 200 `{ account }`
  - `POST /cash-registers/:id/close` → `closeBankAccount` → 200 `{ account, balance }`
  - `POST /cash-registers/:id/reactivate` → `reactivateBankAccount` → 200 `{ account }`
  - `GET /cash-registers` → `listBankAccounts` → 200 `{ accounts }`
- Cada escritura empieza con el guard en-handler stricter: `ADMIN_ROLES` (no `FINANCE_VOID_ROLES`, que incluiría gestion) → 403 si el rol no pertenece (patrón espejo de `POST /expenses`).
- Cuentas banco = `branchId=null` (country-agnostic): NO se aplica el filtro `resolveCajaCountry`/`enforceCajaScope`; el guard admin/owner cubre el acceso (PATTERNS nota country-scope).
- Imports agregados: los 4 schemas nuevos de `./schemas`, `ADMIN_ROLES` de `../shared/permissions`, y los tipos `CreateBankAccountInput`/`UpdateBankAccountInput` de `./types`.
- Errores canalizados por `handleServiceError`; schema adjunto en cada ruta.

**Task 2 — Suite de integración bank-accounts.test.ts** (`affe0638`):

- Harness idéntico a `cost-centers.test.ts` (`createTestApp`, `createStaffUser`, `getAuthToken`, `import * as schema`, tokens `ownerToken`/`gestionToken`/`coachToken`), con cleanup de las cuentas creadas en `afterAll`.
- 10 casos `it(...)`: (1) crear con 3 obligatorios + alias → 201 y `name` = "Banco Galicia · templo.caja.ars" (D-03); (2) crear sin CBU/CVU ni Alias → 400 (uno-de-dos D-02); (3) crear solo con CBU/CVU → 201 y name fallback "···· últimos-4"; (4) PATCH que completa campos → 200 y name recalculado; (5) close → 200, presente en el ABM con `isActive=false` pero ausente de `/cash-registers/balances` (cajas operativas); (6) reactivate → 200 y `isActive=true`; (7-9) guard gestion→403, coach→403, owner→201 (D-12); (10 en dos describe) seed 'Retiros' (AR) presente + moneda fija D-04 (PATCH con `currency:'EUR'` NO cambia la moneda almacenada, sigue 'ARS').
- Sin `any` (interfaz `BankAccountBody` local para tipar las respuestas).

## Verification

- `pnpm build` (tsc sobre `src/**`) verde tras cada task.
- Typecheck dirigido del test (tsconfig extendido con rootDir raíz) → `bank-accounts.test.ts` sin errores. El único error del check es preexistente en `test/helpers.ts` (TS2783 `id` duplicado), ajeno a este plan y fuera de scope; CI transpila los tests con esbuild/vitest (no tsc), por lo que no bloquea.
- 5 rutas registradas: verificado por grep (`POST/GET /cash-registers`, `PATCH/close/reactivate /cash-registers/:id`); sin colisión (POST y GET comparten path pero distinto método).
- Los tests de integración corren en CI contra MySQL real (convención del proyecto: suite no se corre localmente).

## Deviations from Plan

### Auto-fixed / decisiones de contrato

**1. [Rule 3 - contrato] `close` re-fetchea la cuenta para devolver `{ account, balance }`**

- **Found during:** Task 1
- **Issue:** El `<interfaces>` del plan documenta `POST /:id/close → 200 { account, balance }`, pero `closeBankAccount(id)` del service (plan 02) devuelve solo `{ balance }` (no expone la fila, y `getBankAccountRow` es privado).
- **Fix:** El handler llama `closeBankAccount` para el balance y luego `listBankAccounts().find(a => a.id === id)` para adjuntar `account` (misma forma `BankAccountRow`, `isActive=false`). A escala de un puñado de cuentas no hay N+1 real. Honra el contrato para el frontend (planes 04/05) sin tocar el service.
- **Files modified:** `el-templo-api/src/modules/finance/routes.ts`
- **Commit:** `dba9a3ad`

Nota (no-deviation): `GET /cash-registers` se dejó SIN guard stricter a propósito — el hook de módulo (`FINANCE_READ_ROLES`) ya excluye a coach, y los must_haves solo exigen 403 en los endpoints de ESCRITURA. Solo las 4 escrituras aplican `ADMIN_ROLES`.

## Threat Model Compliance

- **T-150-07** (elevation, escrituras ABM): guard en-handler con `ADMIN_ROLES` en create/update/close/reactivate (NO `FINANCE_VOID_ROLES`); tests afirman gestion→403 y coach→403. La seguridad real vive en la API (149 D-04).
- **T-150-08** (tampering `/:id`): el service (plan 02) valida existencia + `type='banco'` (`NotFoundError`); el schema fuerza `id` integer ≥1; el ciclo close→reactivate está cubierto por tests.
- **T-150-09** (spoofing hook): autenticación previa por el hook `FINANCE_READ_ROLES` (routes.ts) antes del guard stricter del ABM.
- **T-150-18** (tampering currency): `updateBankAccountSchema` rechaza `currency` (additionalProperties:false) y el service nunca la muta; el test afirma que la moneda almacenada no cambia (D-04).

## Known Stubs

Ninguno. Los 5 endpoints están cableados a los métodos del `CashRegisterService`; el frontend que los consume viene en los planes 04/05.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/finance/routes.ts (5 rutas /cash-registers con guard ADMIN_ROLES)
- FOUND: el-templo-api/test/finance/bank-accounts.test.ts (10 casos it)
- FOUND commit: dba9a3ad (Task 1)
- FOUND commit: affe0638 (Task 2)
