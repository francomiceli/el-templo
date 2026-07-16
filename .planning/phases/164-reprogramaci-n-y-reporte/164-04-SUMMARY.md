---
phase: 164-reprogramaci-n-y-reporte
plan: 04
subsystem: admin-reports-ui
tags: [reports, trial-sessions, vue, quasar, lead-status-source, reschedules]

# Dependency graph
requires:
  - phase: 164-03
    provides: "reschedules + leadStatusSource por fila + filtro leadStatusSource=auto|manual en GET /reports/trial-sessions"
provides:
  - "Columna 'Reprogramaciones' por lead en el reporte de Sesiones de Prueba del admin"
  - "Indicador discreto 'Estado puesto a mano' junto al estado cuando leadStatusSource==='manual'"
  - "Filtro por origen (Automático/Manual) cableado al query param leadStatusSource"
affects: [TrialSessionsReport.vue, useReportsApi]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Header slot con q-th + q-tooltip para documentar la semántica de una columna"
    - "Indicador condicional discreto (q-icon + q-tooltip) sin colores nuevos"

key-files:
  created: []
  modified:
    - el-templo-admin/src/composables/useReportsApi.ts
    - el-templo-admin/src/components/reports/TrialSessionsReport.vue

key-decisions:
  - "Sólo leadStatusSource==='manual' muestra indicador; null/'auto' = automático/histórico (consistente con backend 164-03)"
  - "Indicador con ícono 'edit' text-grey-6 — paleta existente, sin colores nuevos (D-05)"
  - "buildTrialSessionsParams no se tocó — strippea undefined/null genéricamente, filtro clearable ya cubierto"

patterns-established:
  - "header-cell slot para tooltips explicativos de columnas del reporte"

requirements-completed: [REPRO-02, REPRO-03]

# Metrics
duration: 8min
completed: 2026-07-15
---

# Phase 164 Plan 04: Reprogramaciones + origen del estado en la UI del reporte de Sesiones de Prueba Summary

**Columna 'Reprogramaciones' con tooltip aclaratorio, indicador discreto auto/manual junto al estado del lead, y select de filtro por origen — todo consumiendo el contrato del backend 164-03, compilando/lint limpio.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `useReportsApi.ts`: `reschedules: number` y `leadStatusSource: 'auto'|'manual'|null` en `TrialSessionsRowClient`; `leadStatusSource?: 'auto'|'manual'` en `TrialSessionsFiltersClient`. `buildTrialSessionsParams` sin cambios (strippea genéricamente).
- `TrialSessionsReport.vue`:
  - Columna `reschedules` ("Reprogramaciones", center) al final del array `columns`.
  - Slot `#header-cell-reschedules` con `q-th` + `q-icon info` + `q-tooltip` documentando que cuenta TODAS las pruebas canceladas del lead (incl. self-service).
  - Indicador `q-icon edit` (text-grey-6) + `q-tooltip "Estado puesto a mano"` en el slot `#body-cell-leadStatus`, sólo cuando `leadStatusSource === 'manual'`.
  - `q-select` "Origen" (Automático/Manual, clearable, emit-value/map-options) ligado a `filters.leadStatusSource`; agregado al `interface Filters`, al reactive `filters`, y a `buildServerFilters` (`leadStatusSource: filters.leadStatusSource ?? undefined`).

## Task Commits

1. **Task 1: tipos cliente + columna + indicador + filtro** - `d1192a31` (feat)

**Plan metadata:** (docs commit — este SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `el-templo-admin/src/composables/useReportsApi.ts` - campos `reschedules`/`leadStatusSource` en el row client y `leadStatusSource?` en el filters client.
- `el-templo-admin/src/components/reports/TrialSessionsReport.vue` - columna + header tooltip + indicador manual + select de filtro por origen, cableado a `buildServerFilters`.

## Decisions Made
- Indicador sólo para `'manual'`; `null`/`'auto'` = automático/histórico, alineado con la semántica del filtro backend.
- Ícono `edit` en `text-grey-6` (paleta existente) — sin colores nuevos (D-05).
- No se tocó `buildTrialSessionsParams` (ya strippea undefined/null); el filtro clearable emite `null` → se stripea solo.

## Deviations from Plan

None - plan ejecutado exactamente como estaba escrito.

## Gate / Verification
- Gate local: `pnpm exec vue-tsc` NO está instalado en `el-templo-admin` (hallazgo de 164-02). Gate real usado: `pnpm exec eslint src/composables/useReportsApi.ts src/components/reports/TrialSessionsReport.vue` → **EXIT 0** (limpio).
- `grep "reschedules|leadStatusSource"` confirma columna + indicador + filtro en el .vue y los tipos en el composable.
- Verificación visual queda para el UAT de milestone (abrir el reporte → columna con conteos, ícono manual, select filtrando; auto incluye históricos).

## User Setup Required

None - sin migraciones, sin dependencias nuevas, sin config externa.

## Self-Check: PASSED
- FOUND: el-templo-admin/src/composables/useReportsApi.ts (reschedules/leadStatusSource)
- FOUND: el-templo-admin/src/components/reports/TrialSessionsReport.vue (columna/indicador/filtro)
- FOUND commit d1192a31 (Task 1)

---
*Phase: 164-reprogramaci-n-y-reporte*
*Completed: 2026-07-15*
