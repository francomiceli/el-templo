---
phase: 141-reportes-para-la-admin
plan: 03
subsystem: finance (admin frontend)
tags:
  [
    reports,
    finance,
    caja-hub,
    q-tabs,
    saldos,
    movimientos,
    composable,
    currency-isolation,
  ]
requires:
  - "141-01: GET /pending-tray + /cash-registers/balances (+ Excel exports), thresholdDays, CajaSaldoRow shape"
  - "141-02: GET /movements-history (+ Excel export), MovEgresoItem shape (LEFT JOIN survives NULL-member rows)"
  - "137: validate/observe/correct/void endpoints + keepMembershipActive (1-a-1 membership)"
provides:
  - "useTransactionsApi extended: 3 reads + validate/observe/correct + keepMembershipActive void + 3 Excel exports"
  - "FE types: PendingTrayItem/Result/Params, CajaSaldoRow, CashBalancesParams, MovEgresoItem/Params, CorrectedFields"
  - "src/constants/caja.ts (CAJA_TABS names + landing + ?tab= validation list)"
  - "CajaPage q-tabs hub shell (Pendientes landing / Saldos / Movimientos / Mov. y egresos)"
  - "MovimientosTab.vue (verbatim migration of the old CajaPage body, egresos placeholder removed)"
  - "SaldosPorCajaTab.vue (cards by tipo, per-currency subtotals, Excel export)"
affects:
  - "Plan 04 frontend (fills the Pendientes + Mov. y egresos placeholder panels using the composable surface this plan stands up)"
tech-stack:
  added: []
  patterns:
    - "thin hub shell (CajaPage) + per-panel SFC extraction under src/components/caja/"
    - "shared selectedCountry/isOwner passed as props from hub to each tab + watch(prop) re-fetch"
    - "?tab= query-param persistence (router.replace, no history pollution)"
    - "per-currency subtotal grouping (Map by currency) — never a cross-currency total"
    - "blob-download export reuse (createObjectURL + anchor), Excel-only (no dead PDF control)"
    - "composable cleanup() kept; onUnmounted only in SFCs (never inside the composable)"
key-files:
  created:
    - el-templo-admin/src/constants/caja.ts
    - el-templo-admin/src/components/caja/MovimientosTab.vue
    - el-templo-admin/src/components/caja/SaldosPorCajaTab.vue
  modified:
    - el-templo-admin/src/composables/useTransactionsApi.ts
    - el-templo-admin/src/types/transaction.ts
    - el-templo-admin/src/pages/CajaPage.vue
decisions:
  - "Movimientos is a verbatim migration (89% file copy) — relocation, not redesign; only the country selector + egresos placeholder removed"
  - "Efectivo central group derived front-side from type=efectivo && branchId=null (backend enum is only efectivo/banco)"
  - "Saldo firme subtotals per-currency only (Map keyed by currency); pendiente never added to firme nor subtotaled"
  - "MovEgresoItem.kind widened to string (cash_transfer/expense not in the FE TransactionKind union)"
  - "voidTransaction omits keepMembershipActive from the body unless explicitly provided (backend defaults true)"
metrics:
  duration: ~12min
  completed: 2026-06-24
---

# Phase 141 Plan 03: Reportes para la admin (Caja hub frontend, part 1) Summary

Reorganized `/caja` into a `q-tabs` cash-control hub (Pendientes landing / Saldos / Movimientos / Mov. y egresos), migrated the existing CajaPage body verbatim into `MovimientosTab.vue`, built `SaldosPorCajaTab.vue` (cards grouped by tipo with strict per-currency subtotals), and extended `useTransactionsApi` with the whole Plan-01/02 read surface + the four 137 validation actions (`keepMembershipActive` threaded) + three Excel exports — honoring 141-UI-SPEC and the currency-isolation contract.

## What Was Built

- **`useTransactionsApi` extension + FE types (Task 1):** added `PendingTrayItem`/`PendingTrayResult`/`PendingTrayParams`, `CajaSaldoRow`/`CashBalancesParams`, `MovEgresoItem`/`MovEgresoParams`, `CorrectedFields` (mirroring the backend Plan-01/02 shapes). Composable now exposes `getPendingTray`, `getCashRegisterBalances`, `getMovEgresosHistory`, `validateTransaction`, `observeTransaction`, `correctTransaction`, an extended `voidTransaction(id, reason, keepMembershipActive?)` (only sends the flag when provided — backend defaults true), and `exportPendingTrayToExcel`/`exportCashBalancesToExcel`/`exportMovEgresosToExcel` (responseType:'blob'). All in the return block; `cleanup()` retained; **no `onUnmounted` inside the composable**; no `any`.
- **`src/constants/caja.ts` (Task 2):** `CAJA_TABS` tab-name constants + `CAJA_DEFAULT_TAB` (pendientes) + `CAJA_TAB_NAMES` (for `?tab=` validation). The overdue threshold is deliberately NOT here — it comes from the bandeja response `thresholdDays` (D-08 seam for 142).
- **`MovimientosTab.vue` (Task 2):** verbatim migration of the old CajaPage body (summary cards, "Por tipo de transacción" kind cards, filter bar, transactions q-table with method/kind badges + voided strike + clickable alumno + acciones q-menu Detalles/Anular, detail dialog, Exportar Excel). The country selector and the egresos "Próximamente" placeholder were removed; `selectedCountry`/`isOwner` are now props, with a `watch(props.selectedCountry)` driving the re-fetch the old in-page selector did. `cleanup()` is called from the SFC's `onUnmounted`.
- **`CajaPage.vue` (Task 2):** rewritten as a thin hub shell — header (text-h5 "Caja" + owner-only País q-select moved up) + `q-tabs` (align=left, active-color/indicator-color="primary", dense, Material icons inbox/account_balance_wallet/receipt_long/swap_horiz) + `q-separator` + `q-tab-panels` (keep-alive, swipeable=false) rendering MovimientosTab + SaldosPorCajaTab and placeholder panels for pendientes/movEgresos (Plan 04). Landing = pendientes; active tab synced to `?tab=` via `router.replace`. Router gating unchanged.
- **`SaldosPorCajaTab.vue` (Task 3):** consumes `getCashRegisterBalances`. Groups `CajaSaldoRow[]` into a FIXED order — Efectivo sucursales (efectivo && branchId≠null) / Efectivo central (efectivo && branchId=null) / Banco (banco) — separated by `q-mt-xl`. Each card: name + moneda badge beside + saldo firme (`text-h5` bold, large) + "Pendiente: {monto}" (`text-caption` gold/$warning, never added to firme). Per-currency subtotal chips (Map keyed by currency) — **never a cross-currency total**; empty group → "Sin cajas de este tipo." Only an "Exportar Excel" outline button (no PDF control); `q-skeleton` loading; negative notify on error; `createLogger('SaldosPorCajaTab')`; warm palette.

## Deviations from Plan

**1. [Rule 2 — type correctness] `MovEgresoItem.kind` widened to `string`.**

- **Found during:** Task 1 (FE type mirror).
- **Issue:** The plan's `MovEgresoItem` mirrors the backend, where `kind` includes `cash_transfer`/`expense` — values NOT in the admin's `TransactionKind` union (Phase 106 only declares the 5 member-keyed kinds). Mirroring `kind: TransactionKind` would be a lie and would force unsafe casts in Plan 04's MovEgresosTab.
- **Fix:** Declared `kind: string` with a comment; Plan 04 maps it to ES labels.
- **Files modified:** `el-templo-admin/src/types/transaction.ts`.
- **Commit:** 35f189b1

**2. [Rule 2 — missing critical behavior] Country-change re-fetch via `watch` in the tabs.**

- **Found during:** Task 2/3.
- **Issue:** The old CajaPage re-loaded summary/transactions via the country selector's `@update:model-value`. Moving the selector to the hub would have left the tabs stale on an owner AR↔ES switch (a correctness gap, not in the plan's explicit steps).
- **Fix:** Both MovimientosTab and SaldosPorCajaTab `watch(() => props.selectedCountry)` and re-fetch.
- **Files modified:** MovimientosTab.vue, SaldosPorCajaTab.vue.
- **Commit:** fcfa74c3, 8d72ebf1

Otherwise the plan executed as written.

## Verification

- `cd el-templo-admin && npx tsc --noEmit` — no errors in any Plan-03 file (composable, types, CajaPage, MovimientosTab, SaldosPorCajaTab, constants/caja). The only `tsc` errors are pre-existing and out of scope: `boot/__tests__/axios-refresh-lock.test.ts` (missing vitest types) and `utils/pdf/session-pdf-builder.ts` (pdfmake `vfs`/`Margins` typings) — both untouched by this plan.
- Warm palette honored: kind colors reuse existing tokens; the lone `blue` token is the pre-existing "Transferencia" summary-card icon migrated verbatim (no new blue introduced).
- Only Excel export buttons rendered (Movimientos + Saldos); no "Exportar PDF" dead control anywhere (REP-04, Excel-only v1).
- `cleanup()` retained in the composable; `onUnmounted` appears only in the two SFCs, never inside the composable.

## Threat Model Compliance

- **T-141-09** (coach → /caja): router meta `allowedRoles ['gestion','admin','owner']` left unchanged (coach excluded); backend `FINANCE_READ_ROLES` is the authoritative gate. Frontend gating is defense-in-depth.
- **T-141-10** (cross-currency total): SaldosPorCajaTab computes subtotals per-currency only (Map keyed by `currency`); there is no code path that sums `firmeBalance` across different currencies. Pendiente is never added to firme.
- **T-141-SC** (npm installs): zero new packages.

## Self-Check: PASSED

- el-templo-admin/src/constants/caja.ts: FOUND
- el-templo-admin/src/components/caja/MovimientosTab.vue: FOUND
- el-templo-admin/src/components/caja/SaldosPorCajaTab.vue: FOUND
- el-templo-admin/src/pages/CajaPage.vue: FOUND
- Commits 35f189b1, fcfa74c3, 8d72ebf1: FOUND
