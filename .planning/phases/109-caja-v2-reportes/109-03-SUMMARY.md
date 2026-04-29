---
phase: 109-caja-v2-reportes
plan: 03
subsystem: ui
tags:
  [
    phase-109,
    finance,
    frontend,
    caja,
    kind,
    badge,
    excel,
    exceljs,
    server-side-export,
  ]

# Dependency graph
requires:
  - phase: 106-endpoints-transaccionales
    provides: GET /api/admin/finance/transactions (kind filter, recorded by joins)
  - phase: 109-01
    provides: revenueByKind extension on /transactions/summary
  - phase: 64-reportes
    provides: server-side exceljs Workbook export pattern (Phase 64 P03)
  - phase: 108-pago-de-saldo-historial-financiero
    provides: KIND_LABELS_ES + PAYMENT_METHOD_LABELS_ES + q-badge color-coded patterns
provides:
  - "CajaPage 'Por tipo de transacción' block + Tipo filter + Tipo column (D-10/D-12/D-13)"
  - "GET /api/admin/finance/transactions/export — server-side .xlsx with 11 columns (D-15)"
  - "useTransactionsApi.exportToExcel(filters) composable method"
  - "TransactionService.exportRowsForExcel(filters) — non-paginated row dump"
  - "TransactionExportRow type extending TransactionListItem with voidReason"
affects:
  - "Phase 109-04 (ReportesPage Deudas)"
  - "Phase 109-05 (smoke test phase)"
  - "Future Caja extensions (Egresos / multi-currency / pivot exports)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-side Excel export (route renders Workbook, service returns rows) — replaces Phase 109 PLAN's originally-proposed client-side xlsx pattern"
    - "Composable export method returns Blob via responseType:'blob' — mirrors useReportsApi.exportAccessLog idiom"
    - "Defensive fallback in admin reactive state when backend field is optional (revenueByKind ?? all-zeros)"

key-files:
  created:
    - el-templo-api/test/finance/export-transactions.test.ts
  modified:
    - el-templo-admin/src/types/transaction.ts
    - el-templo-admin/src/pages/CajaPage.vue
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
    - el-templo-api/src/modules/finance/transaction-service.ts

key-decisions:
  - "Task 3 redirected from client-side xlsx to server-side exceljs (xlsx not installed in admin; Phase 64 P03 pattern is server-side)"
  - "TransactionExportRow extends TransactionListItem with voidReason — minimal additive contract for the 'Razón anulación' column"
  - "Conceptos column rendered as '<TARGET_KIND_LABEL_ES> #<targetId>' joined by ', ' (W5 stub — granular labels deferred until ops asks)"
  - "Export endpoint mounted under same FINANCE_READ_ROLES module guard + attachCountryScope as listing — zero new attack surface"
  - "exportRowsForExcel reuses buildListConditions for byte-identical filter semantics with /transactions list"
  - "Spanish label dicts duplicated inline in routes.ts (KIND_LABELS_ES, PAYMENT_METHOD_LABELS_ES, TARGET_KIND_LABEL_ES) — mirror of admin frontend; future shared module if a 3rd consumer surfaces"

patterns-established:
  - "Server-side .xlsx pattern in finance module (matches reports module): service returns row[], route renders Workbook+styles+headers and sends as binary attachment"
  - "Loose passthrough JSON Schema for binary export endpoints (no response: 200 schema, only error response codes registered)"

requirements-completed: [CAJA-01, CAJA-02, CAJA-04]

# Metrics
duration: ~50min
completed: 2026-04-29
---

# Phase 109 Plan 03: CajaPage v2 + Server-side Excel Export Summary

**CajaPage gana segmentación por kind (5 cards color-coded + filtro Tipo + columna badge) y un export Excel server-side via nuevo endpoint /admin/finance/transactions/export — eliminando la dependencia inexistente de la library `xlsx` en admin.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-04-29T02:30:00Z (approx)
- **Completed:** 2026-04-29T03:18:00Z
- **Tasks:** 3
- **Files modified:** 7
- **Files created:** 1 (integration test)

## Accomplishments

- `FinanceSummary.revenueByKind` cabledo en admin con fallback defensivo
- Bloque "Por tipo de transacción" con 5 cards color-coded (D-10) + filtro single-select "Tipo" (D-12) + columna Tipo badge (D-13) en CajaPage
- Endpoint backend `GET /api/admin/finance/transactions/export` con RBAC + country-scope + 11 columnas exceljs (D-15)
- Composable `useTransactionsApi.exportToExcel(filters)` + handler `onExportCaja` (botón "Exportar Excel") en CajaPage
- 5 integration tests del export endpoint (5/5 pasando) y 134/134 tests del módulo finance pasando (cero regresiones)
- D-01 guard preservado (0 ocurrencias de "aging" en CajaPage.vue)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend FinanceSummary type and load revenueByKind in CajaPage** — `47f54656` (feat)
2. **Task 2: Add 'Por tipo de transaccion' block + Tipo filter + Tipo badge column** — `c4092ed4` (feat)
3. **Task 3: Server-side Excel export endpoint + admin integration** — `21c5a8d0` (feat)

## Files Created/Modified

### Backend (el-templo-api)

- `src/modules/finance/types.ts` — `TransactionExportRow` interface (extends TransactionListItem with `voidReason`)
- `src/modules/finance/schemas.ts` — `exportTransactionsSchema` querystring shape (mirrors listing minus page/limit, `additionalProperties:false`)
- `src/modules/finance/transaction-service.ts` — `TransactionService.exportRowsForExcel(filters): Promise<TransactionExportRow[]>` reusing `buildListConditions` + N+1-safe linkSummary follow-up
- `src/modules/finance/routes.ts` — `GET /transactions/export` route with exceljs Workbook rendering (11 columns, header style, attachment Content-Disposition); local `KIND_LABELS_ES` / `PAYMENT_METHOD_LABELS_ES` / `TARGET_KIND_LABEL_ES` dicts; `buildConceptosCell` helper
- `test/finance/export-transactions.test.ts` — 5 integration tests (E1: xlsx headers + row count, E2: coach 403 RBAC, E3: kind filter narrows output, E4: country scope locks non-owner, E5: Conceptos column populated correctly)

### Admin frontend (el-templo-admin)

- `src/types/transaction.ts` — `FinanceSummary.revenueByKind: Record<TransactionKind, number>` additive field
- `src/composables/useTransactionsApi.ts` — `exportToExcel(filters): Promise<Blob>` mirroring `useReportsApi.exportAccessLog` pattern
- `src/pages/CajaPage.vue` — local `KIND_LABELS_ES` / `KIND_COLORS` / `KIND_ORDER` / `KIND_OPTIONS` constants; `summary.revenueByKind` reactive state with all-zeros fallback; "Por tipo de transacción" block with 5 cards; "Tipo" q-select filter; "Tipo" q-badge column with `kindLabel` / `kindColor` helpers; "Exportar Excel" button with `onExportCaja` handler

## Decisions Made

- **Server-side over client-side export.** The plan originally specified a client-side paginated loop with the `xlsx` library + 200-page-size cap. During checkpoint, ops surfaced two facts: (a) `xlsx` is not installed in `el-templo-admin`, and (b) the established codebase pattern (Phase 64 P03 reports) is server-side via `exceljs`. Server-side gives one less moving part on the client, no client-side hard cap (server can stream thousands of rows in one response without page-size juggling), and a single source of truth for filter semantics.
- **Type split: `TransactionExportRow extends TransactionListItem`.** The export needs `voidReason` for the "Razón anulación" column but the listing endpoint deliberately keeps that field private (rendered only in the per-member financial-history view). Subclassing the type signals export-only.
- **Conceptos as `<label> #<id>` stub.** Backend listing exposes only `linkSummary` (no resolved labels). Granular labels ("Mensualidad Marzo 2026 — Performance Mensual") would require a second JOIN against subscriptions+plans+debts inside the export query. Operations confirmed the stub is sufficient for v1; if pivot tables in Excel start to require human-readable concept names, it surfaces as a gap-closure plan.
- **Spanish labels duplicated inline.** Routes.ts owns its own copy of `KIND_LABELS_ES` / `PAYMENT_METHOD_LABELS_ES` / `TARGET_KIND_LABEL_ES`. Admin frontend has its own copy in CajaPage.vue + FinancialHistoryTab.vue. Three duplications — but no shared module yet because the call sites are 3 (admin admin pages × 1 backend route) and DRY-extracting now risks premature abstraction across module boundaries (frontend admin vs api). If a 4th consumer arrives, this is the trigger to consolidate.

## Deviations from Plan

### Auto-fixed / Re-scoped Issues

**1. [Plan-level redirection — Task 3] Switched export from client-side xlsx to server-side exceljs**

- **Found during:** Task 3 (Excel export implementation)
- **Issue:** Plan §Task 3 prescribed `xlsx` library + paginated client-side loop with `EXPORT_PAGE_SIZE=200` and `EXPORT_HARD_CAP_ROWS=10_000`. But `xlsx` is NOT in `el-templo-admin/package.json`, and the codebase's actual export pattern (Phase 64 P03 reports module: 4 endpoints in `el-templo-api/src/modules/reports/routes.ts` lines 239-459) is server-side `exceljs.Workbook`.
- **Fix:** Re-scoped Task 3 entirely:
  - **Backend:** Added `TransactionService.exportRowsForExcel`, `exportTransactionsSchema`, and `GET /transactions/export` route mirroring the reports/routes.ts idiom (Workbook → addWorksheet → columns → addRow → writeBuffer → reply with Content-Disposition).
  - **Admin:** Added `exportToExcel(filters): Promise<Blob>` to the composable + `onExportCaja` handler that creates an object URL and triggers download. NO `xlsx` import, NO `EXPORT_PAGE_SIZE`, NO client-side loop.
- **Files modified:** see "Files Created/Modified" above (backend + admin).
- **Verification:**
  - `grep "import.*xlsx" el-templo-admin/src/pages/CajaPage.vue` → 0 lines
  - `grep -c "/finance/transactions/export\|transactions/export" el-templo-api/src/modules/finance/routes.ts` → 2
  - `grep "exportToExcel" el-templo-admin/src/composables/useTransactionsApi.ts` → 2 lines (defn + return)
  - `grep -c "Workbook" el-templo-api/src/modules/finance/routes.ts` → 2
  - `grep -n "limit: 5000\|pageSize: 5000\|5000" el-templo-admin/src/pages/CajaPage.vue` → 0
  - All 5 export integration tests pass; 134/134 finance suite passes.
- **Committed in:** `21c5a8d0` (Task 3 commit).

---

**Total deviations:** 1 plan-level re-scope (Task 3 client-side → server-side).
**Impact on plan:** Functionally equivalent or better. Server-side handles arbitrary row counts without client memory pressure, has single-source-of-truth filter semantics (reuses `buildListConditions`), and has integration tests against real MySQL. CAJA-04 acceptance criteria satisfied (one row per transaction, 11 columns per D-15, filename `caja-<YYYY-MM-DD>.xlsx`). Tasks 1 + 2 executed exactly as planned.

## Issues Encountered

- **Pre-existing tsc errors in `src/utils/pdf/session-pdf-builder.ts`** — 3 errors related to `pdfmake` types are not introduced by this plan. Verified via `git stash` baseline check: same 3 errors before any changes. Out of scope for Plan 109-03 (logged here for visibility; consider a follow-up cleanup plan).
- **No other issues.**

## Verification Grep Outputs (Acceptance Gates)

```text
# D-01 guard
$ grep -c "aging" el-templo-admin/src/pages/CajaPage.vue
0

# D-10 / D-13 — block and labels present
$ grep -nc "Por tipo de transacción\|KIND_LABELS_ES\|KIND_COLORS" el-templo-admin/src/pages/CajaPage.vue
14

# D-12 — filter wired
$ grep -nc "filters.kind" el-templo-admin/src/pages/CajaPage.vue
2

# D-13 — Tipo body-cell slot present
$ grep -nc "body-cell-kind" el-templo-admin/src/pages/CajaPage.vue
1

# Server-side export — endpoint registered
$ grep -c "/finance/transactions/export\|transactions/export" el-templo-api/src/modules/finance/routes.ts
2

# Server-side export — composable wired
$ grep "exportToExcel" el-templo-admin/src/composables/useTransactionsApi.ts | wc -l
2

# Server-side export — Workbook in route layer
$ grep -c "Workbook" el-templo-api/src/modules/finance/routes.ts
2

# Server-side export — service returns rows only (no exceljs in service)
$ grep -c "Workbook\|exceljs" el-templo-api/src/modules/finance/transaction-service.ts
0

# No client-side xlsx import
$ grep "import.*xlsx" el-templo-admin/src/pages/CajaPage.vue
(empty)

# No 5000 literal anywhere in admin
$ grep -n "limit: 5000\|pageSize: 5000\|5000" el-templo-admin/src/pages/CajaPage.vue
(empty)

# No console usage
$ grep -c "console\." el-templo-admin/src/pages/CajaPage.vue
0
```

## Test Results

- `pnpm test test/finance/export-transactions.test.ts` → **5/5 passing** (E1 .xlsx headers + row count, E2 coach 403, E3 kind filter, E4 country scope, E5 Conceptos column).
- `pnpm test test/finance/` → **134/134 passing** (zero regressions).
- `pnpm exec tsc --noEmit` (api) → **clean**.
- `pnpm exec tsc --noEmit` (admin) → only pre-existing `session-pdf-builder.ts` errors (out of scope, not introduced by this plan).
- `pnpm exec eslint src/pages/CajaPage.vue src/composables/useTransactionsApi.ts` → **clean**.

## Self-Check: PASSED

- All 7 modified files exist and contain the expected changes.
- All 1 created file exists (`el-templo-api/test/finance/export-transactions.test.ts`).
- All 3 task commits exist in git history (`47f54656`, `c4092ed4`, `21c5a8d0`).

## Next Phase Readiness

- Plan 109-04 (ReportesPage "Deudas" frontend) can proceed — it depends on the Plan 109-02 outstanding-balances endpoint (already shipped), not on this plan. No coupling.
- Plan 109-05 (smoke test phase) gains a CajaPage that's ready for end-to-end manual verification: open CajaPage → see new block + cards → toggle Tipo filter → see badge column → click "Exportar Excel" → verify .xlsx with 11 columns downloads.
- No blockers.

---

_Phase: 109-caja-v2-reportes_
_Completed: 2026-04-29_
