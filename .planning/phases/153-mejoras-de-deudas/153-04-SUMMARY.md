---
phase: 153-mejoras-de-deudas
plan: 04
subsystem: admin
tags: [deudas, vencidos, expired-members, renewal-leads, quasar, rbac-ui, vue3]

# Dependency graph
requires:
  - phase: 153-mejoras-de-deudas
    plan: 02
    provides: "GET /admin/reports/expired-members (ExpiredMemberRow sin monto, paginado, 403 coach)"
  - phase: 153-mejoras-de-deudas
    plan: 03
    provides: "DeudasPage hub de tabs + DEUDAS_TABS.vencidos + DEUDAS_DETAIL_ROLES + visibleTabs/tabFromQuery"
provides:
  - "Tab 'Vencidos' en DeudasPage — leads de renovación (plan vencido 60d sin renovar, DEUDA-04)"
  - "VencidosTab.vue (tabla read-only sin monto) + getExpiredMembers en useTransactionsApi"
  - "Tipos frontend ExpiredMemberRow/ExpiredMembersFilters/ExpiredMembersResult"
affects: [DeudasPage.vue]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getExpiredMembers espeja getOutstandingBalances (loading/error, api.get, extractError) sin export ni currency"
    - "VencidosTab reusa la estructura de PorDeudaTab (filtros branch+search, Cargar más, no-data slot) SIN monto/buckets/export (D-06/D-13)"
    - "Tercer tab montado sobre visibleTabs (fuente única de render + validación ?tab=) con el mismo gate DEUDAS_DETAIL_ROLES que Por deuda"

key-files:
  created:
    - el-templo-admin/src/components/deudas/VencidosTab.vue
  modified:
    - el-templo-admin/src/types/transaction.ts
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-admin/src/pages/DeudasPage.vue

key-decisions:
  - "Orden por vencimiento más reciente delegado al backend (daysOverdue ASC, plan 153-02) — el front no reordena"
  - "VencidosTab recibe solo branchOptions + countryScope (sin displayCurrency/isOwner): no hay monto ni filtro de moneda (D-06)"
  - "Ambos tabs de detalle (Por deuda / Vencidos) comparten el mismo gate en visibleTabs — no se duplica lógica de gating (D-12)"

patterns-established:
  - "Tab de leads sin monto: q-table read-only sin acciones por fila (D-13), sin WhatsApp (diferido en CONTEXT §Deferred)"

requirements-completed: [DEUDA-04]

# Metrics
duration: ~3min
completed: 2026-07-04
---

# Phase 153 Plan 04: Tab "Vencidos" del hub de Deudas Summary

**DeudasPage suma el tercer tab "Vencidos": la cohorte de socios con plan vencido sin renovar en los últimos 60 días (DEUDA-04) como leads de renovación en una tabla read-only sin monto (nombre, teléfono, plan vencido, fecha de vencimiento, días transcurridos), consumiendo `GET /admin/reports/expired-members` del plan 153-02, gated igual que "Por deuda" (coach fuera en UI + API 403).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-07-04T18:14:28Z
- **Completed:** 2026-07-04T18:16:54Z
- **Tasks:** 3
- **Files changed:** 4 (1 creado, 3 modificados)

## Accomplishments

- Tipos frontend `ExpiredMemberRow`/`ExpiredMembersFilters`/`ExpiredMembersResult` en `types/transaction.ts`, espejando el contrato del backend (plan 153-02) — sin `amount`/`currency` (D-06), result paginado sin `bucketTotals`.
- `getExpiredMembers(filters)` en `useTransactionsApi`, copiando la estructura de `getOutstandingBalances` (loading/error, `api.get('/admin/reports/expired-members', { params })`, `extractError`, finally), registrado en el objeto de retorno del composable.
- `VencidosTab.vue`: q-table read-only (sin acciones por fila — D-13) con columnas Nombre / Teléfono / Plan vencido / Fecha de vencimiento (formateada) / Días transcurridos; sin monto, sin buckets, sin export, sin WhatsApp (diferido). Filtros sucursal + búsqueda, "Cargar más" paginado, slot `#no-data`, error vía `createLogger` + `$q.notify`.
- Tercer `q-tab` + `q-tab-panel` en `DeudasPage` para `DEUDAS_TABS.vencidos` (label "Vencidos"), gated por `canSeeDetail`/`DEUDAS_DETAIL_ROLES` igual que "Por deuda"; `visibleTabs` ahora incluye `vencidos`, por lo que `tabFromQuery` cae al default si el coach fuerza `?tab=vencidos` (T-153-09 mitigada en UI; la defensa real es el 403 del endpoint).

## Task Commits

1. **Task 1: getExpiredMembers en useTransactionsApi** - `559851dd` (feat)
2. **Task 2: VencidosTab.vue (tabla read-only sin monto)** - `68802746` (feat)
3. **Task 3: Wire del tab "Vencidos" en DeudasPage** - `e8765735` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/transaction.ts` (MOD) - trío `ExpiredMemberRow`/`ExpiredMembersFilters`/`ExpiredMembersResult` (sin monto, paginado).
- `el-templo-admin/src/composables/useTransactionsApi.ts` (MOD) - import de los tipos + método `getExpiredMembers` + registro en el return.
- `el-templo-admin/src/components/deudas/VencidosTab.vue` (NEW) - tabla read-only de leads de renovación.
- `el-templo-admin/src/pages/DeudasPage.vue` (MOD) - import de VencidosTab, tercer q-tab/q-tab-panel gated, `visibleTabs` incluye `vencidos`.

## Decisions Made

- **Orden delegado al backend:** el endpoint del plan 153-02 ya devuelve el cohorte ordenado por `daysOverdue` ASC (vencimiento más reciente primero, D-06/§Claude's Discretion), así que VencidosTab no reordena.
- **Props mínimos:** VencidosTab recibe solo `branchOptions` + `countryScope`. No toma `displayCurrency`/`isOwner` porque no hay monto ni filtro de moneda (D-06), a diferencia de PorDeudaTab.
- **Gate compartido, no duplicado:** los dos tabs de detalle usan `canSeeDetail` y aparecen juntos en `visibleTabs`; el gating de "Vencidos" no introduce un set de roles distinto (D-12).

## Deviations from Plan

None - plan executed exactly as written. Los tres tasks se implementaron según el plan; el gate local `pnpm lint` quedó verde tras cada task (0 errores; solo warnings pre-existentes en archivos ajenos al plan).

## Issues Encountered

- Ninguno. `pnpm lint` verde en los 3 tasks.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — VencidosTab consume datos reales de `GET /admin/reports/expired-members` (plan 153-02). El tab se renderiza y wirea completo; no queda ningún panel vacío ni referencia colgada.

## Next Phase Readiness

- DEUDA-04 cerrado en UI: la cohorte de no-renovaciones vive en el tab "Vencidos", separada de las deudas reales (D-04). El botón de WhatsApp por fila queda diferido (CONTEXT §Deferred) — el teléfono ya está en la fila si Nacho lo pide después.
- `pnpm lint` verde en el-templo-admin; los tests de la API (expired-members) corren en CI al pushear (preferencia del usuario: no correr suites localmente).

## Self-Check: PASSED

All modified/created files present on disk; all 3 task commits (`559851dd`, `68802746`, `e8765735`) present in git history.

---

_Phase: 153-mejoras-de-deudas_
_Completed: 2026-07-04_
