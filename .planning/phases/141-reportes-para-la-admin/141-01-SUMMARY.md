---
phase: 141-reportes-para-la-admin
plan: 01
subsystem: finance (API)
tags: [reports, finance, bandeja, saldos, export, rbac]
requires:
  - "137: validation_status state machine + firmMoneyConditions"
  - "138: cash_registers entity + getBalance primitive"
  - "139: branch-less caja scope precedent (enforceCajaScope)"
provides:
  - "GET /api/admin/finance/pending-tray (REP-01) + sibling .xlsx export"
  - "GET /api/admin/finance/cash-registers/balances (REP-02) + sibling .xlsx export"
  - "TransactionService.listPendingTray()"
  - "CashRegisterService.listActiveCajasWithBalance()"
  - "OVERDUE_DAYS shared constant (142 swaps for finance_settings)"
affects:
  - "Plan 03 frontend (CajaPage hub: Pendientes + Saldos tabs consume these)"
tech-stack:
  added: []
  patterns:
    - "own LEFT-JOIN query (no mutation of shared list()/exportRowsForExcel())"
    - "TS-computed aging (clamp ≥0) mirroring getOutstandingConcepts"
    - "exceljs Workbook reuse via shared styleHeaderRow + ES label maps"
    - "sibling /export endpoints (NOT ?type=), Excel-only v1"
key-files:
  created:
    - el-templo-api/src/modules/finance/constants.ts
    - el-templo-api/test/finance/pending-tray.test.ts
    - el-templo-api/test/finance/cash-balances.test.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/cash-register-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
decisions:
  - "isOverdue + thresholdDays computed server-side (authoritative overdue counter; 142 seam)"
  - "listActiveCajasWithBalance scopes non-owner by branch.country; branch-less central/banco owner-only (Franco-confirmed)"
  - "bandeja paginated (PaginatedResult + max 200) per resolved Open Question 3"
  - "Excel-only export v1 (no pdfmake — that is session-PDF only)"
metrics:
  duration: ~5min
  completed: 2026-06-24
---

# Phase 141 Plan 01: Reportes para la admin (read endpoints + exports) Summary

Two read-only finance report endpoints — bandeja de pendientes (REP-01) and saldos por caja (REP-02) — each with its own service method and a sibling Excel export (REP-04), currency-isolated and coach-excluded, with no migration (reads over existing 137/138/139 columns).

## What Was Built

- **`OVERDUE_DAYS = 3` shared constant** (`constants.ts`) with a documented 142-swap seam.
- **`listPendingTray(filters)`** (TransactionService) — its OWN query: LEFT JOINs users/branches/cash_registers + a `recorder` self-join, filters `validation_status IN ('pendiente','observado')` (mapped from `status`) AND `voidedAt IS NULL`, orders **`asc(transactionDate), asc(createdAt)`** (oldest-first, the opposite of `list()`), computes `ageInDays` in TS (clamp ≥0, mirror of `getOutstandingConcepts`) and `isOverdue = ageInDays > OVERDUE_DAYS`, returns `PaginatedResult<PendingTrayItem> & { thresholdDays }`. The shared `list()`/`exportRowsForExcel()` were NOT touched.
- **`listActiveCajasWithBalance(scope?)`** (CashRegisterService) — selects active cajas (LEFT JOIN branches for country), composes the existing `getBalance(id)` per caja; for a non-owner it skips branch-less central/banco cajas (owner-only) and cajas whose `branch.country !== scope.country`.
- **Types:** `PendingTrayItem`, `PendingTrayFilters`, `CajaSaldoRow`.
- **Routes:** `GET /pending-tray`, `GET /pending-tray/export`, `GET /cash-registers/balances`, `GET /cash-registers/balances/export` — all under `financeRoutes` (coach 403 inherited from the `FINANCE_READ_ROLES` module guard), owner-aware country resolution reused verbatim. Exports reuse the exceljs Workbook pattern via a shared `styleHeaderRow` helper + ES label maps.
- **Schemas:** `pendingTraySchema`/`pendingTrayExportSchema`/`cashBalancesSchema`/`cashBalancesExportSchema`, all `additionalProperties:false` with the `status` enum.
- **Tests:** `pending-tray.test.ts` (oldest-first ordering, aging, recorder + caja name, isOverdue>3, thresholdDays, status filter, coach 403) and `cash-balances.test.ts` (per-caja firme excludes pendiente, coach 403, central/banco owner-only scope vs owner).

## Deviations from Plan

None — plan executed exactly as written. The two service methods are sibling queries (no mutation of shared paths), exports are Excel-only siblings, no migration was generated.

## Verification

- `npx tsc --noEmit` clean after each of the 3 tasks.
- No new migration files created under `el-templo-api/src/db/migrations/` (the two `??` 0101/0102 SQL files are pre-existing, out of scope).
- Integration tests run in CI on push to staging (per project policy — full suite not run locally).

## Threat Model Compliance

- **T-141-01** (coach disclosure): both test files assert coach → 403 over HTTP via the module guard.
- **T-141-02** (cross-country/central-banco): `listActiveCajasWithBalance` gates non-owner by branch country and makes branch-less cajas owner-only; the scope test asserts gestion does NOT see the branch-less banco caja while owner does.
- **T-141-03** (mass export ignoring scope): both export endpoints reuse the same owner-aware country resolution + scope as their read endpoint.
- **T-141-04** (SQLi): Drizzle parameterized queries only; querystring schemas `additionalProperties:false` + enum/format.
- **T-141-SC**: zero new packages.

## Self-Check: PASSED

- constants.ts, pending-tray.test.ts, cash-balances.test.ts: FOUND
- Commits 4659b704, e2afa629, ac2c0988: FOUND
