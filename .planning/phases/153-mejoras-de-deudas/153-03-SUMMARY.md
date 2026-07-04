---
phase: 153-mejoras-de-deudas
plan: 03
subsystem: admin
tags:
  [
    deudas,
    tabs-hub,
    quasar,
    rbac-ui,
    outstanding-balances,
    reportes-removal,
    vue3,
  ]

# Dependency graph
requires:
  - phase: 153-mejoras-de-deudas (plan 01)
    provides: OutstandingBalanceRow enriquecido (reasonLabel/periodStart/periodEnd/registeredAt/notes) en /admin/reports/outstanding-balances
  - phase: 152-reorganizaci-n-de-caja
    provides: patrón de hub de tabs (CajaPage + constants/caja.ts, ?tab= sync, gating owner)
provides:
  - "DeudasPage como hub de 2 tabs (Por socio / Por deuda) con ?tab= sync y gating por rol (D-12)"
  - "constants/deudas.ts (DEUDAS_TABS/DEUDAS_DEFAULT_TAB/DEUDAS_TAB_NAMES) — contrato ?tab= estable, incluye vencidos para 153-04"
  - "DEUDAS_DETAIL_ROLES en templo-config (espeja CAJA_ROLES, excluye coach)"
  - "PorDeudaTab con Motivo/Fecha de registro/período (subtítulo)/nota (tooltip) — DEUDA-01/02/03/D-11"
affects:
  [
    153-04 (agrega el tab Vencidos al hub — VencidosTab + wiring),
    ReportesPage (pierde el reporte de Deudas),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hub de tabs Quasar con visibleTabs computado por rol: tabFromQuery cae al default si el tab pedido no es visible (no solo si no existe)"
    - "Nota libre en q-tooltip + ícono indicador sobre la celda de Motivo (dato secundario sin robar columna, D-11)"

key-files:
  created:
    - el-templo-admin/src/constants/deudas.ts
    - el-templo-admin/src/components/deudas/PorSocioTab.vue
    - el-templo-admin/src/components/deudas/PorDeudaTab.vue
  modified:
    - el-templo-admin/src/config/templo-config.ts
    - el-templo-admin/src/pages/DeudasPage.vue
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-admin/src/types/transaction.ts
  deleted:
    - el-templo-admin/src/components/DeudasReport.vue

key-decisions:
  - "Período (DEUDA-03) como subtítulo dd/mm–dd/mm bajo el Motivo, no columna propia — mantiene la tabla compacta y agrupa motivo+ciclo"
  - "Nota (D-11) en q-tooltip sobre la celda de Motivo + ícono sticky_note_2 como affordance de que hay nota"
  - "Redirect explícito de ?tab=deudas en Reportes NO implementado (discrecional): la degradación a 'accesos' vía VALID_TABS ya evita el link roto sin sumar useRouter"
  - "Fecha devengo (D-10) conservada tal cual junto a la nueva Fecha de registro — son datos distintos (ciclo vs alta)"

patterns-established:
  - "visibleTabs computed = fuente única de verdad de qué tabs se renderizan Y de la validación de ?tab= (coach forzando ?tab=porDeuda cae al default)"

requirements-completed: [DEUDA-01, DEUDA-02, DEUDA-03]

# Metrics
duration: ~5min
completed: 2026-07-04
---

# Phase 153 Plan 03: DeudasPage hub de tabs (Por socio / Por deuda) Summary

**DeudasPage pasa a ser un hub de tabs (patrón CajaPage): "Por socio" es la tabla agregada actual movida verbatim (cobro en la puerta, coach-visible) y "Por deuda" es el reporte detallado mudado desde Reportes ahora con Motivo, Fecha de registro, período del ciclo y la nota libre en tooltip (DEUDA-01/02/03); el reporte salió de Reportes sin links rotos y el coach no ve el tab de detalle (D-12).**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-04T18:03:37Z
- **Completed:** 2026-07-04T18:08:42Z
- **Tasks:** 3
- **Files:** 3 creados, 4 modificados, 1 borrado

## Accomplishments

- `constants/deudas.ts` con el contrato de tabs (`DEUDAS_TABS`/`DEUDAS_DEFAULT_TAB = porSocio`/`DEUDAS_TAB_NAMES`), incluyendo `vencidos` ahora para que el `?tab=` sea estable cuando el plan 153-04 lo wiree.
- `DEUDAS_DETAIL_ROLES = ['gestion','admin','owner']` en templo-config (espeja `CAJA_ROLES` de la API; `DEUDAS_ROLES` intacto sigue gobernando el acceso a la página completa con coach).
- `DeudasPage` reescrita como hub de 2 tabs con `?tab=` sync (`router.replace`, sin polución de history), selector de país owner-only y gating por rol: el coach solo ve "Por socio" y `tabFromQuery` cae al default si el tab pedido no es visible para el rol.
- `PorSocioTab` = extracción verbatim del cuerpo actual (useCoachApi, sin cambios de columnas, D-01).
- `PorDeudaTab` = mudanza de `DeudasReport` con export Excel/buckets/"Cargar más" intactos + columnas nuevas Motivo (`reasonLabel`) y Fecha de registro (`registeredAt`), período `dd/mm–dd/mm` como subtítulo del motivo y nota libre en `q-tooltip` (D-11).
- Reportes pierde el reporte de Deudas (5 puntos de remoción: q-tab, q-tab-panel, import, `deudasBranchOptions`, `'deudas'` de `VALID_TABS`); `?tab=deudas` degrada a `'accesos'`.

## Task Commits

1. **Task 1: constants/deudas.ts + DEUDAS_DETAIL_ROLES** - `53537c57` (feat)
2. **Task 2: DeudasPage hub + PorSocioTab (extracción verbatim)** - `04bb0234` (feat)
3. **Task 3: PorDeudaTab (mudanza + columnas nuevas) + remoción en Reportes** - `4d371c1c` (feat)

## Files Created/Modified

- `el-templo-admin/src/constants/deudas.ts` (NEW) - contrato de tabs de Deudas (analog de `constants/caja.ts`).
- `el-templo-admin/src/components/deudas/PorSocioTab.vue` (NEW) - cuerpo actual de DeudasPage movido sin cambios (useCoachApi).
- `el-templo-admin/src/components/deudas/PorDeudaTab.vue` (NEW) - reporte detallado por deuda mudado de DeudasReport + Motivo/Fecha de registro/período/nota.
- `el-templo-admin/src/config/templo-config.ts` (MOD) - `DEUDAS_DETAIL_ROLES` nuevo.
- `el-templo-admin/src/pages/DeudasPage.vue` (MOD) - hub de tabs con gating y ?tab= sync.
- `el-templo-admin/src/pages/ReportesPage.vue` (MOD) - remoción del reporte de Deudas (5 puntos).
- `el-templo-admin/src/types/transaction.ts` (MOD) - `OutstandingBalanceRow` gana los 5 campos del plan 153-01.
- `el-templo-admin/src/components/DeudasReport.vue` (DELETED) - se mudó a PorDeudaTab, no se comparte.

## Decisions Made

- **Período como subtítulo, no columna:** `dd/mm–dd/mm` bajo el Motivo mantiene la tabla compacta (ya son 11 columnas) y agrupa visualmente motivo + ciclo.
- **Nota en tooltip + ícono:** un `q-tooltip` sobre la celda de Motivo con un `sticky_note_2` de affordance evita robar una columna a un dato secundario (D-11).
- **Redirect explícito de ?tab=deudas no implementado:** discrecional en el plan; la degradación automática a `'accesos'` vía `VALID_TABS` ya evita el link roto sin sumar `useRouter` a ReportesPage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Frontend `OutstandingBalanceRow` no declaraba los 5 campos del plan 153-01**

- **Found during:** Task 3
- **Issue:** El plan 153-01 enriqueció el endpoint API y el tipo de la API (`reports/types.ts`), pero el tipo del admin `src/types/transaction.ts::OutstandingBalanceRow` seguía sin `reasonLabel`/`periodStart`/`periodEnd`/`registeredAt`/`notes`. PorDeudaTab no podía referenciarlos sin errores de tipo.
- **Fix:** Agregados los 5 campos al tipo del admin espejando exactamente los nombres/nullability de la API.
- **Files modified:** `el-templo-admin/src/types/transaction.ts`
- **Commit:** `4d371c1c`

## Issues Encountered

- Orden de tasks: la Task 2 reescribe DeudasPage referenciando `PorDeudaTab` que recién crea la Task 3. El eslint del admin no resuelve módulos (`import/no-unresolved` no configurado), así que el `pnpm lint` de la Task 2 pasó; el estado final (post Task 3) queda con el import resuelto. Se respetó la estructura de 3 commits del plan.

## User Setup Required

None.

## Known Stubs

None — el tab "Por deuda" consume datos reales del endpoint enriquecido (plan 153-01). El tab "Vencidos" NO es un stub: está declarado en el contrato `?tab=` pero deliberadamente no renderizado (lo agrega el plan 153-04); `visibleTabs` no lo incluye, así que no hay panel vacío ni referencia a `VencidosTab`.

## Next Phase Readiness

- El plan 153-04 agrega el tab "Vencidos": `DEUDAS_TABS.vencidos` y su lugar en `DEUDAS_TAB_NAMES` ya existen; solo falta crear `VencidosTab.vue`, sumarlo a `visibleTabs`, al `q-tabs` y a un `q-tab-panel` en DeudasPage.
- El gate por rol ya cubre "Vencidos": `DEUDAS_DETAIL_ROLES` aplica a ambos tabs de detalle.
- `pnpm lint` verde en el-templo-admin; los tests corren en CI (preferencia del usuario: no correr suites localmente).

## Self-Check: PASSED

All 3 created files present on disk (constants/deudas.ts, PorSocioTab.vue, PorDeudaTab.vue); DeudasReport.vue confirmed deleted; ReportesPage.vue has 0 refs to DeudasReport; all 3 task commits (`53537c57`, `04bb0234`, `4d371c1c`) present in git history.

---

_Phase: 153-mejoras-de-deudas_
_Completed: 2026-07-04_
