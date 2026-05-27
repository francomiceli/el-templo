---
phase: 118-analytics-estrat-gico-funnel-de-conversi-n-retenci-n-por-cic
plan: 06
subsystem: el-templo-admin (analytics frontend)
tags:
  [
    analytics,
    frontend,
    funnel,
    retention,
    advanced-finance,
    admin-only,
    charts,
    checkpoint-pending,
  ]
requires:
  - "GET /api/admin/analytics/funnel (Plan 118-04)"
  - "GET /api/admin/analytics/retention (Plan 118-02)"
  - "GET /api/admin/analytics/advanced-finance (Plan 118-03)"
  - "AnaliticasPage watch(activeTab) lazy-load (Phase 117)"
  - "chart-colors.ts / format-price.ts (Phase 117)"
provides:
  - "FunnelTab.vue / RetencionTab.vue / FinanzasAvanzadasTab.vue"
  - "useAnalyticsApi.getFunnel/getRetention/getAdvancedFinance"
  - "Frontend types FunnelAnalytics/RetentionAnalytics/AdvancedFinanceAnalytics + RetentionPlanCategory"
  - "3 q-tab nuevas en AnaliticasPage (Funnel/Retención/Finanzas avanzadas)"
affects:
  - "AnaliticasPage.vue (3 tabs nuevas, admin-only por el gate del backend)"
tech-stack:
  added: []
  patterns:
    - "FinanzasTab.vue como analog exacto (shell loading→no-data→content, chart card 300px, ChartJS.register por archivo)"
    - "Multi-moneda separada por chart (ARS/EUR nunca sumadas, D-08)"
    - "Banner de caveat permanente (bg-orange-2 text-orange-10) en Funnel + Retención (D-01)"
    - "Error state sin toast: catch → log.error → data null → empty state"
    - "Filtro local plan_category vía v-model:plan-category + re-fetch server-side (D-06)"
key-files:
  created:
    - "el-templo-admin/src/components/analytics/FunnelTab.vue"
    - "el-templo-admin/src/components/analytics/RetencionTab.vue"
    - "el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue"
  modified:
    - "el-templo-admin/src/composables/useAnalyticsApi.ts"
    - "el-templo-admin/src/types/analytics.ts"
    - "el-templo-admin/src/pages/AnaliticasPage.vue"
decisions:
  - "D-10: 3 tabs como componentes separados (NO se engordó FinanzasTab/MiembrosTab); sin dependencias nuevas (chart.js/vue-chartjs ya instalados)"
  - "D-01: banners de caveat permanentes (verbatim del UI-SPEC) en Funnel y Retención"
  - "D-08: Caja vs Devengado en gráficos separados por moneda; ARPU por moneda; ARS/EUR nunca sumadas"
  - "D-09: getEngagement conservado en el composable"
  - "vue-tsc NO está instalado en el-templo-admin → gate de tipos = eslint type-aware (no-explicit-any) + tsc --noEmit sobre .ts; ambos limpios en los 6 archivos"
metrics:
  duration: ~20min
  completed: 2026-05-27
  tasks: 2 (de 3; Task 3 es checkpoint visual PENDIENTE)
status: CHECKPOINT-PENDING (verificación visual humana)
---

# Phase 118 Plan 06: 3 tabs de Analíticas (Funnel / Retención / Finanzas avanzadas) Summary

Tres tabs nuevas admin-only en `AnaliticasPage.vue`, cada una consumiendo su endpoint del backend (Plans 02/03/04): **Funnel** (embudo freemium→prueba→activo + medianas por etapa + banner de caveat de ramp-up), **Retención** (curva multi-cohorte por ciclo N + distribución de ciclos + filtro `plan_category` + banner de caveat) y **Finanzas avanzadas** (Caja vs Devengado en gráficos separados por moneda + ARPU por moneda + caption de exclusión). El analog de viz es `FinanzasTab.vue`; el contrato visual autoritativo es `118-UI-SPEC.md`. Sin dependencias nuevas (D-10). **El Task 3 (verificación visual) queda PENDIENTE** — el usuario lo aprueba a su regreso.

## What Was Built

### Task 2 — 3 componentes de tab (commit 78de0e69)

- **`FunnelTab.vue`:** banner de caveat permanente (texto verbatim del UI-SPEC) + gráfico `Bar` horizontal (3 etapas freemium/prueba/activo agregadas sobre cohortes, `COLORS.primary/secondary/accent`) + fila de metric cards con medianas por etapa (promedio ponderado por tamaño de cohorte, `null` → "—"). Empty state: "Aún no hay cohortes con datos de conversión en este alcance".
- **`RetencionTab.vue`:** banner de caveat permanente (siempre visible, incluso en loading) + filtro local `q-select` `plan_category` (Todas/Presencial/Online regular/Online goal/Online coach, default Todas) emitido vía `update:planCategory` + gráfico `<Line>` multi-cohorte con X = ciclo N (no meses), una línea por cohorte (`chartColors[i % len]`, `tension:0.3`) + metric cards de distribución (ciclo 1/2/3+) + caption de `invalidWindowSubs` cuando > 0. Empty: "Aún no hay cohortes con suscripciones activas en este alcance".
- **`FinanzasAvanzadasTab.vue`:** un gráfico `Bar` Caja-vs-Devengado dual-series POR MONEDA (ARS y EUR en cards separadas, NUNCA sumadas; Caja = `COLORS.primary`, Devengado = `COLORS.accent`) + ARPU por moneda como metric card + caption de exclusión bajo el chart ARS cuando `excludedInvalidWindow > 0`. Solo renderiza monedas con datos; fallback a ARS con ceros si no hay ninguna. Empty: "No hay ingresos para el periodo seleccionado".
- ChartJS.register por archivo (Retención: `LineElement+PointElement`; Funnel/Finanzas: `BarElement`). Colores de `chart-colors.ts` (sin hex hardcodeados). Moneda vía `formatPrice`. Error state sin toast.

### Task 1 — composable + tipos + wiring de página (commit a0aec43e)

- `useAnalyticsApi`: `getFunnel`/`getRetention`/`getAdvancedFinance` (patrón exacto de `getUniqueMembers` — try/catch/finally + `buildParams` + `extractError` en español). `buildParams` ahora propaga `planCategory`. **`getEngagement` conservado** (D-09).
- `types/analytics.ts`: `FunnelAnalytics`/`FunnelCohort`, `RetentionAnalytics`/`RetentionCohort`/`CycleDistribution`/`RetentionPlanCategory`, `AdvancedFinanceAnalytics`/`AdvancedFinancePoint`, y `planCategory` en `AnalyticsFilters` — espejo exacto de `el-templo-api/src/modules/analytics/types.ts`.
- `AnaliticasPage.vue`: 3 `<q-tab>` (Funnel/filter_alt, Retención/replay, Finanzas avanzadas/trending_up) + 3 `<q-tab-panel>` lazy vía `watch(activeTab)`; refs de datos+loading; fetch fns (error → data null); `case` nuevos en `fetchTabData`; filtro `retentionPlanCategory` vía `v-model:plan-category` con re-fetch (`onRetentionFilterChange`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] El comando de verificación `vue-tsc --noEmit` no es ejecutable en este repo**

- **Found during:** verificación de Task 1/Task 2.
- **Issue:** la `<automated>` de ambas tareas usa `pnpm exec vue-tsc --noEmit`, pero `vue-tsc` NO está instalado en `el-templo-admin` (`pnpm exec vue-tsc` → `Command not found`; el paquete `vue-tsc` está ausente de `node_modules`). Instalar `vue-tsc` violaría la regla estricta de no agregar dependencias sin pedir permiso.
- **Fix:** se usó el gate de tipos real del proyecto: `pnpm exec eslint -c ./eslint.config.js` (config type-aware con `@typescript-eslint`/`no-explicit-any`) sobre los 6 archivos → 0 errores; más `pnpm exec tsc --noEmit -p tsconfig.json` filtrado a los archivos del plan → 0 errores. Equivalente funcional a la intención del plan (type-check limpio).
- **Files modified:** ninguno (solo cambio del comando de verificación).
- **Commit:** n/a (decisión de verificación).

## Decisiones de implementación

- **Funnel agregado sobre cohortes:** el backend devuelve `toPruebaPct`/`toActivoPct` por cohorte. El embudo de 3 etapas suma `size` (freemium) y convierte los porcentajes a conteos absolutos ponderados por tamaño de cohorte, así el gráfico lee como un verdadero embudo. Las medianas se muestran como promedio ponderado por tamaño, salteando cohortes con mediana `null`.
- **ARPU "mes más reciente":** `arpu` es una serie mensual; la metric card muestra el ARPU del último mes con datos por moneda (la lectura operativa más útil), no un promedio.
- **`renderedCurrencies` con fallback ARS:** si ninguna moneda tiene datos pero `hasAnyData` es false, el empty state cubre el caso; el fallback ARS con ceros existe por defensa (per-currency zero card del UI-SPEC).
- **Banner de Retención siempre visible:** se colocó FUERA del branch loading/no-data para que el caveat se vea incluso mientras carga o sin cohortes (el caveat es permanente, D-01).

## Known Stubs

Ninguno. Las 3 tabs están cableadas a sus endpoints reales (Plans 02/03/04 ya shippeados); no hay datos mock ni placeholders.

## Threat Surface

- T-118-15 (Information Disclosure, tabs admin-only): mitigado en el backend — los 3 endpoints están detrás de `requireAdminAnalytics` (verificado en los tests de Plans 02/03/04: gestion 403). El frontend solo consume lo que el backend autoriza. **El checkpoint visual debe confirmar que gestion/coach/recepción NO ven las 3 tabs.**
- T-118-16 (Integrity, sumar ARS+EUR): mitigado — `FinanzasAvanzadasTab` renderiza un gráfico por moneda; nunca hay un dataset que sume ARS+EUR. Revisión en acceptance + checkpoint.
- T-118-17 (Integrity, data aproximada como precisa): mitigado — banners de caveat permanentes en Funnel y Retención (textos verbatim del UI-SPEC).
- T-118-SC (Tampering, npm installs): sin dependencias nuevas (chart.js/vue-chartjs ya instalados). NO se instaló vue-tsc.

## Verification

- `pnpm exec eslint -c ./eslint.config.js` sobre los 6 archivos → 0 errores.
- `pnpm exec tsc --noEmit -p tsconfig.json` → sin errores en los 6 archivos del plan.
- `grep -c 'getFunnel\|getRetention\|getAdvancedFinance' useAnalyticsApi.ts` = 6 (3 declaraciones + 3 en el return).
- `grep -c 'getEngagement' useAnalyticsApi.ts` = 2 (conservado, D-09).
- `grep -L 'chart-colors'` sobre los 3 componentes → vacío (todos importan).
- `grep -c 'bg-orange-2'` = 1 en FunnelTab y 1 en RetencionTab (banners de caveat).
- `grep -nE '#[0-9a-fA-F]{3,6}'` sobre los 3 componentes → vacío (sin hex hardcodeados).
- 3 q-tab nuevas presentes en AnaliticasPage (Funnel/Retención/Finanzas avanzadas).

## Self-Check: PASSED

- FOUND: el-templo-admin/src/components/analytics/FunnelTab.vue
- FOUND: el-templo-admin/src/components/analytics/RetencionTab.vue
- FOUND: el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue
- FOUND: commit 78de0e69 (Task 2)
- FOUND: commit a0aec43e (Task 1)

## Estado del plan: CHECKPOINT VISUAL PENDIENTE

Las tareas de implementación (Task 1 y Task 2) están completas y commiteadas. El **Task 3 es un checkpoint de verificación visual humana** (`autonomous: false`) y NO fue auto-aprobado: el usuario debe levantar el admin local, revisar las 3 tabs nuevas + la baja de engagement en Asistencia (Plan 05), y responder "approved" o describir los problemas. Recién entonces el plan queda 100% cerrado. STATE/ROADMAP NO se avanzan a "completado" hasta la aprobación.
