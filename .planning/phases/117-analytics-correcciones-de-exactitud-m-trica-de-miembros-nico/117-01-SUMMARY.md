---
phase: 117-analytics-correcciones-de-exactitud-m-trica-de-miembros-nico
plan: 01
subsystem: analytics
tags: [analytics, correctness, multi-currency, scope, tdd]
requires: []
provides:
  - "shared/active-member.ts::activeMemberExists — canonical live 'activo' predicate"
  - "analytics/scope.ts::applyScope — branch/country scope helper (two flavors)"
  - "per-currency revenue types (RevenueByCurrency, MonetaryKpiByCurrency)"
  - "PlanDistributionRow with country"
affects:
  - el-templo-admin (FinanzasTab.vue / CajaPage.vue / AnaliticasPage.vue + types/analytics.ts consume the new revenue shape — frontend update deferred to its phase-117 frontend plan)
tech-stack:
  added: []
  patterns:
    - "Reusable Drizzle sql fragment as a shared predicate (not a class/entity)"
    - "Per-currency revenue split (group by currency, map to { ARS, EUR }) — never sum across"
    - "Half-open [from, to+1day) date ranges to preserve indexes"
key-files:
  created:
    - el-templo-api/src/modules/shared/active-member.ts
    - el-templo-api/src/modules/analytics/scope.ts
  modified:
    - el-templo-api/src/modules/analytics/service.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/test/analytics/analytics.test.ts
    - el-templo-api/test/helpers.ts
decisions: [D-01, D-02, D-04, D-05, D-06, D-07, D-08, D-09, D-17, D-18]
metrics:
  duration: ~75min
  completed: 2026-05-26
---

# Phase 117 Plan 01: Analytics correctness foundations Summary

Extracted the canonical live "activo" predicate (`activeMemberExists`) and an
`applyScope` scope helper, then fixed the six FINDINGS correctness bugs in-place
and made every revenue metric report ARS and EUR separately — all covered by
integration tests against real MySQL.

## What Was Built

- **`shared/active-member.ts`** — `activeMemberExists(userIdColumn)` returns the
  EXISTS predicate copied verbatim from `recomputeUserStatus`. Analytics now
  computes "activo" live from subscriptions instead of reading the drift-prone
  `users.status` column (excludes the ~48 fantasmas; real count 692 vs 749).
- **`analytics/scope.ts`** — `applyScope` absorbs the two repeated scope flavors
  (join-always vs join-conditional), returning append-only WHERE conditions plus
  a `needsBranchJoin` flag. Documented; append-only (T-117-01).
- **Bug fixes in `analytics/service.ts`:**
  - D-02: `countActiveMembers` uses `activeMemberExists`, drops `users.status`.
  - D-04: no-show enum `'confirmed'` → `'confirmado'` (was always ~100%/0).
  - D-05/D-17: `sumRevenue`, `getRevenueTrend`, `getRevenueByMethod`,
    `getRevenueByBranch`, and the `monthlyRevenue` KPI split per currency;
    currencies are never summed.
  - D-06: `countNewMembers` counts only new ACTIVE members (canonical predicate).
  - D-07: `getPlanDistribution` filters `is_archived` and groups by `(name,
country)` — Flex (AR) and Flex (ES) stay separate; archived plans hidden.
  - D-08: half-open `[dateFrom, dateTo+1)` ranges (no `DATE()` wrapper) on the
    `createdAt` and `checkedInAt` WHERE filters to keep indexes usable.
- **Types** (`types.ts`): `RevenueByCurrency`, `MonetaryKpiByCurrency`,
  `PlanDistributionRow`, and updated `KpiStats`/`FinancialAnalytics`.
- **Fastify response schemas** (`schemas.ts`) updated to the new per-currency +
  plan-distribution-country shapes so `fast-json-stringify` does not strip the
  new keys.
- **Tests**: `activeMemberExists` (active-vigente / fantasma-vencido), no-show
  with real `confirmado` rows, multi-currency revenue, new-active members, and
  plan distribution by (name, country) — all against real MySQL with a real
  clock (no fake timers, per Plan 103-03 lesson).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated Fastify response schemas (`schemas.ts`)**

- **Found during:** Task 2
- **Issue:** The plan's `files_modified` did not list `schemas.ts`, but
  `fast-json-stringify` strips response fields not declared in the schema. The
  new per-currency revenue shape and `planDistribution.country` would have been
  silently dropped on the wire.
- **Fix:** Updated `kpiSchema` (monthlyRevenue → per-currency),
  `memberAnalyticsSchema` (planDistribution + country), and
  `financialAnalyticsSchema` (revenueTrend/ByMethod/ByBranch per-currency).
- **Commit:** c80d980e

**2. [Rule 3 - Blocking] Added finance tables to test `TABLES_TO_CLEAN`**

- **Found during:** Task 2
- **Issue:** `cleanAllTestData` did not clean `financial_transactions`,
  `transaction_links`, or `balances`, so rows leaked across tests and polluted
  the new exact-total per-currency assertions (saw 243000 instead of 25000 in
  full-suite runs).
- **Fix:** Added the three tables to `TABLES_TO_CLEAN` (FK checks already
  disabled). Finance suite (141 tests) still green afterwards.
- **Commit:** c80d980e

**3. [Rule 1 - Bug / scope-adjacent] Also fixed `getPeakHoursHeatmap` date filter (D-08)**

- **Found during:** Task 2
- **Issue:** The plan listed D-08 fixes at `:277, :513, :1021`, but
  `getPeakHoursHeatmap` has the same index-killing `DATE(checkedInAt)` WHERE
  filter. Left unfixed it would contradict the D-08 intent and the acceptance
  grep gate.
- **Fix:** De-wrapped its range filter to `[from, to+1)`. The `DATE()` projection
  in the daily-bucket SELECT/GROUP BY of `getDailyCheckins` is intentionally kept
  (required to bucket by calendar day).
- **Commit:** c80d980e

### Pre-existing test contract updates

Three pre-existing analytics tests asserted the old single-number revenue shape
and a bare-freemium "new member"; they were updated to the per-currency shape and
to assign a subscription (D-06 now requires active). Not deviations — required
consequences of the contract changes.

## Known Stubs

None. No stub data introduced.

## Frontend Contract Change (deferred)

The admin app (`el-templo-admin`) consumes the analytics revenue shape in
`FinanzasTab.vue`, `CajaPage.vue`, `AnaliticasPage.vue`, and
`src/types/analytics.ts`. Those still expect the old single-number
`monthlyRevenue.value` / `revenueTrend[].revenue` / `revenueByMethod.cash:number`
shapes and will need updating to the per-currency shape. This is **deferred to
the phase-117 frontend plan** per this plan's backend-only scope. Until then the
admin Analytics/Finanzas tab will mis-render revenue (admin is web-only / staging).

## Self-Check: PASSED

- Files exist: active-member.ts, scope.ts (FOUND); service/types/schemas modified.
- Commits exist: d95c9b3e (Task 1), c80d980e (Task 2).
- `pnpm tsc --noEmit` clean; `pnpm vitest run test/analytics/analytics.test.ts`
  25/25 green; finance suite 141/141 green.
- Grep gates: `subscription_status` present in active-member.ts; `innerJoin` in
  scope.ts (5); `activeMemberExists` used in service.ts (4×); no runtime
  `'confirmed'` typo; plan distribution by (name, country) returns 2 rows; revenue
  multi-currency keys separate.
