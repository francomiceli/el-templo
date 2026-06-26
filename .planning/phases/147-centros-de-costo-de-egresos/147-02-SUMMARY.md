---
phase: 147-centros-de-costo-de-egresos
plan: 02
subsystem: admin/caja
tags: [frontend, finance, cost-centers, egresos, arqueo]
requires:
  - "147-01: GET /admin/finance/cost-centers + costCenterName en listMovEgresos + POST /expenses exige costCenterId"
provides:
  - "Selector obligatorio de centro de costo en el dialog de egreso (EGR-02 UI)"
  - "Columna 'Centro de costo' en la lista del arqueo por caja (EGR-03 UI)"
  - "useTransactionsApi.getCostCenters(params) → CostCenter[]"
affects:
  - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue"
  - "el-templo-admin/src/components/caja/MovEgresosTab.vue"
tech-stack:
  added: []
  patterns:
    - "Selector country-scoped owner-aware (mismo patrón que loadCajas/getCashRegisterBalances)"
    - "Default razonable preseleccionado y cambiable (no forzado silenciosamente)"
key-files:
  created: []
  modified:
    - "el-templo-admin/src/types/transaction.ts"
    - "el-templo-admin/src/composables/useTransactionsApi.ts"
    - "el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue"
    - "el-templo-admin/src/components/caja/MovEgresosTab.vue"
decisions:
  - "'Varios' preseleccionado como escape (visible, cambiable); cae al primero del catálogo si no estuviera"
  - "Columna del .xlsx export DIFERIDA (EGR-03 pide solo 'la lista muestra')"
  - "Centro de costo en el detail dialog con v-if (solo filas expense); columna de tabla muestra '—' en no-expense"
metrics:
  duration: "~12 min"
  completed: 2026-06-26
---

# Phase 147 Plan 02: Centros de costo de egresos (Frontend) Summary

Frontend de los centros de costo de egresos: selector obligatorio de centro de costo (default "Varios", cambiable) en la tab "Egreso" del dialog de registro, y columna "Centro de costo" en la lista del arqueo por caja, alimentados por los contratos del backend de 147-01.

## What Was Built

- **Tipos (`transaction.ts`)** — `RegisterExpenseInput.costCenterId: number` (required), `MovEgresoItem.costCenterName: string | null` (mirror backend), e interfaces nuevas `CostCenter { id, name, country }` y `CostCenterParams { country? }`.
- **Composable (`useTransactionsApi.ts`)** — método `getCostCenters(params: CostCenterParams = {}): Promise<CostCenter[]>` contra `GET /admin/finance/cost-centers`, copiando el patrón de `getCashRegisterBalances` (loading/error, `extractError('Error cargando centros de costo')`). Expuesto en el objeto de retorno.
- **Dialog de egreso (`RegistrarMovEgresoDialog.vue`)** — estado `costCenters`/`loadingCostCenters`, `egreso.costCenterId`, `loadCostCenters()` llamado en `onShow()` (junto a `loadCajas`), `costCenterOptions` computed. `q-select` "Centro de costo \*" en la tab egreso (después de Caja, antes de Monto). "Varios" preseleccionado tras la carga (cambiable). `canSubmitEgreso` exige `costCenterId !== null` → botón "Registrar egreso" deshabilitado sin elección. `submitEgreso` envía `costCenterId`; `resetAll` lo limpia.
- **Lista del arqueo (`MovEgresosTab.vue`)** — columna `centro` ("Centro de costo", `field: costCenterName`) tras "Caja"; template `#body-cell-centro` renderiza `row.costCenterName || '—'`; q-item "Centro de costo" en el detail dialog con `v-if="detailRow.costCenterName"`. No se tocó el filtro Tipo, el export Excel ni la lógica de cobros/estado.

## How to Verify

- **Visual (UAT manual, fuera del run autónomo):** abrir el hub `/caja` → tab "Movimientos de caja" → "Registrar" → tab "Egreso": aparece "Centro de costo \*" con "Varios" preseleccionado; el botón se habilita solo con caja+centro+monto. Registrar un egreso y confirmar que la fila muestra el nombre del centro en la columna "Centro de costo"; las demás filas (cobros/movimientos/ajustes) muestran "—".

## Deviations from Plan

None — plan ejecutado tal cual. Las decisiones de ambigüedad previstas por el plan/CONTEXT ("Varios" preseleccionado, export diferido, detail con v-if) se registraron en `.planning/AUTONOMOUS-DECISIONS-v5.3.md` (Fase 147 / 147-02).

## Typecheck

`pnpm exec vue-tsc --noEmit` filtrado por los 4 archivos tocados (`transaction.ts`, `useTransactionsApi.ts`, `RegistrarMovEgresoDialog.vue`, `MovEgresosTab.vue`): **sin errores**. Los ~23 errores pre-existentes ajenos (AssignPlanDialog/BandejaPendientesTab/DeudasPage/HorariosPage/treemap/sessions) quedan fuera de scope.

## Commits

- `ef3e52d1` feat(admin/147-02): types + getCostCenters composable para centros de costo
- `ccb06774` feat(admin/147-02): selector obligatorio de centro de costo en dialog de egreso
- `ada4120f` feat(admin/147-02): columna 'Centro de costo' en lista del arqueo

## Self-Check: PASSED

- Archivos modificados existen y typecheck verde.
- 3 commits atómicos presentes en `git log`.
