---
phase: 120-fundaci-n-transversal-ticket-promedio
verified: 2026-06-03T00:00:00Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run the Phase 120 integration test suite in CI on staging push (foundation-helpers.test.ts, breakdowns-cohorts.test.ts, ticket.test.ts)"
    expected: "All three suites pass against real MySQL (eltemplo_test). breakdowns-cohorts and ticket hit real MySQL; foundation-helpers is pure. Confirms the runtime SQL (half-open range, INNER joins, currency grouping, 403/200 wire shape) behaves as the assertions claim."
    why_human: "Project policy (MEMORY) forbids running the integration suite locally — tests run in CI on staging push. The test FILES exist and assert the right behaviors (verified statically), but execution against real MySQL has not happened yet. This is deferred-to-CI UAT, not a code failure."
  - test: "Apply migration 0136 via the pipeline (pnpm db:migrate) on staging, then production"
    expected: "ALTER TABLE subscriptions ADD COLUMN price_regular_snapshot INT NULL applies cleanly; _migrations table records 0136; no other Phase 120 migration runs (duration_tier does not migrate)."
    why_human: "Migrations are applied by the deploy pipeline, never locally and never via drizzle-kit (project convention). The SQL is verified safe (single nullable ADD COLUMN, no semicolon in any comment line) but has not been applied to any DB yet."
---

# Phase 120: Fundación transversal + Ticket promedio Verification Report

**Phase Goal:** Construir la fundación transversal que consumen los 6 bloques (`duration_tier` por flag, helpers nominal+%+n, motor de breakdowns comparables, aislamiento de moneda, cohortes por rango con vista semanal/mensual) y validarla entregando el Bloque 6 (ticket promedio) como primer consumidor real.
**Verified:** 2026-06-03
**Status:** human_needed (all code verified; CI test-run + migration-apply deferred per project policy)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (ROADMAP success criteria)                                                                                                 | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `duration_tier` (monthly\|long_term) resolved by flag, not name; rename never breaks the report; no column/migration             | ✓ VERIFIED | `duration-tier.ts:36-65` — `deriveDurationTier(durationDays)` with named constants `ONE_OFF_MAX_DURATION_DAYS=1`, `MONTHLY_MAX_DURATION_DAYS=31`; ≤1→null, 2–31→monthly, >31→long_term. Pure derivation from `durationDays`, `planTier` enum explicitly NOT consulted (docblock 20-23). No DB import, no migration for the tier.                                                  |
| 2   | Uniform nominal+%+n helper + comparable breakdowns engine (branch/country/duration/plan side by side, not just a filter)         | ✓ VERIFIED | `metric-shape.ts:52-59` `metricShape` returns `{nominal, percentage, n}`. `breakdowns.ts` `BreakdownAxis="branch"\|"country"\|"duration"\|"plan"`; `breakdownKeyExpr` emits groupBy keys (plan axis = composite `(name,country)`, lines 122-130); module emits NO scope conditions (append-only, lines 11-17). Ticket service composes all axes into perPlan/byBranch/byDuration. |
| 3   | Currency isolation (ARS/EUR never summed); cohorts half-open `[from,to)` + selectable weekly/monthly                             | ✓ VERIFIED | `breakdowns.ts:52-62` `CurrencyMap`/`emptyCurrencyEntry` per-currency, no sum-across-currency helper. `cohorts.ts:105-119` `rangeConditions` strict `<` upper bound (half-open); `bucketExpr:133-142` weekly `%x-W%v` / monthly `%Y-%m`. Ticket service keeps ARS/EUR as separate accumulators end-to-end (ticket-service.ts:189-192, 310-315).                                   |
| 4   | Ticket per-plan = mean of price_paid charged; global = SUM/COUNT volume-weighted, per currency, by charge date                   | ✓ VERIFIED | `ticket-service.ts:252-254,322-326` global = `mean(globalPricedValues)` = SUM/COUNT (volume-weighted, NOT mean-of-means); per-plan = mean of `pricedValues` (price_paid>0). Value sourced from LINKED `subscriptions.pricePaid` (line 451), NOT `ft.amount`. Universe = canonical `plan_charge`/inflow/not-voided filter by `transactionDate`, half-open (lines 431-441).         |
| 5   | Discount (price_paid vs priceRegular) per plan + branch, median alongside mean; ticket opens by short/long-term, branch, country | ✓ VERIFIED | `ticket-service.ts:265-283` `listBase = priceRegularSnapshot ?? plan.priceRegular` (fallback counted in `historicalFallbackCount`); discount mean+median per plan (395-396), per branch (347-348), global (377-378). Cohort split list-price vs discounted (287-295). byDuration/byBranch breakdowns + country via scope. Route opens all cuts.                                   |

**Score:** 5/5 ROADMAP success criteria verified (mapped to 9/9 requirements below).

### Required Artifacts

| Artifact                            | Expected                                             | Status     | Details                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics/duration-tier.ts`        | deriveDurationTier + named constants                 | ✓ VERIFIED | 66 lines; exports `deriveDurationTier`, `ONE_OFF_MAX_DURATION_DAYS`, `MONTHLY_MAX_DURATION_DAYS`, `DurationTier`. Imported by breakdowns.ts + ticket-service.ts.     |
| `analytics/metric-shape.ts`         | nominal+%+n + median, NaN-safe                       | ✓ VERIFIED | 77 lines; `metricShape`, `median`, `MetricShape`. Div-by-zero→0, empty→null. Imported by ticket-service.ts.                                                          |
| `analytics/breakdowns.ts`           | breakdown axes + CurrencyMap, append-only            | ✓ VERIFIED | 199 lines; emits only groupBy keys, no scope conditions. Imports deriveDurationTier.                                                                                 |
| `analytics/cohorts.ts`              | half-open range + weekly/monthly bucket              | ✓ VERIFIED | 143 lines; strict `<` upper bound; `rangeConditions` consumed by ticket-service.ts.                                                                                  |
| `db/migrations/0136_...sql`         | single nullable ADD COLUMN, no `;` in comments       | ✓ VERIFIED | 15 lines; single `ALTER TABLE ... ADD COLUMN price_regular_snapshot INT NULL`. ONLY Phase 120 migration. No semicolon in any comment line (grep confirmed).          |
| `db/schema/subscriptions.ts`        | priceRegularSnapshot column                          | ✓ VERIFIED | Line 68: `priceRegularSnapshot: int("price_regular_snapshot")` (nullable).                                                                                           |
| `subscriptions/service.ts`          | snapshot captured at 4 insert sites                  | ✓ VERIFIED | Lines 1093 (assignPlan), 2434 (changePlanNow), 2809 (changePlanAfterCurrent), 3080 (renewSubscription). `grep -c` = 4; bulkMigratePlan (3213) intentionally NULL.    |
| `analytics/ticket-service.ts`       | TicketService, price_paid-sourced, per-currency      | ✓ VERIFIED | 553 lines; full math, guarded divisions, excludedNoLink, cohort split.                                                                                               |
| `analytics/routes.ts` GET /ticket   | ADMIN_ROLES-only, scoped                             | ✓ VERIFIED | Lines 364-389; `requireAdminAnalytics` (403 for non-ADMIN_ROLES) + `requireBranchAccess`.                                                                            |
| `analytics/schemas.ts` ticketSchema | declares byCurrency, excludedNoLink, nullable fields | ✓ VERIFIED | Lines 495-574; ticketCurrencyBlockSchema declares perPlan/byBranch/byDuration/globalCohorts/discountMedian; top-level excludedNoLink + historicalFallbackCount.      |
| `analytics/types.ts` Ticket\* types | full type set                                        | ✓ VERIFIED | TicketAnalytics/TicketCurrencyBlock/TicketCohortSplit/TicketPlanRow/TicketBranchRow/TicketDurationRow present.                                                       |
| 3 test files                        | foundation + breakdowns/cohorts + ticket             | ✓ VERIFIED | foundation-helpers.test.ts (101 LOC), breakdowns-cohorts.test.ts (315 LOC), ticket.test.ts (613 LOC). Assert the right behaviors (see below). NOT run (CI-deferred). |

### Key Link Verification

| From              | To                          | Via                                                                         | Status  | Details                                 |
| ----------------- | --------------------------- | --------------------------------------------------------------------------- | ------- | --------------------------------------- |
| ticket-service.ts | duration-tier.ts            | `import { deriveDurationTier }` + call line 211                             | ✓ WIRED |                                         |
| ticket-service.ts | metric-shape.ts             | `import { metricShape, median }` + 20+ call sites                           | ✓ WIRED |                                         |
| ticket-service.ts | cohorts.ts                  | `import { rangeConditions }` + lines 436,515                                | ✓ WIRED |                                         |
| ticket-service.ts | scope.ts                    | `applyScope` lines 425,504 (composed, not relaxed)                          | ✓ WIRED |                                         |
| ticket-service.ts | subscriptions table         | INNER join via transaction_links target_kind=subscription, reads price_paid | ✓ WIRED | Value from subscription, NOT ft.amount. |
| routes.ts         | TicketService               | `new TicketService` line 73 + `getTicket` line 383                          | ✓ WIRED |                                         |
| breakdowns.ts     | duration-tier.ts            | `import { deriveDurationTier }` + delegation                                | ✓ WIRED | Single threshold source.                |
| service.ts (subs) | priceRegularSnapshot column | 4 insert `.values({ priceRegularSnapshot: <plan>.priceRegular })`           | ✓ WIRED |                                         |

### Data-Flow Trace (Level 4)

| Artifact                    | Data Variable      | Source                                                                                                                             | Produces Real Data                              | Status    |
| --------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| TicketService.getTicket     | charges            | `linkedCharges` real Drizzle query over financial_transactions ⋈ transaction_links ⋈ subscriptions ⋈ subscription_plans ⋈ branches | Yes — real DB joins, no static return           | ✓ FLOWING |
| TicketService.getTicket     | universeByCurrency | `universeCountByCurrency` real COUNT(\*) grouped by currency                                                                       | Yes                                             | ✓ FLOWING |
| priceRegularSnapshot column | discount listBase  | populated at 4 SubscriptionService insert sites from plan.priceRegular                                                             | Yes (forward); historical NULL→fallback counted | ✓ FLOWING |

No hollow props or static-empty returns found. The route returns the service result directly (routes.ts:383-384).

### Behavioral Spot-Checks

| Behavior                                       | Command                                      | Result                                        | Status |
| ---------------------------------------------- | -------------------------------------------- | --------------------------------------------- | ------ |
| API typechecks (all new files)                 | `pnpm exec tsc --noEmit`                     | EXIT=0, no errors                             | ✓ PASS |
| Snapshot captured at exactly 4 sites           | `grep -c "priceRegularSnapshot:" service.ts` | 4                                             | ✓ PASS |
| Migration 0136 is the only Phase 120 migration | `ls migrations/ \| grep 013[6]`              | 0136 only (0135 is campaigns_copy, pre-phase) | ✓ PASS |
| No semicolon in any SQL comment line of 0136   | `grep -E '^\s*--.*;'`                        | NONE                                          | ✓ PASS |
| No `any` types in new analytics files          | grep `: any` / `as any` / `<any>`            | NONE (only `as unknown as SQL`, allowed)      | ✓ PASS |
| No console.log / debt markers                  | grep TODO/FIXME/XXX/TBD/console              | NONE                                          | ✓ PASS |

### Probe Execution

| Probe  | Command | Result                                                                | Status  |
| ------ | ------- | --------------------------------------------------------------------- | ------- |
| (none) | —       | No `scripts/*/tests/probe-*.sh` and no probe declared in PLAN/SUMMARY | SKIPPED |

This phase uses vitest integration tests (CI-run), not shell probes.

### Requirements Coverage

| Requirement | Source Plan | Description                                                      | Status      | Evidence                                                                                            |
| ----------- | ----------- | ---------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| FUND-01     | 120-01      | duration_tier by flag, not name                                  | ✓ SATISFIED | duration-tier.ts deriveDurationTier; no column/migration                                            |
| FUND-02     | 120-01      | uniform nominal+%+n helper                                       | ✓ SATISFIED | metric-shape.ts metricShape + median, NaN-safe                                                      |
| FUND-03     | 120-03      | breakdowns engine side-by-side, append-only                      | ✓ SATISFIED | breakdowns.ts axes branch/country/duration/plan; plan composite (name,country); no scope relaxation |
| FUND-04     | 120-03      | currency isolation ARS/EUR                                       | ✓ SATISFIED | CurrencyMap per-currency; ticket keeps ARS/EUR separate end-to-end                                  |
| FUND-05     | 120-03      | cohorts half-open [from,to) + weekly/monthly                     | ✓ SATISFIED | cohorts.ts strict `<` upper bound; bucketExpr weekly/monthly                                        |
| TICKET-01   | 120-04      | per-plan = mean of price_paid charged                            | ✓ SATISFIED | ticket-service.ts perPlan mean of pricedValues (price_paid>0)                                       |
| TICKET-02   | 120-04      | global = SUM/COUNT volume-weighted, per currency                 | ✓ SATISFIED | global = mean(globalPricedValues) = SUM/COUNT; per currency                                         |
| TICKET-03   | 120-04      | discount vs priceRegular(snapshot), median alongside mean        | ✓ SATISFIED | listBase = snapshot ?? plan.priceRegular; mean+median; cohort split; snapshot column 120-02         |
| TICKET-04   | 120-04      | currency-isolated, opens by duration/branch/country, ADMIN_ROLES | ✓ SATISFIED | byCurrency/byDuration/byBranch; requireAdminAnalytics 403; excludedNoLink mandatory                 |

No orphaned requirements: REQUIREMENTS.md maps exactly FUND-01..05 + TICKET-01..04 to Phase 120, all claimed by plans 01/03/04 (and 02 as the TICKET-03 base).

### Anti-Patterns Found

None. No stubs, no placeholders, no debt markers, no empty returns, no `any`, no console.log in any of the 5 new source files. The pre-migration / bulkMigratePlan NULL snapshot is a documented design property (D-05/D-06), not a stub.

### Human Verification Required

#### 1. Run the Phase 120 integration test suite in CI (deferred per project policy)

**Test:** Push to staging; let CI run `pnpm test` against real MySQL (eltemplo_test).
**Expected:** foundation-helpers.test.ts (pure, 9 cases), breakdowns-cohorts.test.ts (6 real-MySQL cases: duration bucketing, (name,country) split, currency isolation, half-open boundary, weekly/monthly), ticket.test.ts (13 cases incl. price_paid-not-ft.amount, weighted-not-mean-of-means, $0 exclusion, currency isolation, snapshot/fallback+median, cohort split, enrollment-only excludedNoLink, duration buckets, branch scope, half-open boundary, 403 gestion / 200 admin wire shape) all pass.
**Why human:** Project MEMORY forbids local integration runs; tests run in CI on staging push. Test files exist and assert the correct behaviors (statically verified), but have not been executed against real MySQL. This is deferred-to-CI UAT, not a failure.

#### 2. Apply migration 0136 via the pipeline

**Test:** Deploy pipeline runs `pnpm db:migrate` on staging then production.
**Expected:** `price_regular_snapshot INT NULL` added to `subscriptions`; `_migrations` records 0136; no duration_tier migration runs.
**Why human:** Migrations apply via the pipeline, never locally / never via drizzle-kit (project convention). SQL is verified safe but unapplied.

### Gaps Summary

No gaps. All 9 requirements (FUND-01..05, TICKET-01..04) are delivered with substantive, wired, data-flowing implementations in the actual codebase, matching the locked decisions D-01..D-06 exactly:

- D-01/D-02: tier derived from durationDays with named constants, no column, no migration. ✓
- D-03: price_paid>0 averaged, $0 reported separately as zeroCount/zeroPct. ✓
- D-04: canonical plan_charge revenue filter, half-open by transaction_date, currency-isolated, global = SUM/COUNT. ✓ (with the user-confirmed refinement that the VALUE comes from the linked subscription.price_paid, while FT remains the universe/period/currency filter — documented in 120-04 SUMMARY).
- D-05/D-06: single nullable forward-snapshot column, migration 0136 (the only one), captured at exactly 4 real-charge sites, median alongside mean. ✓

Typecheck is clean (EXIT=0). The only outstanding items are the two project-policy-mandated steps (CI test execution + pipeline migration apply) that cannot be performed locally — flagged as human/CI UAT, not as code defects. Status is therefore `human_needed`, not `passed`.

---

_Verified: 2026-06-03_
_Verifier: Claude (gsd-verifier)_
