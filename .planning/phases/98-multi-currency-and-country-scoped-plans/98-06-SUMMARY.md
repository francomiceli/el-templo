---
phase: 98-multi-currency-and-country-scoped-plans
plan: 06
subsystem: reports-analytics-country-scoping
tags:
  [country-scope, reports, analytics, exports, multi-currency, forward-compat]
requires:
  - "phase 98 plan 01 (subscriptions.currency, payments.currency, branches.country columns)"
  - "phase 98 plan 02 (attachCountryScope preHandler)"
  - "phase 98 plan 03 (attachCountryScope wired on reports/routes.ts and analytics/routes.ts)"
  - "phase 98 plan 05 (precedent for request.scope.country → service filter threading)"
provides:
  - "ReportsService filters accept country; every buildXxxConditions emits branches.country WHERE clause when present"
  - "Charge history and expiring-memberships report rows include currency (from payments.currency / subscriptions.currency)"
  - "Excel exports for charges and expiring-memberships include a `Moneda` column populated per row"
  - "AnalyticsService filters accept country; every aggregation helper inner-joins branches and WHERE-filters by country when present"
  - "All 4 reports routes + all 4 analytics routes plumb request.scope.country into their filter objects"
  - "Plugin-level attachCountryScope registration untouched — Plan 03 remains sole owner"
affects:
  - "Plans 07-10 (admin UI reports/analytics pages — owner country dropdown now drives server-side filtering end-to-end)"
  - "Plan 11 (integration tests — reports + analytics now need cross-country 403/empty-result coverage)"
tech_stack:
  added: []
  patterns:
    - "Pass-country-as-positional-helper-argument (analytics private helpers) to avoid a filter-object refactor ripple"
    - "Conditional inner-join on branches in helpers whose base FROM is attendance/bookings/subscriptions — joined only when country filter is present to preserve existing query shape when no filter"
    - "Raw-SQL country predicate in buildChargeConditionsRaw + branches b alias in getInactiveMembers SQL"
    - "JSON schema response row augmentation (currency field) so Fastify schema validator does not strip the additive field"
key_files:
  modified:
    - "el-templo-api/src/modules/reports/service.ts"
    - "el-templo-api/src/modules/reports/routes.ts"
    - "el-templo-api/src/modules/reports/types.ts"
    - "el-templo-api/src/modules/reports/schemas.ts"
    - "el-templo-api/src/modules/analytics/service.ts"
    - "el-templo-api/src/modules/analytics/routes.ts"
    - "el-templo-api/src/modules/analytics/types.ts"
decisions:
  - "Added currency to JSON response schemas for charge-history and expiring-memberships rows. Without this, Fastify's response validator would strip the new field in production (even though TypeScript carries it through). reports/schemas.ts updated alongside types.ts."
  - "Analytics helpers pass `country` as a positional argument alongside the existing `branchId` positional. A filter-object refactor would have touched 14 private helpers; adding one argument keeps the blast radius linear and matches the existing positional style. Method signatures changed but are all private — no external caller is affected."
  - "For helpers whose base FROM is attendance/bookings/subscriptions (not payments/users which already had branches-reachable chains), the branches innerJoin is added ONLY when `country !== undefined`. Rationale: avoid changing query plans for the existing code path; the branch join is the single additive edge that turns on only when the country filter is active."
  - "getInactiveMembers is raw SQL with a `s.branch_id` conditional. Added a parallel `AND b.country = ?` conditional and an unconditional `INNER JOIN branches b ON b.id = s.branch_id`. branch_id is NOT NULL on subscriptions, so the unconditional inner join does not prune rows."
  - "Access-log and inactive-members Excel exports did NOT get a Moneda column. Access log is non-monetary (no amount, no currency-bearing field). Inactive members is a list of members who haven't checked in — also non-monetary. Only charges (payments.currency) and expiring (subscriptions.currency) are financial."
  - "request.scope.country is plumbed into EVERY reports + analytics handler (including access/inactive which are non-monetary). Non-monetary queries still benefit from country scoping — a non-owner staff in Spain should not see Argentine attendance data in their own reports, even though currency is irrelevant."
  - "On the SQL charge history query, currency comes directly from `p.currency` (payments.currency). On expiring memberships, currency comes from `subscriptions.currency`. No assumption is made about the relationship between plan.currency and payment.currency — Plan 04's cross-currency guard already ensures consistency."
metrics:
  duration: "~45 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 06: Reports + Analytics country scoping and Moneda column — Summary

Threaded `request.scope.country` (set by Plan 03's preHandler) through every
reports and analytics route handler into service-layer filters, then applied
the filter as a `branches.country = ?` WHERE clause on every aggregation and
row query in both modules. Added a `Moneda` column to the two Excel exports
whose underlying rows have an inherent currency (charges, expiring). Response
shapes remain a strict superset (REQ-98-11); no field was removed or renamed.

## Reports: service queries that got the country filter

| Method                     | How country is applied                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `buildAccessConditions`    | Emits `eq(schema.branches.country, filters.country)`; attendance query already innerJoined branches           |
| `buildChargeConditions`    | Emits `eq(schema.branches.country, filters.country)`; added `.innerJoin(branches)` to count query             |
| `buildChargeConditionsRaw` | Emits `sql\`b.country = ${filters.country}\``; added `INNER JOIN branches b ON b.id = m.branch_id` to raw SQL |
| `getExpiringMemberships`   | Emits `eq(schema.branches.country, filters.country)`; added `.innerJoin(branches)` to select                  |
| `getInactiveMembers` (raw) | Emits `AND b.country = ?`; added unconditional `INNER JOIN branches b ON b.id = s.branch_id`                  |

Grep evidence: `grep -c "filters.country" service.ts` returns 10; `grep -c "country" service.ts` returns 15; `grep -c "branches.country" service.ts` returns 6.

## Reports: export-row currency plumbing

- `ChargeReportRow` gained `currency: string` (from `payments.currency`)
- `ExpiringReportRow` gained `currency: string` (from `subscriptions.currency`)
- `AccessReportRow` and `InactiveReportRow` unchanged (non-monetary)

The SQL charge query now SELECTs `p.currency` and the expiring Drizzle query
now SELECTs `schema.subscriptions.currency`. Fastify response schemas updated
so the validator does not strip the additive `currency` field in production.

## Reports: Excel exports — Moneda column added where appropriate

| Export             | Sheet        | Monetary? | Moneda column              | Populated from                               |
| ------------------ | ------------ | --------- | -------------------------- | -------------------------------------------- |
| `/access/export`   | Accesos      | No        | No                         | —                                            |
| `/charges/export`  | Cobros       | Yes       | Yes (after Monto)          | `row.currency` (from payments.currency)      |
| `/expiring/export` | Vencimientos | Yes       | Yes (after Dias restantes) | `row.currency` (from subscriptions.currency) |
| `/inactive/export` | Inactivos    | No        | No                         | —                                            |

Rationale for skipping access + inactive: they carry no amount column, so a
currency column has nothing meaningful to accompany. Both still receive the
`country` filter so a Spanish coach's inactive-members list only shows
Spanish members (REQ-98-05).

Existing columns retained identical headers and order. Moneda is inserted
adjacent to the amount-bearing column in each sheet (after `Monto` on Cobros,
after `Dias restantes` on Vencimientos).

## Reports: route plumbing

All 8 reports handlers (4 data + 4 export) now read `request.scope.country`
and pass it into the filter object:

- `GET /access` + `/access/export`
- `GET /charges` + `/charges/export`
- `GET /expiring` + `/expiring/export`
- `GET /inactive` + `/inactive/export`

Grep: `grep -c "request.scope.country" reports/routes.ts` returns 8 (one per
handler).

## Analytics: service helpers that got the country filter

Every private helper below gained a `country: "AR" | "ES" | undefined`
parameter after `branchId`. When supplied, they inner-join `schema.branches`
and add `eq(schema.branches.country, country)` to the WHERE chain.

| Helper                 | Base FROM            | Join added when country present                 |
| ---------------------- | -------------------- | ----------------------------------------------- |
| `countActiveMembers`   | users                | unconditional (users.branchId is NOT NULL + FK) |
| `countNewMembers`      | users                | unconditional                                   |
| `countChurnedMembers`  | subscriptions        | unconditional                                   |
| `computeRetentionRate` | subscriptions (×2)   | unconditional on both queries                   |
| `getPlanDistribution`  | subscriptions        | unconditional                                   |
| `getAttentionList`     | subscriptions        | unconditional                                   |
| `getDailyCheckins`     | attendance           | conditional (only when country is set)          |
| `getPeakHoursHeatmap`  | attendance           | conditional                                     |
| `getSlotOccupancy`     | bookings → schedules | unconditional (schedules.branchId NOT NULL)     |
| `getNoShowRate`        | bookings → schedules | conditional                                     |
| `getRevenueTrend`      | payments → users     | unconditional                                   |
| `getRevenueByMethod`   | payments → users     | unconditional                                   |
| `getRevenueByBranch`   | payments → users     | unconditional (was already joined)              |
| `getExpectedRevenue`   | subscriptions        | conditional                                     |
| `sumRevenue`           | payments → users     | unconditional                                   |
| `computeDailyAvg`      | attendance           | conditional                                     |

Entry points `getKpis`, `getMemberAnalytics`, `getAttendanceAnalytics`,
`getFinancialAnalytics` each destructure `filters.country` and forward it.

Grep: `grep -c "branches.country" analytics/service.ts` returns 17 (each
helper touches it at least once).

## Analytics: route plumbing

All 4 analytics handlers plumb `request.scope.country` into the filters
object: `/`, `/members`, `/attendance`, `/financial`.

Grep: `grep -c "request.scope.country" analytics/routes.ts` returns 4.

## Plan 03 ownership: preHandler registration unchanged

Pre-flight greps (before edits) and post-flight greps (after commit) both
confirm:

- `reports/routes.ts`: `attachCountryScope` count = 2 (import + one call
  inside the existing onRequest hook); `addHook("onRequest")` count = 1
- `analytics/routes.ts`: `attachCountryScope` count = 2; `addHook("onRequest")`
  count = 1

No hook was added or re-registered in this plan. Plan 03 remains the sole
owner of plugin-level preHandler wiring.

## Forward-compat affirmation (REQ-98-11)

No response field was renamed or removed. Only additive changes:

- `ChargeReportRow.currency: string` — new, optional for consumers (defaults
  "ARS" if the server has legacy rows without currency, via `r.currency ??
"ARS"`)
- `ExpiringReportRow.currency: string` — new, defaults "ARS" if
  `schema.subscriptions.currency` is legacy-null
- Analytics response shapes (`KpiStats`, `MemberAnalytics`,
  `AttendanceAnalytics`, `FinancialAnalytics`) are STRUCTURALLY UNCHANGED —
  country filtering happens before aggregation, so row shapes on the wire are
  identical

Existing admin and member callers that ignore the new `currency` field
continue to work. Plan 07-10's admin UI will render `formatPrice(amount,
currency)` using the new field.

## No currency GROUP BY on analytics aggregations

The plan's Task 2 action block suggested adding a `GROUP BY
schema.payments.currency` to aggregations like `getRevenueByMethod`. I did
NOT do this because:

1. With the country filter applied (D-10: each view is single-country by
   construction), the currency within a single view is also single-valued by
   construction (payments in an AR branch are ARS; payments in an ES branch
   are EUR). Grouping by currency would produce the same single row per
   group that ungrouped aggregation already returns.
2. The existing response shape (`{ cash, transfer, card }` on
   `getRevenueByMethod`, `{ month, revenue }` array on `getRevenueTrend`,
   `{ branchId, branchName, revenue }` array on `getRevenueByBranch`) has no
   slot for a currency discriminator. Adding GROUP BY currency without
   changing the response shape could silently double rows (e.g., two
   `{ branchId: 1, branchName: "San Isidro", revenue: ... }` rows, one for
   each currency) — which would break admin UI consumers that key on
   branchId.
3. Any future cross-country aggregation that DOES need GROUP BY currency
   should introduce a new response-shape-compatible field (like a
   `revenueByCurrency: { ARS: ..., EUR: ... }` block) — that is out of scope
   for this plan and forbidden by SPEC.md ("Consolidated/base-currency
   reporting" excluded).

Net effect: analytics aggregations remain single-currency per call, matching
SPEC D-10 and avoiding cross-currency sum bugs by construction via the
country scope filter.

## Cross-country bleed risk: flagged for Plan 11

One aggregation is worth explicit attention in the integration test suite:
`getRevenueByBranch` returns an array of branches with their revenue. When
an owner toggles `?country=ES`, only Spanish branches should appear; when a
non-owner with an AR branch hits the endpoint, only their branch country's
branches should appear. This is now enforced via the branches join + country
WHERE clause, but Plan 11 should add an integration test:

- Owner calls `GET /api/admin/analytics/financial?country=ES` → response's
  `revenueByBranch` contains only ES branches
- Non-owner (AR coach) calls same endpoint → `revenueByBranch` contains only
  their branch (or at most all AR branches — matches existing role scoping)

## Note for Plan 11 (integration tests — reports + analytics)

New endpoints/cases to cover:

1. `GET /api/admin/reports/charges?country=ES` (owner) — only ES payments
   rows
2. `GET /api/admin/reports/charges/export?country=ES` (owner) — downloaded
   XLSX has `Moneda` column; all rows show `EUR`
3. `GET /api/admin/reports/charges` (non-owner AR coach) — only AR payment
   rows (branch-scoped); `Moneda` column in export is `ARS` for every row
4. `GET /api/admin/reports/expiring?country=ES` — only ES subscription rows;
   export has Moneda = EUR
5. `GET /api/admin/reports/access?country=ES` — only ES attendance rows
   (non-monetary, no Moneda in export, but scoped)
6. `GET /api/admin/reports/inactive?country=ES` — only ES members (via raw
   SQL b.country condition)
7. `GET /api/admin/analytics?country=ES` (owner) — KPIs reflect only ES
   data; monthlyRevenue is a EUR total
8. `GET /api/admin/analytics/members?country=ES` — newMembers,
   churnedMembers, retentionRate, planDistribution all ES-only
9. `GET /api/admin/analytics/attendance?country=ES` — dailyCheckins,
   peakHoursHeatmap, slotOccupancy, noShowRate all from ES bookings
10. `GET /api/admin/analytics/financial?country=ES` — revenueTrend,
    revenueByMethod, revenueByBranch all ES-only; revenueByBranch contains
    zero AR branches
11. Non-owner (AR coach) with `?country=ES` — preHandler collapses to AR;
    response is AR-scoped (defense-in-depth verification)
12. Owner with no `?country=` query — preHandler falls back to owner's own
    branch country (D-06 default AR)

## Out of scope (deferred)

- Integration tests — Plan 11 owns them (all cases enumerated above)
- Admin UI country-toggle wiring on ReportesPage, AnaliticasPage, CajaPage,
  FinanzasTab — Plans 08-10
- CSV exports — none exist in reports/routes.ts today; all exports are
  Excel. If CSV endpoints are added later, they must include `currency`
  column by the same rule
- CajaPage service — not in reports/analytics module; owned by Plan 09

## Commit

- `818fee7a` feat(98-06): country-scope filter + Moneda column on reports
  and analytics

## Acceptance criteria — all met

| Check                                                     | Result         | Expected | Status |
| --------------------------------------------------------- | -------------- | -------- | ------ |
| `grep -q "attachCountryScope"` on reports/routes.ts       | yes            | yes      | OK     |
| `grep -q "attachCountryScope"` on analytics/routes.ts     | yes            | yes      | OK     |
| `grep -c 'country?: "AR"' reports/types.ts`               | 4              | ≥1       | OK     |
| `grep -c "eq(schema.branches.country" reports/service.ts` | 4              | ≥1       | OK     |
| `grep -c "filters.country" reports/service.ts`            | 10             | ≥3       | OK     |
| `grep -q 'header: "Moneda"' reports/routes.ts`            | yes            | yes      | OK     |
| `grep -q "currency: row.currency" reports/routes.ts`      | yes            | yes      | OK     |
| `grep -c "request.scope.country" reports/routes.ts`       | 8              | ≥4       | OK     |
| `grep -c 'addHook("onRequest"' reports/routes.ts`         | 1              | 1        | OK     |
| `grep -c "country" analytics/service.ts`                  | 86             | ≥3       | OK     |
| `grep -q "branches.country" analytics/service.ts`         | yes            | yes      | OK     |
| `grep -c "request.scope.country" analytics/routes.ts`     | 4              | ≥1       | OK     |
| `grep -c 'addHook("onRequest"' analytics/routes.ts`       | 1              | 1        | OK     |
| No new `console.log` introduced                           | 0              | 0        | OK     |
| `cd el-templo-api && pnpm tsc --noEmit`                   | exit 0         | exit 0   | OK     |
| `cd el-templo-api && pnpm test` — full suite              | 720/720 passed | all pass | OK     |

## Self-Check: PASSED

Files modified (verified via `[ -f … ]`):

- `el-templo-api/src/modules/reports/service.ts` — FOUND
- `el-templo-api/src/modules/reports/routes.ts` — FOUND
- `el-templo-api/src/modules/reports/types.ts` — FOUND
- `el-templo-api/src/modules/reports/schemas.ts` — FOUND
- `el-templo-api/src/modules/analytics/service.ts` — FOUND
- `el-templo-api/src/modules/analytics/routes.ts` — FOUND
- `el-templo-api/src/modules/analytics/types.ts` — FOUND

Commit (verified via `git log --oneline`):

- `818fee7a` feat(98-06): country-scope filter + Moneda column on reports
  and analytics — FOUND

TypeScript: `cd el-templo-api && pnpm tsc --noEmit` exit 0 (no output).
Full test suite: 720/720 pass (38/38 test files).

Plan 03 ownership: `attachCountryScope` count = 2 (unchanged), onRequest
hook count = 1 (unchanged) on both plugins. No preHandler registration
was added, removed, or modified in this plan.
