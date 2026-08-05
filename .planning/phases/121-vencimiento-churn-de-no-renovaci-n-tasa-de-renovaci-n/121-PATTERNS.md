# Phase 121: Vencimiento — Churn de no renovación + Tasa de renovación - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 7 (1 shared helper, 2 services, 1 routes edit, 1 schemas edit, 1 types edit, 2 test files)
**Analogs found:** 7 / 7 (every new file has a strong analog — Phase 120 just shipped the canonical version of this exact metric pattern)

This is a **backend-only** phase in `el-templo-api` (Fastify + Drizzle + MySQL). It adds two person-based analytics metrics on top of the Phase 120 foundation (`breakdowns.ts`, `cohorts.ts`, `metric-shape.ts`, `duration-tier.ts`, `scope.ts`). **The single best structural analog for the whole phase is `ticket-service.ts`** — it is the most recent new metric service that composes all foundation primitives without re-implementing them, registers a route under the ADMIN guard, declares a `*Schema`, adds wire types, and ships a real-MySQL integration test using `registerUser` + `passwordHash`. Copy its shape.

No schema migration is expected (the cohort is computed live from `subscriptions.endDate` + `subscriptions.startDate`). No frontend.

---

## File Classification

| New/Modified File                                                                   | Role                | Data Flow                   | Closest Analog                                                 | Match Quality                               |
| ----------------------------------------------------------------------------------- | ------------------- | --------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `src/modules/analytics/expiry-cohort.ts` (NEW, shared helper — name TBD by planner) | utility             | transform / query-primitive | `src/modules/analytics/cohorts.ts` + `breakdowns.ts`           | role-match (new foundation-style primitive) |
| `src/modules/analytics/churn-service.ts` (NEW)                                      | service             | CRUD / read-aggregate       | `src/modules/analytics/ticket-service.ts`                      | exact (new analytics metric service)        |
| `src/modules/analytics/renewal-service.ts` (NEW)                                    | service             | CRUD / read-aggregate       | `src/modules/analytics/ticket-service.ts`                      | exact                                       |
| `src/modules/analytics/routes.ts` (MODIFIED — register 2 endpoints)                 | route               | request-response            | the `/ticket` block (routes.ts:360-389)                        | exact                                       |
| `src/modules/analytics/schemas.ts` (MODIFIED — add 2 response schemas)              | config (validation) | request-response            | `ticketSchema` (schemas.ts:552-574)                            | exact                                       |
| `src/modules/analytics/types.ts` (MODIFIED — add wire interfaces)                   | model (types)       | transform                   | `TicketAnalytics` / `TicketCurrencyBlock` (types.ts:455-501)   | exact                                       |
| `test/analytics/churn-renewal.test.ts` (NEW, may be split into two)                 | test                | request-response            | `test/analytics/ticket.test.ts` + `breakdowns-cohorts.test.ts` | exact                                       |

**Planner discretion (per CONTEXT D / "Claude's Discretion"):**

- Whether the expiry-cohort engine is extracted as one shared helper (probable, both B1/B2 consume it) or inlined per service. The foundation precedent (`cohorts.ts`, `breakdowns.ts` are tiny pure modules) favors extraction.
- Whether churn + renewal live in one service file or two. `ticket-service.ts` is one service per metric block; two thin services that both consume the shared expiry-cohort helper matches the convention best.

---

## Shared Patterns

These are cross-cutting and apply to **every** new file. Each new service/route/schema/test copies them verbatim — do NOT reinvent.

### Analytics metric service — constructor DI (Phase 56)

**Source:** `ticket-service.ts:172-176` (identical to `AdvancedFinanceService`)
**Apply to:** `churn-service.ts`, `renewal-service.ts`

```typescript
export class TicketService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
```

Imports block to copy (`ticket-service.ts:60-77`):

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, isNull, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { rangeConditions } from "./cohorts";
import { metricShape, median } from "./metric-shape";
import { deriveDurationTier, type DurationTier } from "./duration-tier";
import type { AnalyticsFilters /* …new wire types… */ } from "./types";
```

### Scope (branch/country access filter) — `applyScope`

**Source:** `scope.ts:55-75`; invoked at `ticket-service.ts:425-429` and `service.ts:681-685` (old renewal)
**Apply to:** every query in both new services. SECURITY-critical (T-120-10 / T-117-01): scope is append-only, never relaxed; spread `.conditions` into `and(...)`. For the expiry cohort the branch column is **`schema.subscriptions.branchId`** (NOT financialTransactions — this metric is subscription-based, matching old `getRenewalRate` at `service.ts:684`).

```typescript
const { conditions: scopeConditions } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.subscriptions.branchId,
});
```

When `needsBranchJoin` is true the caller must `.innerJoin(schema.branches, …)` (flavor-B pattern, `ticket-service.ts:530-535`).

### Half-open `[from, to)` cohort window — `rangeConditions`

**Source:** `cohorts.ts:105-119`; invoked at `ticket-service.ts:436-440`
**Apply to:** the expiry-cohort helper. The cohort of "vencidos en `[from,to)`" (D-01) is `rangeConditions(schema.subscriptions.endDate, dateFrom, dateTo)` — INCLUSIVE lower, EXCLUSIVE upper. This is the deliberate correction the cohort engine standardizes; do NOT use the legacy `<= dateTo` from old `computeRetentionRate` (`service.ts:368-369`).

```typescript
...rangeConditions(schema.subscriptions.endDate, filters.dateFrom, filters.dateTo),
```

### Uniform `{ nominal, percentage, n }` envelope + median — `metricShape` / `median`

**Source:** `metric-shape.ts:52-76`; consumed all over `ticket-service.ts:323-326, 343-348, 391-402`
**Apply to:** churn% and renov% outputs. `metricShape(nominal, total)` guards div-by-zero → 0, never NaN. Report `n` always so the frontend can surface small-sample / `en_gracia` caveats (RENOV-03 "número vivo"). Re-use for the multi-N churn columns and the renovados÷vencidos ratio — do NOT hand-roll percentages.

### Breakdowns engine (open by branch / country / duration / plan)

**Source:** `breakdowns.ts:103-198` — `breakdownKeyExpr` (SQL grouping keys), `breakdownSegmentKey` (JS map key), `durationTierFromDays`
**Apply to:** the "abierto por los breakdowns estándar" requirement (CHURN-06, RENOV-04). Group SQL by `breakdownKeyExpr(axis, cols)`, accumulate per segment with `breakdownSegmentKey(...)` as the Map key. Duration axis SELECTs the raw `durationDays` and buckets in JS via `durationTierFromDays` / `deriveDurationTier` — the 1/31 threshold stays in `duration-tier.ts` only. Breakdowns are ADDITIVE grouping keys, NEVER access filters (access stays in `applyScope`).

### Route registration — service instantiation + ADMIN guard

**Source:** `routes.ts:73` (instantiate) + `routes.ts:360-389` (the `/ticket` block)
**Apply to:** the two new endpoints. Both are SENSIBLE → `requireAdminAnalytics` (ADMIN_ROLES-only, gestión gets 403), same as `/ticket`, `/retention`, `/advanced-finance`. Pattern:

```typescript
const churnService = new ChurnService(fastify.db, fastify.log);
// …
fastify.get<{
  Querystring: {
    branchId?: number;
    dateFrom?: string;
    dateTo?: string; /* window? */
  };
}>(
  "/churn",
  {
    schema: churnSchema,
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
      };
      const result = await churnService.getChurn(filters);
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get churn");
    }
  },
);
```

Error handling is the single shared `handleServiceError(err, reply, request.log, "<verb>")` from `../shared/error-handler` — `catch (err: unknown)`, no per-route try/catch logic. Both new services and routes import it the same way.

### Response schema — fast-json-stringify discipline

**Source:** `ticketSchema` (`schemas.ts:552-574`), `analyticsQuerystring` (`schemas.ts:17-24`), `errorSchema` (`schemas.ts:9-15`)
**Apply to:** the two new `*Schema` exports. Every wire field MUST be declared in the response schema or fast-json-stringify STRIPS it (note in `metric-shape.ts:21-24`). Declare 200 + 400/401/403/500 with `errorSchema`. If the window/multi-N is a querystring param, extend a local copy of `analyticsQuerystring` (add e.g. `window: { type: "integer" }`) rather than mutating the shared const.

### Wire types

**Source:** `TicketAnalytics` / `TicketCurrencyBlock` (`types.ts:455-501`), `AnalyticsFilters` (`types.ts:556-576`)
**Apply to:** new `ChurnAnalytics` / `RenewalAnalytics` interfaces in `types.ts`. `AnalyticsFilters` already carries `branchId/country/dateFrom/dateTo`; if the planner adds a `window` field, extend `AnalyticsFilters` the way `planId`/`entryOrigin` were added (optional, documented as "ignored by metrics that don't support it").

### Integration test — real MySQL, `registerUser` / `passwordHash`

**Source:** `test/analytics/ticket.test.ts` (full service test) + `test/analytics/breakdowns-cohorts.test.ts` (primitive test)
**Apply to:** the new test file(s). ⚠️ **Phase 120 lesson (CONTEXT code_context):** insert members via `registerUser(app, { email, password, firstName, lastName, branchId, dni })` (`ticket.test.ts:129-137`) OR a raw insert using the real column `passwordHash: "x"` (`breakdowns-cohorts.test.ts:100-108`). A raw insert with a `password` field BREAKS in CI. Tests do NOT run locally — they run in CI on the staging push.

```typescript
// breakdowns-cohorts.test.ts:100-108 — raw insert, note passwordHash (col password_hash, notNull)
const [u] = await app.db.insert(users).values({
  email,
  passwordHash: "x",
  firstName: "BC",
  lastName: "Tester",
  branchId,
  role: "member",
});
```

Test scaffolding to copy: `createTestApp()` / `cleanAllTestData(app)` / `beforeEach` clean (`breakdowns-cohorts.test.ts:46-78`). Seed subscriptions with `insert(subscriptions).values({ userId, planId, branchId, status, startDate, endDate, pricePaid, currency, priceTypeApplied: "regular" })` (`ticket.test.ts:160-175`) — `priceTypeApplied` is `notNull`, easy to forget.

---

## Pattern Assignments

### `src/modules/analytics/expiry-cohort.ts` — NEW shared helper (utility, query-primitive)

**Analog:** `cohorts.ts` (pure range/bucket primitive) + `breakdowns.ts` (pure grouping primitive). This is the **heart shared by B1 (churn) and B2 (renovación)** per CONTEXT Integration Points: it builds the cohort of distinct persons whose subscription `endDate ∈ [from,to)`, applies the D-02/D-03/D-04 rules, and exposes the retention predicate (D-05).

**Foundation-style module conventions to copy** (from `cohorts.ts:31` and `breakdowns.ts:37`): pure, no DB access if it only emits SQL fragments; `import { sql, type SQL, type AnyColumn } from "drizzle-orm"`; constrained string-literal unions (no raw user strings in SQL — T-120-07); named exported constants for any threshold (mirror `duration-tier.ts:36,44`); doc-comment header citing the decision IDs.

**Cohort predicate (D-01, D-03, D-04) — build from these real rules:**

- Cohort = distinct `subscriptions.userId` with `endDate ∈ [from,to)` via `rangeConditions(schema.subscriptions.endDate, from, to)`. NEVER `updatedAt` / `cancelledAt` (that is exactly the old `countChurnedMembers` being replaced — `service.ts:336-338`).
- D-03 exclude `status='paused'`: add `sql\`${schema.subscriptions.status} <> 'paused'\`` (do NOT shift effective endDate — descartado).
- D-04 last-expiry-per-person: the person's churn is evaluated on their LATEST expiry in range. Pattern reference for "distinct persons + a per-user pick": `COUNT(DISTINCT ${schema.subscriptions.userId})` (old `computeRetentionRate` `service.ts:381`) combined with a window/`MAX(endDate)` per user. Planner confirms exact SQL.

**Retention predicate (D-05 / D-06) — "renovó":** a DISTINCT later `subscriptions` row (different `id`, same `userId`) whose `startDate <= E + ventana` and gives continuity; plan change AND duration change count. Structural analog = the `EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.user_id = … AND s2.id != … )` correlated subquery in old `computeRetentionRate` (`service.ts:397-402`) and the `activeMemberExists(...)` helper used by old `getRenewalRate` (`service.ts:698-700`) — BUT the new predicate is person-based over the expiry cohort and keyed off `startDate <= E + ventana`, NOT `status IN ('active','paused')` and NOT a fixed CURDATE window. Detection is over `subscriptions` rows, not payments (CONTEXT D-05 / Discretion).

---

### `src/modules/analytics/churn-service.ts` — NEW (service, read-aggregate)

**Analog:** `ticket-service.ts` (exact structural twin).

**Copy:** the imports block (`ticket-service.ts:60-77`), the DI constructor (`:172-176`), the `getX(filters): Promise<XAnalytics>` public-method shape (`:183`), the `Promise.all([...])` fan-out for parallel sub-queries (`:184-187`), the per-segment `Map` accumulator + `finalize*` private methods (`:189-415`), and the guarded-division discipline (`mean`/`metricShape` never NaN, `:144-150`).

**Churn-specific composition:**

- Consume `expiry-cohort.ts` for the denominator (distinct matured vencidos) and the retention predicate.
- **Churn maduro (D-08, CHURN-03):** numerator AND denominator only include persons whose expiry was `>= ventana` days ago. Reference the `DATE_SUB(CURDATE(), INTERVAL … DAY)` maturity pattern from old `getRenewalRate` (`service.ts:688-691`) — but apply it as a maturity gate on `endDate`, and use `sql.raw(String(days))` ONLY for an integer you control, never user input.
- **Multi-N comparative (D-07, CHURN-02):** churn@5 / @10 / @15 side by side via `Promise.all` of the same query at different windows (exact shape of old `getRenewalRate`'s `[last7,last14,last30] = await Promise.all([...])`, `service.ts:715-719`). The "official" churn that pairs with renovación uses the single configured window (default 15).
- **Historical series (CHURN-05):** bucket the cohort by `bucketExpr(schema.subscriptions.endDate, "monthly")` (`cohorts.ts:133-142`); mark a period **provisorio** when its cohort has not yet matured (≥ ventana days) — a computed flag in the row shape.
- **Breakdowns (CHURN-06):** open by branch/country/duration/plan via the breakdowns engine.
- Output via `metricShape` so churn% reports `{ nominal, percentage, n }`.

---

### `src/modules/analytics/renewal-service.ts` — NEW (service, read-aggregate)

**Analog:** `ticket-service.ts` structurally; `getRenewalRate` (`service.ts:676-721`) for the renovados÷vencidos math (but person-based on the SAME expiry cohort, not the legacy 7/14/30 CURDATE windows).

**Renewal-specific composition:**

- Same expiry cohort as churn (RENOV-01: renovados ÷ vencidos over the SAME cohort) — both services consume `expiry-cohort.ts`, the DRY win that justifies extraction.
- Renovado = retention predicate true within the configured window (default 15d, D-07). Corte renovación/reactivación configurable.
- **Número vivo (RENOV-03, D-07):** do NOT force `renov% + churn% = 100`; expose `en_gracia` (persons still inside the grace window, excluded from churn maduro) so the sum only reaches 100 when `en_gracia = 0`. Report all three via `metricShape` (renov nominal/percentage/n + a separate `enGracia` count).
- Sortable/comparable by segment (RENOV-04) via the breakdowns engine.

---

### `src/modules/analytics/routes.ts` — MODIFIED (register `/churn` + `/renewal`)

**Analog:** the `/ticket` block (`routes.ts:360-389`). Instantiate both services next to `ticketService` (`routes.ts:73`). Both endpoints: `requireAdminAnalytics` + `requireBranchAccess` preHandler, build `AnalyticsFilters` from query + `request.scope.country`, `handleServiceError` in catch. If a `window`/multi-N param is added, declare it in the `Querystring` generic AND the schema. Do NOT touch the old endpoints — D-09: old metrics stay live (deprecated) until the admin-UI phase.

---

### `src/modules/analytics/schemas.ts` — MODIFIED (add `churnSchema`, `renewalSchema`)

**Analog:** `ticketSchema` (`schemas.ts:552-574`). Mirror its `querystring: analyticsQuerystring` (or a local extension with `window`) + `response: { 200, 400/401/403/500: errorSchema }`. Declare EVERY wire field (fast-json-stringify strips undeclared fields). For the `{ nominal, percentage, n }` envelope build a small reusable `metricShapeSchema` const (pattern: `revenueByCurrencySchema` at `:52-58`).

---

### `src/modules/analytics/types.ts` — MODIFIED (add `ChurnAnalytics`, `RenewalAnalytics`)

**Analog:** `TicketAnalytics` / `TicketCurrencyBlock` (`types.ts:455-501`). Add the new response interfaces; if a `window` filter is introduced, extend `AnalyticsFilters` (`types.ts:556-576`) the way `planId` (`:567`) and `entryOrigin` (`:575`) were added — optional, JSDoc'd as ignored by non-supporting metrics.

---

### `test/analytics/churn-renewal.test.ts` — NEW (test, request-response)

**Analog:** `test/analytics/ticket.test.ts` (service-through-app integration) + `breakdowns-cohorts.test.ts` (primitive coverage). Cover: cohort = `endDate ∈ [from,to)` half-open boundary (row on `to` excluded — pattern at `breakdowns-cohorts.test.ts:250-288`); paused excluded (D-03); last-expiry-per-person (D-04); retention predicate counts plan/duration change + early renewal (D-05/D-06); churn maduro excludes in-grace persons and `en_gracia` keeps the renovación sum off 100 (D-07/D-08); provisional flag on immature historical periods (CHURN-05); breakdowns by branch/country/duration/plan; ADMIN guard 403 for gestión. **Use `registerUser` / `passwordHash` for member inserts** and seed subscriptions with `priceTypeApplied: "regular"` (notNull). Tests run in CI only.

---

## No Analog Found

None. Every new file maps to a Phase 120 file that shipped the canonical version of this exact pattern. The planner should prefer these real codebase analogs over RESEARCH.md abstractions.

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/analytics/` (foundation + services + routes + schemas + types), `el-templo-api/src/db/schema/subscriptions.ts`, `el-templo-api/test/analytics/`
**Files scanned:** 11 read in full or in targeted ranges (cohorts, metric-shape, duration-tier, scope, breakdowns, ticket-service, routes, service.ts:320-426 + 676-721, subscriptions schema, breakdowns-cohorts.test, ticket.test, schemas.ts:9-24/495-630, types.ts:556-576)
**Pattern extraction date:** 2026-06-03
**Deprecated (D-09, do NOT delete this phase):** `countChurnedMembers` (`service.ts:329-358`), `computeRetentionRate` (`service.ts:360-426`), `getRenewalRate` (`service.ts:676-721`). Planner should annotate these as deprecated and point to the new endpoints as canonical replacements; physical removal is the admin-UI phase.
