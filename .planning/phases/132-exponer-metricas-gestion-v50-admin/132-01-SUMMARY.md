---
phase: 132-exponer-metricas-gestion-v50-admin
plan: 01
subsystem: analytics-backend
tags: [analytics, filters, planId, turno, scope, drizzle]
requires:
  - applyScope append-only invariant (T-117-01)
  - expiry-cohort engine (Phase 121)
  - trial-funnel cohort (Phase 123)
provides:
  - planId input filter on /admin/analytics/{ticket,churn,renewal,ltv,trial-funnel}
  - turno input filter on /admin/analytics/trial-funnel
affects:
  - el-templo-admin frontend (132-03+ will pass planId/turno as global panel filters)
tech-stack:
  added: []
  patterns:
    - subscriptionPlanFilter() shared helper in expiry-cohort.ts (append-only SQL[] fragment)
    - boughtPlanPredicate variant in trial-funnel (plan-restricted compró, unrestricted new-lead)
    - in-memory turno filter on the already-scoped cohort rows
key-files:
  created: []
  modified:
    - el-templo-api/src/modules/analytics/expiry-cohort.ts
    - el-templo-api/src/modules/analytics/ticket-service.ts
    - el-templo-api/src/modules/analytics/churn-service.ts
    - el-templo-api/src/modules/analytics/renewal-service.ts
    - el-templo-api/src/modules/analytics/ltv-service.ts
    - el-templo-api/src/modules/analytics/trial-funnel-service.ts
    - el-templo-api/src/modules/analytics/routes.ts
    - el-templo-api/src/modules/analytics/schemas.ts
    - el-templo-api/src/modules/analytics/types.ts
    - el-templo-api/test/analytics/ticket.test.ts
    - el-templo-api/test/analytics/trial-funnel.test.ts
decisions:
  - "planId threaded via a shared subscriptionPlanFilter() helper (DRY across churn/renewal/ltv), inline append on ticket/trial-funnel"
  - "TrialTurno literal moved to types.ts so AnalyticsFilters references it without a circular service import; service re-exports for back-compat"
  - "ticket excludedNoLink suppressed (reported 0) under a planId filter — the universe count has no subscription join and would over-report"
  - "trial-funnel new-lead exclusion stays UNRESTRICTED by planId (any prior paid sub = returner); only compró/bought-plan is plan-restricted"
  - "turno filter applied in-memory AFTER the scoped DB fetch, never relaxing scope"
metrics:
  duration: ~25min
  completed: 2026-06-05
---

# Phase 132 Plan 01: planId + turno Input Filters on Analytics Endpoints Summary

Threaded `planId` (all 5 subscription/funnel metrics) and `turno` (trial-funnel only) as real INPUT query params end-to-end — service WHERE clause, route Querystring, JSON schema — AND-ed after `applyScope` so they restrict rather than bypass country/branch scope.

## What Was Built

### Task 1 — planId on ticket / churn / renewal / ltv (`fe7e5765`)

- New shared `subscriptionPlanFilter(planId): SQL[]` in `expiry-cohort.ts` — an append-only fragment (empty array when absent) spread AFTER `...scopeConditions` in every cohort query of churn (4 queries), renewal (2 queries), and ltv `cohortLives` (1 query, which feeds both the headline cohort and all breakdowns).
- Ticket: appended `eq(subscriptions.planId, filters.planId)` to the `linkedCharges` conditions (the subscriptions join already existed). `excludedNoLink` is suppressed to `0` under an active planId filter because the universe-count query has no subscription join and would otherwise over-report.
- LTV headline (`1 ÷ churn`) automatically inherits the filter because it reuses `ChurnService.getChurn(filters)`; the monetary side intersects the now-plan-filtered `cohortLives`.
- Routes widened (`planId?: number`) + filters object; schemas: new local `ticketQuerystring` (clone, not mutating shared const) + `planId` added to churn/renewal/ltv querystrings.
- 3 new ticket.test.ts tests: plan restriction, planId×cross-branch scope isolation, non-integer → 400.

### Task 2 — planId + turno on trial-funnel (`2222538b`)

- `TrialTurno` literal moved into `types.ts`; `trial-funnel-service.ts` imports + re-exports it so `AnalyticsFilters.turno?: TrialTurno` has no circular import.
- `boughtPlanPredicate` variant: when planId is set, the compró EXISTS + bought-plan scalar subqueries add `s.plan_id = ?` (plan BOUGHT axis, D-123-09). The new-lead exclusion deliberately keeps the UNRESTRICTED paid-sub predicate.
- `turno` filter: `getTrialFunnel` filters the already-scoped cohort rows in-memory via `classifyTurno(r.startTime) === filters.turno` (skipped for undefined / "otro").
- Route widened (`planId`, `turno`) + schema `turno` enum `["manana","tarde"]` (excludes "otro", T-132-03).
- 5 new trial-funnel.test.ts tests: turno restriction + breakdown, planId bought-plan, turno×country scope isolation, invalid turno → 400, turno=otro → 400.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ticket `excludedNoLink` over-reports under a planId filter**

- **Found during:** Task 1 (ticket-service).
- **Issue:** `excludedNoLink = universe − matched`. The universe-count query has no subscription join, so a planId filter shrinks `matched` (to plan-A) while `universe` stays full — inflating the no-link diagnostic into a meaningless large number.
- **Fix:** Guarded the computation with `if (filters.planId === undefined)`; reports `0` for a single-plan view (the no-link diagnostic is inherently a whole-universe metric).
- **Files modified:** `ticket-service.ts`
- **Commit:** `fe7e5765`

**2. [Rule 3 - Blocking] `TrialTurno` circular import**

- **Found during:** Task 2.
- **Issue:** `AnalyticsFilters` (in types.ts) needed `TrialTurno`, but the literal lived in `trial-funnel-service.ts` which already imports from types.ts — a circular reference.
- **Fix:** Moved the canonical literal to `types.ts`; service imports + re-exports it (`export type { TrialTurno } from "./types"`) preserving the existing public export path.
- **Files modified:** `types.ts`, `trial-funnel-service.ts`
- **Commit:** `2222538b`

The planner-suggested per-service `planFilterConditions` helper was consolidated into ONE shared `subscriptionPlanFilter` in `expiry-cohort.ts` (DRY — churn/renewal/ltv already share that module). Not a behavioral deviation.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` clean across the analytics module (both tasks + post-prettier).
- Integration tests authored (8 new) but NOT run locally per project policy — they run in CI on the staging push (`feedback_tests_run_in_ci_not_local`). New tests assert filtering correctness AND scope-isolation (no cross-branch/country leak).
- Manual grep confirmed: every planId/turno fragment is appended AFTER `...scopeConditions`, never before.

## Known Stubs

None.

## Threat Flags

None — no new endpoints, auth paths, or schema/DB changes (query-param + WHERE additions only). All three threat-register mitigations (T-132-01 append-only, T-132-02 type validation, T-132-03 "otro" exclusion) are implemented and test-covered.

## Notes for Next Plan

- 132-02 handles `frequency-service` (BOTH turno input AND the D-12 name/phone enrichment) — intentionally NOT touched here.
- Frontend plans (132-03+) can now pass `planId` (all 6 metrics) and `turno` (funnel + frequency) as real global panel filters; the turno×sucursal funnel cross (D-11) works via `turno` filter + existing branch breakdown, zero 2D-aggregation code.

## Self-Check: PASSED
