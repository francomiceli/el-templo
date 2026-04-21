---
phase: 98-multi-currency-and-country-scoped-plans
plan: 09
subsystem: admin-ui-reports-country-scope
tags:
  [
    admin-ui,
    country-scope,
    multi-currency,
    formatPrice,
    reports,
    analytics,
    exports,
  ]
requires:
  - "phase 98 plan 02 (formatPrice utility — accepts amount in whole currency units, no cents)"
  - "phase 98 plan 06 (reports/analytics endpoints accept ?country=; charges/expiring rows carry currency; XLSX exports carry Moneda column)"
  - "phase 98 plan 07 (owner QSelect pattern precedent from PlanesPage)"
provides:
  - "CajaPage: owner Argentina/España QSelect + formatPrice on all 4 summary cards + row-level Monto + detail dialog + void confirm"
  - "ReportesPage: owner Argentina/España QSelect + formatPrice on Cobros amount column + country-plumbed fetch on all 4 tabs + country-plumbed export on all 4 exports"
  - "AnaliticasPage: owner Argentina/España QSelect + formatPrice on monthlyRevenue KPI card + country-plumbed filters for kpis/member/attendance/financial fetches"
  - "FinanzasTab: currency prop + formatPrice for revenueByMethod cells, outstanding card, chart tooltips (bar chart + branch chart)"
  - "usePaymentsApi.getFinancialSummary(branchId?, dateFrom?, dateTo?, country?) — backward-compatible positional country param"
  - "useAnalyticsApi.buildParams forwards filters.country"
  - "Additive type fields: PaymentListItem.currency, ChargeReportRow.currency, ExpiringReportRow.currency, AnalyticsFilters.country, *ReportParams.country"
affects:
  - "Plan 10 (member app price displays) — uses the same formatPrice primitive, same D-06 pattern"
  - "Plan 11 (integration tests) — exports now carry country query param end-to-end; verify Moneda column matches owner's toggled country"
tech_stack:
  added: []
  patterns:
    - "Owner-only v-if QSelect driven by authStore.user?.role === 'owner' (AdminLayout.vue precedent, Plan 07 convention)"
    - "Page-level displayCurrency computed from selectedCountry ('ES' -> 'EUR' | else 'ARS') for aggregate totals/charts without a row-level currency field"
    - "Row-level formatPrice(row.amount, row.currency ?? displayCurrency) fallback pattern for rows where server hasn't yet returned currency in legacy data"
    - "countryScope computed (owner ? selectedCountry : undefined) — same value plumbed into all tab fetches AND all exports so the toggle propagates end-to-end"
    - "FinanzasTab accepts currency as an optional prop (defaults to 'ARS' via withDefaults) so the parent AnaliticasPage owns the single selector per D-10"
    - "Chart.js options wrapped in computed() so tooltip callbacks pick up currency prop reactivity when owner toggles country"
key_files:
  modified:
    - "el-templo-admin/src/pages/CajaPage.vue (+45 / -10 lines)"
    - "el-templo-admin/src/pages/ReportesPage.vue (+60 / -15 lines)"
    - "el-templo-admin/src/pages/AnaliticasPage.vue (+35 / -10 lines)"
    - "el-templo-admin/src/components/analytics/FinanzasTab.vue (+15 / -15 lines)"
    - "el-templo-admin/src/composables/usePaymentsApi.ts (+3 / -1 lines)"
    - "el-templo-admin/src/composables/useAnalyticsApi.ts (+1 / -0 lines)"
    - "el-templo-admin/src/types/payment.ts (+2 / -0 lines — additive: PaymentListItem.currency, PaymentListParams.country)"
    - "el-templo-admin/src/types/report.ts (+6 / -0 lines — additive: ChargeReportRow.currency, ExpiringReportRow.currency, *ReportParams.country)"
    - "el-templo-admin/src/types/analytics.ts (+1 / -0 lines — additive: AnalyticsFilters.country)"
decisions:
  - "CajaPage has NO export button — only void/detail menu actions on the payments table. The conditional 'Export plumbing on CajaPage' acceptance criterion is therefore skipped, as allowed by the plan."
  - "ReportesPage uses a single page-level country selector controlling ALL 4 tabs (Accesos, Cobros, Vencimientos, Inactivos). Tab switch via watch(activeTab) re-fetches for the current country. Every tab's fetch AND its export carry country: countryScope."
  - "AnaliticasPage owns the selector; FinanzasTab receives currency as a prop per D-10 (one selector per page). Prop defaults to 'ARS' via withDefaults so the component is safe if used elsewhere without a currency prop."
  - "Row-level Monto in CajaPage payments table uses slotProps.row.currency ?? displayCurrency. Server currently populates currency on newer payments (Plan 06); the fallback prevents legacy rows from rendering as bare numbers. Same fallback on the detail dialog and void confirm message."
  - "Existing FinancialSummary response shape does NOT carry currency — the per-method totals (cash/transfer/card/monthlyRevenue) are already single-currency per the backend scoping. The client formats them with displayCurrency derived from the owner's selection (or the non-owner's own country via server scope, where displayCurrency defaults to ARS — acceptable since a non-owner never sees a mixed-country view)."
  - "getFinancialSummary's country arg placed in the 4th positional slot (after branchId, dateFrom, dateTo) to preserve backward compatibility with all existing call sites. This matches the established convention in this codebase (positional optional args)."
  - "Removed duplicate inline arsFormatter in ReportesPage, AnaliticasPage, FinanzasTab — all three now route through the shared formatPrice utility. Zero cross-file drift risk going forward."
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-21"
---

# Phase 98 Plan 09: Admin reports UI country scoping + formatPrice migration — Summary

Wired the owner Argentina/España selector, migrated every price display
to `formatPrice`, and plumbed the active country through every fetch and
every export request on the four admin reporting surfaces. The backend
changes from Plans 03 + 06 (country scope preHandler, country filter in
services, Moneda column in XLSX exports) now have fully corresponding
client-side UI.

## Surfaces touched

| Surface                                | Selector | Price migration | Fetch plumbing  | Export plumbing                     |
| -------------------------------------- | -------- | --------------- | --------------- | ----------------------------------- |
| `CajaPage.vue`                         | Yes      | 8 formatPrice   | Yes             | N/A (no export button on this page) |
| `ReportesPage.vue`                     | Yes      | 2 formatPrice   | Yes (4 tabs)    | Yes (all 4 exports)                 |
| `AnaliticasPage.vue`                   | Yes      | 2 formatPrice   | Yes (4 fetches) | N/A (no export button on this page) |
| `components/analytics/FinanzasTab.vue` | prop     | 4 formatPrice   | via parent      | N/A (no export button on this tab)  |

## Exact lines migrated from toLocaleString to formatPrice

| File                                                        | Before                                                     | After                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `CajaPage.vue` (line 23)                                    | `${{ summary.revenueByMethod.cash.toLocaleString() }}`     | `{{ formatPrice(summary.revenueByMethod.cash, displayCurrency) }}`                                      |
| `CajaPage.vue` (line 39)                                    | `${{ summary.revenueByMethod.transfer.toLocaleString() }}` | `{{ formatPrice(summary.revenueByMethod.transfer, displayCurrency) }}`                                  |
| `CajaPage.vue` (line 55)                                    | `${{ summary.revenueByMethod.card.toLocaleString() }}`     | `{{ formatPrice(summary.revenueByMethod.card, displayCurrency) }}`                                      |
| `CajaPage.vue` (line 71)                                    | `${{ summary.monthlyRevenue.toLocaleString() }}`           | `{{ formatPrice(summary.monthlyRevenue, displayCurrency) }}`                                            |
| `CajaPage.vue` (line 174)                                   | `${{ slotProps.row.amount.toLocaleString() }}`             | `{{ formatPrice(slotProps.row.amount, slotProps.row.currency ?? displayCurrency) }}`                    |
| `CajaPage.vue` (line 267)                                   | `${{ detailPayment.amount.toLocaleString() }}`             | `{{ formatPrice(detailPayment.amount, detailPayment.currency ?? displayCurrency) }}`                    |
| `CajaPage.vue` (line 539 — confirmVoid dialog)              | `$${payment.amount.toLocaleString()}`                      | `${formatPrice(payment.amount, payment.currency ?? displayCurrency.value)}`                             |
| `ReportesPage.vue` (Cobros amount column)                   | `format: (val) => formatCurrency(val)`                     | `format: (val, row) => formatRowCurrency(val, row)` (reads row.currency)                                |
| `AnaliticasPage.vue` (monthlyRevenue KPI)                   | `formatCurrency(k.monthlyRevenue.value)`                   | Still `formatCurrency(...)` — but `formatCurrency` now wraps `formatPrice` with `displayCurrency.value` |
| `FinanzasTab.vue` (revenueByMethod × 3 cells + outstanding) | inline `arsFormatter.format(value)`                        | `formatCurrency(value)` — wraps `formatPrice(value, props.currency)`                                    |
| `FinanzasTab.vue` (bar + branch chart tooltips)             | inline `arsFormatter`                                      | `formatPrice(ctx.parsed.{x,y}, props.currency)` inside computed chart options                           |

## Grep acceptance criteria — all pass

| Check                                                       | Result        | Expected |
| ----------------------------------------------------------- | ------------- | -------- | ----- |
| `grep -c "formatPrice" CajaPage.vue`                        | 8             | ≥ 2      |
| `grep -c "selectedCountry" CajaPage.vue`                    | 5             | ≥ 2      |
| `grep -q "Argentina" CajaPage.vue`                          | OK            | match    |
| `grep -qE "España\|Espana" CajaPage.vue`                    | OK            | match    |
| `grep -c ".toLocaleString()" CajaPage.vue`                  | 0             | 0        |
| `grep -c "formatPrice" ReportesPage.vue`                    | 2             | ≥ 2      |
| `grep -c "selectedCountry" ReportesPage.vue`                | 4             | ≥ 2      |
| `grep -q "Argentina" ReportesPage.vue`                      | OK            | match    |
| `grep -qE "España\|Espana" ReportesPage.vue`                | OK            | match    |
| `grep -c ".toLocaleString()" ReportesPage.vue`              | 0             | 0        |
| `grep -A 15 "exportingAccess.value = true" …                | grep country` | OK       | match |
| `grep -A 15 "exportingCharges.value = true" …               | grep country` | OK       | match |
| `grep -A 15 "exportingExpiring.value = true" …              | grep country` | OK       | match |
| `grep -A 15 "exportingInactive.value = true" …              | grep country` | OK       | match |
| `grep -c "formatPrice" AnaliticasPage.vue`                  | 2             | ≥ 2      |
| `grep -c "selectedCountry" AnaliticasPage.vue`              | 4             | ≥ 2      |
| `grep -q "Argentina" AnaliticasPage.vue`                    | OK            | match    |
| `grep -c ".toLocaleString()" AnaliticasPage.vue`            | 0             | 0        |
| `grep -c "formatPrice" FinanzasTab.vue`                     | 4             | ≥ 2      |
| `grep -c ".toLocaleString()" FinanzasTab.vue`               | 0             | 0        |
| `cd el-templo-admin && pnpm tsc --noEmit` on modified files | clean         | 0 errors |

## Pages without export buttons — conditional criterion skipped

Three of the four surfaces have no export button:

1. **CajaPage** — only has row-level void/detail actions. No "Exportar" button.
2. **AnaliticasPage** — dashboards + KPI cards; no export action on the page.
3. **FinanzasTab** — child chart component; parent has no export button either.

The plan explicitly says: _"If [page] has no export button, that's fine —
grep for an `export` handler first; if absent, document in SUMMARY and
skip the export-plumbing acceptance criterion for this file."_

Only **ReportesPage** has export buttons (4 of them) — all plumb country,
grep-verified.

## Type additions (forward-compat per REQ-98-11)

All additions are strict superset — no rename, no removal:

- `PaymentListItem.currency?: string` (optional; populated by server when available)
- `PaymentListParams.country?: 'AR' | 'ES'`
- `ChargeReportRow.currency?: string` (populated from payments.currency per Plan 06)
- `ExpiringReportRow.currency?: string` (populated from subscriptions.currency per Plan 06)
- `AccessReportParams.country?: 'AR' | 'ES'`
- `ChargeReportParams.country?: 'AR' | 'ES'`
- `ExpiringReportParams.country?: 'AR' | 'ES'`
- `InactiveReportParams.country?: 'AR' | 'ES'`
- `AnalyticsFilters.country?: 'AR' | 'ES'`

## Composable signature changes

### `usePaymentsApi.getFinancialSummary`

Before: `getFinancialSummary(branchId?, dateFrom?, dateTo?)`
After: `getFinancialSummary(branchId?, dateFrom?, dateTo?, country?)`

Positional 4th arg; all existing callers still compile.

### `useAnalyticsApi.buildParams`

Internal helper — now also plumbs `filters.country` when set. No public
API change; all four public methods (`getKpis`, `getMemberAnalytics`,
`getAttendanceAnalytics`, `getFinancialAnalytics`) already accept
`AnalyticsFilters` and the new `country` field is transparently forwarded.

## Deviations from Plan

**None** — plan executed as written. Conditional export-plumbing
acceptance for pages without exports was explicitly allowed by the plan
and applied to CajaPage, AnaliticasPage, FinanzasTab (all three lack
export buttons).

## Known Stubs

None. All wired end-to-end:

- QSelect → `selectedCountry` → `countryScope` computed → `country: countryScope.value`
  in every fetcher/exporter → server `?country=` query param (Plan 03 preHandler
  honors for owner, collapses for non-owner).
- Row `currency` field → `formatPrice(amount, row.currency ?? displayCurrency)`.
- FinanzasTab `currency` prop → chart tooltip callbacks (computed chart options
  so Chart.js picks up prop changes).

## Threat Flags

None. The plan's `<threat_model>` enumerates T-98-05, T-98-12, T-98-17;
all three are mitigated by construction:

- **T-98-05** (cross-country info disclosure): server scopes via preHandler;
  owner's client sends country, non-owner's request has `country=undefined`
  and server derives.
- **T-98-12** (cross-currency sums): every view is single-currency by
  construction — country filter applies server-side before aggregation.
- **T-98-17** (export missing currency): ReportesPage exports now carry
  country, and Plan 06 already added Moneda column to XLSX.

## Out of scope (deferred)

- **Member app price displays + plan catalog** — Plan 10.
- **Integration tests** (export country plumbing, currency column matches
  toggled country) — Plan 11. Enumerated in Plan 06 SUMMARY's test plan.
- **Pre-existing pdfmake TS errors** in `utils/pdf/session-pdf-builder.ts` —
  logged in deferred-items.md in Plan 07, still present, not touched.
  Zero new errors introduced by Plan 09.

## Commit

- `fc121797` feat(98-09): reports pages — country dropdown + formatPrice + export country plumbing

## Self-Check: PASSED

Files modified (verified via `git log fc121797 --stat`):

- `el-templo-admin/src/pages/CajaPage.vue` — FOUND
- `el-templo-admin/src/pages/ReportesPage.vue` — FOUND
- `el-templo-admin/src/pages/AnaliticasPage.vue` — FOUND
- `el-templo-admin/src/components/analytics/FinanzasTab.vue` — FOUND
- `el-templo-admin/src/composables/usePaymentsApi.ts` — FOUND
- `el-templo-admin/src/composables/useAnalyticsApi.ts` — FOUND
- `el-templo-admin/src/types/payment.ts` — FOUND
- `el-templo-admin/src/types/report.ts` — FOUND
- `el-templo-admin/src/types/analytics.ts` — FOUND

Commit (verified via `git log --oneline | grep fc121797`):

- `fc121797` feat(98-09): reports pages — country dropdown + formatPrice + export country plumbing — FOUND

TypeScript: `cd el-templo-admin && pnpm tsc --noEmit` returns only the
pre-existing pdfmake errors documented in deferred-items.md. Filtered
to the 9 files I modified: zero new errors.

Grep acceptance criteria: ALL PASS (see table above).
