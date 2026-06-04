# Phase 123: Asistencia + Funnel — Frecuencia de asistencia + Funnel de sesiones de prueba - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 9 (2 new analytics services, 1 routes edit, 1 schemas edit, 1 types edit, 1 segmentation-service edit, 1 notification-cron edit, 2 new tests)
**Analogs found:** 9 / 9 — every new/modified file has a strong analog. The Phase 120/121/122 analytics module shipped the canonical version of the exact "new metric service → endpoint → schema → types → real-MySQL test" pattern this phase repeats twice.

This is a **backend-only** phase in `el-templo-api` (Fastify + Drizzle + MySQL). Two **independent** analytics metrics (frequency over `attendance`, trial funnel over `bookings`) plus a **minimal** segmentation-input change (golden case only). No frontend. No migration is strictly required (both metrics compute live) — the only candidate migration is **seeding/declaring a `system_settings` key** for the golden-case threshold (D-123-02), which is an INSERT, not a schema change; the planner decides whether to add a tiny SQL migration or rely on a `SEGMENT_DEFAULTS`-style fallback.

**Best structural analogs:**

- **`frequency-service.ts`** → `churn-service.ts` (cohort scan + per-person JS fold + per-axis breakdown loop) for the band distribution / cooling-down list, and `attendance-metrics-service.ts` for the `attendance`-table query shape + `applyScope(branchColumn = attendance.branchId)` flavor-B conditional join. Check-in adoption is **reused, not reimplemented** (D-123-06).
- **`trial-funnel-service.ts`** → `funnel-service.ts` (Phase 118 — the structural cousin: a stage cascade over a cohort, JS fold of per-person stage flags, `metricShape`/`median` guards) BUT with churn-style scope/breakdown discipline. This is a **NEW, different funnel** from `funnel-service.ts` (D-123 boundary: do NOT touch the freemium→prueba→activo funnel).
- **Routes/schemas/types** → the `/churn` block + `churnSchema` + `churnQuerystring` + `ChurnAnalytics` family (window param already standardized, attribution window reuses the exact same pattern per D-123-12).
- **Segmentation golden case** → `SegmentationService.calculateSegment` (`segmentation/service.ts`) + the existing nightly batch in `notification-cron.ts:202-330` + `SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS` (`segmentation/types.ts`).

---

## File Classification

| New/Modified File                                                                              | Role                | Data Flow                  | Closest Analog                                                                                   | Match Quality                           |
| ---------------------------------------------------------------------------------------------- | ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `src/modules/analytics/frequency-service.ts` (NEW)                                             | service             | read-aggregate / transform | `churn-service.ts` (fold+breakdowns) + `attendance-metrics-service.ts` (attendance query, scope) | exact (new analytics metric service)    |
| `src/modules/analytics/trial-funnel-service.ts` (NEW)                                          | service             | read-aggregate / transform | `funnel-service.ts` (stage cascade + JS fold) + `churn-service.ts` (scope/breakdown discipline)  | exact / role-match (new cascade metric) |
| `src/modules/analytics/routes.ts` (MODIFIED — register `GET /frequency` + `GET /trial-funnel`) | route               | request-response           | the `/churn` block (`routes.ts:405-436`)                                                         | exact                                   |
| `src/modules/analytics/schemas.ts` (MODIFIED — add `frequencySchema` + `trialFunnelSchema`)    | config (validation) | request-response           | `churnSchema` (`schemas.ts:619-663`) + `churnQuerystring` (`:584-592`)                           | exact                                   |
| `src/modules/analytics/types.ts` (MODIFIED — add wire interfaces)                              | model (types)       | transform                  | `ChurnAnalytics`/`ChurnRenewalAxis` family + `FunnelAnalytics` (`types.ts`)                      | exact                                   |
| `src/modules/segmentation/service.ts` (MODIFIED — golden-case en_riesgo override)              | service             | transform                  | `calculateSegment` priority ladder (`service.ts:97-269`) + `getThresholds` (`:34-83`)            | role-match (minimal in-place edit)      |
| `src/jobs/notification-cron.ts` (MODIFIED — feed frequency into the existing nightly batch)    | job                 | batch / event-driven       | the 03:00 segment-recalc block (`notification-cron.ts:202-330`)                                  | exact (extend existing loop)            |
| `test/analytics/frequency.test.ts` (NEW)                                                       | test                | request-response           | `funnel.test.ts` + `attendance-metrics.test.ts` + `churn.test.ts`                                | exact                                   |
| `test/analytics/trial-funnel.test.ts` (NEW)                                                    | test                | request-response           | `funnel.test.ts` + `churn.test.ts`                                                               | exact                                   |

**Planner discretion (per CONTEXT "Claude's Discretion"):**

- Two services (`frequency-service.ts` + `trial-funnel-service.ts`) vs one — CONTEXT leans two (independent metrics); the analytics convention (one service per metric block) confirms two.
- Exact band cutoffs Bajo/Medio (~1 / ~2 / 3+ visits/week) as a **named constant** (mirror `duration-tier.ts`'s `ONE_OFF_MAX_DURATION_DAYS` / `MONTHLY_MAX_DURATION_DAYS` exported-constant style). NOT env vars (D-123-04).
- Turno cutoffs (mañana 07–10, tarde 17–20, else "otro") as **named constants** (D-123-13). NOT env vars.
- Exact SQL for `bookings.isTrial=1` cohort anchored by scheduled-session date, and for "first paid subscription ≤ window".
- Whether the golden-case threshold lives in a NEW `system_settings` key (seeded via tiny migration) or reuses an existing one — and whether frequency is computed inline in the cron loop vs exposed as a `FrequencyService` helper the loop calls (CONTEXT: extend the existing job, no new cron — D-123-01).

---

## Shared Patterns

Cross-cutting; apply to **every** new analytics file. Copy verbatim — do NOT reinvent.

### Analytics metric service — constructor DI (Phase 56)

**Source:** `attendance-metrics-service.ts:49-53` / `churn-service.ts:123-127` / `funnel-service.ts:98-102` (all identical)
**Apply to:** `frequency-service.ts`, `trial-funnel-service.ts`

```typescript
export class FrequencyService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
```

Imports block to copy (from `churn-service.ts:49-73`, trimmed to what each service uses):

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { bucketExpr, rangeConditions } from "./cohorts";
import { metricShape, median } from "./metric-shape";
import { breakdownSegmentKey, type BreakdownAxis } from "./breakdowns";
import type { AnalyticsFilters /* …new wire types… */ } from "./types";
```

### Scope (branch/country access filter) — `applyScope` + the **CRITICAL 121/122 lesson**

**Source:** `scope.ts:55-75`; the conditional-join discipline at `attendance-metrics-service.ts:71-99` (flavor B) and `funnel-service.ts:119-146` (flavor B with `.$dynamic()`)
**Apply to:** EVERY query in both new services. SECURITY-critical: scope is append-only; spread `.conditions` into `and(...)`.

⚠️ **LESSON FROM 121/122 (caused 500s — flag prominently for the planner):** when `applyScope` returns `needsBranchJoin = true` (i.e. a `country` filter is active), the query MUST conditionally `innerJoin(branches)` or the `branches.country` condition references a table not in the FROM clause → 500. Use the `.$dynamic()` + conditional-join shape verbatim:

```typescript
// churn-service.ts:176-189 / funnel-service.ts:128-146 — copy this shape
const { conditions: scopeConditions, needsBranchJoin } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.attendance.branchId, // frequency: attendance-based metric
});
let query = this.db
  .select({
    /* … */
  })
  .from(schema.attendance)
  .$dynamic();
if (needsBranchJoin) {
  query = query.innerJoin(
    schema.branches,
    eq(schema.branches.id, schema.attendance.branchId),
  );
}
const rows = await query.where(and(...conditions, ...scopeConditions));
```

**Branch column per metric:**

- **Frequency:** `schema.attendance.branchId` (the visit metric is attendance-based — matches `attendance-metrics-service.ts:74`).
- **Trial funnel:** the cohort is anchored by the **scheduled-session date** (D-123-10), and `bookings` has **no `branch_id`** — the sede comes from `schedules.branchId` (exactly the join `checkInAdoptionByBranch` already uses: `bookings → schedules → branches`, `attendance-metrics-service.ts:167-175`). So `branchColumn: schema.schedules.branchId`.
- **Plan axis money / first-paid-sub side:** `schema.subscriptions.branchId` (subscription-based, matches churn `churn-service.ts:168`).

⚠️ **Second 121/122 lesson:** in **correlated subqueries**, qualify outer-table column refs with the literal table prefix — Drizzle renders unqualified columns in `.select()`/`sql` correlated subselects, which silently binds to the wrong (inner) table. When the planner writes the "first paid subscription ≤ window from session date" EXISTS/scalar subquery, reference the outer `bookings`/cohort columns with the explicit `schema.<table>.<col>` form (the breakdown joins at `churn-service.ts:389-396` already use the explicit `sql\`${schema.branches.id} = ${schema.subscriptions.branchId}\`` form for this reason).

### Half-open `[from, to)` cohort window + weekly/monthly bucketing — `rangeConditions` / `bucketExpr`

**Source:** `cohorts.ts:105-142`; consumed at `churn-service.ts:294` (`bucketExpr`)
**Apply to:**

- **Frequency rolling 4-week windows** — current `[now-28d, now)` and prior `[now-56d, now-28d)` (D-123-03/05). Mirror the `isoSecond` half-open timestamp pattern at `attendance-metrics-service.ts:44-47, 77-83` for `attendance.checkedInAt`, NOT `rangeConditions` on a date column (attendance frequency counts by timestamp; the panel range, if exposed, can still use `rangeConditions`). Per-member normalization for <4 weeks of membership (D-123-03) divides by the member's REAL elapsed weeks (capped at 4), not a hard /4.
- **Trial funnel cohort** — anchored by the **scheduled-session date** (`bookings.bookingDate`, D-123-10), windowed half-open via `rangeConditions(schema.bookings.bookingDate, from, to)`, bucketed `bucketExpr(schema.bookings.bookingDate, "weekly"|"monthly")` (D-123-10 weekly+monthly cuts). Use the EXCLUSIVE upper bound — do NOT use `<= dateTo`.

### Uniform `{ nominal, percentage, n }` envelope + median — `metricShape` / `median`

**Source:** `metric-shape.ts:52-76`; consumed across `churn-service.ts` and `funnel-service.ts:81-87, 313-318`
**Apply to:** every band-distribution count, every funnel rate. `metricShape(nominal, total)` guards div-by-zero → 0, never NaN; always report `n`. Funnel rates (D-123-11): `tasa_show = asistieron ÷ reservaron`, `tasa_cierre = compraron ÷ asistieron` (denominator = **asistentes**, NOT reservas), `punta_a_punta = compraron ÷ reservaron` — each a `metricShape`. Div-by-zero (0 reservas / 0 asistentes) → 0, NEVER NaN (D-123-11). The cooling-down `% de variación` (D-123-05) is informative; the **trigger is the band change**, not the %.

### Breakdowns engine — branch / country / plan / (frequency: standard axes; funnel: + turno)

**Source:** `breakdowns.ts:103-198` (`breakdownKeyExpr`, `breakdownSegmentKey`, `durationTierFromDays`); the per-axis loop at `churn-service.ts:348-429`
**Apply to:**

- **Frequency:** opens by the standard breakdowns (branch/country/duration/plan via the `breakdowns.ts` axes; D-123-14). Copy the `CHURN_AXES` constant + per-axis `Promise.all` + Map accumulator + deterministic `.sort()` from `churn-service.ts:348-429`.
- **Trial funnel:** opens by **branch / country / turno / plan** (D-123-07/13, FUNNEL-05). `branch`/`country`/`plan` reuse `breakdowns.ts` axes; **`turno` and `plan` here need NEW handling** (see Pattern Assignments — turno is not a `breakdowns.ts` axis, and the plan axis groups by **the plan they BOUGHT**, D-123-09, not the trial). The planner adds a `turno` axis as a local extension (named-constant cutoffs), NOT inside `breakdowns.ts` (which is the shared FUND-03 module — keep it generic).

Breakdown axes are **ADDITIVE groupBy keys, NEVER access filters** (access stays in `applyScope`).

### Route registration — service instantiation + ADMIN guard + shared error handler

**Source:** `routes.ts:80-82` (instantiate next to `churnService`/`renewalService`/`ltvService`) + the `/churn` block (`routes.ts:405-436`)
**Apply to:** `GET /frequency` and `GET /trial-funnel`. Both SENSIBLE → `requireAdminAnalytics` (ADMIN_ROLES-only, **gestión gets 403** — D-123-14) + `requireBranchAccess({ from: "query.branchId", optional: true })`. Build `AnalyticsFilters` from query + `request.scope.country ?? undefined`. Trial funnel's attribution window reuses the **exact `window` param pattern** of churn/renewal/ltv (D-123-12) — declare it in the `Querystring` generic AND the schema. Error handling is the single shared `handleServiceError(err, reply, request.log, "<verb>")` in `catch (err: unknown)` — no per-route try/catch logic. Do NOT touch the existing `/funnel` endpoint.

```typescript
const frequencyService = new FrequencyService(fastify.db, fastify.log); // next to ltvService at routes.ts:82
const trialFunnelService = new TrialFunnelService(fastify.db, fastify.log);
// …
fastify.get<{
  Querystring: {
    branchId?: number;
    dateFrom?: string;
    dateTo?: string;
    window?: number;
  };
}>(
  "/trial-funnel",
  {
    schema: trialFunnelSchema,
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
      return await trialFunnelService.getTrialFunnel(filters);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get trial funnel");
    }
  },
);
```

### Response schema — fast-json-stringify discipline

**Source:** `churnSchema` (`schemas.ts:619-663`), `churnQuerystring` (`:584-592`), `churnMetricShapeSchema` (`:597-604`), `errorSchema` (`:9-15`)
**Apply to:** `frequencySchema`, `trialFunnelSchema`. Every wire field MUST be declared or fast-json-stringify STRIPS it (note `metric-shape.ts:21-24`). Declare 200 + 400/401/403/500 (`errorSchema`). For the funnel's `window`, copy the **local** `churnQuerystring` const (`schemas.ts:584-592`) with `window: { type: "integer", minimum: 1, maximum: 365 }` — do NOT mutate the shared `analyticsQuerystring`. Frequency has no `window` param → reuse `analyticsQuerystring` directly (like `uniqueMembersSchema` at `schemas.ts:213-214`). Reuse a small `metricShapeSchema` const for the `{nominal,percentage,n}` envelope (pattern: `churnMetricShapeSchema`). Declare `["number","null"]` for any % de variación / median that can be null.

### Wire types

**Source:** `ChurnAnalytics`/`ChurnRenewalAxis`/`ChurnSegmentRow` family (`types.ts:517-598`), `FunnelAnalytics`/`FunnelCohort` (`types.ts:330-337`), `AnalyticsFilters` (`types.ts:783-811`)
**Apply to:** new `FrequencyAnalytics` + `TrialFunnelAnalytics` interfaces. `AnalyticsFilters.window?` ALREADY exists (`types.ts:803-810`) — do NOT re-add it; the funnel reuses it as the **attribution window** (document this in the JSDoc, like `entryOrigin` / `planId` were documented as metric-specific). Reuse `MetricShape` for all counts/rates; reuse the `ChurnRenewalAxis` shape for the frequency breakdown rows; the trial funnel needs a NEW axis union (e.g. `"branch" | "country" | "turno" | "plan"`) since `turno` is funnel-only.

### Integration test — real MySQL, `passwordHash`/`registerUser`, CURDATE-derived seeding

**Source:** `funnel.test.ts:1-130` (controlled `created_at`, plan/branch seeding, `registerUser`) + `attendance-metrics.test.ts` (attendance rows) + `churn.test.ts` (CURDATE-derived dates)
**Apply to:** `frequency.test.ts`, `trial-funnel.test.ts`. ⚠️ **Phase 120/121 lessons (test-covered):** member inserts use `registerUser(app, {...})` (`funnel.test.ts:88-95`) or a raw insert with `passwordHash: "x"` (NOT `password` — breaks CI); seed subscriptions with `priceTypeApplied: "regular"` (notNull) and plans with `priceRegular`/`priceZero`/`durationDays` notNull (`funnel.test.ts:66-74, 121-130`). **Derive every date from `CURDATE()`/now offsets** so rolling-window and maturity assertions stay TZ-flake-safe (analytics tests fail after ~21:00 AR otherwise — see MEMORY `project_analytics_test_tz_flake`). For frequency, seed `attendance` rows with controlled `checkedInAt`/`sessionDate`/`branchId`/`memberId`/`scheduleId`; for the funnel, seed `bookings` rows (`isTrial: true`, the `status` enum values, `bookingDate`, `scheduleId`) + `schedules` (with `startTime` for the turno axis) + `subscriptions` (first paid sub) + `users.convertedAt`. Tests run in **CI only** (project policy — never run locally; ask before pushing to staging). Copy `createTestApp()` / `getAuthToken` / `cleanAllTestData(app)` / ES-branch seeding (`funnel.test.ts:38-75`). Assert gestión token → 403, admin → 200.

---

## Pattern Assignments

### `src/modules/analytics/frequency-service.ts` — NEW (service, read-aggregate) — FREQ-01..06

**Analog:** `churn-service.ts` (per-person JS fold + per-axis breakdown loop) + `attendance-metrics-service.ts` (the `attendance` query shape, `applyScope` on `attendance.branchId`, the half-open `isoSecond` timestamp windows).

**Copy:** the imports + DI constructor; the `attendance.checkedInAt` half-open window pattern (`attendance-metrics-service.ts:65-110`); the breakdown per-axis `Promise.all` + Map accumulator + deterministic sort (`churn-service.ts:348-429`).

**Frequency-specific composition:**

- **Visits/week over rolling 4 weeks (D-123-03):** per member, `COUNT(attendance)` in `[now-28d, now)` grouped by `attendance.memberId` (mirror `uniqueMembers`' `COUNT(DISTINCT …)` shape but per-member, not distinct-over-branch). `visitsPerWeek = visits ÷ min(weeksOfMembership, 4)` — normalize by REAL membership weeks for <4-week members (D-123-03), so a new member with 2 visits in 1 week is "Alto", not falsely "Bajo". Membership age = `now − users.createdAt` (or first subscription start — planner picks; CONTEXT says "tiempo real de membresía").
- **Bands (D-123-04):** `Inactivo` (0 visits in window), `Bajo` (~1/wk), `Medio` (~2/wk), `Alto` (3+/wk). Cutoffs as **named exported constants** (`FREQ_BANDS` or `BAJO_MAX_VISITS_PER_WEEK` / `MEDIO_MAX_VISITS_PER_WEEK` — mirror `duration-tier.ts:36,44`). Distribution = count of members per band, **including active members with 0 visits → Inactivo** (D-123-04). "Active" = has an active/paused subscription (mirror `segmentation/service.ts:180-196` for the active-sub lookup) so Inactivo means _active member, 0 visits_, the actionable signal.
- **Cooling-down list (D-123-05):** compute each member's band for the CURRENT 4 weeks and the PRIOR 4 weeks (`[now-56d, now-28d)`); a member who dropped ≥1 band is "enfriándose", with the `% de variación` (current vs prior visits/week) reported alongside (informative). Trigger = band change, NOT the raw %.
- **Check-in adoption alongside (D-123-06):** **REUSE `AttendanceMetricsService.checkInAdoptionByBranch(filters)`** — do NOT reimplement. Instantiate `AttendanceMetricsService` inside `FrequencyService` (or compose in the route) and surface its per-branch ratio in the response as the validity gate. The `<50%` warning is FRONTEND logic (deferred phase) — the service just returns the ratio.
- **Breakdowns (D-123-14):** standard axes (branch/country/duration/plan) via the `churn-service.ts:348-429` pattern, grouping the band counts per segment.
- Output every count via `metricShape` (always `n`); the cooling-down `%` via a guarded division (never NaN).

⚠️ **Golden-case helper (D-123-01/05):** the segmentation batch (below) needs a _per-member_ frequency signal ("active member, 0 visits in window, or cooling down"). Expose a small reusable method (e.g. `FrequencyService.coolingOrInactiveUserIds(window)` or a per-user `isGoldenCase(userId)`) that the cron loop consumes — do NOT duplicate the window math in the cron. Planner decides the exact shape (CONTEXT Discretion).

---

### `src/modules/analytics/trial-funnel-service.ts` — NEW (service, read-aggregate) — FUNNEL-01..05

**Analog:** `funnel-service.ts` (the stage-cascade structure: read the cohort, build per-person stage flags in JS, fold per cohort, guard div-by-zero → `metricShape`/0) + `churn-service.ts` (scope `.$dynamic()` conditional join, breakdown per-axis loop). **This is a NEW funnel** — do NOT modify `funnel-service.ts` (Phase 118, hidden in UI, different metric).

**Copy:** imports + DI constructor; the JS-fold + median + 0-on-empty discipline from `funnel-service.ts:230-322`; the conditional-join scope shape from `churn-service.ts:176-196`; the breakdown loop from `churn-service.ts:348-429`.

**Cascade definition (reserva → asistencia → compra), built from these REAL rules:**

- **Reservó (denominator, D-123-08):** every `bookings.isTrial = 1` row of a **new lead** in the cohort, regardless of final status (`cancelado`/`no_show` still count as reservó). Cohort anchored by the **scheduled-session date** = `bookings.bookingDate` (D-123-10), windowed half-open + bucketed weekly/monthly.
- **Asistió (D-123-07 — CRITICAL):** `bookings.status IN ('qr_escaneado','confirmado')` — NOT the `attendance` table. Reason: trial leads have `status='prueba'` with no active sub, and the QR check-in path requires an active sub, so trials never produce an `attendance` row. `bookings.status` is the only reliable trial-attendance signal. `no_show`/`cancelado`/`lista_espera`/`reservado` do NOT count as asistió. (The enum lives in `bookings.ts:17-24`.)
- **Compró (D-123-09):** the lead's **first PAID subscription** within the attribution window (~21d, configurable via `window` — D-123-12) measured from the **session date**. Detect via `subscriptions` (first paid sub of the user — `pricePaid > 0` / `priceTypeApplied != 'zero'`, planner confirms) and/or `users.convertedAt` (set on first sub if the user had an `isTrial` booking — `users.ts:113-115`). The **plan axis (FUNNEL-05) groups by the plan they BOUGHT** (`subscriptions.planId` → `subscriptionPlans.name`/`country`), NOT the trial plan.
- **New lead (D-123-10):** only leads with **no PRIOR paid subscription** count. A freemium/prueba who never paid = new (counts); a previously-paid returner = reactivation (EXCLUDED). Detection: no `subscriptions` row with `pricePaid > 0` before the session date for that user — a correlated subquery (⚠️ apply the explicit-table-prefix lesson here).

**Tasas (D-123-11):** `tasa_show = asistieron ÷ reservaron`, `tasa_cierre = compraron ÷ asistieron` (over **asistentes**), `punta_a_punta = compraron ÷ reservaron` — each `metricShape` (nominal + % + n), div-by-zero → 0 never NaN.

**Maturity / provisional (D-123-12):** a cohort period whose attribution window has not yet fully elapsed (session date + window > today) is marked **provisional** — mirror the `provisional` flag on `churn-service.ts:319-345`'s monthly series (a bucket with any not-yet-matured row is provisional). The cohort "matures itself" as the window closes.

**Turno axis (D-123-13, FUNNEL-05):** bucket by the **schedule start hour in the sede's LOCAL timezone**. `schedules.startTime` is a `HH:MM` varchar (`schedules.ts:27`), and `branches.timezone` (`branches.ts:16`) is the IANA TZ. Two real turnos: **mañana = 07:00–09:59**, **tarde = 17:00–19:59**, else **"otro"** (fallback). Cutoffs as **named constants** (e.g. `TURNO_MANANA_START_HOUR=7` / `TURNO_MANANA_END_HOUR=10` / `TURNO_TARDE_START_HOUR=17` / `TURNO_TARDE_END_HOUR=20`), NOT env vars. Since `startTime` is already wall-clock in the sede's TZ (schedules are sede-local), "interpret in the sede TZ" mostly means parsing the `HH` from the string — confirm whether any cross-TZ conversion is needed (CONTEXT: "se interpreta la hora en la TZ de la sede"). `turno` is a funnel-LOCAL axis, NOT added to the shared `breakdowns.ts`.

**Breakdowns (FUNNEL-05):** branch / country / turno / plan-bought, each a per-axis Map accumulator over the three cascade counts (reservó/asistió/compró) → three `metricShape`s per segment. Reuse the `churn-service.ts:348-429` loop shape; add the `turno` + plan-bought cases.

---

### `src/modules/analytics/routes.ts` — MODIFIED (register `GET /frequency` + `GET /trial-funnel`)

**Analog:** the `/churn` block (`routes.ts:405-436`) and instantiation site (`routes.ts:80-82`). Instantiate both new services next to `ltvService`. `requireAdminAnalytics` + `requireBranchAccess` preHandler (gestión 403 — D-123-14). Frequency: no `window` (reuse plain `AnalyticsFilters` build like the `/attendance/unique-members` block at `routes.ts:216-240`). Trial funnel: declare `window` in the `Querystring` generic AND the schema (D-123-12, same as `/churn`). `handleServiceError` in catch. Do NOT touch the existing `/funnel`, `/churn`, `/renewal`, `/ltv`, `/attendance/*` endpoints.

---

### `src/modules/analytics/schemas.ts` — MODIFIED (add `frequencySchema` + `trialFunnelSchema`)

**Analog:** `churnSchema`/`churnQuerystring`/`churnMetricShapeSchema` (`schemas.ts:584-663`). Reuse a shared `metricShapeSchema` const (or copy `churnMetricShapeSchema`). `frequencySchema.querystring = analyticsQuerystring` (no window). `trialFunnelSchema.querystring` = a local `trialFunnelQuerystring` adding `window: {type:"integer", minimum:1, maximum:365}` (copy `churnQuerystring`). Declare full 200 (band distribution array, cooling-down array with `% variación` as `["number","null"]`, check-in-adoption array, breakdowns array for frequency; reservó/asistió/compró + three tasas + provisional flag + per-axis breakdowns + weekly/monthly series for the funnel) + 400/401/403/500 (`errorSchema`). Declare EVERY field.

---

### `src/modules/analytics/types.ts` — MODIFIED (add `FrequencyAnalytics` + `TrialFunnelAnalytics`)

**Analog:** `ChurnAnalytics` family (`types.ts:517-598`) + `FunnelAnalytics` (`:330-337`). Add the new response interfaces + supporting row/segment/axis types. Trial funnel needs a NEW axis union (`"branch" | "country" | "turno" | "plan"`); frequency can reuse `ChurnRenewalAxis`. Reuse `MetricShape`. `AnalyticsFilters.window?` already exists (`:803-810`) — reuse it as the funnel attribution window; extend its JSDoc to note funnel usage (the way `entryOrigin`/`planId` are documented as metric-specific).

---

### `src/modules/segmentation/service.ts` — MODIFIED (golden-case `en_riesgo` override, D-123-02)

**Analog:** the `calculateSegment` priority ladder (`service.ts:97-269`) and `getThresholds`/`SEGMENT_SETTINGS_KEYS` (`service.ts:34-83`, `segmentation/types.ts:20-38`).

**Minimal in-place edit — DO NOT rewrite the engine (D-123-01/02):** add ONLY the golden case — an **active (paying) member with 0 visits in the frequency window, or cooling down → `en_riesgo`**. The threshold is a NEW `system_settings` key (tuneable, NOT env var — mirror the `SEGMENT_SETTINGS_KEYS`/`SEGMENT_DEFAULTS` pattern at `segmentation/types.ts:20-38` and the `getThresholds` parse-or-default at `service.ts:50-82`). Add the key (e.g. `segment.frequency_zero_visit_window_days` or reuse `WINDOW_DAYS`) + its default. The **fine multi-band → segment mapping is DEFERRED** (D-123-02) — do NOT invent Bajo/Medio/Alto → segment thresholds. The login `calculateAndUpdate` cooldown (`service.ts:275-307`) stays UNCHANGED.

⚠️ Decide WHERE the override slots into the priority ladder so it does not clobber `nuevo`/`ghost` (CONTEXT: "caso inequívoco y de mayor valor"). Likely: after the `nuevo` guard, gated on `has-active-paid-sub AND zero-visits-or-cooling`. Planner confirms exact placement against the existing ladder semantics.

---

### `src/jobs/notification-cron.ts` — MODIFIED (feed frequency into the EXISTING nightly batch, D-123-01)

**Analog:** the 03:00 segment-recalc block (`notification-cron.ts:202-330`) — the per-profile loop that calls `segmentationService.calculateSegment(profile.userId)` and persists, bypassing the login cooldown.

**Extend, do NOT create a new cron (D-123-01):** the frequency signal becomes ONE more input within the existing loop. Two viable shapes (CONTEXT Discretion):

- (a) Before the loop, compute the golden-case set once via `FrequencyService.coolingOrInactiveUserIds(window)` (one batched query, preferred — avoids N per-member frequency queries), then pass that signal into `calculateSegment` (the planner threads it through, e.g. an optional param or a pre-fetched Set checked inside the override).
- (b) `calculateSegment` itself queries the per-member frequency (simpler, but N queries in the nightly batch — acceptable since it is nightly, but the batched approach is the DRY/perf win).
  Keep the existing transition-detection + notification-queue + ghost-reattempt logic (`:243-311`) UNCHANGED — only the segment _input_ changes. The `node-cron` framework, imports (`notification-cron.ts:17-29`), and error-handling shape (`catch (err: unknown)` + `log.warn`) are already in place.

---

### `test/analytics/frequency.test.ts` + `test/analytics/trial-funnel.test.ts` — NEW (test, request-response)

**Analog:** `funnel.test.ts` (controlled timestamps, plan/branch/`registerUser` seeding, ES-branch cross-country scope) + `attendance-metrics.test.ts` (attendance rows) + `churn.test.ts` (CURDATE-derived dates, provisional/window assertions).

**`frequency.test.ts` covers:** band classification incl. active-with-0-visits → Inactivo (D-123-04); <4-week normalization (a new member is not falsely Bajo — D-123-03); cooling-down detection on a band drop + the `% variación` (D-123-05); check-in adoption surfaced alongside (reuses `checkInAdoptionByBranch` — assert the ratio appears — D-123-06); breakdowns by branch/country/duration/plan; gestión 403 / admin 200.

**`trial-funnel.test.ts` covers:** reservó counts cancelled/no_show trials (D-123-08); asistió = `bookings.status IN ('qr_escaneado','confirmado')` only, NOT `attendance` (seed a trial WITHOUT an attendance row and confirm it still counts via status — D-123-07); compró = first paid sub within window (seed one inside and one OUTSIDE the window, assert only in-window counts — D-123-09/12); new-lead exclusion (a previously-paid returner does NOT count — D-123-10); the three tasas with denominators (cierre over asistentes, not reservas — D-123-11) and div-by-zero → 0; provisional flag on an immature cohort period (D-123-12); turno bucketing mañana/tarde/otro by `schedules.startTime` (D-123-13); plan axis groups by plan BOUGHT (D-123-09); gestión 403 / admin 200.

Both: `registerUser`/`passwordHash` member inserts, `priceTypeApplied:"regular"` subs, plan `priceRegular`/`priceZero`/`durationDays` notNull, CURDATE-derived dates (TZ-flake-safe). CI-only.

---

## No Analog Found

None. Every new/modified file maps to a Phase 117/118/120/121/122 file that shipped the canonical version of this pattern. The genuinely new elements are behavioral, not structural:

- **Frequency band/cooling-down logic** — new computation, but the JS-fold-over-cohort + breakdown structure is exactly `churn-service.ts` / `funnel-service.ts`.
- **The trial funnel cascade** — new metric, but a direct structural cousin of `funnel-service.ts` (different stages, same shape).
- **The turno axis** — new, but a thin local extension of the breakdown-loop pattern (named-constant cutoffs like `duration-tier.ts`).

The planner should prefer these real codebase analogs over RESEARCH.md abstractions.

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/analytics/` (funnel-service, attendance-metrics-service, churn-service, scope, cohorts, breakdowns, metric-shape, duration-tier, routes, schemas, types), `el-templo-api/src/modules/segmentation/{service,types}.ts`, `el-templo-api/src/jobs/notification-cron.ts`, `el-templo-api/src/db/schema/{bookings,attendance,schedules,subscriptions,users,branches,subscription-plans,system-settings}.ts`, `el-templo-api/src/modules/scheduling/trials-service.ts`, `el-templo-api/test/analytics/funnel.test.ts`
**Files scanned:** 18 read in full or in targeted ranges
**Pattern extraction date:** 2026-06-04
**Two critical 121/122 lessons re-flagged for the planner:** (a) conditional `.$dynamic()` innerJoin on `branches` when `needsBranchJoin` (active `country` filter) — else 500; (b) explicit `schema.<table>.<col>` prefixes in correlated subqueries (Drizzle renders unqualified refs against the inner table). Both apply directly to the new-lead-exclusion and first-paid-sub subqueries in the trial funnel.
