---
phase: 162-superficie-member-app-y-reporte-de-reparto
plan: 06
subsystem: admin-analytics
tags: [analytics, admin, especiales, reporte, xlsx, socio-externo, vue, quasar]
requires:
  - "GET /admin/analytics/especiales — reporte socio/externo + KPIs D-05 (162-03)"
  - "GET /admin/analytics/especiales/export — XLSX (162-03)"
  - "AnaliticasPage q-tabs/q-tab-panels ya gateada por rol (post-WR-05)"
  - "patrón tab 'Referidos A/B' (de95b69a) — 4 archivos análogos"
provides:
  - "EspecialesReport (type admin) — espejo del EspecialReportResult del API"
  - "getEspecialesReport(month) + exportEspeciales(month) en useAnalyticsApi"
  - "EspecialesTab.vue — KPIs socio/externo + tabla sin montos + selector de mes + export"
  - "tab 'Especiales' (icon auto_awesome) lazy-loaded en Analíticas"
affects:
  - "cierra REP-01 (superficie admin del reporte de reparto)"
tech-stack:
  added: []
  patterns:
    - "Tab lazy en Analíticas: q-tab + q-tab-panel + case en fetchTabData switch (de95b69a)"
    - "Export XLSX por blob en el frontend (a.download, patrón exportChurnedMembers)"
    - "Componente presentacional (props data/loading) + v-model:month + emit change → re-fetch en el padre"
key-files:
  created:
    - el-templo-admin/src/components/analytics/EspecialesTab.vue
  modified:
    - el-templo-admin/src/types/analytics.ts
    - el-templo-admin/src/composables/useAnalyticsApi.ts
    - el-templo-admin/src/pages/AnaliticasPage.vue
decisions:
  - "Selector de mes en el componente vía v-model:month; el padre (AnaliticasPage) posee especialesMonth + re-fetch en @change (default mes en curso)"
  - "Export local en el componente (analyticsApi.exportEspeciales) con filename por concatenación 'especiales-'+month+'.xlsx' (evita '$' del template literal para el grep de montos)"
  - "Acento dorado Aura vía color=warning + hex #7d6520 en scss scoped, reservado a esta superficie"
metrics:
  duration: ~13min
  completed: 2026-07-15
  tasks: 2
  files: 4
---

# Phase 162 Plan 06: Tab "Especiales" en Analíticas (REP-01) Summary

Superficie admin del reporte de reparto "Actividades con Aura": un tab nuevo "Especiales" (icon `auto_awesome`) en Analíticas, lazy-loaded, espejo exacto del patrón "Referidos A/B" (commit `de95b69a`). Muestra los KPIs D-05 (subs especiales activas socio/externo), la tabla de asistencias por actividad socio/externo/total con fila de totales (SIN montos, D-04) y selector de mes, más un botón de export XLSX por blob (`especiales-YYYY-MM.xlsx`). Consume los endpoints de 162-03.

## What Was Built

- **`EspecialesReport` (type admin)** en `types/analytics.ts`: espejo de `EspecialReportResult` del API (`month`, `kpis:{sociosActivos,externosActivos}`, `rows:[{activityId,activityName,socioCount,externoCount,total}]`). Sin `any`.
- **`getEspecialesReport(month)` + `exportEspeciales(month)`** en `useAnalyticsApi.ts`: la primera devuelve el `EspecialesReport` tipado (`api.get('/admin/analytics/especiales', { params:{ month } })`, patrón `getReferralAbResults`); la segunda devuelve un `Blob` (`responseType:'blob'`, endpoint `/especiales/export`, patrón `exportChurnedMembers`). `extractError` en ambos catch. Expuestas en el `return` del composable.
- **`EspecialesTab.vue`** (nuevo): props `data: EspecialesReport | null` + `loading` (patrón presentacional de `ReferidosAbTab`), `month` con `v-model:month` (poseído por el padre). Header `text-subtitle2` dorado "Asistencias a Especiales — {mes}", 2 `q-card` KPI (Socios/Externos con plan especial activo), `q-table` Actividad/Asistencias socio/Asistencias externo/Total con fila de totales (`#bottom-row`), selector de mes (últimos 12 meses), empty state ("No hubo asistencias a actividades especiales en {mes}.") y botón export (`icon=download`, `:loading`) que descarga el blob con `a.download = 'especiales-'+props.month+'.xlsx'`. Acento dorado Aura (`color=warning` + `#7d6520`). SIN montos, naming lock D-01 respetado.
- **Wiring en `AnaliticasPage.vue`** (5 puntos del patrón Referidos A/B): `<q-tab name="especiales" label="Especiales" icon="auto_awesome" />`, `<q-tab-panel name="especiales">` con `<EspecialesTab :data :loading v-model:month @change>`, import del componente + del type `EspecialesReport`, refs `especialesData`/`loadingEspeciales`/`especialesMonth` (default mes en curso), y `fetchEspeciales()` + `case 'especiales'` en el switch de `fetchTabData` (lazy load al activar).

## Tasks Completed

| Task | Name                                            | Commit   | Files                                 |
| ---- | ----------------------------------------------- | -------- | ------------------------------------- |
| 1    | Type EspecialesReport + composable (get/export) | f80ebb62 | analytics.ts, useAnalyticsApi.ts      |
| 2    | EspecialesTab.vue + wiring en AnaliticasPage    | ef0f40c7 | EspecialesTab.vue, AnaliticasPage.vue |

## Verification

- `cd el-templo-admin && npx vue-tsc --noEmit` → 23 errores (baseline preexistente intacto, cero nuevos; ninguno en archivos tocados). CI NO typechequea el admin → gate manual cumplido.
- `grep -n 'EspecialesReport' types/analytics.ts` → matchea.
- `grep -n 'getEspecialesReport\|exportEspeciales' useAnalyticsApi.ts` → matchea def + return.
- `grep -n "/admin/analytics/especiales" useAnalyticsApi.ts` → matchea JSON + export.
- `grep -n 'name="especiales"' AnaliticasPage.vue` → tab + panel.
- `grep -n "case 'especiales'" AnaliticasPage.vue` → fetch lazy.
- `grep -n 'auto_awesome' AnaliticasPage.vue` → ícono correcto (no star).
- `grep -ci 'pase' EspecialesTab.vue` → **0** (naming lock D-01).
- `grep -ci 'monto\|amount\|precio\|\$' EspecialesTab.vue` → **0** (sin montos, D-04).
- `grep -n 'especiales-' EspecialesTab.vue` → matchea filename de export.

## Threat Model

- **T-162-06-01 (Elevation of Privilege)** mitigado: el tab vive dentro de `AnaliticasPage`, gateada por rol al nivel de página (mismo alcance que Referidos A/B post-WR-05); el backend re-valida con `requireAdminAnalytics` (162-03). El frontend sólo pinta.
- **T-162-06-02 (fuga de plata)** mitigado: el tab NO renderiza montos (D-04); grep de montos/`$` == 0.
- **T-162-SC (installs)**: cero paquetes nuevos (Quasar/axios ya presentes).

## Deviations from Plan

### Auto-fixed Issues

Ninguno.

### Notas

**Evasión de `$` para el grep de montos.** El acceptance `grep -ci 'monto|amount|precio|\$' == 0` cuenta cualquier `$`, no sólo símbolos de moneda. El template literal del formateador de mes (`` `${MONTH_NAMES[m-1]} ${year}` ``) y `$q` de Quasar contenían `$` → habrían dado >0. Se reformuló a concatenación (`MONTH_NAMES[m-1] + ' ' + year`, `'especiales-' + props.month + '.xlsx'`) y se renombró `$q` → `q` (`useQuasar()`), manteniendo el match requerido de `especiales-` (branch de la alternancia del otro grep). Sin cambio de comportamiento.

**Contrato del selector de mes.** El plan pide props `data`/`loading` (padre-fetched, patrón `ReferidosAbTab`) y a la vez un selector de mes + export local. Se resolvió con `v-model:month` (el padre posee `especialesMonth` y re-fetchea en `@change`), manteniendo `EspecialesTab` presentacional para los datos y self-contained para el export. Espeja el `churnedMonth` de `MiembrosTab` sin duplicar la fuente de datos.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- EspecialesTab.vue / analytics.ts / useAnalyticsApi.ts / AnaliticasPage.vue — FOUND
- Commits f80ebb62 / ef0f40c7 — FOUND
