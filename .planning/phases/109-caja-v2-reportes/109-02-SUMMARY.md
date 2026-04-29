---
phase: 109-caja-v2-reportes
plan: 02
subsystem: finance/reports
tags:
  [
    phase-109,
    finance,
    backend,
    reports,
    outstanding-balances,
    aging,
    deudas,
    caja-v2,
  ]
requires:
  - phase-105-balances-cache
  - phase-106-finance-read-roles
  - phase-108-outstanding-concepts-pattern
provides:
  - GET /api/admin/reports/outstanding-balances
  - ReportsService.getOutstandingBalances
  - OutstandingBalanceRow / DebtBucket / OutstandingBalancesFilters / OutstandingBalancesResult / BucketTotals
affects:
  - admin frontend (109-04 will consume) — ReportesPage Deudas tab
tech-stack:
  added: []
  patterns:
    - Reuse Phase 108 getOutstandingConcepts JOIN/age-math pattern adapted to global scope
    - Owner-aware country resolution mirrors GET /api/admin/finance/transactions/summary (Phase 106)
    - Drizzle leftJoin chain (balances → subscriptions → subscription_plans → branches → users)
    - JS-side bucket math (computeAgeInDaysOB / computeBucketOB) — portable, timezone-stable
key-files:
  created:
    - el-templo-api/test/reports/outstanding-balances.test.ts (854 LOC)
  modified:
    - el-templo-api/src/modules/reports/types.ts (231 LOC, +85)
    - el-templo-api/src/modules/reports/schemas.ts (367 LOC, +71)
    - el-templo-api/src/modules/reports/service.ts (1186 LOC, +332)
    - el-templo-api/src/modules/reports/routes.ts (498 LOC, +52)
decisions:
  - Service method lives in ReportsService (not TransactionService) — matches D-08 path /reports/outstanding-balances and isolates the multi-currency keyed-bucketTotals quirk to one consumer
  - Bucket math in JS, not SQL CASE — matches Phase 108 pattern, portable across DB session timezones, makes the future-date clamp at 0 trivial
  - Owner without ?country sees ALL countries (no filter); owner with ?country=AR|ES filters; non-owner locked to scope.country — same pattern as GET /api/admin/finance/transactions/summary (Phase 106)
  - Reused buildMemberNameSearchCondition (shared/member-search.ts) instead of inlining LIKE — supports multi-token search (e.g. "Juan Perez")
  - debt_balance rows are excluded when branchId or country filter active because they have no branch (LEFT JOIN). Documented in the service docstring; tested explicitly in FILTER-BRANCH-EXCLUDES-DEBT and DEBT-BALANCE (uses owner)
  - Two queries for the result (paginated rows + full-set bucket totals) — avoids re-running the JOIN chain three times by skipping a separate COUNT query (count derived from the totals query is incorrect because we'd need the JOIN cardinality; chose explicit separate COUNT + totals scan for clarity)
metrics:
  duration_min: 20
  tasks_completed: 3
  files_modified: 4
  files_created: 1
  test_cases: 19
  test_pass: 19
  test_fail: 0
  completed_at: 2026-04-29
---

# Phase 109 Plan 02: Outstanding Balances (Deudas) Endpoint Summary

Backend endpoint `GET /api/admin/reports/outstanding-balances` powering the future "Deudas" tab in ReportesPage (Plan 109-04). Returns paginated outstanding-balance rows with server-computed aging buckets and either a flat `BucketTotals` (non-owner) or a per-currency keyed map (owner) so the frontend never sums different currencies in one total.

## Files Created/Modified

| File                                                      | LOC  | Δ    | Change                                                                                                                                                                 |
| --------------------------------------------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-api/src/modules/reports/types.ts`              | 231  | +85  | Added `DebtBucket`, `OutstandingBalanceRow`, `OutstandingBalancesFilters`, `BucketTotals`, `OutstandingBalancesResult`                                                 |
| `el-templo-api/src/modules/reports/schemas.ts`            | 367  | +71  | Added `outstandingBalancesSchema` (Fastify JSON Schema as const, NO Zod). `bucketTotals` typed as `object` with `additionalProperties: true` for both shape variants   |
| `el-templo-api/src/modules/reports/service.ts`            | 1186 | +332 | Added `getOutstandingBalances` method, `computeAgeInDaysOB`, `computeBucketOB`, `deriveEffectiveDateAndLabelOB`, `emptyBucketTotals` helpers, `MS_PER_DAY_OB` constant |
| `el-templo-api/src/modules/reports/routes.ts`             | 498  | +52  | Mounted `GET /outstanding-balances` with owner-aware country resolution. Inherits module-level CAJA_ROLES guard (no duplicate hook)                                    |
| `el-templo-api/test/reports/outstanding-balances.test.ts` | 854  | new  | 19 integration test cases — RBAC matrix, bucket boundaries, filters, pagination, multi-currency, debt_balance preservation, cross-country, amount=0 guard              |

Total: ~590 LOC of production code + 854 LOC of tests across 3 task commits.

## Test Results

```
✓ test/reports/outstanding-balances.test.ts (19 tests)
  ✓ RBAC1: coach receives 403
  ✓ RBAC2: recepcion receives 403 (CAJA_ROLES excludes recepcion)
  ✓ RBAC3: gestion receives 200
  ✓ RBAC4: admin receives 200
  ✓ RBAC5: owner receives 200
  ✓ EMPTY: empty result returns zeroed BucketTotals (non-owner flat shape)
  ✓ BUCKETS: bucket math matches D-05 boundaries (30/31/60/61/90/91)
  ✓ BUCKETS-FUTURE: future effective_date clamps ageInDays to 0 (bucket '0-30')
  ✓ SORT: default sort is ageInDays DESC (oldest first)
  ✓ FILTER-BRANCH: branchId filter restricts to that branch only
  ✓ FILTER-BRANCH-EXCLUDES-DEBT: branchId filter excludes debt_balance rows (no branch)
  ✓ FILTER-CURRENCY: currency filter restricts rows (owner)
  ✓ FILTER-SEARCH: search by member name (partial match)
  ✓ PAGINATION: 75 rows → page 1 returns 50, page 2 returns 25
  ✓ OWNER-MULTI-CURRENCY: bucketTotals keyed by currency for owner across ARS+EUR
  ✓ NON-OWNER-FLAT: bucketTotals flat for gestion in own country only
  ✓ DEBT-BALANCE: target_kind='debt_balance' row preserved through LEFT JOIN (owner sees all)
  ✓ CROSS-COUNTRY: non-owner from AR with only ES seeds → empty result (no 403)
  ✓ AMOUNT-ZERO-EXCLUDED: balance with amount=0 is not in rows (WHERE amount > 0)

Test Files  1 passed (1)
Tests       19 passed (19)
```

Combined with existing reports.test.ts: **30/30 reports tests pass** (no regression).

## Verification Output

```
$ cd el-templo-api && pnpm exec tsc --noEmit -p tsconfig.json
(clean — no errors)

$ grep -nc "/outstanding-balances" src/modules/reports/routes.ts
2

$ grep -nc "getOutstandingBalances\|computeBucketOB\|leftJoin" src/modules/reports/service.ts
18

$ grep -nc "OutstandingBalanceRow\|DebtBucket" src/modules/reports/types.ts
9

$ grep -nc "outstandingBalancesSchema" src/modules/reports/schemas.ts
4
```

All grep gates exceeded thresholds.

## Commits

| Hash       | Type | Scope    | Title                                                       |
| ---------- | ---- | -------- | ----------------------------------------------------------- |
| `bf8af20d` | feat | (109-02) | add types + schema for outstanding-balances (Deudas) report |
| `a5171f99` | feat | (109-02) | implement ReportsService.getOutstandingBalances (Deudas)    |
| `33a46447` | feat | (109-02) | mount GET /api/admin/reports/outstanding-balances + tests   |

## Key Decisions

1. **Service location: reports module, not finance.** D-08 specifies `/api/admin/reports/outstanding-balances`, and the existing `reports/` module already mounts `attachCountryScope` + the `CAJA_ROLES` guard. Moving the method into `finance/transaction-service.ts` would have required either a duplicate route mount or a service cross-import, neither of which is justified for a single read-only consumer. Phase 108 `getOutstandingConcepts` (per-member) lives in `transaction-service.ts` because the per-member `/financial-history` endpoint is mounted under `members/`, not `reports/`. Different consumers, different homes.

2. **Bucket math in JS, not SQL CASE.** The D-05 contract says `ageInDays = max(0, DATEDIFF(today, effectiveDate))` with the future-date clamp at 0. SQL `DATEDIFF(CURDATE(), effective_date)` returns negative integers for future dates, so we'd need a `GREATEST(0, ...)` wrapper plus a `CASE` for bucket assignment plus another timezone consideration if the DB session ever drifts from UTC. The JS approach (`new Date(); setHours(0,0,0,0)` + `Math.floor((now - effDate)/MS_PER_DAY)`) is portable, identical to Phase 108 `getOutstandingConcepts`, and survives a hypothetical DB timezone change without any code edit. The cost — ageInDays computed per-row in two passes (rows + bucketTotals) — is ~75 rows × 2 = 150 timestamp diffs per request. Negligible.

3. **Owner-aware country resolution mirrors finance/transactions/summary, not reports/access.** The simpler `country: request.scope.country` pattern used by `/access`, `/charges`, `/expiring`, `/inactive` always applies a country filter — even for owner. That works for the existing 4 reports because they're inherently single-country-tabular. The Deudas report is **the** place where multi-currency totals surface (D-06). Owner without `?country` MUST see ARS + EUR debts in the same response so the per-currency bucketTotals map is populated. The route handler explicitly branches: owner reads `request.query.country` (undefined = all countries), non-owner uses `request.scope.country`.

4. **Two queries instead of one with COUNT() OVER().** The bucketTotals scan needs the full filtered set without LIMIT, and JS-side aggregation needs `effectiveDate` per row. We could fold COUNT into the totals scan (`totalsRows.length`), but that conflates two concerns. Kept them separate — three trips: paginated rows, count, totals. The third trip is the only one that re-fetches all rows; the count is a single aggregate. Worth the clarity.

5. **Search uses `buildMemberNameSearchCondition` shared helper.** Supports multi-token search (e.g. `?search=Juan Perez` matches firstName=Juan AND lastName=Perez or firstName=Perez AND lastName=Juan via CONCAT_WS). Inlining a single LIKE would have been simpler but inconsistent with the rest of the admin search UX.

## Decisions / Deviations

### Deviations from Plan

**1. [Rule 1 — Bug] Test fixture: DEBT-BALANCE used wrong role**

- **Found during:** Task 3 first test run.
- **Issue:** Initial draft authenticated DEBT-BALANCE test as `gestionArToken`. debt_balance rows have no branch, so the `branches.country = 'AR'` filter applied for non-owner excluded the row. Test asserted `rows.length === 1` and got 0.
- **Root cause:** debt_balance rows are excluded whenever a country filter is active (this is documented service behavior, since debt_balance is a virtual concept without geography).
- **Fix:** Switched the test to `ownerToken` (owner without `?country` skips the country filter, so the LEFT JOIN preservation is observable). Updated test name to "DEBT-BALANCE: target_kind='debt_balance' row preserved through LEFT JOIN (owner sees all)" and added an inline comment explaining why owner is required.
- **Files modified:** `el-templo-api/test/reports/outstanding-balances.test.ts`
- **Commit:** rolled into `33a46447` (test passed before commit)

### effectiveDate Fallback for debt_balance

The Phase 108 pattern uses `balances.createdAt` (date portion) when the LEFT JOIN to `subscriptions` doesn't resolve. We preserved that exact fallback in `deriveEffectiveDateAndLabelOB` so the derived ageInDays matches across the two consumers. The `conceptLabel` for debt_balance is `"Saldo a regularizar"` (D-04 wording in the plan) instead of the per-member `"Saldo libre #<id>"` used in Phase 108 — the global report doesn't expose the internal balance ID.

## Self-Check: PASSED

**Files exist:**

- `el-templo-api/test/reports/outstanding-balances.test.ts` — FOUND
- `el-templo-api/src/modules/reports/types.ts` — FOUND (modified)
- `el-templo-api/src/modules/reports/schemas.ts` — FOUND (modified)
- `el-templo-api/src/modules/reports/service.ts` — FOUND (modified)
- `el-templo-api/src/modules/reports/routes.ts` — FOUND (modified)

**Commits exist:**

- `bf8af20d` — FOUND in git log
- `a5171f99` — FOUND in git log
- `33a46447` — FOUND in git log
