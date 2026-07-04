---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
plan: 06
subsystem: admin-caja-ui
tags: [caja, cost-centers, abm, frontend-only, white-label, dry]
requires:
  - "152-04 (rutas ABM cost-centers: POST/PATCH/deactivate/reactivate + GET /cost-centers/all, tipo CostCenter con isActive)"
  - "152-05 (cambios previos en useTransactionsApi.ts + types/transaction.ts, mismos archivos que este plan toca)"
provides:
  - "métodos ABM cost-center en useTransactionsApi (listAllCostCenters/createCostCenter/renameCostCenter/deactivateCostCenter/reactivateCostCenter)"
  - "tipo CostCenter (con isActive) + CreateCostCenterInput/RenameCostCenterInput; selector renombrado a CostCenterItem"
  - "CategoriaEgresoFormDialog.vue (crear/renombrar categoría de egreso, single q-input)"
  - "sección 'Categorías de egreso' en CuentasTab (tabla país-scoped con baja lógica)"
affects:
  - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue (import CostCenterItem)"
tech-stack:
  added: []
  patterns:
    - "ABM de catálogo espejando el ABM de cuentas bancarias en el mismo tab (D-07): tabla + dimming + badge, baja lógica, sin borrado físico"
    - "Segunda sección apilada país-scoped: loadCostCenters en onMounted + watch(selectedCountry) (única desviación vs cuentas banco, país-agnósticas)"
    - "Mirror fiel del backend: selector active-only = CostCenterItem (sin isActive); ABM = CostCenter (con isActive)"
key-files:
  created:
    - "el-templo-admin/src/components/caja/CategoriaEgresoFormDialog.vue"
  modified:
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/components/caja/CuentasTab.vue"
    - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue"
decisions:
  - "Rename del tipo FE CostCenter → CostCenterItem (selector active-only) para reservar CostCenter al ABM full-row (con isActive), mirror exacto del backend (CostCenterItem vs CostCenter). Evita el type lie de agregar isActive al shape del selector que el backend nunca devuelve"
  - "listAllCostCenters recibe country: 'AR' | 'ES' directo (no un params obj): el ABM SIEMPRE pasa el país del selector (D-08 país-scoped), a diferencia del selector active-only cuyo country es opcional"
  - "El diálogo colapsa a un solo q-input name con regla required-trim; la unicidad por país (409) la valida el backend y se surfacea vía extractError + notify"
metrics:
  duration: ~12min
  completed: 2026-07-04
requirements: [CAJA-05]
---

# Phase 152 Plan 06: ABM de categorías de egreso en la UI (CAJA-05) Summary

Cierra el ABM white-label de categorías de egreso (levanta EGR-F2 diferido de v5.3): dentro del tab Cuentas se agrega una segunda sección apilada "Categorías de egreso" que replica el patrón del ABM de cuentas bancarias (D-07) — tabla con filas atenuadas + badge "Cerrada" para las dadas de baja (D-08), acciones crear/renombrar/desactivar/reactivar, sin borrado físico. Consume las rutas admin/owner-only de 152-04. A diferencia del ABM de cuentas (país-agnóstico), esta sección es país-scoped (D-08, nombre único por país): mantiene el `watch` del selector de país de CajaPage. Nacho administra el catálogo desde la UI sin tocar seeds.

## What Was Built

- **Task 1 — api client + tipo CostCenter** (`23be55d2`): 5 métodos nuevos en `useTransactionsApi` consumiendo las rutas de 152-04 — `listAllCostCenters(country)` → `GET /cost-centers/all?country=` (`{ centers }`), `createCostCenter({ name, country })` → `POST /cost-centers` (`{ center }`, 201), `renameCostCenter(id, { name })` → `PATCH /cost-centers/:id` (`{ center }`), `deactivateCostCenter(id)`/`reactivateCostCenter(id)` → `POST /cost-centers/:id/{deactivate,reactivate}` (`{ center }`), todos con el manejo request/extractError del composable (sin `onUnmounted` dentro). En `types/transaction.ts`: nuevo `CostCenter { id, name, country, isActive }` (mirror del ABM full-row del backend) + `CreateCostCenterInput`/`RenameCostCenterInput`; el shape del selector active-only se renombró a `CostCenterItem` (mirror del `CostCenterItem` del backend, sin isActive) para evitar el type lie.
- **Task 2 — CategoriaEgresoFormDialog.vue** (`1c95b061`): copia simplificada de `CuentaBancariaFormDialog` colapsada a un único `q-input` para `name` con regla required-trim. `v-model` computed `show`; `isEditMode` computed según `props.categoria`; `submit()` ramifica `createCostCenter({ name, country: selectedCountry })` (alta) vs `renameCostCenter(id, { name })` (edición); `try/catch (err: unknown)` con `extractError` + `$q.notify({ type: 'negative' })` + `log.error` (surfacea el 409 de unicidad por país); emite `saved` al éxito; `onUnmounted(cleanup)` a nivel SFC.
- **Task 3 — sección Categorías de egreso en CuentasTab** (`3bb784e7`): segunda sección apilada bajo el ABM de cuentas (separada por `q-separator`), heading "Categorías de egreso" + botón "Nueva categoría". Tabla de `costCenters` con filas atenuadas (`:class="{ 'text-grey-5': !row.isActive }"`) + `q-badge` "Cerrada" (D-08); acciones editar (abre el dialog en modo edición) + toggle desactivar (con `$q.dialog` confirm, warning simple sin saldo)/reactivar (directo). Estado propio: `costCenters` ref, `loadCostCenters()` (extractError + notify), `openCreateCategoria`/`openEditCategoria`/`onSavedCategoria`. `loadCostCenters()` usa `props.selectedCountry` y se llama en `onMounted` + dentro del `watch(() => props.selectedCountry, ...)` (país-scoped, D-08).

## Verification

- `npx vue-tsc --noEmit` en el-templo-admin: sin errores en ninguno de los 4 archivos del plan (verificado por task y en conjunto). Los errores de tsc en otros archivos (test files sin `vitest`, charts, `session-pdf-builder`, etc.) son PREEXISTENTES y ajenos a este plan (SCOPE BOUNDARY, mismos que 152-05 registró).
- Sin `console.*` ni `any` en los archivos del plan.
- Respuestas de las rutas confirmadas contra el backend (152-04): `{ center }` / `{ centers }`, base `/admin/finance/cost-centers`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / consistencia de tipos] Rename del tipo FE `CostCenter` → `CostCenterItem` + toque de `RegistrarMovEgresoDialog.vue`**

- **Found during:** Task 1
- **Issue:** El plan pide "agregar la interface `CostCenter` (id, name, country, isActive)", pero el FE YA tenía un `CostCenter { id, name, country }` (sin isActive) que juega el rol del `CostCenterItem` del backend (selector active-only). Agregarle `isActive` al mismo tipo sería un type lie: `GET /cost-centers` (selector) devuelve `CostCenterItem` del backend, que NO trae `isActive`.
- **Fix:** Se renombró el shape del selector a `CostCenterItem` (mirror exacto del backend) y se reservó `CostCenter` para el ABM full-row con `isActive`. Se actualizaron los 2 consumidores del selector: el return type de `getCostCenters` y el import/ref de `RegistrarMovEgresoDialog.vue` (`CostCenter` → `CostCenterItem`, cambio de 2 líneas). `RegistrarMovEgresoDialog.vue` no estaba en los files del plan, pero el rename lo requería y es un swap puramente de nombre de tipo.
- **Files modified:** `el-templo-admin/src/types/transaction.ts`, `el-templo-admin/src/composables/useTransactionsApi.ts`, `el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue`
- **Commit:** `23be55d2`

## Threat Model Compliance

- **T-152-14** (Elevation of Privilege, acciones del ABM en la UI): mitigado — la autorización real vive en la API (152-04, guard `ADMIN_ROLES` en las 5 rutas); la UI consume esas rutas y solo oculta según rol, no es la barrera de seguridad (149 D-04).
- **T-152-15** (Tampering, nombre duplicado): mitigado — el backend rechaza con 409 por unicidad por país; el dialog surfacea el error vía `extractError` + `$q.notify({ type: 'negative' })`.
- **T-152-16** (Tampering, scope de país): mitigado — el país se toma del selector de CajaPage (`props.selectedCountry`) y se pasa como param a `listAllCostCenters` + en el body del alta; el backend re-resuelve owner-aware (152-04).
- **T-152-SC** (installs): aceptado — este plan no instaló paquetes.

## Notes for Downstream Plans

- El tipo FE del selector active-only es ahora `CostCenterItem` (sin `isActive`); el ABM usa `CostCenter` (con `isActive`). Cualquier consumidor nuevo del selector de egresos debe importar `CostCenterItem`.
- `listAllCostCenters(country)` es país-scoped por diseño (recibe country directo, no opcional): el ABM siempre pasa el país del selector.
- La sección de categorías vive en `CuentasTab.vue` junto al ABM de cuentas bancarias; si se pide separar en tabs propios, extraer la segunda sección a un componente hermano reusando `CategoriaEgresoFormDialog`.

## Self-Check: PASSED
