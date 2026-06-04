---
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
plan: 03
subsystem: api
tags: [analytics, renovacion, churn, drizzle, mysql, fastify, typescript]

# Dependency graph
requires:
  - phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
    plan: 01
    provides: "expiry-cohort engine (expiryCohortConditions, lastExpiryPerPersonExpr, retainedExpr, maturedExpr, RENOVATION_WINDOW_DEFAULT_DAYS) + RenewalAnalytics wire types + AnalyticsFilters.window"
  - phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
    plan: 02
    provides: "ChurnService pattern + churnSchema + /churn route registration to mirror; D-09 deprecation precedent"
  - phase: 120-fundaci-n-transversal-ticket-promedio
    provides: "applyScope, metricShape, breakdownSegmentKey, deriveDurationTier"
provides:
  - "RenewalService.getRenewal(filters): person-based renovación (renovados ÷ vencidos) over the SAME matured expiry cohort as churn (shared denominator, RENOV-01)"
  - "GET /api/admin/analytics/renewal under requireAdminAnalytics + requireBranchAccess (gestion 403)"
  - "renewalSchema (window querystring bounded 1..365 + full RenewalAnalytics response declaration)"
  - "Deprecation annotation (D-09) on legacy getRenewalRate pointing to /renewal as canonical"
affects: [122-ltv, 123-frecuencia-funnel, admin-ui-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Renovación as the complement of churn over the IDENTICAL matured cohort: renewal uses retainedExpr where churn uses NOT retainedExpr, so the two reconcile BY CONSTRUCTION when enGracia is 0 (no forced sum to 100)"
    - "Mirrors ChurnService structure (DI ctor, per-person cohort rows folded in JS, 4-axis breakdowns) so renewal.n equals churn.window.churn.n for identical filters"
    - "Local renewalQuerystring window extension (1..365) without mutating the shared analyticsQuerystring const"

key-files:
  created:
    - el-templo-api/src/modules/analytics/renewal-service.ts
    - el-templo-api/test/analytics/renewal.test.ts
  modified:
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/service.ts

key-decisions:
  - "Renovación computes renovados = matured AND retained over the same per-person cohort rows churn classifies; the denominator is byte-identical to churn's, asserted in the test"
  - "enGracia exposed as the número vivo (RENOV-03 / D-07); renov%+churn% reconcile only over the matured cohort, the grace residual is surfaced not folded"
  - "Followed the Plan 02 D-09 precedent: getRenewalRate annotated deprecated (doc-comment + inline marker) pointing to /renewal; behavior + callers unchanged (admin dashboard still consumes it)"

patterns-established:
  - "Block 2 (renovación) consumes the EXACT same expiry-cohort predicates as Block 1 (churn) — the DRY shared-denominator win the contract-first Plan 01 enabled"

requirements-completed: [RENOV-01, RENOV-02, RENOV-03, RENOV-04]

# Metrics
duration: 4min
completed: 2026-06-04
---

# Phase 121 Plan 03: Person-based Renovación Service + GET /renewal Summary

**A new `RenewalService.getRenewal` that consumes the Plan 01 expiry-cohort engine to count DISTINCT matured persons whose last membership expiry in `[from, to)` renewed within the configured window (renovados ÷ vencidos), over the EXACT SAME matured cohort churn uses (RENOV-01) — exposed at `GET /api/admin/analytics/renewal` under the ADMIN guard with a validated `window` param (default 15, RENOV-02), the `enGracia` número vivo (RENOV-03), and 4-axis breakdowns (RENOV-04), while annotating the legacy 7/14/30 `getRenewalRate` metric deprecated (D-09).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-04T03:09:06Z
- **Completed:** 2026-06-04T03:13Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Built `renewal-service.ts` (RenewalService) mirroring `ChurnService`: DI ctor, `Promise.all` fan-out over the official renewal + grace count and the 4-axis breakdowns, each composing the Plan 01 predicates (`expiryCohortConditions`, `lastExpiryPerPersonExpr`, `retainedExpr`, `maturedExpr`).
- Person-based renovación (RENOV-01): one row per person via `lastExpiryPerPersonExpr` (D-04), classified matured/retained at the configured window; `renewal = metricShape(renovados, maturedDenominator)`. The denominator is the SAME matured cohort size churn uses — renewal is `retainedExpr` where churn is `NOT retainedExpr` over the identical rows, so the two reconcile BY CONSTRUCTION.
- Configurable cutoff defaulting to 15 (RENOV-02): effective window is `filters.window ?? RENOVATION_WINDOW_DEFAULT_DAYS`, echoed in `windowDays`.
- Número vivo (RENOV-03 / D-07): `enGracia` = cohort persons NOT matured at the window, surfaced so renov% + churn% only sum to 100 when `enGracia === 0` — the residual is exposed, never forced into the percentages.
- 4-axis breakdowns (RENOV-04): branch / country / duration / plan, joined to `branches` + `subscriptionPlans`, accumulated per `breakdownSegmentKey`, duration tier derived in JS via `deriveDurationTier` (one-off plans dropped). Every query routes through `applyScope` on `subscriptions.branchId`; axes are additive groupBy keys only.
- Registered `GET /renewal` under `requireAdminAnalytics` + `requireBranchAccess` with `renewalSchema` (window bounded 1..365, full `RenewalAnalytics` response declared so fast-json-stringify keeps every field).
- Annotated `getRenewalRate` `@deprecated Phase 121 D-09` (doc-comment + inline marker) pointing to `/renewal`, leaving behavior and callers untouched (admin dashboard still consumes it).
- Wrote `renewal.test.ts` covering RENOV-01..04 + the ADMIN 403 / admin 200 wire shape, instantiating BOTH `RenewalService` and `ChurnService` to assert `renewal.renewal.n === churn.window.churn.n` (shared denominator). Maturity anchored to CURDATE-derived offsets (TZ-flake safe), `passwordHash` member inserts, `priceTypeApplied: "regular"` subs.

## Task Commits

Each task committed atomically:

1. **Task 1: RenewalService** — `ba3422bf` (feat)
2. **Task 2: GET /renewal route + renewalSchema + D-09 deprecation** — `198da698` (feat)
3. **Task 3: Integration test** — `28efbc9c` (test)

_Note: Task 1 was tagged `tdd="true"`, but its verify gate is type-check only; per the Plan 01/02 precedent the executable coverage is the Task 3 integration test (CI-only, real MySQL). The service was built then covered by the Task 3 test — no separate RED/GREEN unit cycle for the SQL-composing service._

## Files Created/Modified

- `el-templo-api/src/modules/analytics/renewal-service.ts` (created) — `RenewalService.getRenewal`: person-based renovación composing the expiry-cohort predicates, official renewal + enGracia + 4-axis breakdowns; all scope-guarded and div-by-zero safe.
- `el-templo-api/src/modules/analytics/schemas.ts` (modified) — added `renewalQuerystring` (local window extension), `renewalMetricShapeSchema`, and `renewalSchema`.
- `el-templo-api/src/modules/analytics/routes.ts` (modified) — import + instantiate `RenewalService`, register `GET /renewal` mirroring the `/churn` block.
- `el-templo-api/src/modules/analytics/service.ts` (modified) — D-09 deprecation annotation on `getRenewalRate` (no behavior change).
- `el-templo-api/test/analytics/renewal.test.ts` (created) — real-MySQL integration coverage (CI only).

## Decisions Made

- **Renewal as the complement of churn over the identical cohort:** `renovados = matured AND retained`; the denominator is the same matured cohort churn counts, asserted equal in the test. No second window-aware aggregate — the same per-person rows are folded both ways.
- **enGracia exposed, never folded:** the grace residual stays a live número outside both percentages (RENOV-03 / D-07); the two only reconcile to 100 when `enGracia === 0`.
- **D-09 deprecation, not deletion:** `getRenewalRate` annotated deprecated (now 3 markers across the file's deprecated metrics) pointing to `/renewal`; physical removal deferred to the admin-UI phase so the current dashboard does not break.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The `private log` field is stored in the DI ctor for parity with `ChurnService` / `TicketService` but is not yet used (no logging path in a pure read aggregation); this matches the sibling services and does not trip tsc.

## Threat Surface Scan

No new trust boundary beyond the planned `GET /renewal`. T-121-07 (authz): `requireAdminAnalytics` (ADMIN_ROLES) + the plugin operational-role gate + `requireBranchAccess` — gestion gets 403 (test-covered). T-121-08 (input validation): `window` integer-bounded 1..365 at `renewalSchema`; the 200 response declares only intended fields. T-121-09 (scope leakage): every RenewalService query spreads `applyScope(...).conditions` on `subscriptions.branchId`; breakdown axes are additive groupBy keys, never access filters; `request.scope.country` drives the country filter, not client input. T-121-10 (SQLi): the window reaches the predicates as a typed SERVICE-controlled integer (`sql.raw(String(n))` inside `expiry-cohort.ts`); date bounds are bound parameters. T-121-SC: no new packages, no install task.

## Known Stubs

None — `getRenewal` is fully implemented end-to-end; no placeholder values or unwired data paths.

## User Setup Required

None — no external service configuration. No migration (the cohort is computed live from `subscriptions`).

## Next Phase Readiness

- Block 1 (churn) and Block 2 (renovación) now both ship against the shared expiry cohort; the admin-UI phase will reconnect dashboard cards to `/churn` + `/renewal` and then physically remove the D-09-deprecated `countChurnedMembers` / `computeRetentionRate` / `getRenewalRate`.
- Tests run in CI on the staging push (not locally per project policy); a green CI run validates RENOV-01..04 + the shared-denominator reconciliation against real MySQL.
- Phase 121 is execution-complete (Plans 01/02/03); next is `/gsd-plan-phase 122` (LTV).

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/renewal-service.ts
- FOUND: el-templo-api/test/analytics/renewal.test.ts
- FOUND: el-templo-api/src/modules/analytics/schemas.ts (renewalSchema)
- FOUND: el-templo-api/src/modules/analytics/routes.ts (/renewal)
- FOUND: el-templo-api/src/modules/analytics/service.ts (D-09 getRenewalRate marker)
- FOUND commit: ba3422bf (Task 1)
- FOUND commit: 198da698 (Task 2)
- FOUND commit: 28efbc9c (Task 3)

---

_Phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n_
_Completed: 2026-06-04_
