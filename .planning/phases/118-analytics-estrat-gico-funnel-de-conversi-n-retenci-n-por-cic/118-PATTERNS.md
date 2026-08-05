# Phase 118: Analytics estratégico — funnel + retención por ciclos + caja vs devengado - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 18 (10 new, 8 modified)
**Analogs found:** 18 / 18 (phase-117 analytics module is a near-exact analog for almost every file)

This phase is the second half of the analytics split started in phase 117. The 117 code
(domain services, scope helper, multi-currency pattern, status-history hook, frontend tabs)
is the single strongest analog source for nearly every new file. Copy from 117, do NOT touch
the `analytics/service.ts` monolith (v4.9).

---

## File Classification

### Backend — NEW domain services + wiring

| New/Modified File                                                                  | Role                 | Data Flow                    | Closest Analog                                                      | Match Quality                       |
| ---------------------------------------------------------------------------------- | -------------------- | ---------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `el-templo-api/src/modules/analytics/funnel-service.ts` (NEW)                      | service              | transform/CRUD-read          | `analytics/engagement-service.ts` + `attendance-metrics-service.ts` | exact (role + flow)                 |
| `el-templo-api/src/modules/analytics/retention-service.ts` (NEW)                   | service              | transform/cohort-aggregation | `analytics/attendance-metrics-service.ts`                           | exact                               |
| `el-templo-api/src/modules/analytics/advanced-finance-service.ts` (NEW)            | service              | transform/aggregation        | `analytics/service.ts` `getRevenueTrend`/`getOutstandingByCurrency` | role-match (multi-currency pattern) |
| `el-templo-api/src/modules/analytics/routes.ts` (MODIFIED)                         | route                | request-response             | itself (existing `requireAdminAnalytics` routes)                    | exact                               |
| `el-templo-api/src/modules/analytics/schemas.ts` (MODIFIED)                        | config (JSON schema) | request-response             | itself (`kpiSchema` etc.)                                           | exact                               |
| `el-templo-api/src/modules/analytics/types.ts` (MODIFIED)                          | model (types)        | —                            | itself (`MonetaryKpiByCurrency`, `RevenueByCurrency`)               | exact                               |
| `el-templo-api/src/modules/members/service.ts` (MODIFIED — hook `prueba`)          | service              | event-driven (status hook)   | `subscriptions/service.ts::recomputeUserStatus`                     | exact (the canonical hook)          |
| `el-templo-api/src/modules/members/routes.ts` (MODIFIED — hook `inactivo`+`admin`) | route                | event-driven (status hook)   | `subscriptions/service.ts::recomputeUserStatus`                     | role-match                          |

### Backend — NEW tests

| New File                                                                    | Role | Data Flow                | Closest Analog                                            | Match Quality |
| --------------------------------------------------------------------------- | ---- | ------------------------ | --------------------------------------------------------- | ------------- |
| `el-templo-api/test/analytics/funnel.test.ts` (NEW)                         | test | integration (real MySQL) | `test/analytics/engagement.test.ts`                       | exact         |
| `el-templo-api/test/analytics/retention.test.ts` (NEW)                      | test | integration              | `test/analytics/engagement.test.ts`                       | exact         |
| `el-templo-api/test/analytics/advanced-finance.test.ts` (NEW)               | test | integration              | `test/analytics/engagement.test.ts`                       | exact         |
| `el-templo-api/test/.../user-status-history-hooks.test.ts` (NEW, suggested) | test | integration              | `test/analytics/engagement.test.ts` + subscriptions tests | role-match    |

### Frontend — NEW tabs + composable/page wiring

| New/Modified File                                                                     | Role                  | Data Flow                          | Closest Analog                                   | Match Quality  |
| ------------------------------------------------------------------------------------- | --------------------- | ---------------------------------- | ------------------------------------------------ | -------------- |
| `el-templo-admin/src/components/analytics/FunnelTab.vue` (NEW)                        | component             | request-response (read-only chart) | `components/analytics/FinanzasTab.vue`           | exact          |
| `el-templo-admin/src/components/analytics/RetencionTab.vue` (NEW)                     | component             | request-response                   | `components/analytics/FinanzasTab.vue`           | exact          |
| `el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue` (NEW)             | component             | request-response                   | `components/analytics/FinanzasTab.vue`           | exact          |
| `el-templo-admin/src/pages/AnaliticasPage.vue` (MODIFIED — 3 tabs)                    | page                  | request-response                   | itself (`watch(activeTab)` lazy-load)            | exact          |
| `el-templo-admin/src/composables/useAnalyticsApi.ts` (MODIFIED — new methods)         | provider (API client) | request-response                   | itself (`getUniqueMembers`/`getCheckInAdoption`) | exact          |
| `el-templo-admin/src/types/analytics.ts` (MODIFIED — new response types)              | model (types)         | —                                  | itself                                           | exact          |
| `el-templo-admin/src/components/analytics/AsistenciaTab.vue` (MODIFIED — D-09 delete) | component             | template/code deletion             | itself                                           | n/a (deletion) |
| `el-templo-admin/src/pages/ReportesPage.vue` (MODIFIED — D-09 delete)                 | page                  | code deletion                      | itself                                           | n/a (deletion) |

---

## Pattern Assignments

### `funnel-service.ts` / `retention-service.ts` / `advanced-finance-service.ts` (NEW domain services)

**Analog:** `el-templo-api/src/modules/analytics/attendance-metrics-service.ts` (structure) +
`engagement-service.ts` (scope + activeMemberExists usage). NEVER touch `analytics/service.ts`.

**Class shell + DI + imports** (`attendance-metrics-service.ts` lines 26-53). Every new service
copies this exact header — constructor DI (`db`, `log`), `import * as schema`, `applyScope`,
`activeMemberExists`, types from `./types`:

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";
import { activeMemberExists } from "../shared/active-member";
import type { AnalyticsFilters /* new response types */ } from "./types";

export class FunnelService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
  // ...
}
```

**Scope pattern — flavor B (conditional branch join)** (`engagement-service.ts` lines 71-111,
`attendance-metrics-service.ts` lines 71-101). EVERY new query MUST route through `applyScope`.
For funnel (cohorts of `users`) use `branchColumn: schema.users.branchId`; for retention/finance
on subscriptions use `schema.subscriptions.branchId`. Build a `conditions: SQL[]`, spread scope
in, and gate the `branches` innerJoin on `needsBranchJoin`:

```typescript
const { conditions: scopeConditions, needsBranchJoin } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.users.branchId,
});
const conditions: SQL[] = [, /* feature predicates */ ...scopeConditions];
const rows = needsBranchJoin
  ? await base
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .groupBy(/* ... */)
  : await base.where(and(...conditions)).groupBy(/* ... */);
```

**Canonical "active" predicate** (`shared/active-member.ts` lines 27-35) — ARPU denominator
(D-08) and any "activos del mes". NEVER `users.status`. Use `activeMemberExists(schema.users.id)`.

**Half-open date windows** (`attendance-metrics-service.ts` lines 44-47, 77-83) — never wrap a
column in `DATE()` (kills the index). Use `>= lower AND < upperExclusive` on raw columns. The
`isoSecond()` helper is copyable verbatim for timestamp bounds.

**user_status_history cohort reads (funnel + retention).** Funnel cohort = mes de
`users.created_at` (D-03); retention cohort = mes de primera sub activa (D-06). Read transitions
from `schema.userStatusHistory` (columns `fromStatus`/`toStatus`/`source`/`changedAt`, composite
index `(user_id, changed_at)` already exists — schema at `db/schema/user-status-history.ts` lines
38-57). Funnel stages: `freemium→prueba→activo`; median days per stage. CAVEAT (D-01): `prueba`/
`inactivo` precise only forward-only since 2026-05-26; historical `activo` approximated via
`MIN(subscriptions.created_at)`.

**Retention consecutive-cycle gap = 30 días** (D-04/D-05) — export as a module constant from the
service (`export const CONSECUTIVE_CYCLE_GAP_DAYS = 30;`), NOT env var, NOT DB column. Two subs of
same member are consecutive iff `next.start_date − prev.end_date ≤ 30d`. Gap >30d ends the streak
(member leaves their cohort curve at that cycle; reactivation counts separately, never re-inflates
the original cohort). Filter by `subscription_plans.plan_category` enum
(`presencial`/`online_regular`/`online_goal`/`online_coach` — schema `subscription-plans.ts` lines
22-26).

**Advanced finance — multi-currency split** (`analytics/service.ts` `getRevenueTrend` lines
1005-1069, `getOutstandingByCurrency` lines 1220-1260). Copy the (month, currency) GROUP BY → Map
collapse into `{ ARS, EUR }` per month. ARS+EUR NEVER summed. Caja = reuse the existing
`revenueTrend` shape (`financial_transactions`, `kind IN ('plan_charge','debt_settlement')`,
`direction='inflow'`, `voided_at IS NULL`). Devengado (D-07) = prorratear `price_paid ×
(días-de-la-sub-dentro-del-mes ÷ días-totales-start..end)` over `subscriptions.start_date..end_date`
(schema cols `pricePaid`/`startDate`/`endDate` — `subscriptions.ts` lines 55-57). VALIDATE
null/0/end<start BEFORE dividing — exclude invalid-window subs (count them for the frontend caveat,
never divide by zero). ARPU = `devengado del mes ÷ activeMemberExists count del mes`, per currency.
**Researcher note:** confirm whether cancel/refund updates `end_date` — `cancelSubscription` in
`subscriptions/service.ts` sets `subscription_status` but the prorated math relies on `end_date`
being shortened; the resume path (lines 1721-1734) DOES extend `endDate`, but cancel was not
confirmed to shorten it. Reevaluate if it does not.

---

### `members/service.ts` + `members/routes.ts` (MODIFIED — status-history hooks, D-02, FIRST TASK)

**Analog (canonical hook):** `subscriptions/service.ts::recomputeUserStatus` lines 4099-4225.
The history-write block (lines 4203-4224) is the exact pattern to mirror at the un-hooked sites:

```typescript
// read status BEFORE the update → statusBefore
// ...perform the status UPDATE...
// read status AFTER → statusAfter
if (statusAfter !== null && statusAfter !== statusBefore) {
  await tx.insert(schema.userStatusHistory).values({
    userId,
    fromStatus: statusBefore,
    toStatus: statusAfter,
    source: "recompute", // ← new hooks use 'admin' for manual flips, see below
  });
  this.log.info(
    { userId, fromStatus: statusBefore, toStatus: statusAfter },
    "user status transition recorded",
  );
}
```

**Sites to wire (verify line numbers — file moves):**

- `prueba` (conversión lead/sesión de prueba): `members/service.ts` line **540** (createMember,
  `status: "prueba" as const`), line **615**, line **708**. These are CREATE inserts (`from=null →
to='prueba'`) — record a history row alongside the user insert. Reuse the same `userId` returned
  from the insert. No prior status, so `fromStatus` is `null` (column is nullable — schema line 45).
- `inactivo`: `members/routes.ts` line **814** and line **862** (both
  `.set({ status: "inactivo" })`). Read the current status before the `.set`, write a history row
  after when it changed. These run outside a tx today (`fastify.db.update`) — wrap in a tx or write
  the history row right after (mirror the read-before / write-after shape).
- **Admin manual flips → `source='admin'`** (reserved but NOT wired — schema comment line 28). Any
  admin-driven `users.status` change records with `source: "admin"`. The two `members/routes.ts`
  sites above are admin-driven, so `source='admin'` applies there.

**Do NOT duplicate** the `recompute` hook — `recomputeUserStatus` already covers flips to
`activo`/`inactivo` that pass through it. Only wire the gaps.

---

### `analytics/routes.ts` (MODIFIED — new admin-only endpoints, D-11)

**Analog:** itself, lines 39-49 (`requireAdminAnalytics` guard) and lines 80-105 (a guarded route).
New endpoints (funnel, retención, caja/devengado/ARPU) are SENSITIVE → `requireAdminAnalytics` in
`preHandler` (NOT the operational set). Filter-building boilerplate (lines 92-99) is copyable:

```typescript
fastify.get<{
  Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
}>(
  "/funnel",
  {
    schema: funnelSchema,
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
      const result = await funnelService.getFunnel(filters);
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get funnel");
    }
  },
);
```

Instantiate the new services in `analyticsRoutes` alongside the existing ones (lines 51-57).
`error` handling = `handleServiceError(err, reply, request.log, "<verb>")` — no custom catch.

---

### `analytics/schemas.ts` + `analytics/types.ts` (MODIFIED)

**Analog:** `schemas.ts` lines 17-79 (`analyticsQuerystring`, `monetaryKpiByCurrencySchema`,
`revenueByCurrencySchema`, full `kpiSchema` with 401/403/500 errorSchema responses) and `types.ts`
lines 26-39 (`MonetaryKpiByCurrency`), 219-251 (`RevenueByCurrency`, `revenueTrend` shape). Reuse
`revenueByCurrencySchema` and `analyticsQuerystring` fragments. New response types follow the same
per-currency `{ ARS, EUR }` shape for caja/devengado/ARPU.

---

### `FunnelTab.vue` / `RetencionTab.vue` / `FinanzasAvanzadasTab.vue` (NEW components)

**Analog:** `el-templo-admin/src/components/analytics/FinanzasTab.vue` (full file — strongest viz
analog). UI contract in `118-UI-SPEC.md` is authoritative for copy/colors/layout.

**Per-tab shell** (FinanzasTab lines 1-9): loading → no-data → content branch.

```html
<div v-if="props.loading" class="q-pa-md">
  <q-skeleton type="rect" height="300px" class="q-mb-md" />
  <q-skeleton type="rect" height="200px" />
</div>
<div
  v-else-if="!props.data"
  class="text-center q-pa-xl text-grey-5 text-italic"
>
  No hay datos para el periodo seleccionado
</div>
<template v-else> … </template>
```

**Chart card + fixed-height wrapper** (FinanzasTab lines 13-23) — REQUIRED `style="height: 300px;
position: relative"`:

```html
<q-card flat bordered>
  <q-card-section>
    <div class="text-subtitle2 q-mb-sm">
      Funnel de conversión (freemium → prueba → activo)
    </div>
    <div style="height: 300px; position: relative">
      <Bar :data="funnelData" :options="funnelOptions" />
    </div>
  </q-card-section>
</q-card>
```

**Chart.js registration + imports** (FinanzasTab lines 99-118). Per-file `ChartJS.register(...)`.
Retención needs `LineElement, PointElement` for `<Line>`; funnel/finance use `BarElement`. Colors
from `src/utils/chart-colors.ts` (`COLORS`, `chartColors`) — NEVER hardcode hex (chart-colors.ts
lines 6-27). Currency formatting via `formatPrice(value, 'ARS'|'EUR')` (`src/utils/format-price.ts`).

**Multi-currency / multi-series chart data** (FinanzasTab lines 163-216): two datasets never
summed. For Caja vs Devengado (D-08): Caja = `COLORS.primary`, Devengado = `COLORS.accent`, one
chart PER currency (FinanzasAvanzadasTab renders ARS + EUR separately, never one summed chart).
Multi-cohort retention lines: `chartColors[i % chartColors.length]`, `tension: 0.3`. Chart options
always `responsive: true, maintainAspectRatio: false` (lines 144-145).

**Per-currency zero card** (FinanzasTab `outstandingEntries` lines 220-230): render explicit `0`
in scoped currency rather than nothing.

**Caveat banner** (UI-SPEC §Caveat banner — Funnel + Retención, permanent):
`q-banner dense rounded class="bg-orange-2 text-orange-10 q-mb-md"` with `#avatar` slot
`<q-icon name="info" color="orange-9" />`. Banner bodies are verbatim in 118-UI-SPEC.md.

**Excluded-invalid-window caption** (Devengado, D-07): render only when N > 0,
`Se excluyeron N suscripciones con ventana inválida (sin fecha de fin o duración 0).`

**Retención plan_category filter:** local `q-select` (dense, outlined), options Presencial /
Online regular / Online goal / Online coach / Todas, default Todas.

**Error state:** NO toast/alert. `catch (err: unknown)` → `log.error(...)` → leave data null so the
empty state renders (matches AnaliticasPage fetch fns lines 455-501).

---

### `AnaliticasPage.vue` (MODIFIED — add 3 tabs)

**Analog:** itself. Add 3 `<q-tab>` (lines 144-147) + 3 `<q-tab-panel>` (lines 150-159) +
lazy-load via `watch(activeTab)` + `fetchTabData()` switch (lines 503-525). Tab labels/icons in
UI-SPEC: `Funnel`/`filter_alt`, `Retención`/`replay`, `Finanzas avanzadas`/`trending_up`. Pass
`:currency="displayCurrency"` (lines 156-158) and inherit global filters via `currentFilters`
(lines 375-380). New data refs + loading refs mirror lines 388-396. Fetch fns copy lines 479-489.

---

### `useAnalyticsApi.ts` + `types/analytics.ts` (MODIFIED)

**Analog:** `useAnalyticsApi.ts` lines 104-152 (`getUniqueMembers`/`getCheckInAdoption`/
`getEngagement`). Add `getFunnel`/`getRetention`/`getAdvancedFinance` copying the exact try/catch/
finally + `buildParams(filters)` + `extractError(err, '...')` shape. Add new methods to the return
object (lines 159-170). **KEEP `getEngagement`** (D-09 preservation). Add matching frontend response
types to `src/types/analytics.ts`.

---

### `AsistenciaTab.vue` + `ReportesPage.vue` (MODIFIED — D-09 DELETION)

**This is a template/code deletion, no analog.** Exact targets:

`AsistenciaTab.vue` — remove:

- Template card "Activos por segmento de engagement" (lines 65-93, the `v-if="props.engagement"`
  block).
- Template worklist card en_riesgo/ghost + WhatsApp button (lines 95-onwards, second
  `v-if="props.engagement"` block, columns/segment chips/`contactMember`).
- Dead script: `segmentCountCards` (line 313), `engagementColumns` (line 337), `formatMemberName`
  (line 344), `contactMember` (line 357), `segmentLabel`/`segmentColor` (lines 349/353), the prop
  `engagement` (line 286), and now-unused imports `SEGMENT_LABELS`/`SEGMENT_COLORS`/
  `SEGMENT_DESCRIPTIONS` (lines 254-256) + `EngagementAnalytics`/`EngagementMember` (lines 262-263).
- **CONSERVE:** the <50% check-in warning (line 17 banner), únicos 7/14/30, no-show, heatmap,
  ocupación, ratio check-in.

`ReportesPage.vue` — remove:

- `:engagement="engagementData"` prop (line 197).
- `engagementData` ref (line 1073).
- `analyticsApi.getEngagement(...)` from the `fetchAttendanceData` `Promise.all` (line 1094) and
  the destructured `engagement` usage (line 1099).

**NOT touched (preserve):** backend `GET /api/admin/analytics/engagement`, `EngagementService`,
`engagement.test.ts`, types, `getEngagement` composable method, `segmentation` module.

---

### Tests (NEW, D-12 — mandatory integration tests, real MySQL)

**Analog:** `el-templo-api/test/analytics/engagement.test.ts` (full file). Copy the harness:
`createTestApp`, `getAuthToken(app, "admin@test.com", "adminpass123")`, `cleanAllTestData(app)` in
`beforeEach`, branch setup (AR `TEST` + ES `TESTES` for cross-country scope, lines 41-56),
`subscriptionPlans` insert in `beforeEach` (lines 64-73), and the `createMember` helper using
`registerUser` (lines 76-90). Each new metric gets its own describe block. Finance/retention tests
also clean `financial_transactions`/`transaction_links`/`balances` (NOTES-FROM-117 §detalles —
`cleanAllTestData` should already cover these; verify). Test against real values to catch
enum-string bugs (FINDINGS #2: `'confirmed'` vs `'confirmado'`). Assert per-currency separation and
divide-by-zero guards explicitly.

---

## Shared Patterns

### Scope (branch/country) — ALL new queries

**Source:** `el-templo-api/src/modules/analytics/scope.ts` lines 55-75 (`applyScope`).
**Apply to:** every query in funnel/retention/advanced-finance services. Append-only; never relaxes
a filter. `branchColumn` differs per table (`users.branchId`, `subscriptions.branchId`).

### Canonical "active" predicate — ARPU denominator + "activos del mes"

**Source:** `el-templo-api/src/modules/shared/active-member.ts` lines 27-35.
**Apply to:** advanced-finance ARPU denominator, any active-member count. NEVER `users.status`.

### Multi-currency split (ARS/EUR never summed)

**Source:** `analytics/service.ts` `getRevenueTrend` lines 1005-1069 + `getOutstandingByCurrency`
lines 1220-1260; types `RevenueByCurrency`/`MonetaryKpiByCurrency` (`types.ts` 26-39, 219-251);
frontend `FinanzasTab.vue` lines 163-230.
**Apply to:** caja, devengado, ARPU (backend + all finance frontend).

### Admin-only authorization

**Source:** `analytics/routes.ts` lines 39-49 (`requireAdminAnalytics`).
**Apply to:** all 118 endpoints (funnel, retención, caja/devengado/ARPU) via `preHandler` —
`ADMIN_ROLES` only, never `ANALYTICS_OPERATIONAL_ROLES`.

### Status-history write (forward-only, dedupe on from==to)

**Source:** `subscriptions/service.ts::recomputeUserStatus` lines 4203-4224.
**Apply to:** new hooks in `members/service.ts` (prueba) and `members/routes.ts` (inactivo, admin
flips with `source='admin'`).

### Domain-service shell (constructor DI, Phase 56 convention)

**Source:** `attendance-metrics-service.ts` lines 26-53 / `engagement-service.ts` lines 30-57.
**Apply to:** all 3 new services. NEVER add to `analytics/service.ts` (v4.9 split).

### Frontend chart conventions

**Source:** `FinanzasTab.vue` (registration lines 99-118, fixed 300px wrapper lines 13-23, options
144-145), `chart-colors.ts`, `format-price.ts`.
**Apply to:** all 3 new tab components.

---

## No Analog Found

No file lacks an analog. The phase-117 analytics module covers every role and data flow. The only
genuinely new logic without a direct in-codebase template is:

| Concern                                         | Role                | Reason                                                                                               | Mitigation                                                                                                                                                   |
| ----------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prorated accrued revenue math (D-07)            | service (transform) | No prorated-by-window aggregation exists yet; closest is the flat per-month sum in `getRevenueTrend` | Copy the multi-currency GROUP-BY skeleton from `getRevenueTrend`; the proration arithmetic + null/0/end<start guard is net-new (RESEARCH.md / D-07 guidance) |
| Cohort-cycle streak with 30-day gap (D-04/D-05) | service (cohort)    | No consecutive-cycle streak logic in the codebase                                                    | Read `subscriptions` ordered per member; the gap/streak logic is net-new but uses standard Drizzle + the exported constant                                   |

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/analytics/`, `el-templo-api/src/modules/shared/`,
`el-templo-api/src/modules/subscriptions/`, `el-templo-api/src/modules/members/`,
`el-templo-api/src/db/schema/`, `el-templo-api/test/analytics/`,
`el-templo-admin/src/components/analytics/`, `el-templo-admin/src/pages/`,
`el-templo-admin/src/composables/`, `el-templo-admin/src/utils/`.
**Files scanned:** ~22 read in full or targeted.
**Pattern extraction date:** 2026-05-26
