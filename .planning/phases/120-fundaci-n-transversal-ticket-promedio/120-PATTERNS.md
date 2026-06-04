# Phase 120: Fundación transversal + Ticket promedio - Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 8 (7 new + 3 modified — 2 files appear in both buckets conceptually)
**Analogs found:** 8 / 8 (every file has an exact or strong role-match analog in the analytics/subscriptions modules)

Backend-only phase in `el-templo-api/` (Fastify + Drizzle ORM + MySQL). No RESEARCH.md exists; the file list below is derived from `120-CONTEXT.md` `<decisions>` + `<code_context>`. This module (Phase 117/118 analytics) is mature and self-similar — the new code should clone the established service/route/schema/test quad almost mechanically.

---

## File Classification

| New/Modified File                                                           | Role      | Data Flow                  | Closest Analog                                                                               | Match Quality          |
| --------------------------------------------------------------------------- | --------- | -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| `src/modules/analytics/duration-tier.ts` (new)                              | utility   | transform                  | `src/modules/shared/active-member.ts` + `RetentionService.CONSECUTIVE_CYCLE_GAP_DAYS` const  | role-match             |
| `src/modules/analytics/metric-shape.ts` (new — nominal+%+n helper, FUND-02) | utility   | transform                  | `funnel-service.ts` `median()` (lines 81-87) + `RetentionService` cohort `% reached` math    | role-match             |
| `src/modules/analytics/breakdowns.ts` (new) OR extend `scope.ts` (FUND-03)  | utility   | transform                  | `src/modules/analytics/scope.ts` `applyScope`                                                | exact (same role/flow) |
| Currency isolation (FUND-04 — likely folded into helpers/types)             | utility   | transform                  | `advanced-finance-service.ts` `CurrencyMap` + per-currency map walk                          | exact                  |
| Cohorts `[from,to)` weekly/monthly (FUND-05)                                | utility   | transform                  | `retention-service.ts` cohort bucketing + `advanced-finance-service.ts` month-walk helpers   | exact                  |
| `src/modules/analytics/ticket-service.ts` (new, block 6)                    | service   | CRUD (read-only aggregate) | `src/modules/analytics/advanced-finance-service.ts`                                          | exact                  |
| `analytics/routes.ts` (+ `/ticket` route)                                   | route     | request-response           | existing `/advanced-finance` route block (routes.ts lines 330-355)                           | exact                  |
| `analytics/schemas.ts` + `types.ts` (ticket shapes)                         | config    | request-response           | `advancedFinanceSchema` (schemas.ts 438-455) + `AdvancedFinanceAnalytics` (types.ts 358-363) | exact                  |
| `src/db/schema/subscriptions.ts` (+ `priceRegularSnapshot` col)             | model     | —                          | existing columns in subscriptions.ts + `subscription-plans.priceRegular`                     | exact                  |
| `src/db/migrations/0136_*.sql` (new, snapshot col)                          | migration | —                          | `0132_add_branches_address.sql` / `0133_add_bookings_source.sql`                             | exact                  |
| `subscriptions/service.ts` (capture snapshot at assign/change/renew)        | service   | CRUD                       | 4 `tx.insert(schema.subscriptions).values({...})` sites (1075, 2414, 2788, 3059)             | exact                  |
| `test/analytics/ticket.test.ts` (new)                                       | test      | —                          | `test/analytics/advanced-finance.test.ts`                                                    | exact                  |

---

## Pattern Assignments

### `src/modules/analytics/duration-tier.ts` (utility, transform) — FUND-01

**Analog:** `src/modules/shared/active-member.ts` (a single canonical, parameterized, exported helper with a verbose docblock) + the named-constant convention in `retention-service.ts` line 54.

**Named-threshold constant pattern** (`retention-service.ts:48-54`):

```typescript
/**
 * Consecutive-cycle gap threshold (Phase 118 D-04). [...] NOT an env var, NOT a
 * DB column — a fixed product rule exported for reuse/testing.
 */
export const CONSECUTIVE_CYCLE_GAP_DAYS = 30;
```

**What to build (D-01/D-02):** A pure function deriving `'monthly' | 'long_term' | null` (null = excluded one-off) from `durationDays`, with two **named exported constants** for the thresholds (do NOT inline `1` / `31`):

```typescript
export const ONE_OFF_MAX_DURATION_DAYS = 1; // ≤ 1 → excluded (Clase única, Sesión de Prueba)
export const MONTHLY_MAX_DURATION_DAYS = 31; // 2..31 → monthly; > 31 → long_term

export type DurationTier = "monthly" | "long_term";

export function deriveDurationTier(
  durationDays: number | null,
): DurationTier | null {
  if (durationDays === null || durationDays <= ONE_OFF_MAX_DURATION_DAYS)
    return null; // excluded
  return durationDays <= MONTHLY_MAX_DURATION_DAYS ? "monthly" : "long_term";
}
```

Input column is `subscriptionPlans.durationDays` (`int(...).notNull()` per `subscription-plans.ts:40`). All 6 metric blocks (phases 121-123) consume this SAME helper. **No migration** for this — pure derivation.

---

### `src/modules/analytics/metric-shape.ts` (utility, transform) — FUND-02

**Analog:** `funnel-service.ts` `median()` (lines 81-87, copy verbatim — same nullable-on-empty contract the ticket needs for its median) and the `% reached / size` rounding in `retention-service.ts:189-192`.

**Median helper to copy** (`funnel-service.ts:81-87`):

```typescript
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}
```

**Percentage / div-by-zero guard pattern** (`retention-service.ts:189-192`, and `advanced-finance-service.ts:148-150`):

```typescript
// guard div-by-zero, report 0 (documented), NEVER NaN
bucket.size > 0 ? Math.round((reached / bucket.size) * 100) : 0;
```

**What to build (FUND-02):** A shape `{ nominal, percentage, n }` returned by all blocks. `percentage` rounded, `n` = sample size, guard `n === 0 → percentage 0` (never NaN). Median is a sibling helper for the ticket. Mirror the "always declare every field, default to 0/null" discipline noted in schemas.ts:119-121 (fast-json-stringify strips undeclared fields).

---

### `src/modules/analytics/breakdowns.ts` OR extend `scope.ts` (utility, transform) — FUND-03

**Analog (exact):** `src/modules/analytics/scope.ts` — `applyScope` is the canonical "compute WHERE fragments + flag whether a branches join is needed, do NOT mutate the query builder" pattern. The breakdowns engine is the natural sibling: same input filters, same `$dynamic()` + conditional-join contract.

**Pattern to follow** (`scope.ts:55-75`): returns `{ conditions: SQL[], needsBranchJoin: boolean }`; **append-only**, never relaxes a filter (security invariant T-117-01); branch column supplied by caller (`branchColumn: AnyColumn`) because it differs per table (`subscriptions.branchId` vs `users.branchId` vs `financialTransactions.branchId`).

**Consumption pattern (flavor B conditional join)** — every analytics service applies it identically (`retention-service.ts:94-128`, `advanced-finance-service.ts:235-266`):

```typescript
const { conditions: scopeConditions, needsBranchJoin } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.subscriptions.branchId,
});
let query = this.db.select({...}).from(schema.subscriptions).$dynamic();
if (needsBranchJoin) {
  query = query.innerJoin(schema.branches, eq(schema.branches.id, schema.subscriptions.branchId));
}
const rows = await query.where(conditions.length > 0 ? and(...conditions) : undefined);
```

**Discretion (per CONTEXT D-40):** planner chooses extend-scope vs new-module. Recommendation: **new module that COMPOSES `applyScope`** (the breakdown axes branch/country/duration/plan-name are orthogonal to the security scope, which `applyScope` already owns and must stay append-only). Duration axis groups via `deriveDurationTier`; plan-name axis groups by `(name, country)` NOT name alone — see the explicit "Flex (AR) ≠ Flex (ES)" rule already established in `types.ts:96-104` / `PlanDistributionRow`.

---

### Currency isolation (utility) — FUND-04

**Analog (exact):** `advanced-finance-service.ts` — the entire file is the canonical "ARS/EUR are NEVER summed" implementation.

**Per-currency accumulator pattern** (`advanced-finance-service.ts:67`, 216-225):

```typescript
type CurrencyMap = Map<string, { ARS: number; EUR: number }>;
// ...
const entry = byMonth.get(month) ?? { ARS: 0, EUR: 0 };
if (r.currency === "ARS" || r.currency === "EUR") {
  entry[r.currency] = Number(r.revenue);
}
byMonth.set(month, entry);
```

Group SQL by `(..., currency)`; keep ARS and EUR as separate keys end-to-end; never `SUM` across currencies. The ticket's weighted average must run **per currency** (TICKET-04). `subscriptions.currency` is `varchar(3) default 'ARS'` (`subscriptions.ts:58`); `subscription_plans.currency` same (`subscription-plans.ts:49`); `financial_transactions.currency` is the cobro currency.

---

### Cohorts respecting `[from,to)` weekly/monthly (utility) — FUND-05

**Analog (exact):** `retention-service.ts` cohort bucketing (lines 154-195) for the grouping model + `advanced-finance-service.ts` calendar helpers (lines 89-107) for month math.

**Calendar helpers to reuse/copy** (`advanced-finance-service.ts:89-107`):

```typescript
function monthStart(month: string): string {
  return `${month}-01`;
}
function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this month
  return d.toISOString().slice(0, 10);
}
function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}
```

**dayDiff (UTC-anchored, DST-safe)** appears identically in BOTH `advanced-finance-service.ts:76-79` and `retention-service.ts:74-77` — already a de-facto shared util; FUND can formalize it. The cohort range must be **half-open `[from,to)`** (CONTEXT FUND-05) — note current date filters in `advanced-finance-service.ts:186-195` use inclusive `>= dateFrom` / `<= dateTo`; the new cohort engine should use `>= from` AND `< to` for the upper bound. Weekly/monthly view default is Claude's discretion (CONTEXT D-42).

---

### `src/modules/analytics/ticket-service.ts` (service, read-only aggregate) — TICKET-01..04

**Analog (exact):** `src/modules/analytics/advanced-finance-service.ts` — same role (new strategic-metric domain service, monolith `service.ts` untouched), same data source (`financial_transactions` canonical revenue filter), same per-currency output, same constructor-DI shape.

**Constructor DI + class shape** (`advanced-finance-service.ts:109-113`):

```typescript
export class AdvancedFinanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
}
```

**Canonical revenue filter to REPLICATE** (`advanced-finance-service.ts:177-195`) — but note the ticket's filter differs from advanced-finance on `kind`: ticket is **`kind = 'plan_charge'` only** (NOT `debt_settlement`), `direction = 'inflow'`, `voided_at IS NULL`, by `transaction_date` (CONTEXT D-04):

```typescript
const conditions: SQL[] = [
  isNull(schema.financialTransactions.voidedAt),
  eq(schema.financialTransactions.kind, "plan_charge") as unknown as SQL,
  eq(schema.financialTransactions.direction, "inflow") as unknown as SQL,
  ...scopeConditions,
];
if (filters.dateFrom !== undefined) {
  conditions.push(
    sql`${schema.financialTransactions.transactionDate} >= ${filters.dateFrom}`,
  );
}
if (filters.dateTo !== undefined) {
  conditions.push(
    sql`${schema.financialTransactions.transactionDate} <= ${filters.dateTo}`,
  );
}
```

**Ticket-specific math (TICKET-01..03):**

- Weighted average = `SUM(price_paid) / COUNT(*)` over `price_paid > 0` cobros — **ponderado por volumen, NOT promedio de promedios** (D-04). Per plan and global, per currency.
- The $0 cobros (promos/becas/pruebas) are **excluded from the average** but reported side-by-side as count/% of zero-priced memberships (D-03) — reuse the FUND-02 nominal+%+n shape.
- Discount vs list price (TICKET-03): use the NEW snapshot column for new cobros; fall back to current `subscription_plans.priceRegular` for historical with a disclaimer (D-05). Show **median alongside average** (copy `median()` from funnel-service).
- Scope + duration/plan-name/branch cuts via the FUND-03 breakdowns engine.

**Defensive-count + caveat field pattern** (`advanced-finance-service.ts:158`, types.ts `excludedInvalidWindow`): return a count of excluded-rows so the frontend can surface a caveat.

---

### `analytics/routes.ts` — register `GET /ticket`

**Analog (exact):** the `/advanced-finance` route block (`routes.ts:330-355`).

**Pattern to clone** (`routes.ts:330-355`):

```typescript
fastify.get<{
  Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
}>(
  "/advanced-finance",
  {
    schema: advancedFinanceSchema,
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
      const result = await advancedFinanceService.getAdvancedFinance(filters);
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get advanced finance");
    }
  },
);
```

- Instantiate the service at the top of the plugin alongside the others (`routes.ts:58-70`): `const ticketService = new TicketService(fastify.db, fastify.log);`.
- The ticket is financially **SENSITIVE → ADMIN_ROLES-only**: include `requireAdminAnalytics` in `preHandler` (gestion gets 403), exactly like `/advanced-finance`, `/retention`, `/funnel`. The plugin-wide `onRequest` hook (routes.ts:77-90) already authenticates + gates to operational roles + attaches `request.scope.country`.
- Error handling: always `catch (err: unknown)` → `handleServiceError(err, reply, request.log, "get ticket")` (project convention, no `any`).

---

### `analytics/schemas.ts` + `analytics/types.ts` — ticket response contract

**Analog (exact):** `advancedFinanceSchema` (schemas.ts:438-455) + `AdvancedFinanceAnalytics` (types.ts:358-363).

**Schema response pattern** (`schemas.ts:438-455`):

```typescript
export const advancedFinanceSchema = {
  querystring: analyticsQuerystring,
  response: {
    200: {
      type: "object",
      properties: {
        /* ... */
      },
    },
    400: errorSchema,
    401: errorSchema,
    403: errorSchema,
    500: errorSchema,
  },
} as const;
```

**CRITICAL (lesson 106-04/109-02, schemas.ts:119-121):** fast-json-stringify STRIPS any field not declared in the response schema. Every field of the ticket payload (average, median, n, zeroCount, zeroPct, discount, per-currency, per-cut breakdowns) MUST be declared or it vanishes from the wire. Reuse `analyticsQuerystring` (schemas.ts:17-24) and the shared `errorSchema` / `revenueByCurrencySchema`. Add the `Ticket*` interfaces to types.ts following the heavily-documented style there (every field commented with its semantics and null/zero contract).

---

### `src/db/schema/subscriptions.ts` — new `priceRegularSnapshot` column (D-05)

**Analog (exact):** existing nullable int columns in `subscriptions.ts` (e.g. `priceOverrideAmount: int("price_override_amount")`, line 63) + the source value `subscriptionPlans.priceRegular: int("price_regular").notNull()` (`subscription-plans.ts:37`).

**Drizzle column to add** (mirror existing nullable-int style, `subscriptions.ts:63`):

```typescript
priceRegularSnapshot: int("price_regular_snapshot"), // nullable: NULL for all rows before this migration
```

Placed near the other price columns. Nullable because historical rows have no snapshot (D-05: only forward fidelity). CONTEXT D-41 leaves `subscriptions` vs `financial_transactions` to the planner — `subscriptions` is recommended since the snapshot is captured at sub-insert time inside `SubscriptionService` and the plan's `priceRegular` is already in scope there.

---

### `src/db/migrations/0136_*.sql` — snapshot column migration (D-06)

**Analog (exact):** `0133_add_bookings_source.sql` (single ADD COLUMN, no backfill) and `0132_add_branches_address.sql` (ADD COLUMN + backfill UPDATEs).

**Migration pattern to clone** (`0133_add_bookings_source.sql`):

```sql
-- Phase 120 (D-05): add subscriptions.price_regular_snapshot for ticket discount base
--
-- Captures the plan's current price_regular at each new membership charge so the
-- ticket discount (block 6) is faithful going forward. Existing rows stay NULL
-- (historical discount falls back to the plan's current price_regular with a
-- disclaimer). No backfill possible (the list price was never stored).
--
-- Comment safety (Phase 103-01 invariant)
--   The runner splits on semicolons BEFORE stripping line comments, so NO
--   semicolon character may appear inside any comment line.
--
-- Hand-written SQL. ADD COLUMN without IF NOT EXISTS per project convention.

ALTER TABLE subscriptions ADD COLUMN price_regular_snapshot INT NULL AFTER price_override_reason;
```

**MUST follow (CLAUDE.md + MEMORY):** hand-written SQL only (NEVER `drizzle-kit generate`); **NO `;` inside any comment line** (the custom runner splits on `;` before stripping `--`); ADD COLUMN without `IF NOT EXISTS`; next sequential number is **0136** (last is 0135). Commit the SQL file alongside the schema change.

---

### `subscriptions/service.ts` — capture snapshot at the 4 insert sites

**Analog (exact):** the 4 existing `tx.insert(schema.subscriptions).values({...})` blocks. All run inside `this.db.transaction(async (tx) => {...})` and have the resolved `plan` object in scope (carrying `plan.currency` already passed, and `plan.priceRegular`).

| Site                 | Line  | Method                   |
| -------------------- | ----- | ------------------------ |
| assign               | ~1075 | `assignPlan`             |
| change-now           | ~2414 | `changePlanNow`          |
| change-after-current | ~2788 | `changePlanAfterCurrent` |
| renew                | ~3059 | `renewSubscription`      |

**Insert pattern to extend** (`subscriptions/service.ts:1075-1093`):

```typescript
const insResult = await tx.insert(schema.subscriptions).values({
  userId,
  planId: input.planId,
  branchId: input.branchId,
  status: initialStatus,
  startDate: input.startDate,
  endDate: endDateStr,
  pricePaid,
  priceTypeApplied,
  // ...
  currency: plan.currency, // ← `plan` already resolved & in scope
  // ADD: priceRegularSnapshot: plan.priceRegular,
});
```

Add `priceRegularSnapshot: plan.priceRegular` to each of the 4 sites. **Verify `plan` is in scope at each site** before relying on it — the renew site (3059) uses `currentSub.planId` and `plan.currency` (line 3076), so `plan` is available; confirm the same for the two change sites. This is the snapshot capture point (CONTEXT Integration Points). The `priceRegular` value comes from `subscription_plans.priceRegular` (notNull int).

---

### `test/analytics/ticket.test.ts` (test)

**Analog (exact):** `test/analytics/advanced-finance.test.ts`.

**Test harness pattern to clone** (`advanced-finance.test.ts:1-116`):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  createStaffUser,
  cleanAllTestData,
} from "../helpers";
import { TicketService } from "../../src/modules/analytics/ticket-service";
// ... real-MySQL: createTestApp(), seed AR + ES branches, instantiate svc = new TicketService(app.db, app.log)
beforeEach(async () => {
  await cleanAllTestData(app); /* insert plan with priceRegular */
});
```

Real MySQL integration (project convention: new routes require integration tests in `el-templo-api/test/`). Cover: weighted-vs-mean-of-means, $0 exclusion + zero count/% reporting, currency isolation (ARS/EUR never summed), discount with snapshot present vs historical fallback, median, per-cut breakdowns, ADMIN_ROLES 403 for gestion, branch/country scope. **Do NOT run the suite locally** (MEMORY: tests run in CI on staging push — typecheck locally only).

---

## Shared Patterns

### Branch/Country Scope (security, append-only)

**Source:** `src/modules/analytics/scope.ts` `applyScope`
**Apply to:** ticket-service, breakdowns engine — every query.
Returns `{ conditions: SQL[], needsBranchJoin }`; spread `conditions` into `and(...)`; conditional `innerJoin(branches)` gated on `needsBranchJoin`. Never relaxes a filter (T-117-01).

### Canonical revenue filter (cobro universe)

**Source:** `advanced-finance-service.ts:177-195` (Phase 105 canonical filter)
**Apply to:** ticket-service.
`voided_at IS NULL` + `direction='inflow'` + **`kind='plan_charge'`** (ticket: plan_charge ONLY, no debt_settlement) by `transaction_date`. Replicate the query — never invoke the monolith's private method (D-09 convention).

### Per-currency isolation (ARS/EUR never summed)

**Source:** `advanced-finance-service.ts` `CurrencyMap` (line 67) + per-currency map walk (216-225); `types.ts:376-379` `RevenueByCurrency`
**Apply to:** ticket-service, types, schemas. Group SQL by `(..., currency)`; keep ARS/EUR separate keys end-to-end.

### Div-by-zero / null-never-NaN guard

**Source:** `advanced-finance-service.ts:148-150`, `retention-service.ts:189-192`, `funnel-service.ts:81-87`
**Apply to:** metric-shape, ticket math. `n === 0 → 0` (counts/%) or `null` (median) — documented, NEVER NaN.

### Constructor DI for services (Phase 56)

**Source:** `advanced-finance-service.ts:109-113`, `retention-service.ts:79-83`
**Apply to:** ticket-service. `constructor(private db: MySql2Database<typeof schema>, private log: FastifyBaseLogger)`.

### Route error handling + admin guard

**Source:** `routes.ts:46-56` (`requireAdminAnalytics`), `routes.ts:330-355` (route block)
**Apply to:** the `/ticket` route. `catch (err: unknown)` → `handleServiceError(...)`; `requireAdminAnalytics` in `preHandler` (financially sensitive → 403 for gestion).

### fast-json-stringify field declaration

**Source:** `schemas.ts:119-121` (lesson 106-04/109-02)
**Apply to:** ticket schema. Every response field MUST be declared in the JSON schema or it is stripped from the wire.

### Manual SQL migration safety

**Source:** `0132`/`0133` migrations + CLAUDE.md
**Apply to:** 0136 snapshot migration. Hand-written; NEVER `drizzle-kit generate`; NO `;` in comments; ADD COLUMN without `IF NOT EXISTS`; commit SQL alongside schema.

---

## No Analog Found

None. Every file in this phase maps to a strong analog in the analytics (Phase 117/118) or subscriptions modules. The phase is essentially "clone the advanced-finance / retention quad (service + route + schema/types + test) for the ticket, plus a foundation utility layer (duration-tier, metric-shape, breakdowns, cohorts) composed from existing scope/currency/cohort patterns, plus one small ADD-COLUMN migration + capture at 4 known insert sites."

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/analytics/`, `el-templo-api/src/modules/finance/`, `el-templo-api/src/modules/subscriptions/`, `el-templo-api/src/modules/shared/`, `el-templo-api/src/db/schema/`, `el-templo-api/src/db/migrations/`, `el-templo-api/test/analytics/`
**Files scanned:** ~20 (11 read in full or targeted)
**Pattern extraction date:** 2026-06-03
