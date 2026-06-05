---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 04
subsystem: analytics-frontend
tags:
  [
    analytics,
    vue,
    quasar,
    chart.js,
    ticket,
    ltv,
    trial-funnel,
    per-currency,
    D-01,
    D-05,
    D-06,
  ]
requires:
  - 6 mirrored frontend interfaces from 132-03 (TrialFunnelAnalytics / TicketAnalytics / LtvAnalytics + MetricShape)
  - chart-colors.ts (COLORS) + format-price.ts (formatPrice) — existing utils
  - FunnelTab.vue / FinanzasAvanzadasTab.vue analog patterns (chart wiring + per-currency isolation)
provides:
  - ConversionTab.vue — presentational Funnel de prueba tab (props-in, no fetch) consuming TrialFunnelAnalytics
  - IngresosTab.vue — presentational Ticket + LTV tab (props-in, no fetch) consuming TicketAnalytics + LtvAnalytics
affects:
  - el-templo-admin plan 132-06 (AnaliticasPage wires fetch + mounts both tabs)
tech-stack:
  added: []
  patterns:
    - presentational tab component (props data | null + loading; page owns fetch)
    - per-currency isolation (renderedCurrencies-style guard; ARS/EUR never summed)
    - null-safe money/months rendering (null/NaN -> em dash, never NaN to DOM)
    - chart.js horizontal Bar embudo (indexAxis 'y') with colors from chart-colors
key-files:
  created:
    - el-templo-admin/src/components/analytics/ConversionTab.vue
    - el-templo-admin/src/components/analytics/IngresosTab.vue
  modified: []
decisions:
  - "Verified .vue with eslint (typescript-eslint, type-aware) — vue-tsc is NOT a dependency of el-templo-admin; full SFC typecheck runs in CI / quasar build"
  - "discountMean is a 0-1 fraction (confirmed in ticket-service.ts:280) -> multiplied by 100 for display; zeroPct already a whole percentage -> rendered as-is"
  - "ConversionTab takes only data + loading props (no entryOrigin) — the new /trial-funnel has no origin segment, unlike the deleted freemium FunnelTab"
  - "Sucursal breakdown rendered as a single-axis q-table filtered to axis==='branch'; no 2D turno×sucursal component (D-11 achieved via page turno filter + this breakdown)"
metrics:
  duration: ~2min
  completed: 2026-06-05
---

# Phase 132 Plan 04: ConversionTab + IngresosTab Summary

Created the two presentational analytics tab components for the Conversión and
Ingresos groups (SC-2). Both are pure props-in components — they receive typed
data from `AnaliticasPage.vue` (wired in plan 132-06) and render per the LOCKED
D-06 (Funnel), D-01 (Ticket) and D-05 (LTV) visualization contracts. No fetching
here.

## What Was Built

### Task 1 — ConversionTab.vue — Funnel de prueba (D-06) (`07c72c1e`)

- Props: `data: TrialFunnelAnalytics | null`, `loading: boolean`.
- **Star rate (dominant):** `rates.tasaCierre.percentage` rendered as `text-h3
text-primary` with label "Tasa de cierre (compró sobre asistió)" — visually
  dominant over the secondary `tasaShow` (% asiste) and `puntaAPunta`
  (`text-h6` + `text-caption`).
- **Embudo:** horizontal `Bar` (`indexAxis: 'y'`) over
  `[reservaron, asistieron, compraron]` — descending-width by construction
  (reservaron ≥ asistieron ≥ compraron), in `<q-card flat bordered>` with the
  `height: 300px; position: relative` container. Chart.js registration block
  copied from FunnelTab.vue; colors from `COLORS` (primary → secondary →
  positive for the "compró" step), never inline hex.
- **Sucursal breakdown (D-11):** `props.data.breakdowns` filtered to
  `axis === 'branch'` rendered as a small `q-table` (reservaron/asistieron/
  compraron/tasaCierre). No 2D turno×sucursal aggregation — the turno×sucursal
  cross is achieved by the page-level turno filter + this single-axis breakdown.
- Skeleton loading block + empty state ("No hay sesiones de prueba en el periodo
  seleccionado") when all stage counts are 0.
- `createLogger('ConversionTab')` for the debug path; no `console.*`; no `any`.

### Task 2 — IngresosTab.vue — Ticket + LTV (D-01 / D-05) (`e19c4ee0`)

- Props: `ticket: TicketAnalytics | null`, `ltv: LtvAnalytics | null`,
  `loading: boolean`.
- **Per-currency isolation:** `ticketCurrencies` / `ltvCurrencies` computeds
  filter ARS/EUR by `byCurrency[cur].global.n` / `monetary[cur].n`; each currency
  renders in its OWN `<q-card>` in a `v-for` grid (`col-md-6` when 2 currencies,
  else `col-md-12`). **ARS and EUR are NEVER summed** (grep-confirmed no
  cross-currency `+`).
- **Ticket double headline:** `global.nominal` (promedio general) +
  `globalCohorts.listPrice.average` (precio de lista) side by side (`col-6` each,
  `text-h4`). `% con descuento` (from `discountMean × 100`) and `% a $0`
  (`zeroPct`, already a percentage) shown as TWO separate stats — never merged.
  Per-plan / per-branch desglose is an expandable `q-expansion-item` (not always
  visible).
- **LTV double headline:** `lifetimeHeadlineMonths` (meses) + `$` per cliente
  (`observed ?? projected`). BOTH month estimates shown, labeled "Estimación
  simple" (`lifetimeHeadlineMonths`) and "Supervivencia" (`survivalMedianMonths`);
  `projected` vs `observed` (real) side by side per currency.
- **Null-safe rendering (T-132-11):** `money` / `months` / `discountPct` /
  `wholePct` all render "—" for `null`/`undefined`/`NaN` — no NaN reaches the DOM.
- Skeleton + empty state ("No hay datos para el periodo seleccionado") when both
  currencies have `n === 0` for both metrics. `(ARS)`/`(EUR)` tag as
  `text-caption text-grey-6`. No `console.*`; no `any`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify command references an uninstalled binary (`vue-tsc`)**

- **Found during:** Task 1 + Task 2 verification.
- **Issue:** Both tasks specify `pnpm exec vue-tsc --noEmit -p tsconfig.json`, but
  `vue-tsc` is NOT a dependency of `el-templo-admin` (only `tsc` is in
  `node_modules/.bin`; same finding as plan 132-03). For `.vue` SFCs `tsc` alone
  does not typecheck the template, so I used the project's actual `.vue` static
  analysis: `pnpm exec eslint -c ./eslint.config.js <file>` — the project's eslint
  config is type-aware (typescript-eslint) and lints `.vue` files (it is the
  `lint` script's glob), catching `any`, broken imports, unused symbols, and type
  errors in `<script setup>`. Full SFC template typecheck runs in CI / `quasar
build` (which invokes `vue-tsc`). No dependency installed (package installs are
  excluded from Rule 3).
- **Files modified:** none (tooling substitution only).
- **Commit:** n/a (verification step).

### Notes

- ConversionTab takes ONLY `data` + `loading` props — it does NOT carry the
  `entryOrigin` segment toggle the deleted freemium FunnelTab had. The new
  `/trial-funnel` endpoint has no origin segment, so emitting it would be dead
  wiring. The page (132-06) passes only the global filters.
- Confirmed `discountMean` units against the backend before rendering:
  `ticket-service.ts:280` computes `(listBase - pricePaid) / listBase` → a 0-1
  fraction, so IngresosTab multiplies by 100; `zeroPct` is already
  `Math.round(... * 100)` → rendered as-is.

## Verification

- `pnpm exec eslint -c ./eslint.config.js src/components/analytics/ConversionTab.vue`
  → clean (exit 0).
- `pnpm exec eslint -c ./eslint.config.js src/components/analytics/IngresosTab.vue`
  → clean (exit 0).
- Grep-confirmed both files: no raw hex (colors via `chart-colors`); no `any`; no
  `console.*`; IngresosTab has no `ARS+EUR` / `EUR+ARS` cross-currency sum.
- Manual: ConversionTab has no 2D turno×sucursal aggregation (single-axis
  `axis==='branch'` filter only); IngresosTab never adds across currencies (each
  block reads its own `byCurrency[cur]` / `monetary[cur]`).
- No tests run locally per project policy (`feedback_tests_run_in_ci_not_local`);
  these are presentational components — they are exercised when 132-06 mounts them.

## Known Stubs

None — both components are fully wired to their typed props. They render empty
states (not stubs) when `data` is null or all counts are 0, which is the correct
behavior for a presentational tab whose page (132-06) owns the fetch.

## Threat Flags

None — no new endpoints, auth paths, or schema changes. Both components are pure
render functions over already-authorized analytics data.

- T-132-10 (currency cross-contamination): mitigated — per-currency
  `ticketBlock(cur)` / `ltvBlock(cur)` isolation; grep-confirmed no ARS+EUR sum.
- T-132-11 (null/NaN to DOM): mitigated — every nullable figure
  (`listPrice.average`, `projected`, `observed`, `lifetimeHeadlineMonths`,
  `survivalMedianMonths`, `discountMean`) renders "—" when null/NaN.
- T-132-SC (npm installs): mitigated — no new dependencies; chart.js/vue-chartjs
  already installed.

## Notes for Next Plan

- 132-06 (`AnaliticasPage.vue`) mounts `<ConversionTab :data :loading />` and
  `<IngresosTab :ticket :ltv :loading />`. Wire `data` from `getTrialFunnel`,
  `ticket` from `getTicket`, `ltv` from `getLtv` (all 3 typed methods exist from
  132-03). Turno filter applies to Conversión (funnel); Ingresos hides the turno
  filter (per-subscription metrics).

## Self-Check: PASSED

- FOUND: el-templo-admin/src/components/analytics/ConversionTab.vue
- FOUND: el-templo-admin/src/components/analytics/IngresosTab.vue
- FOUND: .planning/phases/132-exponer-metricas-gestion-v50-admin/132-04-SUMMARY.md
- FOUND: commit 07c72c1e (ConversionTab)
- FOUND: commit e19c4ee0 (IngresosTab)
