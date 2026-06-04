---
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
plan: 02
subsystem: api
tags: [analytics, churn, renovacion, drizzle, mysql, fastify, typescript]

# Dependency graph
requires:
  - phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
    plan: 01
    provides: "expiry-cohort engine (expiryCohortConditions, lastExpiryPerPersonExpr, retainedExpr, maturedExpr, window constants) + ChurnAnalytics wire types + AnalyticsFilters.window"
  - phase: 120-fundaci-n-transversal-ticket-promedio
    provides: "applyScope, metricShape, bucketExpr, breakdownSegmentKey, deriveDurationTier"
provides:
  - "ChurnService.getChurn(filters): person-based churn with multi-N comparison, maturity gate, monthly provisional series, 4-axis breakdowns"
  - "GET /api/admin/analytics/churn endpoint under requireAdminAnalytics + requireBranchAccess"
  - "churnSchema (window querystring bounded 1..365 + full ChurnAnalytics response declaration)"
  - "Deprecation annotations (D-09) on legacy countChurnedMembers + computeRetentionRate pointing to /churn"
affects:
  [121-03-renewal-service, 122-ltv, 123-frecuencia-funnel, admin-ui-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Analytics metric service mirroring ticket-service.ts: DI ctor, Promise.all fan-out, per-segment Map accumulators, finalize-style decomposition, metricShape div-by-zero guard"
    - "Cohort collapsed to one-row-per-person in SQL (lastExpiryPerPersonExpr), then matured/retained gating folded in JS so the official, multi-N, series and breakdown paths share identical classification logic"
    - "Local querystring extension (churnQuerystring) adds the validated window param WITHOUT mutating the shared analyticsQuerystring const"

key-files:
  created:
    - el-templo-api/src/modules/analytics/churn-service.ts
    - el-templo-api/test/analytics/churn.test.ts
  modified:
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/service.ts

key-decisions:
  - "JS folding over per-person cohort rows (not a SQL COUNT(DISTINCT) grouped per segment) so maturity+retention gating is identical across the official window, multi-N comparison, series, and breakdown paths"
  - "Series provisional flag is row-derived: a bucket is provisional when ANY of its persons has not yet matured at the window (cohort still settling)"
  - "Duration-axis one-off plans (tier null) are dropped from the duration breakdown rather than surfaced under an 'excluded' key"

patterns-established:
  - "Window param validated + bounded (1..365) at the schema (T-121-04) before reaching the SERVICE-controlled integer in expiry-cohort predicates"

requirements-completed:
  [CHURN-01, CHURN-02, CHURN-03, CHURN-04, CHURN-05, CHURN-06]

# Metrics
duration: 6min
completed: 2026-06-04
---

# Phase 121 Plan 02: Person-based Churn Service + GET /churn Summary

**A new `ChurnService.getChurn` that consumes the Plan 01 expiry-cohort engine to count DISTINCT persons whose last membership expiry in `[from, to)` did not renew within the configured window (churn maduro, D-08), exposed at `GET /api/admin/analytics/churn` under the ADMIN guard with a validated `window` param, a multi-N comparison (5/10/15), a monthly provisional series, and 4-axis breakdowns — while annotating the legacy `updatedAt`-based churn/retention metrics as deprecated (D-09).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-04T03:00:04Z
- **Completed:** 2026-06-04T03:06:09Z
- **Tasks:** 3
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Built `churn-service.ts` (ChurnService) mirroring `ticket-service.ts`: DI ctor, `Promise.all` fan-out over the official window, the multi-N comparison, the monthly series, and the 4-axis breakdowns — each composing the Plan 01 predicates (`expiryCohortConditions`, `lastExpiryPerPersonExpr`, `retainedExpr`, `maturedExpr`).
- Person-based churn (CHURN-01): one row per person via `lastExpiryPerPersonExpr` (D-04), classified matured/retained at the official window; `window.churn = metricShape(churned, maturedDenominator)`. In-grace persons are excluded from numerator AND denominator and surfaced as `enGracia` (CHURN-03 / D-08) so churn% + renov% only reconcile when `enGracia === 0`.
- Multi-N comparison over `CHURN_COMPARISON_WINDOWS` (5/10/15) each at its own maturity+retention window (CHURN-02); the official window defaults to `RENOVATION_WINDOW_DEFAULT_DAYS` (15) and is overridable via the querystring.
- Monthly provisional series (CHURN-05): cohort bucketed by `bucketExpr(endDate, "monthly")`; a bucket is `provisional` when any of its persons has not yet matured.
- 4-axis breakdowns (CHURN-06): branch / country / duration / plan, joined to `branches` + `subscriptionPlans`, accumulated per `breakdownSegmentKey`, with the duration tier derived in JS via `deriveDurationTier` (one-off plans dropped). Every query routes through `applyScope` on `subscriptions.branchId`; axes are additive groupBy keys only.
- Registered `GET /churn` under `requireAdminAnalytics` + `requireBranchAccess` with `churnSchema` (window bounded 1..365, full `ChurnAnalytics` response declared so fast-json-stringify keeps every field).
- Annotated `countChurnedMembers` and `computeRetentionRate` `@deprecated Phase 121 D-09` (doc-comment + inline marker) pointing to `/churn`, leaving behavior and callers untouched (admin dashboard still consumes them).
- Wrote `churn.test.ts` covering CHURN-01..06 + the ADMIN 403 / admin 200 wire shape, with maturity anchored to CURDATE-derived offsets (TZ-flake safe), `passwordHash` member inserts and `priceTypeApplied: "regular"` subs.

## Task Commits

Each task committed atomically:

1. **Task 1: ChurnService** — `cd15d770` (feat)
2. **Task 2: GET /churn route + churnSchema + D-09 deprecation** — `27ce7d8d` (feat)
3. **Task 3: Integration test** — `b866e5f3` (test)

_Note: Task 1 was tagged `tdd="true"`, but its verify gate is type-check only; per the Plan 01 precedent the executable coverage is the Task 3 integration test (CI-only, real MySQL). The service was built then covered by the Task 3 test — no separate RED/GREEN unit cycle for the SQL-composing service._

## Files Created/Modified

- `el-templo-api/src/modules/analytics/churn-service.ts` (created) — `ChurnService.getChurn`: person-based churn composing the expiry-cohort predicates, multi-N, series, breakdowns; all scope-guarded and div-by-zero safe.
- `el-templo-api/src/modules/analytics/schemas.ts` (modified) — added `churnQuerystring` (local window extension), reusable `churnMetricShapeSchema` / `churnWindowResultSchema`, and `churnSchema`.
- `el-templo-api/src/modules/analytics/routes.ts` (modified) — import + instantiate `ChurnService`, register `GET /churn` mirroring the `/ticket` block.
- `el-templo-api/src/modules/analytics/service.ts` (modified) — D-09 deprecation annotations on the two legacy metrics (no behavior change).
- `el-templo-api/test/analytics/churn.test.ts` (created) — real-MySQL integration coverage (CI only).

## Decisions Made

- **JS folding over per-person cohort rows** instead of a per-segment SQL `COUNT(DISTINCT)`: keeps the matured/retained classification byte-identical across the official, multi-N, series, and breakdown code paths and avoids a second window-aware aggregate.
- **Series provisional flag is row-derived** from the persisted `matured` flag — a bucket is provisional if any person in it is still in grace.
- **One-off duration plans (tier `null`) dropped** from the duration breakdown rather than emitted under an `"excluded"` segment.

## Deviations from Plan

None — plan executed exactly as written. (Task 1's `read_first` referenced a `getRenewalRate` at `service.ts:676-721` as the multi-N analog; the implemented multi-N mirrors that Promise.all-of-windows shape over the shared cohort.)

## Issues Encountered

- **Early-renewal test seed correctness:** the first draft of the D-06 early-renewal case let the continuation sub's `endDate` fall inside `[from, to)`, which would have made IT the person's last in-range expiry and inverted the assertion. Fixed before commit by giving the continuation `status='active'` with a FUTURE `endDate` (beyond the range upper bound) so only the original expiry is the cohort row and `retainedExpr` cleanly matches the early start. Resolved within Task 3.

## Threat Surface Scan

No new trust boundary beyond the planned `GET /churn`. T-121-03 (authz): `requireAdminAnalytics` (ADMIN_ROLES) + the plugin operational-role gate + `requireBranchAccess` — gestion gets 403 (test-covered). T-121-04 (input validation): `window` integer-bounded 1..365 at `churnSchema`; the 200 response declares only intended fields. T-121-05 (scope leakage): every ChurnService query spreads `applyScope(...).conditions` on `subscriptions.branchId`; breakdown axes are additive groupBy keys, never access filters; `request.scope.country` drives the country filter, not client input. T-121-06 (SQLi): window reaches the predicates as a typed SERVICE-controlled integer (`sql.raw(String(n))` inside expiry-cohort.ts); dates are bound parameters.

## Known Stubs

None — `getChurn` is fully implemented end-to-end; no placeholder values or unwired data paths.

## User Setup Required

None — no external service configuration. No migration (the cohort is computed live from `subscriptions`).

## Next Phase Readiness

- Plan 03 (renewal-service) consumes the SAME expiry cohort: `renovados ÷ vencidos` over the matured cohort using `retainedExpr` at the configured window, mirroring this service's structure and reusing `enGracia` (RENOV-01/03).
- The admin-UI phase will reconnect the dashboard cards to `/churn` and then physically remove the D-09-deprecated `countChurnedMembers` / `computeRetentionRate` (the literal ROADMAP success-criterion #1 deletion deferred per D-09).
- Tests run in CI on the staging push (not locally per project policy); a green CI run validates CHURN-01..06 against real MySQL.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/churn-service.ts
- FOUND: el-templo-api/test/analytics/churn.test.ts
- FOUND: el-templo-api/src/modules/analytics/schemas.ts (churnSchema)
- FOUND: el-templo-api/src/modules/analytics/routes.ts (/churn)
- FOUND: el-templo-api/src/modules/analytics/service.ts (D-09 markers)
- FOUND commit: cd15d770 (Task 1)
- FOUND commit: 27ce7d8d (Task 2)
- FOUND commit: b866e5f3 (Task 3)

---

_Phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n_
_Completed: 2026-06-04_
