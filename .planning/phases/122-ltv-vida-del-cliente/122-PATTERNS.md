# Phase 122: LTV / vida del cliente - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 7 (1 new pure helper, 1 new service, 1 routes edit, 1 schemas edit, 1 types edit, 1 deprecation edit, 1 new test)
**Analogs found:** 7 / 7 (every new file has a strong analog — Phase 121 just shipped the canonical version of this exact "metric chained onto the expiry cohort" pattern)

This is a **backend-only** phase in `el-templo-api` (Fastify + Drizzle + MySQL). It adds an **LTV / customer-lifetime** metric to the analytics module, **chained onto the Phase 121 churn engine** (`expiry-cohort.ts` + `ChurnService`) and the Phase 120 foundation (`metric-shape.ts`, `breakdowns.ts`, `scope.ts`, `cohorts.ts`, `duration-tier.ts`). No schema migration is expected (the cohort + the real-payment universe are both computed live). No frontend.

**The single best structural analog for the LTV service is `churn-service.ts`** (and its twin `renewal-service.ts`): it composes the expiry-cohort predicates without re-implementing them, classifies one row per person, folds matured/retained in JS, fans out with `Promise.all`, opens 4-axis breakdowns, isolates currency, registers under the ADMIN guard, declares a `*Schema`, adds wire types, and ships a real-MySQL integration test using `passwordHash` + CURDATE-derived seeding. **For the per-currency monetary side, the analog is `advanced-finance-service.ts`** (canonical revenue filter, per-currency `{ARS,EUR}` map, div-by-zero guards) — which is also exactly the ARPU computation to deprecate per D-122-01.

The new Kaplan-Meier median helper is a **pure foundation-style module** in the exact style of `metric-shape.ts` / `cohorts.ts` / `expiry-cohort.ts` (no DB, no logging, no `any`, named exported constants, decision-ID doc header, isolated with dedicated tests per D-122-06).

---

## File Classification

| New/Modified File                                                                                      | Role                | Data Flow             | Closest Analog                                                                                               | Match Quality                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/modules/analytics/kaplan-meier.ts` (NEW, pure helper — name TBD by planner)                       | utility             | transform / pure-stat | `src/modules/analytics/metric-shape.ts` (pure stat helper) + `expiry-cohort.ts` (decision-doc'd pure module) | role-match (new isolated statistical primitive, D-122-06)  |
| `src/modules/analytics/ltv-service.ts` (NEW)                                                           | service             | read-aggregate / CRUD | `src/modules/analytics/churn-service.ts` (cohort) + `advanced-finance-service.ts` (per-currency money)       | exact (new analytics metric service chained on the cohort) |
| `src/modules/analytics/routes.ts` (MODIFIED — register `GET /ltv`)                                     | route               | request-response      | the `/churn` block (`routes.ts:397-433`)                                                                     | exact                                                      |
| `src/modules/analytics/schemas.ts` (MODIFIED — add `ltvSchema`)                                        | config (validation) | request-response      | `churnSchema` (`schemas.ts:619-663`)                                                                         | exact                                                      |
| `src/modules/analytics/types.ts` (MODIFIED — add `LtvAnalytics`)                                       | model (types)       | transform             | `ChurnAnalytics` family (`types.ts`) + `AdvancedFinanceAnalytics` (`types.ts:361-366`)                       | exact                                                      |
| `src/modules/analytics/advanced-finance-service.ts` (MODIFIED — `@deprecated` annotate ARPU, D-122-01) | service             | n/a (annotation only) | the D-09 deprecation precedent in `service.ts` (Phase 121 `@deprecated` markers)                             | exact                                                      |
| `test/analytics/ltv.test.ts` (NEW)                                                                     | test                | request-response      | `test/analytics/renewal.test.ts` + `test/analytics/churn.test.ts`                                            | exact                                                      |

**Planner discretion (per CONTEXT "Claude's Discretion"):**

- Whether LTV lives in a new `LtvService` or composes over `ChurnService`/`RenewalService`. The `churn-service.ts` / `renewal-service.ts` precedent (two thin services that BOTH consume the shared `expiry-cohort.ts`) favors a **new `LtvService` that imports the same predicates** — it needs the survival-duration cohort (months per closed life) + the real-payment sums, neither of which `ChurnService` exposes, so composing-over-instance buys little. Headline `1÷churn` MAY reuse `ChurnService.getChurn()` directly (instantiate it inside `LtvService` or in the route) rather than recomputing churn.
- Exact endpoint shape (`GET /ltv` with `window` + breakdown params) and response schema (headline + KM median + monetary projected/observed, all per-currency with `n`).
- Exact SQL for per-customer real monthly revenue and for the observed sum over closed lives.
- How the survival cohort (each life's duration in months) is materialized from the `end_date` cohort engine to feed Kaplan-Meier.

---

## Shared Patterns

Cross-cutting; apply to **every** new file. Copy verbatim — do NOT reinvent.

### Analytics metric service — constructor DI (Phase 56)

**Source:** `churn-service.ts:123-127` (identical to `RenewalService`, `TicketService`, `AdvancedFinanceService`)
**Apply to:** `ltv-service.ts`

```typescript
export class ChurnService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
```

Imports block to copy (`churn-service.ts:49-73`) — note it imports the cohort predicates from `expiry-cohort.ts`:

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { bucketExpr } from "./cohorts";
import { metricShape } from "./metric-shape";
import { deriveDurationTier } from "./duration-tier";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import {
  expiryCohortConditions,
  lastExpiryPerPersonExpr,
  retainedExpr,
  maturedExpr,
  RENOVATION_WINDOW_DEFAULT_DAYS,
} from "./expiry-cohort";
import type { AnalyticsFilters /* …new LTV wire types… */ } from "./types";
```

### Chain onto the Phase 121 cohort, do NOT redefine "end of life" (D-122-02 / D-122-04)

**Source:** `expiry-cohort.ts:90-202` (the whole module) + `churn-service.ts:171-205` (how it is consumed)
**Apply to:** the survival/duration cohort in `ltv-service.ts`. The end of a customer's life is exactly the Phase 121 churn event: a matured (`maturedExpr`), NOT retained (`!retainedExpr`) person from the expiry cohort. Reactivation inherits the same 15-day window (`RENOVATION_WINDOW_DEFAULT_DAYS`) — a gap ≤ window is continuity (`retainedExpr` true), gap > window closes the life (D-122-04). Build the cohort scan exactly like `churn-service.ts:171-184`:

```typescript
const rows = await this.db
  .select({
    userId: schema.subscriptions.userId,
    matured: maturedExpr(window),
    retained: retainedExpr(window),
  })
  .from(schema.subscriptions)
  .where(
    and(
      ...expiryCohortConditions(filters.dateFrom, filters.dateTo),
      lastExpiryPerPersonExpr(filters.dateFrom, filters.dateTo),
      ...scopeConditions,
    ),
  );
```

A **closed life** = matured AND not retained (the churned set, `foldChurn` at `churn-service.ts:117-121`). An **active/censored life** = matured AND retained, OR still in grace (`enGracia`) — for Kaplan-Meier these are the **censored** observations (D-122-05). Do NOT introduce a new cutoff.

### Headline lifetime = 1 ÷ churn mensual (D-122-03)

**Source:** `churn-service.ts:135-205` (`ChurnService.getChurn` → `window.churn` is `{ nominal, percentage, n }`)
**Apply to:** the headline number. `lifetime_headline ≈ 1 ÷ churn_mensual`. Reuse `ChurnService` person-based churn rather than recomputing it — instantiate `ChurnService` and read `result.window.churn.percentage / 100` as the monthly churn rate. Guard div-by-zero (churn 0 → headline `null`/∞ sentinel, NEVER NaN — mirror the `metricShape` discipline at `metric-shape.ts:52-58` and the ARPU guard at `advanced-finance-service.ts:148-150`). Open by the standard breakdowns + currency (D-122-09).

### Scope (branch/country access filter) — `applyScope`, subscription-based

**Source:** `scope.ts:55`; invoked at `churn-service.ts:165-169`
**Apply to:** every cohort/survival query. SECURITY-critical: scope is append-only, spread `.conditions` into `and(...)`. The cohort branch column is **`schema.subscriptions.branchId`** (subscription-based metric, matching churn):

```typescript
const { conditions: scopeConditions } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.subscriptions.branchId,
});
```

**For the real-payment queries** the scope column is **`schema.users.branchId`** with an unconditional `branches` join (flavor A) — copy the exact shape from `advanced-finance-service.ts:170-214` (the `cashTrend` query), because `financial_transactions` links to a customer via `memberId → users.id`, not a branch directly. Breakdown axes are ADDITIVE groupBy keys, NEVER access filters.

### Uniform `{ nominal, percentage, n }` envelope + median — `metricShape` / `median`

**Source:** `metric-shape.ts:52-76`
**Apply to:** every LTV figure. `metricShape(nominal, total)` guards div-by-zero → 0, never NaN; always report `n` (sample size / cohort size) so the frontend can surface small-sample caveats. The existing `median(values)` (`metric-shape.ts:70-76`) returns `null` on empty — useful if the planner wants a plain median anywhere, but the **Kaplan-Meier median is a NEW, different statistic** (survival median with censoring) and lives in its own helper. Use `metricShape`/`median` for the simple counts/averages, the KM helper for survival.

### Breakdowns engine (open by branch / country / duration / plan) + currency isolation

**Source:** `breakdowns.ts:160` (`breakdownSegmentKey`), `breakdowns.ts:194` (`durationTierFromDays`); consumed at `churn-service.ts:340-413`
**Apply to:** the "abierto por sucursal, país, plan" + per-currency requirement (D-122-09). Copy the per-axis loop from `churn-service.ts:340-413` exactly (the `CHURN_AXES = ["branch","country","duration","plan"]` constant, the `innerJoin(branches)` + `innerJoin(subscriptionPlans)`, the duration-tier drop for one-off plans `deriveDurationTier(...) === null`, the `breakdownSegmentKey(axis, {...})` Map accumulator, the deterministic `.sort((a,b)=>a.key.localeCompare(b.key))`). **Currency isolation (D-122-09, ARS/EUR NEVER summed):** mirror the per-currency `Map<Currency, ...>` accumulator from `ticket-service.ts:189-296` and the `currency === "EUR" ? "EUR" : "ARS" ? ... : null` guard (`ticket-service.ts:200-202`) / `advanced-finance-service.ts:217-223, 304-309` — an unknown currency is skipped, never summed.

### Route registration — service instantiation + ADMIN guard + error handler

**Source:** `routes.ts:78` (instantiate `churnService`) + `routes.ts:397-433` (the `/churn` block, with the `window` querystring)
**Apply to:** the new `GET /ltv` endpoint. SENSIBLE → `requireAdminAnalytics` (ADMIN_ROLES-only, gestión gets 403) + `requireBranchAccess`, same as `/churn` and `/renewal`. Build `AnalyticsFilters` from query + `request.scope.country ?? undefined`, including `window: request.query.window` if a window param is exposed. Error handling is the single shared `handleServiceError(err, reply, request.log, "get ltv")` in a `catch (err: unknown)` — no per-route try/catch logic:

```typescript
const ltvService = new LtvService(fastify.db, fastify.log); // next to churnService at routes.ts:78
// …
fastify.get<{
  Querystring: {
    branchId?: number;
    dateFrom?: string;
    dateTo?: string;
    window?: number;
  };
}>(
  "/ltv",
  {
    schema: ltvSchema,
    preHandler: [
      requireAdminAnalytics,
      requireBranchAccess({ from: "query.branchId", optional: true }),
    ],
  },
  async (request, reply) => {
    try {
      const filters: AnalyticsFilters = {
        branchId: request.query.branchId,
        country: request.scope.country ?? undefined,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
        window: request.query.window,
      };
      return await ltvService.getLtv(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get ltv");
    }
  },
);
```

### Response schema — fast-json-stringify discipline

**Source:** `churnSchema` (`schemas.ts:619-663`), `churnQuerystring` (`schemas.ts:584-592`), `churnMetricShapeSchema` (`schemas.ts:597-604`), `errorSchema` (`schemas.ts:9-15`)
**Apply to:** the new `ltvSchema`. Every wire field MUST be declared or fast-json-stringify STRIPS it (lesson noted at `metric-shape.ts:21-24`). Declare 200 + 400/401/403/500 (`errorSchema`). If `window` is a querystring param, copy the **local** `churnQuerystring`/`renewalQuerystring` pattern (`schemas.ts:584-592`, `:674-682`): a private `ltvQuerystring` const with `window: { type: "integer", minimum: 1, maximum: 365 }` — do NOT mutate the shared `analyticsQuerystring`. Reuse a small `ltvMetricShapeSchema` const for the `{nominal,percentage,n}` envelope (pattern: `churnMetricShapeSchema`). Declare the per-currency monetary block (`ARS`/`EUR` numbers, `["number","null"]` for averages that can be empty — see `TicketCohortAverage` schema discipline at `types.ts:376-381`).

### Wire types

**Source:** `ChurnAnalytics` family (`types.ts`, `ChurnWindowResult`/`ChurnSegmentRow`/`ChurnSeriesPoint`), `AdvancedFinanceAnalytics` (`types.ts:361-366`), `AnalyticsFilters` (already carries `window?`)
**Apply to:** new `LtvAnalytics` interface. `AnalyticsFilters.window?` ALREADY exists (added in Phase 121 Plan 01) — do NOT re-add it. Model the monetary block on `AdvancedFinanceAnalytics`'s per-currency `{ month, ARS, EUR }` shape but as a per-currency LTV block; reuse `MetricShape` for counts. Reuse the `ChurnRenewalAxis` segment-row shape for breakdowns.

### Integration test — real MySQL, `passwordHash`, CURDATE-derived seeding

**Source:** `test/analytics/renewal.test.ts` (full service + auth, instantiates BOTH services) + `test/analytics/churn.test.ts`
**Apply to:** the new `test/analytics/ltv.test.ts`. ⚠️ **Phase 120/121 lessons (test-covered):** insert members with `passwordHash: "x"` (NOT `password`) — `renewal.test.ts:107-114`; seed subs with `priceTypeApplied: "regular"` (notNull) — `renewal.test.ts:133-143`; derive every `startDate`/`endDate` from `CURDATE()` via the `dateOffset(days)` helper (`renewal.test.ts:147-161`) so maturity assertions stay TZ-flake-safe (analytics tests fail after ~21:00 AR otherwise — see MEMORY). Copy `createTestApp()` / `cleanAllTestData(app)` / `beforeEach` scaffolding and the ES branch seeding for the per-currency case (`renewal.test.ts:54-85`). For the monetary LTV, ALSO seed `financialTransactions` rows (`kind:'plan_charge'`, `direction:'inflow'`, `voidedAt: null`, `amount`, `currency`, `memberId`, `branchId`, `transactionDate`, `recordedBy`, `paymentMethod`, `effectiveDate` — all notNull, see schema below). Tests run in **CI only** (project policy — never run locally; ask before pushing to staging).

---

## Pattern Assignments

### `src/modules/analytics/kaplan-meier.ts` — NEW pure helper (utility, pure-stat) — D-122-05 / D-122-06

**Analog:** `metric-shape.ts` (pure stat helper, div-by-zero/empty guards, fast-json discipline note) + `expiry-cohort.ts` (decision-ID doc header, named exported constants, "no DB, no logging, no `any`" footer).

**Foundation-style conventions to copy** (from `metric-shape.ts:1-27` and `expiry-cohort.ts:1-49`): a doc-comment header citing D-122-05/D-122-06; pure functions only (input = the survival cohort as durations + a censored flag, output = the median); guard empty/single-element cohorts → return `null` (never NaN, mirror `median` at `metric-shape.ts:70-76`); any constant (e.g. a tie-handling rule) as a named export; close with "No DB access, no logging, no `any`."

**Kaplan-Meier scope (D-122-05 — ONLY the median, curve deferred):** input is one observation per customer: `{ durationMonths: number, event: boolean }` where `event = true` means the life closed (churned) and `event = false` means censored (still active / in-grace). Compute the survival function `S(t)` stepwise (`S(t) = Π (1 − d_i / n_i)` over event times) and return the **first time `t` where `S(t) ≤ 0.5`** (the median survival). Do NOT return the full month-by-month curve (deferred). Per D-122-06 the planner MUST write dedicated tests for: censoring (all-active cohort → median `null` if survival never crosses 0.5), events (all-closed → plain median), ties (multiple churns in the same month), empty cohort (`null`), single-customer cohort. This module is the only genuinely NEW algorithm in the phase — isolate it.

**Materializing durations (planner discretion):** each life's duration in months comes from the cohort engine — for a closed life, `end_date − first start_date` (or the span the planner defines); for a censored life, the elapsed time to "today". Mirror the day-arithmetic helpers in `cohorts.ts:47-107` (`dayDiff`, `monthStart`/`monthEnd`/`nextMonth`) and `advanced-finance-service.ts:76-107` rather than re-rolling date math.

---

### `src/modules/analytics/ltv-service.ts` — NEW (service, read-aggregate)

**Analog:** `churn-service.ts` (cohort scan + per-person fold + breakdowns) and `advanced-finance-service.ts` (per-currency real-payment sums + div-by-zero ARPU guard).

**Copy:** the imports block (`churn-service.ts:49-73`), the DI constructor (`:123-127`), the `getLtv(filters): Promise<LtvAnalytics>` public-method shape with `Promise.all([...])` fan-out (`churn-service.ts:135-152`), the per-segment `Map` accumulator + private `finalize*`/`breakdownByAxis` decomposition (`:320-413`), and the guarded-division discipline (`metricShape`/the ARPU guard, never NaN).

**LTV-specific composition:**

- **Headline (D-122-03):** `1 ÷ churn_mensual`. Reuse `ChurnService.getChurn(filters)` — `result.window.churn.percentage` is the monthly churn %. `lifetime = 1 / (churn% / 100)` months; guard churn 0.
- **Kaplan-Meier median (D-122-05):** build the survival cohort from the SAME expiry-cohort scan churn uses (`churn-service.ts:171-184`), classify each person closed (matured AND not retained) vs censored (retained / in-grace), compute each one's duration in months, and feed the `kaplan-meier.ts` helper. Expose BOTH the headline and the KM median so the frontend can compare them (the "valuable signal" in CONTEXT §specifics).
- **Monetary LTV from REAL payments (D-122-07/D-122-08 — NEVER ARPU snapshot):**
  - _Projected:_ `lifetime × ingreso_mensual_real_promedio_por_cliente`, where monthly real revenue comes from `financial_transactions` (the canonical revenue filter, NOT list price).
  - _Observed (closed lives):_ the exact SUM of all real payments over the closed customer's life; `ingreso_mensual_real = LTV_observado ÷ lifetime`.
  - Universe = the **canonical revenue filter** (Phase 120 D-04 / Phase 105): `kind='plan_charge'` (the spec says membership charges; the planner confirms whether to include `debt_settlement` like `advanced-finance-service.ts:179-182` or restrict to `plan_charge` only per CONTEXT §specifics "todos los cobros de membresía"), `direction='inflow'`, `voidedAt IS NULL`, by `transactionDate` within the panel range. Per-customer = grouped by `financialTransactions.memberId`. Copy the exact query shape from `advanced-finance-service.ts:170-214` (`cashTrend`) including the `users` → `branches` flavor-A join for scope.
- **Per-currency (D-122-09):** ARS/EUR NEVER summed — per-currency `Map` accumulator (`ticket-service.ts:189-202`); subscription currency for the cohort, `financialTransactions.currency` for the money.
- **Breakdowns (D-122-09):** branch / country / plan (CONTEXT lists sucursal/país/plan; duration axis is optional — the planner decides) via the `breakdownByAxis` pattern (`churn-service.ts:340-413`).
- Output counts via `metricShape` (always report `n` = cohort size); monetary averages via the guarded mean/`median` (never NaN).

---

### `src/modules/analytics/routes.ts` — MODIFIED (register `GET /ltv`)

**Analog:** the `/churn` block (`routes.ts:397-433`). Instantiate `ltvService` next to `churnService`/`renewalService` (`routes.ts:78-79`). `requireAdminAnalytics` + `requireBranchAccess` preHandler, build `AnalyticsFilters` from query + `request.scope.country`, `handleServiceError` in catch. Declare `window` in the `Querystring` generic AND the schema. Do NOT touch the old endpoints.

---

### `src/modules/analytics/schemas.ts` — MODIFIED (add `ltvSchema`)

**Analog:** `churnSchema` (`schemas.ts:619-663`) + `churnQuerystring` (`:584-592`) + `churnMetricShapeSchema` (`:597-604`). Add a private `ltvQuerystring` (window bounded 1..365), a reusable `ltvMetricShapeSchema`, and `ltvSchema` with the full 200 response (headline, KM median — declare as `["number","null"]` since the median can be null, per-currency monetary block, breakdowns array) + `400/401/403/500: errorSchema`. Declare EVERY field.

---

### `src/modules/analytics/types.ts` — MODIFIED (add `LtvAnalytics`)

**Analog:** the `ChurnAnalytics` family + `AdvancedFinanceAnalytics` (`types.ts:361-366`). Add `LtvAnalytics` (+ supporting `LtvSegmentRow`, per-currency monetary block). `AnalyticsFilters.window?` already exists — reuse it.

---

### `src/modules/analytics/advanced-finance-service.ts` — MODIFIED (deprecate ARPU, D-122-01)

**Analog:** the Phase 121 D-09 deprecation precedent (`@deprecated` doc-comment + inline marker on the legacy metrics in `service.ts`, pointing to the new canonical endpoint, behavior + callers UNCHANGED). **Apply to the ARPU computation here:** the `arpu` series at `advanced-finance-service.ts:138, 147-152, 157` and its denominator `activeMemberCount` (`:349-375`) — the snapshot-ARPU caveat #8 D-122-07 calls out. Annotate `@deprecated Phase 122 D-122-01 — replaced by GET /ltv monetary LTV (real-payment based, non-snapshot)`. Leave it FUNCTIONING so the current Finanzas Avanzadas dashboard does not break (the `advancedFinanceSchema` `arpu` field at `schemas.ts:446` and the `AdvancedFinanceAnalytics.arpu` type at `types.ts:364` stay live). Physical removal is the admin-UI phase. ⚠️ Do NOT delete or change the math.

---

### `test/analytics/ltv.test.ts` — NEW (test, request-response)

**Analog:** `test/analytics/renewal.test.ts` (instantiates BOTH services, asserts cross-metric consistency) + `churn.test.ts`. Cover:

- **Headline = 1÷churn** consistency with `ChurnService` for identical filters (instantiate both, like `renewal.test.ts:55-57, 196-206`).
- **Kaplan-Meier median** on a seeded cohort with both closed and censored (still-active) lives; assert censored persons are NOT dropped (D-122-05). The pure KM helper gets its own unit-style coverage for the D-122-06 edge cases (censoring, events, ties, empty, single-customer).
- **Monetary LTV** from seeded `financialTransactions`: projected vs observed; assert observed = exact sum of the closed customer's real payments and that list price is NOT used (D-122-08 — seed a charge below list price and confirm the real amount drives LTV).
- **Per-currency isolation** (D-122-09): seed AR + ES customers/payments; ARS and EUR never summed.
- **Breakdowns** by branch/country/plan with `{nominal,percentage,n}`.
- **Auth:** gestión token → 403; admin → 200 with the LTV wire shape (`renewal.test.ts:412-454`).
- Use `passwordHash` member inserts, `priceTypeApplied:"regular"` subs, and CURDATE-derived `dateOffset` seeding. Seed `financialTransactions` with ALL notNull columns (memberId, kind, direction, amount, currency, paymentMethod, transactionDate, effectiveDate, branchId, recordedBy). CI-only.

---

## No Analog Found

None. Every new file maps to a Phase 120/121 file that shipped the canonical version of this pattern. The genuinely new element — the Kaplan-Meier survival-median algorithm — has no behavioral analog but a strong STRUCTURAL analog in the pure foundation modules (`metric-shape.ts`, `expiry-cohort.ts`); the planner should prefer these real codebase analogs over RESEARCH.md abstractions and isolate the algorithm with dedicated tests per D-122-06.

---

## Key Reference: Real-payment universe (for monetary LTV, D-122-07/08)

**`financial_transactions` schema** (`src/db/schema/financial-transactions.ts:22-56`) — the customer link is `memberId → users.id` (there is NO subscription FK on the row), so per-customer real revenue is summed by `memberId`:

- `memberId` (FK users.id, notNull) — the customer
- `kind` enum (`plan_charge | debt_settlement | refund | adjustment | advance_payment`)
- `direction` enum (`inflow | outflow`), `amount` (int, notNull), `currency` (varchar(3), default ARS)
- `transactionDate` / `effectiveDate` (date string, notNull), `branchId` (FK, notNull), `recordedBy` (FK, notNull), `paymentMethod` enum (notNull)
- `voidedAt` (timestamp, nullable) — canonical filter requires `IS NULL`

**Canonical revenue filter** (Phase 120 D-04 / Phase 105, replicated at `advanced-finance-service.ts:177-185`): `kind IN (...)` + `direction='inflow'` + `voidedAt IS NULL` + `transactionDate` in `[from,to]`, scoped via `applyScope` on `users.branchId` (flavor-A unconditional `branches` join).

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/analytics/` (expiry-cohort, churn-service, renewal-service, advanced-finance-service, ticket-service, metric-shape, cohorts, breakdowns, duration-tier, scope, routes, schemas, types), `el-templo-api/src/db/schema/{financial-transactions,subscriptions}.ts`, `el-templo-api/test/analytics/renewal.test.ts`
**Files scanned:** 14 read in full or in targeted ranges; foundation-helper exports grepped (cohorts, breakdowns, duration-tier, scope)
**Pattern extraction date:** 2026-06-04
**Deprecate (D-122-01, do NOT delete this phase):** the ARPU computation in `advanced-finance-service.ts` (`arpu` series `:138-152`, `activeMemberCount` `:349-375`) + its schema/type surface (`schemas.ts:446`, `types.ts:364`). Annotate `@deprecated`, leave live; LTV monetary is the canonical replacement. Physical removal is the admin-UI phase, following the Phase 121 D-09 precedent.
