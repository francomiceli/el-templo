---
phase: 109-caja-v2-reportes
plan: 04
subsystem: ui + finance/reports
tags:
  [
    phase-109,
    finance,
    frontend,
    reports,
    deudas,
    aging,
    excel,
    exceljs,
    server-side-export,
  ]

# Dependency graph
requires:
  - phase: 109-02
    provides: GET /api/admin/reports/outstanding-balances + DebtBucket / OutstandingBalanceRow / BucketTotals types
  - phase: 109-03
    provides: server-side exceljs export pattern in finance module + admin Blob-download idiom
  - phase: 64-reportes
    provides: server-side exceljs Workbook export pattern (reports module helpers)
  - phase: 108-pago-de-saldo-historial-financiero
    provides: PaginatedResult "Cargar más" idiom; createLogger / formatPrice / formatDate utils
provides:
  - "DeudasReport.vue — encapsulated 5th report section (filters + bucket cards + table + export)"
  - "ReportesPage 5th q-tab 'Deudas' (between Inactivos and Conversión)"
  - "GET /api/admin/reports/outstanding-balances/export — server-side .xlsx with 9 columns (D-16)"
  - "useTransactionsApi.getOutstandingBalances + exportOutstandingBalancesToExcel composable methods"
  - "ReportsService.exportOutstandingBalances — non-paginated row dump for Deudas export"
  - "Admin types: DebtBucket, OutstandingBalanceRow, BucketTotals, OutstandingBalancesResult, OutstandingBalancesFilters"
affects:
  - "Phase 109-05 (smoke test phase) — gains the Deudas tab to verify end-to-end"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side Excel export for outstanding-balances (matches Phase 109-03 redirection precedent — replaces plan-prescribed client-side xlsx loop)"
    - "Composable export method returns Blob via responseType:'blob' — same idiom as exportToExcel + useReportsApi.exportAccessLog"
    - "Bucket totals shape discriminator at frontend (Object.prototype.hasOwnProperty.call(bt, '0-30')) — gracefully handles flat BucketTotals vs per-currency keyed map without runtime assertion"
    - "Component receives displayCurrency / countryScope / isOwner as props from ReportesPage (B3 fix — currency NEVER hardcoded)"

key-files:
  created:
    - el-templo-admin/src/components/DeudasReport.vue
    - el-templo-api/test/reports/outstanding-balances-export.test.ts
  modified:
    - el-templo-admin/src/types/transaction.ts
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-admin/src/pages/ReportesPage.vue
    - el-templo-api/src/modules/reports/service.ts
    - el-templo-api/src/modules/reports/schemas.ts
    - el-templo-api/src/modules/reports/routes.ts

key-decisions:
  - "Plan-level redirection: Excel export moved from client-side xlsx to server-side exceljs (xlsx not installed in admin; Phase 109-03 just established server-side as the project pattern; same composable idiom as exportToExcel)"
  - "DeudasReport encapsulates its own load lifecycle on mount + watches filters + countryScope; ReportesPage.fetchTabData switch unchanged (no `case 'deudas'` needed)"
  - "Tab inserted between Inactivos and Conversión (5th position per the plan's 'Deudas como 5to reporte' phrasing — Conversión was added in Phase 102-07 and pushes Deudas to the 5th visual slot, not the 6th)"
  - "Export endpoint adds dedicated ReportsService.exportOutstandingBalances method (not getOutstandingBalances + high limit) so the bucketTotals scan is skipped — export only needs row-level data"
  - "BUCKET_LABEL_ES + TARGET_KIND_LABEL_ES inline in routes.ts (mirror of admin DeudasReport.vue) — 4th consumer would trigger DRY consolidation, only 2 consumers today"

requirements-completed: [CAJA-03, CAJA-04]

# Metrics
duration: ~9min
completed: 2026-04-29
---

# Phase 109 Plan 04: Reporte Deudas (frontend + backend export) Summary

**ReportesPage gana un 5to reporte "Deudas" — cards de totales por antigüedad arriba (multi-currency-aware para owner), tabla detallada con filtros server-side y paginación "Cargar más", y un Excel export server-side via nuevo endpoint `GET /api/admin/reports/outstanding-balances/export`. UI 100% español; el token "aging" sólo aparece en código interno.**

## Performance

- **Duration:** ~9 min (3:24:02Z → 3:33:04Z)
- **Tasks:** 3
- **Files modified:** 6
- **Files created:** 2

## Accomplishments

- Admin `DebtBucket / OutstandingBalanceRow / BucketTotals / OutstandingBalancesResult / OutstandingBalancesFilters` types mirror del backend (Plan 109-02) — sin `any`.
- `useTransactionsApi.getOutstandingBalances(filters)` + `exportOutstandingBalancesToExcel(filters)` cableados (lazy axios — undefined params auto-omitted).
- `DeudasReport.vue` (~390 LOC) — filtros (sucursal / moneda / search) + cards bucket totals (4 cards o sets de 4 × N currencies según `isOwner`) + tabla con 8 columnas + "Cargar más" + botón Excel.
- ReportesPage 5to tab "Deudas" (icon=`warning`) entre Inactivos y Conversión; props `displayCurrency` / `countryScope` / `isOwner` derivados del scope existente — **NUNCA hardcoded ARS**.
- Backend: `GET /api/admin/reports/outstanding-balances/export` (CAJA_ROLES + attachCountryScope) — 9 columnas exceljs (D-16), filename `deudas-<YYYY-MM-DD>.xlsx`.
- 4 nuevos integration tests: X1 .xlsx headers + sort + bucket label, X2 coach 403, X3 branchId narrows, X4 country scope. Full reports suite: **34/34 passing** (was 30/30, +4 new).
- D-01 invariant: 0 ocurrencias de "aging" dentro del `<template>` de DeudasReport.vue.

## Task Commits

| #   | Task                                                                       | Hash       | Type |
| --- | -------------------------------------------------------------------------- | ---------- | ---- |
| 1   | Add Deudas types + getOutstandingBalances/exportOutstandingBalancesToExcel | `fbd6f15e` | feat |
| 2   | Server-side Excel export endpoint + integration tests                      | `4f148eb3` | feat |
| 3   | DeudasReport component + ReportesPage 5to tab wire-in                      | `93fc0257` | feat |

## Files Created/Modified

### Backend (el-templo-api)

- `src/modules/reports/service.ts` — `ReportsService.exportOutstandingBalances(filters): Promise<OutstandingBalanceRow[]>` reusing the same JOIN + WHERE + JS bucket-math pipeline as `getOutstandingBalances` minus pagination + bucketTotals.
- `src/modules/reports/schemas.ts` — `outstandingBalancesExportSchema` (loose passthrough; `additionalProperties:false` querystring; binary response so no `200` schema).
- `src/modules/reports/routes.ts` — mounted `GET /outstanding-balances/export` with the existing module-level `CAJA_ROLES` + `attachCountryScope` guard. Owner-aware country resolution mirrors the listing endpoint. 9 columns per D-16 in exceljs Workbook. Inline `BUCKET_LABEL_ES` + `TARGET_KIND_LABEL_ES` dicts.
- `test/reports/outstanding-balances-export.test.ts` — 4 integration tests (X1 .xlsx round-trip + 9-column header + ageDESC sort, X2 coach 403, X3 branchId filter, X4 non-owner cross-country block + owner sees all).

### Admin frontend (el-templo-admin)

- `src/types/transaction.ts` — added `DebtBucket`, `OutstandingBalanceRow`, `BucketTotals`, `OutstandingBalancesResult`, `OutstandingBalancesFilters` (mirror of `el-templo-api/src/modules/reports/types.ts`).
- `src/composables/useTransactionsApi.ts` — added `getOutstandingBalances(filters): Promise<OutstandingBalancesResult>` + `exportOutstandingBalancesToExcel(filters): Promise<Blob>`.
- `src/components/DeudasReport.vue` (new, ~390 LOC) — encapsulated 5th report. `defineProps<{branchOptions; displayCurrency: 'ARS' | 'EUR'; countryScope: 'AR' | 'ES' | undefined; isOwner: boolean}>`. UI strings 100% español: "Totales por antigüedad", "Hasta 30 días / 31-60 / 61-90 / 90+ días", "Cargar más", "Exportar Excel", "No hay deudas pendientes", "Buscar miembro". Internal vars/types use `aging` / `outstandingBalances` (D-01 internal-only). Cards render flat OR per-currency depending on `isOwner` + the discriminator at runtime.
- `src/pages/ReportesPage.vue` — added 5th `<q-tab name="deudas" label="Deudas" icon="warning">` between Inactivos and Conversión, matching `<q-tab-panel>` mounting `<DeudasReport>` with the four required props. `deudasBranchOptions` computed alias for the existing `branchOptions` ref. `import DeudasReport from 'src/components/DeudasReport.vue'`.

## Decisions Made

- **Server-side over client-side export (plan redirection per task_3_redirection).** The plan §Task 2 originally specified `xlsx` library + paginated client-side loop with `EXPORT_PAGE_SIZE=200` and `EXPORT_HARD_CAP_ROWS=10_000`. But `xlsx` is not in `el-templo-admin/package.json`, and the codebase pattern is server-side `exceljs` (Phase 64 P03 reports module + the freshly-shipped Phase 109-03 finance export). Server-side gives one less moving part on the client, no client-side hard cap, no pagination juggling, and a single source of truth for filter semantics.
- **Dedicated `exportOutstandingBalances` service method (not `getOutstandingBalances` + high limit).** The export only needs row-level data — duplicating the bucketTotals scan would do twice the work for nothing. The new method shares the JOIN + WHERE + JS bucket-math helpers (`computeAgeInDaysOB`, `computeBucketOB`, `deriveEffectiveDateAndLabelOB`) so filter semantics remain byte-identical to the listing.
- **Tab insertion at position 5, not 6.** The plan phrases it as "5to reporte". The page already had 5 tabs (Conversión was added in Phase 102-07), so visually Deudas slots in as the 5th of 6. Operationally this matches CAJA-03 sequencing (Caja → Reportes → Deudas).
- **Component owns its own load lifecycle.** ReportesPage's `fetchTabData` switch was NOT extended with `case 'deudas'`. DeudasReport calls `load(true)` on mount and watches filter + `countryScope` changes. This keeps the component self-contained and avoids two competing data flows when the owner toggles country.
- **Cards discriminator at runtime, not at API contract.** `Object.prototype.hasOwnProperty.call(bt, '0-30')` distinguishes flat `BucketTotals` from per-currency keyed map. The backend already controls the shape (`OutstandingBalancesResult.bucketTotals: BucketTotals | Record<string, BucketTotals>`); the frontend gracefully degrades to empty totals if the shape is unexpected (T-109-11 mitigation reused).
- **`countryScope` prop wired into filter payload.** When the owner toggles AR/ES via the global ReportesPage country switcher, `props.countryScope` changes and the watch reloads page 1. For non-owner, `countryScope = undefined` (server enforces from `request.scope.country`).

## Deviations from Plan

### Plan-Level Redirection

**1. [User-directed redirection — Task 2 (export)] Switched export from client-side xlsx to backend endpoint**

- **Source:** User-supplied `<task_3_redirection>` block (matching the precedent set by Plan 109-03's Task 3 redirection during checkpoint).
- **Change:**
  - **Backend (new):** Added `GET /api/admin/reports/outstanding-balances/export` route, `ReportsService.exportOutstandingBalances` service method, `outstandingBalancesExportSchema`, and 4 integration tests.
  - **Admin:** `useTransactionsApi.exportOutstandingBalancesToExcel(filters): Promise<Blob>` mirrors `exportToExcel`. DeudasReport's `onExport` simply triggers a Blob download. NO `xlsx` import. NO `EXPORT_PAGE_SIZE` / `EXPORT_HARD_CAP_ROWS`. NO paginated client loop.
- **Verification:**
  - `grep "import.*xlsx" el-templo-admin/src/components/DeudasReport.vue` → 0 lines
  - `grep -c "/outstanding-balances/export" el-templo-api/src/modules/reports/routes.ts` → 2
  - `grep "exportOutstandingBalancesToExcel" el-templo-admin/src/composables/useTransactionsApi.ts` → 4 lines (defn + return + 2 internal references)
  - `grep -E "EXPORT_PAGE_SIZE|EXPORT_HARD_CAP_ROWS|limit: 5000|pageSize: 5000" el-templo-admin/src/components/DeudasReport.vue` → 0 lines
  - All 4 export integration tests pass; full reports suite 34/34.
- **Acceptance:** functionally equivalent or better. Server-side handles arbitrary row counts, has single-source-of-truth filter semantics, has integration tests against real MySQL. CAJA-04 acceptance criteria satisfied (one row per concepto, 9 columns per D-16, filename `deudas-<YYYY-MM-DD>.xlsx`).

**2. [Rule 3 — adapt grep gates to redirection] Replaced client-side xlsx greps with server-side endpoint greps**

- **Old gates (in plan):** `grep -c "EXPORT_PAGE_SIZE\|EXPORT_HARD_CAP_ROWS"` (positive), `grep "limit: 5000"` (negative).
- **New gates (per task_3_redirection):** `grep "import.*xlsx" DeudasReport.vue` → 0 lines; `grep -c "/outstanding-balances/export" routes.ts` → ≥1.
- **Documentation:** captured here so the next plan/verifier doesn't re-run the obsolete gates.

### Auto-fixed / Re-scoped

None other than the plan-level redirection above.

## Issues Encountered

- **Pre-existing tsc errors in `src/utils/pdf/session-pdf-builder.ts` (3 errors)** — unchanged by this plan, same baseline as Plan 109-03 SUMMARY logged.

## Verification Grep Outputs (Acceptance Gates)

```text
# DeudasReport.vue size + structure
$ wc -l el-templo-admin/src/components/DeudasReport.vue
390 el-templo-admin/src/components/DeudasReport.vue

# D-01 guard — no "aging" inside <template>
$ awk '/<template>/,/<\/template>/' el-templo-admin/src/components/DeudasReport.vue | grep -i "aging"
(empty)

# B3 guard — no hardcoded ARS as displayCurrency
$ grep -E "displayCurrency.*=.*['\"]ARS['\"]" el-templo-admin/src/components/DeudasReport.vue
(empty)

# B3 guard — no TODO derive comments
$ grep -E "TODO.*derive from auth scope|TODO.*currency" el-templo-admin/src/components/DeudasReport.vue
(empty)

# Server-side export — no client-side xlsx
$ grep "import.*xlsx" el-templo-admin/src/components/DeudasReport.vue
(empty)

# Server-side export — no paginated client literals
$ grep -E "EXPORT_PAGE_SIZE|EXPORT_HARD_CAP_ROWS|limit: 5000|pageSize: 5000" el-templo-admin/src/components/DeudasReport.vue
(empty)

# Server-side export — composable wired
$ grep -c "/outstanding-balances/export" el-templo-admin/src/composables/useTransactionsApi.ts
2

# Server-side export — backend route registered
$ grep -c "/outstanding-balances/export" el-templo-api/src/modules/reports/routes.ts
2

# ReportesPage tab + tab-panel + import + props
$ grep -c 'name="deudas"' el-templo-admin/src/pages/ReportesPage.vue
2
$ grep -c "DeudasReport" el-templo-admin/src/pages/ReportesPage.vue
2
$ grep -c ":display-currency" el-templo-admin/src/pages/ReportesPage.vue
1

# No console usage
$ grep -c "console\." el-templo-admin/src/components/DeudasReport.vue
0

# Type checks (admin) — clean except pre-existing pdf-builder
$ pnpm exec tsc --noEmit -p tsconfig.json | grep "^src/" | grep -v "session-pdf-builder"
(empty)

# Type checks (api) — clean
$ cd el-templo-api && pnpm exec tsc --noEmit -p tsconfig.json
(clean)
```

## Test Results

```text
$ cd el-templo-api && pnpm test test/reports/outstanding-balances-export.test.ts
✓ X1: returns .xlsx with 9 column headers (D-16) and one row per concepto  1025ms
✓ X2: coach gets 403 (CAJA_ROLES excludes coach)  560ms
✓ X3: branchId filter narrows the row set  853ms
✓ X4: non-owner admin (AR) cannot export rows from another country (ES)  767ms
Test Files  1 passed (1)
Tests       4 passed (4)

$ pnpm test test/reports/
Test Files  3 passed (3)
Tests       34 passed (34)  (was 30 — +4 new from this plan; zero regressions)
```

## Threat Flags

None — this plan reuses existing trust boundaries (admin browser → admin API, CAJA_ROLES guard + attachCountryScope on the same route prefix as Plan 109-02). The new export endpoint inherits the module-level guard verbatim.

## Self-Check: PASSED

**Files exist:**

- `el-templo-admin/src/components/DeudasReport.vue` — FOUND (new)
- `el-templo-api/test/reports/outstanding-balances-export.test.ts` — FOUND (new)
- `el-templo-admin/src/types/transaction.ts` — FOUND (modified)
- `el-templo-admin/src/composables/useTransactionsApi.ts` — FOUND (modified)
- `el-templo-admin/src/pages/ReportesPage.vue` — FOUND (modified)
- `el-templo-api/src/modules/reports/service.ts` — FOUND (modified)
- `el-templo-api/src/modules/reports/schemas.ts` — FOUND (modified)
- `el-templo-api/src/modules/reports/routes.ts` — FOUND (modified)

**Commits exist:**

- `fbd6f15e` — FOUND in git log
- `4f148eb3` — FOUND in git log
- `93fc0257` — FOUND in git log

## Next Phase Readiness

- Plan 109-05 (smoke test phase) gains the Deudas tab end-to-end: open ReportesPage → click Deudas → cards render bucket totals (single-currency for non-owner, sets of 4 × N currencies for owner) → table renders rows sorted by ageInDays DESC → filter by sucursal / moneda / nombre → "Cargar más" appends → click "Exportar Excel" → verify `deudas-YYYY-MM-DD.xlsx` downloads with 9 columns.
- No blockers.
