---
phase: 141-reportes-para-la-admin
plan: 02
subsystem: finance (API)
tags: [reports, finance, historial, mov-egresos, left-join, export, rbac]
requires:
  - "139: cash_transfer/expense/adjustment rows (member_id NULL, branch_id often NULL) + enforceCajaScope precedent"
  - "141-01: own-query pattern (no mutation of shared list()/exportRowsForExcel()), styleHeaderRow helper, owner-aware country resolution"
provides:
  - "GET /api/admin/finance/movements-history (REP-03) + sibling .xlsx export (REP-04)"
  - "TransactionService.listMovEgresos() — own LEFT-JOIN historial query"
  - "MovEgresoItem + MovEgresoFilters types"
affects:
  - "Plan 03 frontend (CajaPage Mov-Egresos tab consumes this)"
tech-stack:
  added: []
  patterns:
    - "own LEFT-JOIN sibling query (shared list()/exportRowsForExcel() byte-for-byte untouched)"
    - "country-scope-by-caja via sub-select (avoids the eq(branches.country) NULL-branch trap)"
    - "non-owner-with-no-country → 1=0 (defense-in-depth, zero rows not full ledger)"
    - "exceljs Workbook reuse via shared styleHeaderRow + ES label maps"
    - "sibling /export endpoint (Excel-only v1)"
key-files:
  created:
    - el-templo-api/test/finance/mov-egresos-history.test.ts
  modified:
    - el-templo-api/src/modules/finance/types.ts
    - el-templo-api/src/modules/finance/transaction-service.ts
    - el-templo-api/src/modules/finance/schemas.ts
    - el-templo-api/src/modules/finance/routes.ts
decisions:
  - "listMovEgresos LEFT JOINs users+branches+cash_registers+recorder so NULL-member rows survive (the 139 flag)"
  - "kind IN (cash_transfer, expense, adjustment) — adjustment included so the reconciliation trail is complete (Open Question 1 RESOLVED)"
  - "country scoped by CAJA's country (sub-select on cajas where branch.country matches), NOT eq(branches.country) — central/banco (branch-less) owner-only (Open Question 2 RESOLVED)"
  - "non-owner with unresolved country → 1=0 sentinel (zero rows) instead of an unscoped full-ledger read"
  - "shared list()/exportRowsForExcel() NOT mutated — Movimientos tab + Phase 109 tested export unaffected"
metrics:
  duration: ~7min
  completed: 2026-06-24
---

# Phase 141 Plan 02: Historial de movimientos inter-caja y egresos Summary

The 139 LEFT JOIN fix shipped: a NEW `listMovEgresos()` sibling query LEFT JOINs users/branches/cash_registers so `kind IN (cash_transfer, expense, adjustment)` rows with `member_id = NULL` (and often `branch_id = NULL`) survive — the shared member-keyed `list()`/`exportRowsForExcel()` INNER JOINs silently drop them. Exposed via `GET /movements-history` (paginated JSON, REP-03) + a sibling `/movements-history/export` (.xlsx, REP-04), filterable by caja/período, coach-excluded, country-scoped-by-caja, no migration.

## What Was Built

- **`listMovEgresos(filters)`** (TransactionService) — its OWN LEFT-JOIN query: `leftJoin(users)` on `memberId`, `leftJoin(branches)` on `branchId`, `leftJoin(cash_registers)` on `cashRegisterId`, + a `recorder` self-join on `recordedBy`. WHERE `kind IN ('cash_transfer','expense','adjustment')` + optional `eq(cashRegisterId)` + `gte/lte(transactionDate)` for período. ORDER BY `desc(transactionDate), desc(createdAt)`. Paginated (defense-in-depth max 200) with a matching COUNT query over the same LEFT-JOIN chain. `memberName` omitted (these rows have `member_id = NULL`). The shared `list()`/`exportRowsForExcel()` were NOT touched (git diff: pure additions, zero deletions).
- **Country-scope-by-caja (Pitfall 2 avoided):** instead of `eq(branches.country, country)` (which under the LEFT JOIN would wrongly exclude NULL-branch central/banco rows), the scope is a sub-select restricting `cash_register_id` to cajas whose `branch.country` matches — which inherently excludes branch-less central/banco cajas (owner-only, mirror of `enforceCajaScope`). Owner sees all (optional `?country` narrows by caja country). A non-owner with an unresolved country gets a `1 = 0` sentinel (zero rows, never the full ledger).
- **Types:** `MovEgresoItem` (id, transactionDate, kind, direction, amount, currency, cashRegisterId, cashRegisterName, branchId, branchName: string|null, recordedBy, recorderName, voidedAt, voidReason, notes) + `MovEgresoFilters` (cashRegisterId?, country?, isOwner?, dateFrom?, dateTo?, page?, limit?).
- **Schemas:** `movementsHistorySchema` (querystring cashRegisterId/country/dateFrom/dateTo/page/limit, `additionalProperties:false`) + `movementsHistoryExportSchema` (same minus page/limit).
- **Routes:** `GET /movements-history` (owner-aware country resolution, calls `listMovEgresos`, returns paginated result) + `GET /movements-history/export` (same filters minus page/limit, builds a "Mov-Egresos" Workbook sheet: Fecha · Tipo · Dirección · Concepto/Notas · Monto · Moneda · Caja · Registrado por · Anulado · Razón; reuses `styleHeaderRow`; `mov-egresos-${today}.xlsx`). Both under `financeRoutes` (coach 403 inherited from the `FINANCE_READ_ROLES` module guard). Added a `DIRECTION_LABELS_ES` label map for the export.
- **Test:** `mov-egresos-history.test.ts` — the load-bearing assertion proves a NULL-member `cash_transfer` AND a NULL-member `expense` both appear in the response (an INNER JOIN would drop both); plus a NULL-member row still renders cashRegisterName + recorderName; `?cashRegisterId` filter; `?dateFrom/?dateTo` período filter; an `adjustment` appears while a member cobro (`plan_charge`) does NOT; coach → 403.

## Deviations from Plan

**1. [Rule 2 — missing critical functionality] Non-owner-with-no-country defense-in-depth.**

- **Found during:** Task 1 (country-scope implementation).
- **Issue:** The plan specified scoping non-owners by caja country, but did not cover the edge case where a non-owner's `scope.country` is unresolved (undefined). Without a guard, the country condition would be skipped entirely, exposing the full cross-country ledger to a non-owner — a Information Disclosure leak (T-141-06 boundary).
- **Fix:** When `!isOwner` and `country` is undefined, push a `sql\`1 = 0\``sentinel so the query returns zero rows instead of the full ledger. Mirrors the by-construction safety of wave-1's`listActiveCajasWithBalance` (which skips every row when scope.country is null).
- **Files modified:** transaction-service.ts (listMovEgresos).
- **Commit:** 84ed167e

Otherwise the plan executed as written: own LEFT-JOIN sibling query, adjustment included, country-scope-by-caja (no NULL-branch trap), sibling Excel export, shared paths untouched, no migration.

## Verification

- `npx tsc --noEmit` clean after each task (Task 0 RED scaffold + Task 1 implementation).
- `git diff` on transaction-service.ts: **174 insertions, 0 deletions** — `list()`/`exportRowsForExcel()` are byte-for-byte unchanged (Movimientos tab + Phase 109's `export-transactions.test.ts` cannot regress).
- No new migration files under `src/db/migrations/` (the `??` 0101/0102 SQL files are pre-existing, out of scope — same as 141-01).
- Integration test runs in CI on push to staging (full suite not run locally, per project policy).

## Threat Model Compliance

- **T-141-05** (coach disclosure on /movements-history): coach → 403 asserted over HTTP via the `FINANCE_READ_ROLES` module guard.
- **T-141-06** (non-owner cross-country via the LEFT-JOIN NULL-branch trap): scoped by caja country (sub-select on cajas where branch.country matches), NOT `eq(branches.country)`; branch-less central/banco owner-only; non-owner-with-no-country → zero rows.
- **T-141-07** (mass export ignoring scope): `/movements-history/export` reuses the SAME owner-aware resolution + caja-country scope + filters as the read; no unscoped path.
- **T-141-08** (SQLi): Drizzle parameterized queries only; `movementsHistorySchema` `additionalProperties:false` + format/integer.
- **T-141-SC** (npm installs): zero new packages.

## Self-Check: PASSED

- el-templo-api/test/finance/mov-egresos-history.test.ts: FOUND
- Commits 24cc88ae (test RED), 84ed167e (feat GREEN): FOUND
