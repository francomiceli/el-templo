---
phase: 120-fundaci-n-transversal-ticket-promedio
plan: 03
subsystem: analytics
tags:
  [
    breakdowns,
    cohorts,
    currency-isolation,
    scope-composition,
    fund-03,
    fund-04,
    fund-05,
  ]
requires:
  - "120-01: duration-tier.ts deriveDurationTier (duration axis bucketing)"
  - "analytics/scope.ts applyScope (security scope, composed not duplicated)"
  - "analytics/advanced-finance-service.ts (CurrencyMap + month helpers analog)"
provides:
  - "breakdowns.ts: BreakdownAxis, breakdownKeyExpr, breakdownSegmentKey, CurrencyMap, emptyCurrencyEntry, durationTierFromDays"
  - "cohorts.ts: CohortBucket, rangeConditions (half-open), bucketExpr (weekly/monthly), dayDiff, monthStart, monthEnd, nextMonth"
affects:
  - "Plan 04 ticket-service (first consumer of breakdowns + cohorts)"
  - "Phases 121-123 strategic metric blocks (shared axis/cohort/currency primitives)"
tech-stack:
  added: []
  patterns:
    - "Composition over duplication: breakdowns ADD groupBy keys, never relax applyScope conditions"
    - "Per-currency accumulator (ARS/EUR never summed) via CurrencyMap"
    - "Half-open [from, to) cohort windows (exclusive upper bound)"
key-files:
  created:
    - el-templo-api/src/modules/analytics/breakdowns.ts
    - el-templo-api/src/modules/analytics/cohorts.ts
    - el-templo-api/test/analytics/breakdowns-cohorts.test.ts
  modified: []
decisions:
  - "breakdowns.ts is a NEW module that COMPOSES applyScope (not an extension of scope.ts) — security scope stays append-only and owned by scope.ts; breakdowns contribute only groupBy keys + JS duration mapping"
  - "plan axis groups by composite (name, country) returning two SQL keys, and segment key uses a U+2016 separator so Flex AR != Flex ES"
  - "duration axis SELECTs raw durationDays and buckets in JS via durationTierFromDays -> deriveDurationTier; no 1/31 threshold literal appears in any SQL template or numeric comparison here"
  - "rangeConditions uses strict < for the upper bound (half-open), departing from the legacy inclusive <= dateTo finance filter"
  - "bucketExpr weekly key is ISO year-week DATE_FORMAT(col,'%x-W%v') (Monday-start), monthly is '%Y-%m'"
metrics:
  duration: ~3min
  completed: 2026-06-04
---

# Phase 120 Plan 03: Comparable Breakdowns + Cohort Range/Bucket Helpers Summary

Reusable analytics primitives — orthogonal breakdown axes (branch/country/duration/plan) that compose `applyScope`, the per-currency `{ ARS, EUR }` accumulator that never sums currencies, and half-open `[from, to)` cohort range/bucket SQL — consumed by the ticket block (Plan 04) and phases 121-123.

## What Was Built

**Task 1 — `breakdowns.ts` (FUND-03 / FUND-04):** `BreakdownAxis` union + `breakdownKeyExpr(axis, cols)` producing Drizzle `sql` groupBy keys (plan axis returns the composite `(name, country)` pair), `breakdownSegmentKey` for JS-side `CurrencyMap` keying, `durationTierFromDays` delegating to Plan 01's `deriveDurationTier`, and the `CurrencyMap` / `emptyCurrencyEntry` per-currency contract. File header documents the T-120-06 security invariant: the module never emits or relaxes scope conditions — callers still spread `applyScope(...).conditions`.

**Task 2 — `cohorts.ts` (FUND-05):** `rangeConditions(dateColumn, from, to)` with inclusive `>= from` and EXCLUSIVE `< to` (half-open), `bucketExpr(dateColumn, bucket)` returning `%Y-%m` (monthly) or ISO year-week `%x-W%v` (weekly), and the re-exported UTC-anchored `dayDiff` + `monthStart`/`monthEnd`/`nextMonth` so cohort math has one source.

**Task 3 — `breakdowns-cohorts.test.ts`:** Real-MySQL integration (clones the advanced-finance harness, AR `TEST` + ES `TESTES` branches) covering duration bucketing (30 → monthly, 120 → long_term), the two-distinct-`(name, country)`-segments Flex AR/ES split, ARS/EUR currency isolation (independent totals, never summed), the half-open boundary (row on `from` INCLUDED, row on `to` EXCLUDED), and distinct weekly vs monthly bucket keys.

## Verification Results

- `pnpm exec tsc --noEmit` passes clean across the whole project (EXIT=0); no errors mentioning breakdowns / cohorts / the test.
- `grep -c "deriveDurationTier" breakdowns.ts` = 8; no `1`/`31` literal inside any SQL template or numeric comparison against `durationDays` (threshold lives only in Plan 01's helper).
- `cohorts.ts` upper bound is strict `<` in code (line 116); the only `<=` occurrences are docblock references to the legacy filter.
- Test suite NOT run locally per MEMORY (real MySQL — CI runs it on staging push).

## Deviations from Plan

None — plan executed exactly as written.

The plan's named exports were delivered as specified (`BreakdownAxis`, `breakdownKeyExpr`, `CurrencyMap`, `emptyCurrencyEntry` for breakdowns; `CohortBucket`, `rangeConditions`, `bucketExpr` for cohorts). Two additional helpers were exported for ergonomic consumption without relaxing any contract: `breakdownSegmentKey` (JS-side `CurrencyMap` keying with the `(name, country)` composite rule) and `durationTierFromDays` (the single delegation point to Plan 01's `deriveDurationTier`). These are additive conveniences, not contract changes.

## Authentication Gates

None.

## Known Stubs

None. Both modules are complete, pure utilities with no placeholder data or unwired paths.

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/breakdowns.ts
- FOUND: el-templo-api/src/modules/analytics/cohorts.ts
- FOUND: el-templo-api/test/analytics/breakdowns-cohorts.test.ts
- FOUND commit f0f61625 (breakdowns)
- FOUND commit 22ea4849 (cohorts)
- FOUND commit 0fe5e62a (test)
