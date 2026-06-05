---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 05
subsystem: analytics-frontend
tags: [analytics, churn, renovacion, frecuencia, csv, tel, vue, quasar, chartjs]
requires:
  - 6 mirrored frontend interfaces + MetricShape (132-03)
  - frequency coolingDown name/phone enrichment (132-02 D-12)
  - chart-colors COLORS/chartColors palette
  - RetencionTab Line chart shape (analog, D-20 conserved)
  - MiembrosTab Doughnut + q-table slot patterns
  - TrialSessionsReport downloadBlob pattern
provides:
  - RetencionGestionTab.vue (Churn 15d + 5/10d comparison + month curve + Renovación 'número vivo' — D-02/D-03)
  - FrecuenciaTab.vue (bandas Doughnut + cooling-down q-table + client-side CSV + tel: + check-in banner — D-04/D-13/D-14)
affects:
  - el-templo-admin plan 132-06 (AnaliticasPage mounts these 2 tabs + owns fetch)
tech-stack:
  added: []
  patterns:
    - tel: anchor for click-to-call (NEW — no prior repo analog; null-safe → '—')
    - client-side CSV Blob built from in-memory rows (NO export endpoint this phase)
    - CSV formula-injection guard (=,+,-,@ prefixed with ') + RFC-4180 quote escaping + UTF-8 BOM
    - churn series provisional points distinguished (warning color + dashed segment)
    - churn+renovación merged breakdown table keyed by axis::key
key-files:
  created:
    - el-templo-admin/src/components/analytics/RetencionGestionTab.vue
    - el-templo-admin/src/components/analytics/FrecuenciaTab.vue
  modified: []
decisions:
  - "Churn headline prefers the 15d comparison entry; falls back to window.windowDays===15, else window.churn (resilient if backend stops emitting a 15d comparison column)"
  - "Breakdown table MERGES churn.breakdowns + renewal.breakdowns by axis::key into one q-table (D-02/D-03 desglose in a single view); missing side renders '—'"
  - "CSV adds a UTF-8 BOM so Excel renders accented Spanish names; fields quote-wrapped + formula-guarded (T-132-12)"
  - "Verified with eslint (type-aware via vue-eslint-parser + TS parser) — vue-tsc is NOT installed in el-templo-admin; same caveat as 132-03/132-04"
metrics:
  duration: ~8min
  completed: 2026-06-05
---

# Phase 132 Plan 05: RetencionGestionTab + FrecuenciaTab Summary

Built the Retención and Asistencia tab components (SC-2): **RetencionGestionTab**
renders Churn (15d titular + 5/10d comparison + month-over-month curve) and
Renovación in one card row with the locked "número vivo" note (D-02/D-03), and
**FrecuenciaTab** renders the band distribution plus the actionable cooling-down
list (nombre→perfil, teléfono→`tel:`, client-side injection-safe CSV export) and a
per-sede check-in low-adoption banner (D-04/D-13/D-14). Both are presentational —
plan 132-06 wires fetch in `AnaliticasPage.vue`.

## What Was Built

### Task 1 — RetencionGestionTab.vue (`6843b678`)

- Props: `churn: ChurnAnalytics | null`, `renewal: RenewalAnalytics | null`, `loading: boolean`.
- **Churn + Renovación in the SAME `row q-col-gutter-md`** inside one `<q-card flat bordered>` (D-03).
  - Churn headline = the 15-day window (`comparison` entry with `windowDays===15`,
    else `window` fallback) as `text-h4 text-negative`; the 5/10d `comparison`
    entries below as `text-caption text-warning` "(prematuro)".
  - Renovación headline = `renewal.renewal.percentage` as `text-h4 text-positive`
    with the EXACT UI-SPEC "número vivo" note (`text-caption text-grey-6`).
- **Month-over-month curve:** a `Line` chart over `churn.series`
  (`churn.percentage` per bucket); provisional buckets distinguished via a warning-
  colored larger point + a dashed leading segment, plus an explanatory caption and a
  tooltip "(provisional)" suffix.
- **Desglose por sucursal/plan:** a q-table MERGING `churn.breakdowns` +
  `renewal.breakdowns` by `axis::key` (Spanish axis labels), churn in `text-negative`,
  renovación in `text-positive`, missing side → "—".
- Skeleton (loading) + empty state ("No hay datos para el periodo seleccionado")
  per UI-SPEC. Colors only from `chart-colors` `COLORS`. No `any`, no `console.*`.

### Task 2 — FrecuenciaTab.vue (`538bdf1d`)

- Props: `data: FrequencyAnalytics | null`, `loading: boolean`.
- **Bandas:** a `Doughnut` over `distribution` (4 bands) with Spanish band labels,
  `chartColors` palette, 300px container.
- **Lista enfriándose:** a q-table over `coolingDown` with columns Nombre
  (`router-link` to `/alumnos/${userId}`), Teléfono (`tel:${phone}` anchor, null →
  "—" with no link), banda actual ← previa (with an `arrow_back` icon), % variación
  (null → "—").
- **Export CSV (client-side, D-14):** an "Exportar CSV" `outline` q-btn (icon
  download) builds the CSV from the in-memory `coolingDown` rows — **no backend
  export endpoint** (grep-verified). Each field is quote-wrapped with embedded-quote
  escaping (RFC-4180) AND a leading `=,+,-,@` is prefixed with `'` to defeat
  spreadsheet formula injection (T-132-12); rows joined with `\r\n`; a UTF-8 BOM is
  prepended so Excel renders accents. Filename `frecuencia-enfriandose-${YYYY-MM-DD}.csv`;
  success `$q.notify({ type:'positive', message:'Exportación completada', timeout:1500 })`.
- **Check-in alert:** for each `checkInAdoption` row with `ratio < 0.5`, a warning
  `q-banner dense rounded` with the EXACT UI-SPEC copy interpolating `branchName`.
- Skeleton (loading) + empty-list copy ("No hay miembros enfriándose en este
  periodo"). `createLogger('FrecuenciaTab')` for export errors; no `console.*`; no `any`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] verify command references an uninstalled binary (`vue-tsc`)**

- **Found during:** Task 1 + Task 2 verification.
- **Issue:** Both tasks' `<verify>` specify `pnpm exec vue-tsc --noEmit -p tsconfig.json`,
  but `vue-tsc` is NOT a dependency of `el-templo-admin` (only `tsc` is in
  `node_modules/.bin`). The prompt explicitly flagged this caveat (same as 132-04).
- **Fix:** Verified each `.vue` with `pnpm exec eslint <file>` — el-templo-admin's
  eslint is type-aware for `.vue` `<script>` blocks (vue-eslint-parser + TS parser
  with `parserOptions.project`). Both files passed eslint clean (exit 0). Full SFC
  type-checking runs in CI / `quasar build`. No dependency installed (excluded from
  Rule 3 per executor policy).
- **Files modified:** none (tooling substitution only).
- **Commit:** n/a (verification step).

### Notes

- The breakdown table MERGE (churn + renovación in one q-table) is a deliberate
  reading of the D-02/D-03 "desglose por sucursal y plan" requirement as a single
  combined view rather than two separate tables — both metrics share the same
  `axis`/`key` union (`ChurnRenewalAxis`), so one row per axis value carries both.
- A UTF-8 BOM was added to the CSV (not in the literal plan text) so accented Spanish
  member names render correctly in Excel — a correctness improvement for the
  recepción workflow (Rule 2, minor).

## Verification

- `pnpm exec eslint` clean (exit 0) on both new files — type-aware via the project's
  vue/TS eslint setup. No `any`, no `console.*` (CLAUDE.md).
- Grep-confirmed: FrecuenciaTab has NO backend `/export` / `reportsApi` / `api.get`
  call (CSV is fully client-side); filename matches `frecuencia-enfriandose-`;
  formula-injection guard (`/^[=+\-@]/`) + `createObjectURL` present; `tel:` and
  `/alumnos/` links present.
- No tests run locally per project policy (`feedback_tests_run_in_ci_not_local`);
  these are presentational components exercised via `AnaliticasPage.vue` (132-06) +
  CI on the staging push.
- No new dependencies (T-132-SC): chart.js / vue-chartjs / quasar already present.

## Known Stubs

None — both components render real data from their typed props. They receive `null`
until 132-06 wires the fetch, which is the intended presentational/parent-fetch split
(not a stub).

## Threat Flags

None — no new endpoints, auth paths, or schema/DB changes. All plan threat-register
mitigations implemented: T-132-12 (CSV formula-injection guard + quote escaping),
T-132-14 (`tel:`/router-link use typed phone string + numeric userId, no free-form
HTML interpolation), T-132-SC (no npm installs). T-132-13 (PII in CSV) is `accept` per
the register — the rows are already authorized for this admin by `requireAdminAnalytics`

- scope (132-02); the export is client-side over already-fetched data.

## Self-Check: PASSED
