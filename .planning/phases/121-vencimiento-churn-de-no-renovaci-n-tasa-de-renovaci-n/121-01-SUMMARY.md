---
phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n
plan: 01
subsystem: api
tags: [analytics, churn, renovacion, drizzle, mysql, sql-fragments, typescript]

# Dependency graph
requires:
  - phase: 120-fundaci-n-transversal-ticket-promedio
    provides: "rangeConditions half-open [from,to) cohort engine, MetricShape envelope, deriveDurationTier, applyScope"
provides:
  - "Shared expiry-cohort engine (expiry-cohort.ts) with injection-safe predicate/fragment builders"
  - "expiryCohortConditions (D-01/D-03), lastExpiryPerPersonExpr (D-04), retainedExpr (D-05/D-06), maturedExpr (D-08)"
  - "RENOVATION_WINDOW_DEFAULT_DAYS=15 and CHURN_COMPARISON_WINDOWS=[5,10,15] constants (D-07)"
  - "ChurnAnalytics + RenewalAnalytics wire interfaces and supporting rows"
  - "AnalyticsFilters.window optional field (configurable ventana de renovación)"
  - "Primitive CI integration test proving each predicate"
affects:
  [121-02 churn-service, 121-03 renewal-service, 122-ltv, 123-frecuencia-funnel]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure foundation-style SQL-fragment module (style of cohorts.ts/duration-tier.ts): no DB, no logging, no any, named exported thresholds, decision-ID doc headers"
    - "Single shared cohort definition consumed by two services so churn% and renov% share one denominator (RENOV-01 DRY win)"
    - "Injection-safe predicate builders: from/to bound via Drizzle sql params; only sql.raw(String(windowDays)) for a SERVICE-controlled integer"

key-files:
  created:
    - el-templo-api/src/modules/analytics/expiry-cohort.ts
    - el-templo-api/test/analytics/expiry-cohort.test.ts
  modified:
    - el-templo-api/src/modules/analytics/types.ts

key-decisions:
  - "Extracted the expiry-cohort as a shared helper (planner discretion confirmed) — both churn (Plan 02) and renovación (Plan 03) consume it"
  - "CHURN_COMPARISON_WINDOWS = [5,10,15] chosen as the comparative default set (planner discretion per D-07)"
  - "lastExpiryPerPersonExpr implemented as correlated NOT EXISTS (no later/larger-id non-paused in-range row) — keeps the person's MAX endDate, id tie-broken"

patterns-established:
  - "Contract-first plan: ships pure predicates + wire types so Plans 02/03 build against fixed interfaces with no scavenging"
  - "TZ-safe analytics test seeding: derive endDate/startDate from CURDATE() in SQL to avoid the evening UTC-vs-local skew flake"

requirements-completed: [CHURN-01, CHURN-04, RENOV-01]

# Metrics
duration: 5min
completed: 2026-06-04
---

# Phase 121 Plan 01: Expiry-Cohort Engine + Churn/Renovación Wire Contracts Summary

**Shared person-based expiry-cohort engine (distinct persons with `endDate ∈ [from,to)`, paused-excluded, last-expiry-per-person, retention + maturity predicates) plus the ChurnAnalytics/RenewalAnalytics wire types and a configurable window filter — the contract-first foundation both Plan 02 churn and Plan 03 renovación build against.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-04T02:51:21Z
- **Completed:** 2026-06-04T02:57Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `expiry-cohort.ts`, the single SQL-fragment/predicate source shared by churn and renovación so both sit on the SAME denominator (RENOV-01). Exports `expiryCohortConditions`, `lastExpiryPerPersonExpr`, `retainedExpr`, `maturedExpr`, `RENOVATION_WINDOW_DEFAULT_DAYS`, `CHURN_COMPARISON_WINDOWS`.
- Encoded decisions D-01 (cohort by `endDate`, never `updatedAt`/`cancelledAt`), D-03 (paused excluded), D-04 (last expiry per person), D-05/D-06 (retention incl. plan/duration change + early renewal, no floor), D-07 (single configurable window), D-08 (churn maturity gate).
- Added `ChurnAnalytics` / `RenewalAnalytics` wire interfaces (+ `ChurnSegmentRow`, `ChurnWindowResult`, `ChurnSeriesPoint`, `RenewalSegmentRow`, `ChurnRenewalAxis`), all reusing `MetricShape`, and extended `AnalyticsFilters` with optional `window?: number`.
- Wrote a primitive CI integration test exercising every predicate (half-open boundary, paused exclusion, last-expiry collapse, retention plan/duration change + early renewal + past-window, maturity vs grace), TZ-safe via CURDATE()-derived dates.

## Task Commits

Each task committed atomically:

1. **Task 1: Build the shared expiry-cohort engine** - `93a80291` (feat)
2. **Task 2: Add ChurnAnalytics + RenewalAnalytics wire types and window filter** - `7df38cb3` (feat)
3. **Task 3: Primitive integration test for the expiry-cohort engine** - `4f4ba888` (test)

_Note: Task 1 was tagged `tdd="true"`, but its own verify gate is type-check only (the executable primitive coverage is Task 3, the integration test); the module was built then covered by the Task 3 test — there was no separate RED/GREEN unit cycle for the pure fragment builders._

## Files Created/Modified

- `el-templo-api/src/modules/analytics/expiry-cohort.ts` (created) - Pure foundation module: cohort + retention + maturity SQL fragments and the window constants.
- `el-templo-api/src/modules/analytics/types.ts` (modified) - Added churn/renovación wire interfaces + `AnalyticsFilters.window`.
- `el-templo-api/test/analytics/expiry-cohort.test.ts` (created) - Real-MySQL primitive coverage (CI only).

## Decisions Made

- **Shared helper over inlining:** extracted the cohort engine into one module (planner discretion per CONTEXT/PATTERNS) — the DRY win that lets churn and renovación share one denominator.
- **`CHURN_COMPARISON_WINDOWS = [5,10,15]`:** chosen comparative default set (D-07 planner discretion).
- **`lastExpiryPerPersonExpr` as correlated NOT EXISTS** with strictly-later `endDate` OR equal-`endDate`-larger-`id` tie-break, mirroring the cohort window bounds on the `s2` alias.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **`dateOffset` helper SQL execution shape:** the initial `db.select(...).from(sql\`(SELECT 1) AS \_t\`)`derived-table form was fragile; switched to the established`db.execute(sql\`SELECT ...\`)`pattern (matching`helpers.ts:363`) and read row 0 from the mysql2 `[rows, fields]` tuple. Type-checks clean; resolved within Task 3 before commit.

## Threat Surface Scan

No new trust boundary introduced. This plan ships pure SQL-fragment builders + types + a test — no route, no request handling. SQL-injection (T-121-01) is mitigated: `from`/`to` are bound parameters; the only `sql.raw` is `String(windowDays)` for a SERVICE-controlled integer. Scope (branch/country) is intentionally NOT decided here — appended by the consuming services via `applyScope` in Plans 02/03.

## Known Stubs

None — all exports are fully implemented; no placeholder values or unwired data paths.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (churn-service) and Plan 03 (renewal-service) can now build against fixed interfaces: import the predicates from `expiry-cohort.ts` and return `ChurnAnalytics` / `RenewalAnalytics`.
- Tests run in CI on the staging push (not locally per project policy); a green CI run validates the predicates against real MySQL before Plans 02/03 consume them.
- Legacy metrics (`countChurnedMembers`, `computeRetentionRate`, `getRenewalRate`) remain live/deprecated per D-09 — physical removal is the admin-UI phase, not this one.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/expiry-cohort.ts
- FOUND: el-templo-api/src/modules/analytics/types.ts
- FOUND: el-templo-api/test/analytics/expiry-cohort.test.ts
- FOUND commit: 93a80291 (Task 1)
- FOUND commit: 7df38cb3 (Task 2)
- FOUND commit: 4f4ba888 (Task 3)

---

_Phase: 121-vencimiento-churn-de-no-renovaci-n-tasa-de-renovaci-n_
_Completed: 2026-06-04_
