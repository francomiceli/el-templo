---
phase: 122-ltv-vida-del-cliente
plan: 02
subsystem: analytics
tags: [ltv, kaplan-meier, churn-chaining, real-payments, deprecation, endpoint]
requires:
  - "Phase 122 Plan 01 (kaplanMeierMedian helper + LtvAnalytics wire types)"
  - "Phase 121 expiry-cohort engine + ChurnService (end-of-life event, D-122-02/03)"
  - "Phase 120 foundation (applyScope, breakdownSegmentKey, deriveDurationTier, cohorts.dayDiff)"
  - "Phase 105 financial_transactions canonical revenue filter"
provides:
  - "LtvService.getLtv: 1÷churn headline + KM survival median + monetary projected/observed, per-currency, branch/country/plan breakdowns"
  - "GET /api/admin/analytics/ltv (ADMIN_ROLES-only, window 1..365)"
  - "ltvSchema (fully-declared 200 + 400/401/403/500)"
  - "ARPU @deprecated D-122-01 marker (functioning, math/schema/type unchanged)"
affects:
  - "el-templo-api/src/modules/analytics"
tech-stack:
  added: []
  patterns:
    - "Metric service CHAINED onto the shared expiry cohort, reusing (not recomputing) ChurnService for the headline"
    - "Survival cohort fed to Kaplan-Meier: closed = matured && !retained (event), active/in-grace = censored (kept)"
    - "Per-customer real-payment LTV (financial_transactions, canonical filter) — projected + observed, never list price"
    - "Annotate-only deprecation precedent (Phase 121 D-09) for retiring a live metric without breaking consumers"
key-files:
  created:
    - "el-templo-api/src/modules/analytics/ltv-service.ts"
  modified:
    - "el-templo-api/src/modules/analytics/routes.ts"
    - "el-templo-api/src/modules/analytics/schemas.ts"
    - "el-templo-api/src/modules/analytics/advanced-finance-service.ts"
decisions:
  - "Headline reuses ChurnService.getChurn().window.churn.percentage; lifetime = 1 ÷ (pct/100), rounded to 1 decimal, churn 0 → null (never NaN/∞)"
  - "Life span: closed → first-start..last-expiry; censored → first-start..today; months = days ÷ 30 (DAYS_PER_MONTH); 0-month lives dropped from monthly-revenue math"
  - "first-start materialized as a correlated MIN(start_date) subquery scoped to same user + same branch + non-paused (consistent with the cohort engine's same-branch collapse)"
  - "Monetary: observed = mean(closed customers' exact real-payment totals); monthlyRealRevenue = mean(total ÷ durationMonths over lives with duration>0); projected = headline × monthlyRealRevenue"
  - "financial_transactions upper bound is EXCLUSIVE (< dateTo) to match the half-open cohort window"
  - "Per-member real revenue keyed by memberId; a member paying in mixed currencies keeps the largest-total currency block (defensive — members normally pay one currency)"
  - "Per-segment headline derived from the segment's own matured closed/total ratio (the cohort scan already carries matured/retained), not a per-segment ChurnService call"
  - "LTV_AXES = branch/country/plan (duration omitted per CONTEXT; duration-tier drop kept guarded in breakdownByAxis for completeness)"
metrics:
  duration: ~18min
  completed: 2026-06-04
---

# Phase 122 Plan 02: LTV Service + GET /ltv + ARPU Deprecation Summary

`LtvService.getLtv` delivers the customer-lifetime block end-to-end — the `1 ÷ churn` headline (reusing Phase 121's `ChurnService`, never recomputed), the robust Kaplan-Meier survival median (active customers censored, not dropped), and the per-currency monetary LTV from REAL payments (projected + observed, never list price) — opened by branch/country/plan, exposed at `GET /api/admin/analytics/ltv` under the ADMIN guard, with the legacy ARPU annotated `@deprecated D-122-01` but left fully functioning.

## What Was Built

### Task 1 — `ltv-service.ts` (new service, chained onto the expiry cohort)

`LtvService` mirrors `ChurnService`'s structure (imports block, DI ctor, `Promise.all` fan-out, `breakdownByAxis` decomposition) and the money side of `advanced-finance-service.ts`:

- **Headline (LTV-01 / D-122-03):** instantiates `ChurnService` in the ctor and calls `getChurn(filters)` inside `getLtv`; `lifetimeFromChurnPct(window.churn.percentage)` computes `1 ÷ (pct/100)` rounded to 1 decimal, returning `null` when churn ≤ 0 (no finite lifetime — never NaN/∞).
- **Survival cohort (LTV-02/03 / D-122-02/04/05):** `cohortLives` runs the SAME per-person expiry scan churn uses (`expiryCohortConditions` + `lastExpiryPerPersonExpr` + `applyScope` on `subscriptions.branchId`), enriched with the person's first start (correlated `MIN(start_date)` subquery, same user + same branch + non-paused) and last expiry, plus the branch/country/plan columns for breakdowns. `classifyLives` marks closed = matured && !retained (`event: true`) and active/in-grace = censored (`event: false`, KEPT). Durations (closed → first-start..last-expiry; censored → first-start..today; `÷ 30` months) feed `kaplanMeierMedian`.
- **Monetary LTV (LTV-04 / D-122-07/08):** `realPaymentsByMember` runs the canonical revenue filter on `financial_transactions` (`kind IN (plan_charge, debt_settlement)`, `direction='inflow'`, `voidedAt IS NULL`, `transactionDate` in the half-open range), `applyScope` on `users.branchId` with the unconditional `branches` join (flavor A), grouped by `(memberId, currency)`. `buildMonetary` produces, per currency: observed = mean of closed customers' exact totals; monthlyRealRevenue = mean of `total ÷ durationMonths` over positive-duration lives; projected = `headline × monthlyRealRevenue`. All averages `null` when empty.
- **Per-currency (LTV-05 / D-122-09):** ARS/EUR accumulated in separate arrays/blocks; `toCurrency` skips any unknown currency — never folded in.
- **Breakdowns (LTV-05):** `LTV_AXES = [branch, country, plan]`; each segment carries its own headline (segment matured closed/total ratio), KM median, and per-currency monetary block, sorted by `key.localeCompare`.

All division guarded; no `: any`; logging only via the DI `log` field; no `console.log`. `tsc --noEmit` clean.

### Task 2 — `GET /ltv` route + `ltvSchema` + ARPU `@deprecated`

- **`schemas.ts`:** added a LOCAL `ltvQuerystring` (`window` integer 1..365, shared `analyticsQuerystring` NOT mutated), reusable `ltvCurrencyBlockSchema` / `ltvMonetarySchema`, and `ltvSchema` declaring the FULL 200 response (`lifetimeHeadlineMonths` + `survivalMedianMonths` as `["number","null"]`, the per-currency monetary block, the breakdowns array with each segment's headline/median/monetary/n, and top-level `n`) + `400/401/403/500: errorSchema`. Every field declared so fast-json-stringify does not strip it. Fully additive (82 insertions, 0 deletions).
- **`routes.ts`:** imported + instantiated `LtvService` next to `churnService`/`renewalService`; registered `GET /ltv` mirroring the `/churn` block — `schema: ltvSchema`, `preHandler: [requireAdminAnalytics, requireBranchAccess({ from: "query.branchId", optional: true })]`, `AnalyticsFilters` from query + `request.scope.country ?? undefined` + `window`, `handleServiceError(err, reply, request.log, "get ltv")` in `catch (err: unknown)`.
- **`advanced-finance-service.ts`:** annotated the ARPU computation block (in `getAdvancedFinance`) and the `activeMemberCount` denominator with `@deprecated Phase 122 D-122-01 — replaced by GET /ltv monetary LTV (real-payment based, non-snapshot)`, copying the Phase 121 D-09 style. Annotation-only — 17 insertions, 0 deletions; the arpu math expression, the `arpu` schema field, and the `AdvancedFinanceAnalytics.arpu` type are byte-unchanged, so the Finanzas Avanzadas dashboard keeps working.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` passes (whole api package) after each task.
- Task 1 greps: `class LtvService` (1), `kaplanMeierMedian` (4), `ChurnService` (8 ≥1), `financialTransactions` (12), `voidedAt` IS NULL guard present, list price (`priceRegular|price_regular|listPrice`) returns NOTHING, ARS/EUR isolation present, `applyScope` (5 ≥2), `: any` (0), `console.log` (0).
- Task 2 greps: `ltvSchema` in schemas (1), `"/ltv"` route (1), `requireAdminAnalytics` present, `D-122-01` in advanced-finance (2), `analyticsQuerystring =` count unchanged (1 — shared const not mutated), `LtvService` in routes (2 — import + new), `"get ltv"` handler (1), `: any` in routes (0).
- ARPU math byte-unchanged: `activeMembers > 0 ? Math.round(...)` intact; types.ts NOT modified; schemas.ts arpu field untouched (additive-only diff).
- Integration coverage (gestión 403, admin 200, headline=1÷churn consistency, censored-not-dropped, observed=exact real sum, per-currency isolation, breakdowns) is delivered by Plan 03 and runs in CI on the staging push (project policy — tests not run locally).

## TDD Gate Compliance

The plan marks Task 1 `tdd="true"`, but its `<verify>`/`<acceptance_criteria>` are tsc + greps only, the verification note assigns the integration test suite (`test/analytics/ltv.test.ts`) to **Plan 03**, and project policy forbids running the real-MySQL suite locally (CI-only). The MVP+TDD runtime gate was NOT active for this phase (orchestrator did not pass `MVP_MODE`/`TDD_MODE`). The pure Kaplan-Meier algorithm — the only genuinely new logic — already has its dedicated RED/GREEN unit tests from Plan 01 (`kaplan-meier.test.ts`). `LtvService` is composition over already-tested primitives + DB queries whose behavior is asserted by Plan 03's integration suite. No RED `test(...)` commit was produced for this plan because its test artifact belongs to Plan 03; the implementation was committed as `feat(...)` after the tsc + grep gates passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed dead `emptyCurrencyBlock` helper**

- **Found during:** Task 1 (post-commit review).
- **Issue:** An `emptyCurrencyBlock()` helper was written but never referenced (the monetary blocks are always built via `block()`); leftover dead code.
- **Fix:** Deleted the function; confirmed `LtvCurrencyBlock` import is still used by `block()`'s return type; `tsc` clean.
- **Files modified:** `el-templo-api/src/modules/analytics/ltv-service.ts`
- **Commit:** cee2e8e7

(No other deviations — the plan executed as written. Prettier reformatted the new service on commit via lint-staged; no logic change.)

## Self-Check: PASSED

- FOUND: el-templo-api/src/modules/analytics/ltv-service.ts
- FOUND: el-templo-api/src/modules/analytics/routes.ts (GET /ltv + LtvService)
- FOUND: el-templo-api/src/modules/analytics/schemas.ts (ltvSchema)
- FOUND: el-templo-api/src/modules/analytics/advanced-finance-service.ts (@deprecated D-122-01)
- FOUND commit de9cb9f9 (feat — LtvService)
- FOUND commit cee2e8e7 (refactor — drop dead helper)
- FOUND commit 23905618 (feat — GET /ltv + ltvSchema + ARPU deprecation)
