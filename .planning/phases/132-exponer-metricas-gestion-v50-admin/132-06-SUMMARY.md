---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 06
subsystem: analytics-frontend
tags:
  [
    analytics,
    vue,
    quasar,
    integration,
    tabs,
    filters,
    deprecation,
    D-07,
    D-08,
    D-09,
    D-15,
    D-16,
    D-17,
    D-18,
  ]
requires:
  - 6 typed fetch methods on useAnalyticsApi (132-03)
  - ConversionTab.vue + IngresosTab.vue (132-04)
  - RetencionGestionTab.vue + FrecuenciaTab.vue (132-05)
  - membersApi.getPlans(includeArchived, { branchId, country }) (existing)
provides:
  - AnaliticasPage wires the 6 v5.0 metrics across 4 thematic tabs (Conversión/Retención/Asistencia/Ingresos) in D-07/D-08 grouping+order
  - Plan filter (all 6 metrics) + Turno filter (conversión+frecuencia only) global selects (D-09)
  - Deprecated screens physically removed (FunnelTab.vue + its wiring D-17; Renovación 7/14/30 + Tasa de retención cards D-15/D-18; ARPU card D-16)
affects:
  - phase 132 human-verify (visual UAT of the 4 tabs + filters)
tech-stack:
  added: []
  patterns:
    - per-tab lazy fetch (fetchTabData switch on activeTab) — extended with 4 new cases
    - global filter row spread into currentFilters (planId) + per-fetch turno passthrough
    - scope-change vs filter-change split (country/branch re-scope the plan list; plan/turno/date do not)
key-files:
  created: []
  modified:
    - el-templo-admin/src/pages/AnaliticasPage.vue
    - el-templo-admin/src/components/analytics/MiembrosTab.vue
    - el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue
  deleted:
    - el-templo-admin/src/components/analytics/FunnelTab.vue
decisions:
  - "Verified .vue with eslint (type-aware) — vue-tsc is NOT a dependency of el-templo-admin; same caveat as 132-03/04/05. Full SFC template typecheck runs in CI / quasar build."
  - "Added a dedicated onScopeChange (country/branch) that refetches the plan list before the metrics, and drops a now-out-of-scope plan selection; plan/turno/date keep using onFilterChange (no plan-list refetch loop)"
  - "Renamed the conserved per-cycle retention tab label from 'Retención' to 'Retención (ciclos)' (icon timeline) to disambiguate from the new D-07 'Retención' (churn+renovación) tab — the new tab owns the primary 'Retención' label per D-08"
  - "FunnelEntryOrigin + FunnelAnalytics type DEFINITIONS left in types/analytics.ts (still referenced by other features / doc comments); only the page imports were removed"
metrics:
  duration: ~15min
  completed: 2026-06-05
---

# Phase 132 Plan 06: AnaliticasPage Integration + Deprecation Cleanup Summary

The integration + cleanup plan (wave 5): wired the 4 new tab components from plans
132-04/05 into `AnaliticasPage.vue` in the locked D-07 thematic grouping and D-08
usage-rhythm order, added the Plan (all 6 metrics) and Turno (conversión + frecuencia
only) global filters per D-09, and physically deleted every deprecated screen the 6
new metrics replace (D-15/D-16/D-17/D-18) — with grep gates confirming no dead
imports, orphan components, or dead fetch calls remain (SC-3/SC-4). The conserved
views (AsistenciaTab.vue, getMemberAnalytics, Caja vs Devengado, operational Miembros
counts, RetencionTab per-cycle, FinanzasTab) were left intact per D-20/D-21.

## What Was Built

### Task 1 — mount 4 tabs + plan/turno filters (`7c94e40d`)

- Imported `ConversionTab` / `RetencionGestionTab` / `FrecuenciaTab` / `IngresosTab`
  and the 6 analytics types (`TrialFunnelAnalytics`, `ChurnAnalytics`,
  `RenewalAnalytics`, `FrequencyAnalytics`, `TicketAnalytics`, `LtvAnalytics`).
- **Plan filter (D-09):** new `q-select` (`dense outlined emit-value map-options`)
  bound to `selectedPlanId = ref<number | null>(null)`, options from
  `planOptions` populated by `membersApi.getPlans(false, { branchId, country })`
  (first option "Todos los planes" = null). Fetched in `onMounted` alongside
  `fetchBranches`; re-fetched on country/branch change via the new `onScopeChange`,
  which also drops a stale plan selection that falls out of the new scope.
- **Turno filter (D-09/D-10):** new `q-select` (Mañana=`manana` / Tarde=`tarde` /
  "Todos los turnos"=null) bound to `selectedTurno`, shown ONLY when `activeTab` is
  `'conversion'` or `'frecuencia'` (`showTurnoFilter` computed v-if).
- **currentFilters:** spreads `planId: selectedPlanId.value ?? undefined` (applies
  to all 6). Turno is NOT in currentFilters — passed per-fetch only by conversión +
  frecuencia.
- **4 tabs in D-08 order** added at the FRONT of `<q-tabs>`: Conversión
  (`filter_alt`) → Retención (`replay`) → Asistencia (`event_available`) → Ingresos
  (`payments`), each with a matching `<q-tab-panel>` mounting its component +
  loading ref. The existing operational tabs (Miembros/Finanzas/Programas) remain;
  the per-cycle retention tab was relabeled "Retención (ciclos)".
- **4 fetch fns:** `fetchConversion` (getTrialFunnel + turno), `fetchRetencionGestion`
  (Promise.all getChurn + getRenewal), `fetchFrecuencia` (getFrequency + turno),
  `fetchIngresos` (Promise.all getTicket + getLtv) — each try/catch with
  `log.error` + null-on-error per the existing convention; 4 cases added to
  `fetchTabData`.

### Task 2 — delete old FunnelTab wiring + file (`35a48093`, D-17)

- Removed from `AnaliticasPage.vue`: the `<q-tab name="funnel">`, the
  `<q-tab-panel name="funnel">`, the `FunnelTab` import, the `FunnelEntryOrigin` +
  `FunnelAnalytics` type imports, the `funnelData`/`loadingFunnel`/`funnelEntryOrigin`
  refs, `fetchFunnelData`, `onFunnelFilterChange`, and the `case 'funnel'`.
- Deleted `src/components/analytics/FunnelTab.vue`.
- Grep-gated: zero `FunnelTab` / `funnelEntryOrigin` / `fetchFunnelData` references
  remain in the analytics page/components. (Unrelated `loadingFunnel`/`funnelData`
  in `CampaniasPage.vue` is a different feature — campaign funnel — left untouched.)

### Task 3 — delete deprecated cards (`02f0d9b0`, D-15/D-16/D-18)

- **MiembrosTab.vue:** removed the "Tasa de retención" stat card (D-18) and the
  Renovación 7/14/30 cards block + `renewalRateCards` computed (D-15). The
  Nuevos/Bajas cards now sit in a 2-up `col-sm-6` row; Distribución por plan, the
  Nuevos vs Bajas chart, and the "requieren atención" list are conserved (D-21).
  `getMemberAnalytics` in `AnaliticasPage.vue` is preserved (still feeds those
  counts).
- **FinanzasAvanzadasTab.vue:** removed the "ARPU mensual" card + `arpuEntries`
  computed (D-16). The "Caja vs Devengado por mes" chart and all its supporting
  code (`cashVsAccruedData`, `chartOptions`, `renderedCurrencies`, `currencyHasData`,
  `formatPrice`) are conserved.
- Grep-gated: zero `renewalRateCards` / `arpuEntries` references remain.
- `AsistenciaTab.vue` NOT touched (D-19 cancelled — it is live in ReportesPage.vue).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify command references an uninstalled binary (`vue-tsc`)**

- **Found during:** all 3 tasks' verification.
- **Issue:** the plan's `<verify>` blocks specify
  `pnpm exec vue-tsc --noEmit -p tsconfig.json`, but `vue-tsc` is NOT a dependency
  of `el-templo-admin` (only `tsc` + `eslint` are in `node_modules/.bin`; same
  finding as 132-03/04/05, and flagged explicitly in the prompt).
- **Fix:** verified each touched `.vue` with `pnpm exec eslint -c ./eslint.config.js`
  — the project's eslint is type-aware (vue-eslint-parser + TS parser with
  `parserOptions.project`), catching `any`, broken imports, unused symbols, and type
  errors in `<script setup>`. All 3 files passed clean (exit 0). Full SFC template
  typecheck runs in CI / `quasar build`. No dependency installed (package installs
  excluded from Rule 3).
- **Files modified:** none (tooling substitution only).
- **Commit:** n/a (verification step).

### Notes (deliberate readings, not bugs)

- **Scope-change split:** the plan said "refetch [plans] on country/branch change".
  Implemented as a dedicated `onScopeChange` (wired to the country + branch selects)
  that refetches the plan list FIRST and drops an out-of-scope plan selection, then
  fetches the metrics. The plan/turno/date selects keep using `onFilterChange` so
  they do NOT redundantly refetch the plan list. This is a correctness improvement
  (Rule 2, minor) — without the stale-selection drop, switching sucursal could leave
  a `planId` that no longer exists in scope being sent to the metrics.
- **Tab label disambiguation:** the conserved per-cycle retention tab (D-20,
  `RetencionTab.vue`) was relabeled from "Retención" to "Retención (ciclos)"
  (icon `timeline`) so the NEW D-07/D-08 "Retención" tab (churn+renovación) owns the
  primary label. Both tabs render; only the conserved one's label changed.
- The `FunnelEntryOrigin` + `FunnelAnalytics` TYPE definitions stay in
  `types/analytics.ts` (still referenced by doc comments / the old `getFunnel`
  composable method used by other features); only the page's imports were removed,
  per the plan's instruction ("remove the import in the page only").

## Verification

- `pnpm exec eslint -c ./eslint.config.js` clean (exit 0) on all 3 modified files
  (`AnaliticasPage.vue`, `MiembrosTab.vue`, `FinanzasAvanzadasTab.vue`).
- Grep gates:
  - zero `FunnelTab` / `funnelEntryOrigin` / `fetchFunnelData` orphans in the
    analytics page/components (only unrelated `CampaniasPage.vue` campaign-funnel
    state + one doc comment in `ConversionTab.vue`/`types`).
  - zero `renewalRateCards` / `arpuEntries` in `src/components/analytics/`.
  - zero `retentionRate` / `renewalRate` consumption left in `MiembrosTab.vue`.
- Conserved (manual): `AsistenciaTab.vue` NOT in the diff; `getMemberAnalytics` call
  unchanged at `AnaliticasPage.vue`; `ReportesPage.vue` not touched; Caja vs
  Devengado + `renderedCurrencies` + `formatPrice` retained in
  `FinanzasAvanzadasTab.vue`; Nuevos/Bajas/Distribución/lista retained in
  `MiembrosTab.vue`.
- The 4 new tab components are imported AND mounted (props + loading) in
  `AnaliticasPage.vue`; `fetchTabData` has the 4 new cases.
- No tests run locally per project policy (`feedback_tests_run_in_ci_not_local`);
  this is a presentational integration/cleanup plan — visual UAT is the phase
  human-verify gate, and CI runs typecheck/lint/build on the staging push.

## Known Stubs

None. The page owns the fetch for all 4 new tabs and passes real typed data +
loading flags; the components render their own empty states when data is null (not
stubs). No hardcoded empty values flow to the UI.

## Threat Flags

None — no new endpoints, auth paths, or schema/DB changes. The page only passes
typed filter values (planId/turno) to already-authorized endpoints; country is never
sent for non-owners (isOwner gate preserved). Threat-register mitigations met:

- T-132-15 (filters bypassing scope): the page passes only typed `planId`/`turno`;
  scope AND-ing is enforced server-side (132-01/02); `isOwner` country gate intact.
- T-132-16 (orphan fetch after deletion): grep-gate confirmed no dead
  `fetchFunnelData`/refs remain → no stale calls to the removed funnel path.
- T-132-17 (accidental deletion of conserved view): grep + manual gates assert
  `AsistenciaTab.vue` untouched, `getMemberAnalytics` + Caja vs Devengado +
  operational counts conserved.
- T-132-SC (npm installs): no new deps — file deletion + wiring only.

## Self-Check: PASSED
