---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 04
subsystem: finance (ABM de centros de costo)
tags: [finance, cost-centers, abm, rbac, uniqueness, tests]
requires:
  - "152-01 (uniqueIndex uq_cost_centers_name_country + seeds genéricos en migración 0165)"
  - "152-03 (cambios previos del mismo módulo finance: routes/schemas/types)"
provides:
  - "CRUD de cost_centers en cash-register-service (create/rename/deactivate/reactivate/listAll)"
  - "assertUniqueName (guard de unicidad por país, belt-and-suspenders con el uniqueIndex 0165)"
  - "rutas ABM POST/PATCH/deactivate/reactivate/GET-all bajo /cost-centers con guard ADMIN_ROLES"
  - "schemas createCostCenterSchema/renameCostCenterSchema/toggleCostCenterSchema/costCentersAllSchema"
  - "tipo CostCenter (id, name, country, isActive) en types.ts"
affects:
  - "152-06 (UI del ABM que consume estas rutas)"
tech-stack:
  added: []
  patterns:
    - "CRUD de catálogo espejando el ABM de cuentas bancarias (fase 150): guard ADMIN_ROLES en-handler + handleServiceError + baja lógica"
    - "assertUniqueName apoyado en la collation MySQL default (case-insensitive) para alinear con el uniqueIndex DB"
    - "listAll dropea el filtro isActive (espeja listBankAccounts); el selector active-only queda intacto"
key-files:
  created:
    - "el-templo-api/test/finance/cost-centers-abm.test.ts"
  modified:
    - "el-templo-api/src/modules/finance/cash-register-service.ts"
    - "el-templo-api/src/modules/finance/routes.ts"
    - "el-templo-api/src/modules/finance/schemas.ts"
    - "el-templo-api/src/modules/finance/types.ts"
decisions:
  - "Unicidad devuelve ConflictError → 409 (no BadRequest 400): el plan menciona ambos en distintos lugares; 409 es semánticamente correcto para conflicto de recurso y el schema lo registra"
  - "assertUniqueName usa eq(name) apoyado en la collation case-insensitive de MySQL — no distingue 'Alquiler' de 'alquiler', alineado con el uniqueIndex 0165"
  - "toggleCostCenterSchema compartido por deactivate+reactivate (mismo shape: solo params id) en vez de dos schemas idénticos (DRY)"
  - "renombrar un centro a su mismo nombre NO colisiona (excludeId en assertUniqueName) — test explícito"
metrics:
  duration: ~15min
  completed: 2026-07-04
---

# Phase 152 Plan 04: ABM de centros de costo desde la API (CAJA-05) Summary

Backend del ABM de centros de costo (levanta EGR-F2 diferido de v5.3): CRUD completo en `cash-register-service.ts` (crear/renombrar/desactivar/reactivar/listAll), rutas CRUD en `routes.ts` con el guard in-handler `ADMIN_ROLES` (patrón bank-accounts fase 150), schemas de validación estricta y el tipo `CostCenter`. Sin borrado físico (D-08): la baja es lógica (`is_active=false`), lo que saca la categoría del selector de egresos sin cambios extra (registerExpense ya filtra activos). Unicidad de nombre por país con doble barrera (guard en el service + uniqueIndex DB de la migración 0165). La seguridad real vive en la API (149 D-04); la UI de 152-06 solo esconde.

## What Was Built

- **Task 1 — CRUD en el service** (`d3fb154b`): métodos `createCostCenter(name, country)`, `renameCostCenter(id, name)`, `deactivateCostCenter(id)`, `reactivateCostCenter(id)`, `listAllCostCenters(country)` (activos + inactivos, espejando `listBankAccounts`) + un helper privado `getCostCenterRow(id)` (guard NotFound) y el guard `assertUniqueName(name, country, excludeId?)` que lanza `ConflictError` — belt-and-suspenders con el uniqueIndex, apoyado en la collation case-insensitive de MySQL. Deactivate/reactivate = `set({ isActive: false/true })`, sin ningún `.delete(` sobre cost_centers (D-08). Tipo `CostCenter` (id, name, country, isActive) en `types.ts`. `npx tsc --noEmit` verde.
- **Task 2 — rutas + schemas** (`637546be`): 5 rutas nuevas — `POST /cost-centers`, `PATCH /cost-centers/:id`, `POST /cost-centers/:id/deactivate`, `POST /cost-centers/:id/reactivate`, `GET /cost-centers/all` — cada escritura con el guard `ADMIN_ROLES` verbatim del patrón bank-accounts (`reply.code(403)`) y `handleServiceError` en el catch (ConflictError → 409). El `GET /cost-centers` original (active-only, selector de egresos) queda intacto. Resolución de país owner-aware copiada del GET existente. En `schemas.ts`: `createCostCenterSchema` (name 1..100 + country enum AR/ES), `renameCostCenterSchema` (solo name), `toggleCostCenterSchema` (compartido deactivate/reactivate), `costCentersAllSchema`, todos con `additionalProperties: false` y `COST_CENTER_ID_PARAMS`. `npx tsc --noEmit` verde.
- **Task 3 — tests de integración** (`7167e50a`): `cost-centers-abm.test.ts` adaptado del harness de `bank-accounts.test.ts` (createTestApp + createStaffUser + getAuthToken + cleanup de ids). 12 casos, **12/12 verdes contra `eltemplo_test` local**: CRUD happy path (owner 2xx); unicidad por país → 409 (crear duplicado + renombrar a existente) + renombrar a su mismo nombre → 200; RBAC gestion/coach → 403 en create/rename/deactivate/reactivate + GET /all; egreso con centro desactivado → 400 (activo pasa 201, luego se desactiva vía ABM y el mismo egreso es rechazado); GET /cost-centers/all incluye el inactivo y GET /cost-centers (selector) lo excluye.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Unicidad devuelta como 409, no 400**

- **Found during:** Task 1
- **Issue:** El plan menciona la unicidad como `409` en los must_haves/threat_model pero como "BadRequestError/ConflictError" en las interfaces y "→ 400" en la sección de Tests. Un 400 para un conflicto de recurso ya existente es semánticamente incorrecto.
- **Fix:** `assertUniqueName` lanza `ConflictError` → 409; los schemas de create/rename registran `409: errorSchema`; el test de unicidad espera 409. Alineado con los must_haves ("devuelve 409") y el threat register (T-152-10).
- **Files modified:** `cash-register-service.ts`, `schemas.ts`, `cost-centers-abm.test.ts`
- **Commit:** `d3fb154b` / `637546be` / `7167e50a`

## Out-of-Scope Discoveries (deferred)

- **`test/finance/cost-centers.test.ts` referencia seeds viejos** (`"Alquiler Constitución"`/`"Viáticos profes"`) que la migración 0165 del plan 152-01 renombró a `"Alquiler"`/`"Viáticos"`. Ese test fallará en CI hasta actualizar 2 literales. Causa: sibling plan 152-01, NO este plan. Registrado en `deferred-items.md`; NO corregido (archivo/task distinta, scope boundary).

## Threat Model Compliance

- **T-152-08** (Elevation of Privilege, escrituras cost-centers): mitigado — guard in-handler `ADMIN_ROLES` (NO FINANCE_VOID_ROLES) en las 5 rutas; test explícito gestion/coach → 403.
- **T-152-09** (Tampering, body create/rename): mitigado — `additionalProperties:false`, name minLength/maxLength (1..100), country enum ["AR","ES"].
- **T-152-10** (Tampering, unicidad de nombre): mitigado — `assertUniqueName` en el service + uniqueIndex DB (0165) → doble barrera, 409 (test crear+renombrar duplicado).
- **T-152-11** (Tampering, borrado con egresos imputados): mitigado — sin DELETE físico; baja lógica is_active=false; egreso con centro desactivado → 400 (test).
- **T-152-SC** (installs): aceptado — esta fase no instala paquetes.

## Notes for Downstream Plans

- **152-06 (UI):** consumir `POST/PATCH/POST-deactivate/POST-reactivate /cost-centers` (respuesta `{ center }`) y `GET /cost-centers/all?country=` (respuesta `{ centers }`, incluye inactivos) para el ABM; el selector de egresos sigue usando `GET /cost-centers` (active-only). El 409 de unicidad debe surfacearse con un notify claro. Todas las rutas son admin/owner-only server-side.

## Self-Check: PASSED
