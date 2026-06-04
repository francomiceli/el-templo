---
phase: 122-ltv-vida-del-cliente
plan: 01
subsystem: analytics
tags: [ltv, kaplan-meier, survival-analysis, wire-types, foundation]
requires:
  - "Phase 121 expiry-cohort engine + ChurnService (end-of-life definition, D-122-02)"
  - "Phase 120 metric-shape.ts (median null-guard purity precedent)"
provides:
  - "kaplanMeierMedian (pure survival-median helper, D-122-05/06)"
  - "LtvAnalytics + LtvSegmentRow + LtvMonetary wire contract for Plan 02"
affects:
  - "el-templo-api/src/modules/analytics"
tech-stack:
  added: []
  patterns:
    - "Pure foundation module (no DB / no logging / no any, named exported constants)"
    - "Contract-first wire types shipped before the consuming service (Phase 121 Plan 01 precedent)"
    - "Kaplan-Meier product-limit estimator treating active customers as censored data"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/kaplan-meier.ts"
    - "el-templo-api/test/analytics/kaplan-meier.test.ts"
  modified:
    - "el-templo-api/src/modules/analytics/types.ts"
decisions:
  - "KM median = first event time where S(t) <= 0.5; ties collapse into one step"
  - "Single-observation cohorts return null (MIN_COHORT_SIZE_FOR_MEDIAN=2), not a degenerate median"
  - "LtvMonetary keeps ARS/EUR as structurally separate LtvCurrencyBlock (never summed, D-122-09)"
metrics:
  duration: ~7min
  completed: 2026-06-04
---

# Phase 122 Plan 01: LTV Foundation (Kaplan-Meier + wire types) Summary

Pure Kaplan-Meier survival-median helper (the only new algorithm in the LTV phase, treating active customers as censored data) plus the `LtvAnalytics` wire contract that Plan 02's `LtvService` + `GET /ltv` build against — contract-first, zero codebase scavenging.

## What Was Built

### Task 1 — `kaplan-meier.ts` (pure helper, TDD RED→GREEN)

`kaplanMeierMedian(observations: KaplanMeierObservation[]): number | null` implements the product-limit estimator `S(t) = Π (1 − d_i / n_i)` over distinct ascending event times and returns the first event time where `S(t) <= SURVIVAL_MEDIAN_THRESHOLD` (0.5).

- Input: one observation per customer `{ durationMonths: number; event: boolean }` — `event=true` = churned (survival event), `event=false` = censored (still active / in-grace).
- Censored observations stay in the at-risk denominator until their own duration elapses, then leave the risk set WITHOUT producing a drop — never discarded (D-122-05).
- Ties (multiple churns in the same month) collapse into ONE survival step (`d_i > 1`), not a sequence of single drops.
- Numeric safety (T-122-01): empty / single-observation / never-crosses-0.5 / all-censored cohorts return `null`, never NaN. Named constants `SURVIVAL_MEDIAN_THRESHOLD` and `MIN_COHORT_SIZE_FOR_MEDIAN`. No DB, no logging, no `any`; closes with the "No DB access, no logging, no any." footer.
- The full month-by-month survival curve is deliberately NOT returned (deferred, D-122-05).

Test coverage (`kaplan-meier.test.ts`, 9 `it` cases mapping to the six required D-122-06 behaviors):

1. Events, no censoring — durations [1,2,3,4] → median 2 (first month S(t)<=0.5).
2. Censoring matters — KM median (5) differs from naive median-of-closed (3), proving censored persons stay in the denominator.
   3 + 3b. Ties — single-step `d_i/n_i` collapse (asserted both with a 0.5-landing tie and a denominator-sensitive triple tie that single-drops would miss).
3. Empty cohort → null.
4. Single customer (both event and censored) → null.
   6 + 6b. Never crosses 0.5 (heavily censored) and all-censored → null.

### Task 2 — `LtvAnalytics` wire types

Added to `types.ts`, modelled on the `ChurnAnalytics` family + `AdvancedFinanceAnalytics`:

- `LtvCurrencyBlock` — per-currency `projected` / `observed` / `monthlyRealRevenue` (all `number | null`) + `n`, all real-payment based (D-122-07).
- `LtvMonetary` — `{ ARS, EUR }` of `LtvCurrencyBlock`, never summed (D-122-09).
- `LtvSegmentRow` — reuses the existing `ChurnRenewalAxis` for branch/country/plan breakdowns, each row carrying its own headline / survival median / monetary block.
- `LtvAnalytics` — `lifetimeHeadlineMonths` (`1÷churn`, null when churn 0, D-122-03), `survivalMedianMonths` (KM median, null per D-122-05), `monetary`, `breakdowns`, `n`.
- `AnalyticsFilters.window?` was NOT re-added (already present at :700 from Phase 121).

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` passes (whole api package).
- `kaplan-meier.ts`: `kaplanMeierMedian` present, 0 `: any`, no `drizzle`/`fastify`/`db/schema` import (pure module).
- `kaplan-meier.test.ts`: 9 `it(` cases (≥6 required).
- `types.ts`: `interface LtvAnalytics` + `LtvSegmentRow` declared; `projected`/`observed` present; `window?` count unchanged (1 — no duplicate).
- Tests run in CI on the staging push (project policy — not run locally).

## TDD Gate Compliance

- RED: `test(122-01): ...` commit `ff13a08d` added the failing tests before the helper existed (import resolution fails — RED confirmed by absent file).
- GREEN: `feat(122-01): ...` commit `61c32073` implemented the helper; tsc + acceptance greps pass.
- REFACTOR: none needed.

## Deviations from Plan

None - plan executed exactly as written.

(Note: the plan's Test 1 example text loosely said "e.g. 3"; the mathematically correct KM median for durations [1,2,3,4] all-events is 2 — S(t=2)=0.5. Asserted the correct value 2, consistent with the algorithm the plan's `<behavior>` defines. Not a deviation, a clarification of an illustrative example.)

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/kaplan-meier.ts
- FOUND: el-templo-api/test/analytics/kaplan-meier.test.ts
- FOUND: el-templo-api/src/modules/analytics/types.ts (LtvAnalytics added)
- FOUND commit ff13a08d (test RED)
- FOUND commit 61c32073 (feat GREEN — helper)
- FOUND commit 8c98fdb2 (feat — wire types)
