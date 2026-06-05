# Phase 132: Exponer las 6 métricas de gestión v5.0 en el admin + limpiar deprecadas - Pattern Map

**Mapped:** 2026-06-05
**Files analyzed:** 13 (8 frontend create/modify, 3 backend modify, 2 contradiction flags)
**Analogs found:** 13 / 13 (every file has a strong in-repo analog)

## File Classification

### Frontend (`el-templo-admin`, Quasar + Vue 3)

| New/Modified File                                                                  | Role                    | Data Flow                         | Closest Analog                                                                                                               | Match Quality          |
| ---------------------------------------------------------------------------------- | ----------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `components/analytics/ConversionTab.vue` (new — Funnel de prueba)                  | component (tab)         | request-response                  | `components/analytics/FunnelTab.vue`                                                                                         | role+flow exact        |
| `components/analytics/RetencionGestionTab.vue` (new — Churn + Renovación)          | component (tab)         | request-response                  | `components/analytics/RetencionTab.vue`                                                                                      | role+flow exact        |
| `components/analytics/FrecuenciaTab.vue` (new — bandas + lista enfriándose + CSV)  | component (tab)         | request-response + file-I/O (CSV) | `components/analytics/MiembrosTab.vue` (table + router-link + WhatsApp) + `components/reports/TrialSessionsReport.vue` (CSV) | role-match (2 analogs) |
| `components/analytics/IngresosTab.vue` (new — Ticket + LTV)                        | component (tab)         | request-response                  | `components/analytics/FinanzasAvanzadasTab.vue` (per-currency blocks)                                                        | role+flow exact        |
| `pages/AnaliticasPage.vue` (modify — +4 tabs, +plan/turno filters, −FunnelTab tab) | page (orchestrator)     | request-response                  | itself (existing tab wiring)                                                                                                 | self                   |
| `composables/useAnalyticsApi.ts` (modify — +6 methods)                             | composable (API client) | request-response                  | `getRetention` / `getAdvancedFinance` in same file                                                                           | self                   |
| `types/analytics.ts` (modify — +6 output shapes, +planId/turno filters)            | types                   | n/a                               | existing `FunnelAnalytics` / `AdvancedFinanceAnalytics` interfaces                                                           | self                   |
| `components/analytics/MiembrosTab.vue` (modify — D-15/D-18 delete cards)           | component (tab)         | request-response                  | self                                                                                                                         | self                   |
| `components/analytics/FinanzasAvanzadasTab.vue` (modify — D-16 delete ARPU card)   | component (tab)         | request-response                  | self                                                                                                                         | self                   |
| `components/analytics/FunnelTab.vue` (DELETE — D-17)                               | component (tab)         | n/a                               | n/a                                                                                                                          | delete                 |
| `components/analytics/AsistenciaTab.vue` (D-19 — see CONTRADICTION)                | component (tab)         | n/a                               | n/a                                                                                                                          | **blocked**            |

### Backend (`el-templo-api`, Fastify + Drizzle, NO migrations)

| Modified File                                                                                                   | Role                | Data Flow        | Closest Analog                                    | Match Quality   |
| --------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------- | ------------------------------------------------- | --------------- |
| `analytics/frequency-service.ts` (D-12 — enrich `coolingDown[]` with name+phone)                                | service             | CRUD (read)      | `activeMemberPopulation` join in same file        | self            |
| `analytics/ticket/churn/renewal/ltv/trial-funnel-service.ts` (D-10 — planId filter; +turno on funnel/frequency) | service             | CRUD (read)      | `applyScope` consumers + retention-service planId | self + scope.ts |
| `analytics/routes.ts` (D-10 — widen Querystring + filters per endpoint)                                         | route               | request-response | `/retention` route (already has `planId`)         | self            |
| `analytics/schemas.ts` (D-10 — add planId/turno to 6 querystrings)                                              | config (validation) | n/a              | `retentionSchema` / `churnSchema` (window param)  | self            |

---

## Pattern Assignments

### `components/analytics/ConversionTab.vue` (component, request-response)

**Analog:** `el-templo-admin/src/components/analytics/FunnelTab.vue`

This is the closest analog by role AND data flow: a chart.js funnel tab driven by `props.data | null` + `props.loading`, fed from the parent page. NOTE: the analog is the OLD freemium funnel (being deleted by D-17). The new tab consumes the NEW `/trial-funnel` endpoint (`reservó → asistió → compró`) and surfaces `tasaCierre` as the star rate (D-06). Copy the chart wiring + skeleton/empty-state structure, NOT the cohort math.

**Props + chart.js registration pattern** (FunnelTab.vue lines 86-116):

```typescript
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { Bar } from "vue-chartjs";
import { COLORS } from "src/utils/chart-colors";
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

const props = defineProps<{
  data: FunnelAnalytics | null;
  loading: boolean;
  entryOrigin: FunnelEntryOrigin; // ← replace with the new filter inputs
}>();
```

**Loading / empty-state pattern** (FunnelTab.vue lines 46-55) — REUSE verbatim, swap copy to the UI-SPEC funnel empty-state ("No hay sesiones de prueba en el periodo seleccionado"):

```vue
<div v-if="props.loading" class="q-pa-md">
  <q-skeleton type="rect" height="300px" class="q-mb-md" />
  <q-skeleton type="rect" height="120px" />
</div>
<div
  v-else-if="!props.data || props.data.cohorts.length === 0"
  class="text-center q-pa-xl text-grey-5 text-italic"
>
  Aún no hay cohortes con datos de conversión en este alcance
</div>
```

**Horizontal funnel bar pattern** (FunnelTab.vue lines 58-65, 200-223) — the descending-width embudo (D-06) uses `indexAxis: 'y'` so bars are horizontal:

```vue
<div style="height: 300px; position: relative">
  <Bar :data="funnelChartData" :options="funnelOptions" />
</div>
```

```typescript
const funnelOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y" as const,
  plugins: { legend: { display: false } /* tooltip ... */ },
  scales: { x: { beginAtZero: true } },
}));
```

**Star rate (`text-h4`) pattern** (FunnelTab.vue lines 71-78) — the median-cards block is the analog for the dominant `tasaCierre` headline. Use `text-h3`/`text-h4 text-primary` (D-06):

```vue
<div class="text-center q-pa-sm">
  <div class="text-h4 text-primary">{{ card.value }}</div>
  <div class="text-caption text-grey-7">{{ card.label }}</div>
</div>
```

---

### `components/analytics/RetencionGestionTab.vue` (component, request-response)

**Analog:** `el-templo-admin/src/components/analytics/RetencionTab.vue` (curve + plan filter via `v-model` prop) — NOTE this is the per-cycle retention tab (D-20, CONSERVED, NOT this one). It is the analog for the month-over-month Line chart pattern. Renders churn (D-02, 15d headline + 5/10d comparison) + renovación (D-03, same block + "número vivo" note).

**Two-faces-in-one-block pattern (D-03):** churn + renovación in the same `row q-col-gutter-md` of `<q-card flat bordered>`. Use the headline-stat card pattern from `MiembrosTab.vue` lines 28-46:

```vue
<q-card flat bordered>
  <q-card-section class="text-center">
    <div class="text-caption text-grey-7">Churn (15 días)</div>
    <div class="text-h4 text-negative">{{ churn15.toFixed(1) }}%</div>
  </q-card-section>
</q-card>
```

- Churn headline = `text-h4 text-negative`; 5/10d as `text-caption` secondary (UI-SPEC).
- Renovación headline = `text-h4 text-positive`; the "número vivo" note as `text-caption text-grey-6` inline (UI-SPEC copy contract).

**Month-over-month curve:** register `LineElement`/`PointElement` and use `Line` from `vue-chartjs` (same import shape as FunnelTab's Bar block). Backend shape = `ChurnSeriesPoint[]` (`churn-service.ts` / `types.ts:552`).

**Desglose por sucursal/plan:** `q-table` detail — copy the `q-table` column-def + slot pattern from `MiembrosTab.vue` lines 99-178 / 345-387.

---

### `components/analytics/FrecuenciaTab.vue` (component, request-response + file-I/O)

**Two analogs** — this tab is the most composite.

**Analog A (table + row interactions):** `el-templo-admin/src/components/analytics/MiembrosTab.vue`
**Analog B (CSV export):** `el-templo-admin/src/components/reports/TrialSessionsReport.vue`

**Bandas distribution (Doughnut)** — analog `MiembrosTab.vue` lines 80-90, 307-341:

```vue
<div style="height: 300px; position: relative">
  <Doughnut :data="planDistributionData" :options="doughnutChartOptions" />
</div>
```

```typescript
import { ArcElement } from "chart.js";
import { Doughnut } from "vue-chartjs";
import { COLORS, chartColors } from "src/utils/chart-colors";
ChartJS.register(/* ... */ ArcElement /* ... */);
```

Backend shape = `FrequencyDistributionRow[]` (4 bands, each a `MetricShape` `{ nominal, percentage, n }`).

**Nombre → perfil (D-13)** — router-link to `/alumnos/:userId`. TWO valid analogs:

- `TrialSessionsReport.vue` lines 115-124 (declarative `router-link` in a `q-td` slot):

```vue
<template #body-cell-lead="props">
  <q-td :props="props">
    <router-link
      :to="`/alumnos/${props.row.userId}`"
      class="text-primary text-weight-medium no-underline"
    >
      {{ props.row.lead }}
    </router-link>
  </q-td>
</template>
```

- `MiembrosTab.vue` lines 108-113 + 394-396 (imperative `router.push`):

```typescript
import { useRouter } from "vue-router";
const router = useRouter();
function goToMember(userId: number) {
  router.push(`/alumnos/${userId}`);
}
```

**Teléfono → `tel:` link (D-13)** — NEW pattern (no exact `tel:` analog in repo; `MiembrosTab.vue` line 398-402 uses `wa.me`, the closest contact analog). Render `<a :href="\`tel:${row.phone}\`">`. Phone arrives from the D-12 backend enrichment.

**CSV export (D-14)** — UI-SPEC explicitly says reuse the `downloadBlob` + `URL.createObjectURL` pattern from `TrialSessionsReport.vue` lines 605-637:

```typescript
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

```typescript
// export success notify (copy contract):
$q.notify({
  type: "positive",
  message: "Exportación completada",
  timeout: 1500,
});
```

**KEY DIVERGENCE for the planner:** TrialSessionsReport fetches the CSV from a backend `/export` blob endpoint (`useReportsApi.exportTrialSessions`, responseType `'blob'`). The frequency `coolingDown[]` list is ALREADY in memory (returned by `/frequency` with name+phone after D-12) — there is NO export endpoint and the phase adds no backend route for it. So `FrecuenciaTab.vue` must **build the CSV Blob client-side** from the in-memory rows (`new Blob([csvString], { type: 'text/csv;charset=utf-8;' })`) and feed it to the SAME `downloadBlob` helper. Filename per UI-SPEC: `frecuencia-enfriandose-${YYYY-MM-DD}.csv`.

**Export button** (TrialSessionsReport.vue lines 88-97) — UI-SPEC overrides color to `outline` accent + `icon="download"`:

```vue
<q-btn
  color="primary"
  icon="download"
  label="Exportar CSV"
  :loading="exporting"
  :disable="loading"
  @click="onExport"
/>
```

**Check-in adoption alert (D-04)** — `q-banner` warning per sede with low ratio. Analog for the warning banner = `FunnelTab.vue` lines 21-28 (`q-banner dense rounded`); data = `checkInAdoption: CheckInAdoptionRow[]` (already in the `/frequency` payload, `ratio` < 0.5 → warn). Copy contract: "Adopción de check-in baja en {sede}: ...".

---

### `components/analytics/IngresosTab.vue` (component, request-response)

**Analog:** `el-templo-admin/src/components/analytics/FinanzasAvanzadasTab.vue`

Best analog because it already implements the **per-currency isolation** the UI-SPEC requires for Ticket (D-01) and LTV (D-05): "ARS and EUR in separate blocks/cards. Never sum currencies."

**Currency-presence + per-currency render pattern** (FinanzasAvanzadasTab.vue lines 11-37, 93-110):

```typescript
type CurrencyCode = "ARS" | "EUR";
function currencyHasData(cur: CurrencyCode): boolean {
  /* ... */
}
const renderedCurrencies = computed<CurrencyCode[]>(() => {
  const out: CurrencyCode[] = [];
  if (currencyHasData("ARS")) out.push("ARS");
  if (currencyHasData("EUR")) out.push("EUR");
  if (out.length === 0) out.push("ARS"); // always show the scoped currency
  return out;
});
```

```vue
<div v-for="cur in renderedCurrencies" :key="cur" class="col-12"
     :class="renderedCurrencies.length > 1 ? 'col-md-6' : 'col-md-12'">
```

**Double-headline pattern (D-01 Ticket / D-05 LTV)** — two `text-h4` side by side in `col-6` each. Analog = FinanzasAvanzadasTab.vue lines 49-55 (the ARPU `text-h4 + text-caption` stat, REMOVED by D-16 but its layout is the template):

```vue
<div class="text-center q-pa-sm">
  <div class="text-h4">{{ formatPrice(entry.value, entry.currency) }}</div>
  <div class="text-caption text-grey-7">ARPU mensual ({{ entry.currency }})</div>
</div>
```

- Ticket: `global` (cohorte `listPrice`) + promedio general side by side; `% descuento` / `% $0` shown SEPARATED.
- LTV: `lifetimeHeadlineMonths` + `survivalMedianMonths` both labeled; `projected` vs `observed` side by side, **null-safe → render "—"**.

**`formatPrice` import** (FinanzasAvanzadasTab.vue line 75): `import { formatPrice } from 'src/utils/format-price';`

**Backend shapes:** `TicketAnalytics` (`types.ts:498`, per-currency `TicketCurrencyBlock`) + `LtvAnalytics` (`types.ts:717`, `LtvCurrencyBlock`/`LtvMonetary`). Mirror into `types/analytics.ts`.

---

### `pages/AnaliticasPage.vue` (page, modify)

**Analog:** itself — the existing funnel/retención tab wiring is the exact template for the 4 new tabs.

**Add the 4 tabs (D-07/D-08 order):** the `<q-tabs>` block (lines 136-149) + `<q-tab-panels>` (lines 151-239). Conversión first, then Retención + Asistencia, then Ingresos. Existing tabs (Miembros/Finanzas/Programas/Retención-por-ciclo) REMAIN.

**Per-tab data ref + fetch + lazy-load pattern** (lines 433-439, 554-628) — copy verbatim per new tab:

```typescript
const funnelData = ref<FunnelAnalytics | null>(null);
const loadingFunnel = ref(false);
async function fetchFunnelData() {
  loadingFunnel.value = true;
  try {
    funnelData.value = await analyticsApi.getFunnel({
      ...currentFilters.value,
      entryOrigin: funnelEntryOrigin.value,
    });
  } catch (err: unknown) {
    /* log + null */
  } finally {
    loadingFunnel.value = false;
  }
}
```

```typescript
async function fetchTabData() {
  switch (activeTab.value) {
    case "funnel":
      await fetchFunnelData();
      break;
    // ... add the 4 new cases
  }
}
watch(activeTab, () => {
  fetchTabData();
});
```

**Global filter pattern (D-09):** the country/branch/date filter row (lines 16-90) is the template for the NEW `plan` `q-select` (all 6) and `turno` `q-select` (funnel+frecuencia only). Match styling `dense outlined emit-value map-options` + `@update:model-value="onFilterChange"`. The `currentFilters` computed (lines 409-414) is where `planId` / `turno` get spread:

```typescript
const currentFilters = computed<AnalyticsFilters>(() => ({
  branchId: selectedBranchId.value,
  country: isOwner.value ? selectedCountry.value : undefined,
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
  // + planId: selectedPlanId.value ?? undefined,
  // + turno: selectedTurno.value ?? undefined,  (only passed by funnel/frecuencia fetches)
}));
```

**D-17 deletions in this file:** remove the `<q-tab name="funnel">` (line 147), the `<q-tab-panel name="funnel">` (lines 220-228), the `FunnelTab` import (line 253), `funnelData`/`loadingFunnel`/`funnelEntryOrigin` refs (lines 433/437/447), `fetchFunnelData`/`onFunnelFilterChange` (lines 554-568, 605-607), and the `case 'funnel'` in `fetchTabData`. (The NEW Conversión tab replaces it with a different name to avoid confusion.)

---

### `composables/useAnalyticsApi.ts` (composable, modify)

**Analog:** the `getRetention` / `getAdvancedFinance` methods in the same file (lines 177-210) — copy the method body verbatim per new endpoint.

**Per-method pattern** (lines 177-191):

```typescript
async function getRetention(
  filters: AnalyticsFilters = {},
): Promise<RetentionAnalytics> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<RetentionAnalytics>(
      "/admin/analytics/retention",
      {
        params: buildParams(filters),
      },
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando retencion por ciclos");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Add: `getTicket` → `/admin/analytics/ticket`, `getChurn` → `/churn`, `getRenewal` → `/renewal`, `getLtv` → `/ltv`, `getFrequency` → `/frequency`, `getTrialFunnel` → `/trial-funnel`. Register each in the returned object (lines 217-231).

**`buildParams` extension (D-10):** lines 24-33 already serialize `planId`. ADD `turno` and `window` (frequency/funnel/churn etc. use them):

```typescript
if (filters.planId !== undefined) params.planId = filters.planId; // already present
// + if (filters.turno !== undefined) params.turno = filters.turno;
// + if (filters.window !== undefined) params.window = filters.window;
```

---

### `types/analytics.ts` (types, modify)

**Analog:** existing `FunnelAnalytics` (lines 268-271) / `AdvancedFinanceAnalytics` (lines 353-358) interfaces — mirror the 6 backend output shapes from `el-templo-api/.../analytics/types.ts`:

| Frontend interface to add                                                                                                  | Backend source (`analytics/types.ts`) |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `TicketAnalytics` (+ `TicketCurrencyBlock`, `TicketCohortSplit`, `TicketPlanRow`, ...)                                     | line 498 / 376-478                    |
| `ChurnAnalytics` (+ `ChurnWindowResult`, `ChurnSeriesPoint`, `ChurnSegmentRow`)                                            | line 568 / 524-568                    |
| `RenewalAnalytics` (+ `RenewalSegmentRow`)                                                                                 | line 611 / 596-611                    |
| `LtvAnalytics` (+ `LtvCurrencyBlock`, `LtvMonetary`, `LtvSegmentRow`)                                                      | line 717 / 640-717                    |
| `FrequencyAnalytics` (+ `FrequencyDistributionRow`, `FrequencyCoolingRow`\*, `FrequencySegmentRow`)                        | line 808 / 760-817                    |
| `TrialFunnelAnalytics` (+ `TrialFunnelStageCounts`, `TrialFunnelRates`, `TrialFunnelSeriesRow`, `TrialFunnelBreakdownRow`) | line 901 / 836-912                    |

_\* `FrequencyCoolingRow` gains `name` + `phone` after the D-12 backend enrichment — mirror the new fields here._

**Filter type extension (D-10):** `AnalyticsFilters` (lines 362-378) already has `planId` + `entryOrigin`. ADD `turno?: 'TM' | 'TT'` (mañana/tarde — match the `ShiftFilter` literal already used in `TrialSessionsReport.vue` line 259) and `window?: number`. The `MetricShape` `{ nominal, percentage, n }` envelope (used pervasively by the 6 backends) must also be mirrored — it is NOT yet in `types/analytics.ts`.

---

### `components/analytics/MiembrosTab.vue` (component, modify — D-15 / D-18)

**Self-modify.** Delete:

- **D-15:** the "Renovación 7/14/30 días" cards block (lines 49-66 `<template>`) + `renewalRateCards` computed (lines 251-259). After removal, `props.data.renewalRate` is unused → the `RenewalRate` field can leave `MemberAnalytics` if `getMemberAnalytics` no longer needs it (CONTEXT D-15 "borrar la llamada legacy si queda huérfana"). `getMemberAnalytics` IS still used (AnaliticasPage.vue:521 for Nuevos/Bajas/Distribución counts which are CONSERVED per D-21), so the endpoint stays; only `renewalRate` consumption is removed.
- **D-18:** the "Tasa de retención" card (lines 28-46) — the third stat card in the Nuevos/Bajas row. Keep the Nuevos (lines 12-19) and Bajas (lines 20-27) cards.

---

### `components/analytics/FinanzasAvanzadasTab.vue` (component, modify — D-16)

**Self-modify.** Delete the "ARPU mensual" `<q-card>` (lines 40-57) + the `arpuEntries` computed (lines 163-173). **CONSERVE** the "Caja vs Devengado por mes" chart (lines 11-37) and all its supporting code (`cashVsAccruedData`, `chartOptions`, `renderedCurrencies`, `currencyHasData`). The new Ticket lives in `IngresosTab.vue`, NOT here.

---

## Shared Patterns

### Backend: branch/country scope (already applied to all 6 — frontend just passes filters)

**Source:** `el-templo-api/src/modules/analytics/scope.ts` (`applyScope`)
**Apply to:** all 6 service extensions — the D-10 `planId`/`turno` filters are ADDED as extra `conditions`, NEVER replacing scope.

```typescript
const { conditions: scopeConditions, needsBranchJoin } = applyScope({
  branchId: filters.branchId,
  country: filters.country,
  branchColumn: schema.subscriptions.branchId,
});
const conditions: SQL[] = [
  ...scopeConditions /* + range, + NEW planId/turno */,
];
```

**Plan filter (D-10) precedent:** `/retention` already threads `planId` end-to-end. The plan join already exists in every breakdown (`subscriptionPlans`). The new input filter is `eq(schema.subscriptions.planId, filters.planId)` appended to `conditions` (subscription-based: ticket/churn/renewal/ltv) OR the booked-trial plan join (trial-funnel). **Lesson (121/122):** when `needsBranchJoin` and using `.select()` subqueries, qualify columns with a literal table prefix (see MEMORY `reference_drizzle_select_unqualified_columns`).

**Turno filter (D-10, funnel + frequency only):** funnel buckets turno from `schedules.startTime` (TrialFunnelAxis already has a `turno` axis, `types.ts:828`); frequency from the attended schedule. Mañana 07–10 / Tarde 17–20 (CONTEXT 123 decisions). Ticket/churn/renewal/ltv are per-subscription → turno `q-select` hidden/disabled on those tabs (UI-SPEC).

### Backend: route Querystring + schema widening (D-10)

**Source:** `analytics/routes.ts` `/retention` (lines 312-343) + `/churn` `window` (lines 411-442); `schemas.ts` `retentionSchema`/`churnSchema`.
**Apply to:** the 6 endpoints — widen `Querystring` type + add `planId` (all 6) / `turno` (funnel+frequency) to the filters object + the JSON schema querystring. The `window` param is already wired on churn/renewal/ltv/trial-funnel.

```typescript
fastify.get<{
  Querystring: {
    branchId?: number;
    dateFrom?: string;
    dateTo?: string;
    planId?: number; /* +turno */
  };
}>(
  "/ticket",
  {
    schema: ticketSchema,
    preHandler: [
      requireAdminAnalytics,
      requireBranchAccess({ from: "query.branchId", optional: true }),
    ],
  },
  async (request, reply) => {
    const filters: AnalyticsFilters = {
      branchId: request.query.branchId,
      country: request.scope.country ?? undefined,
      dateFrom: request.query.dateFrom,
      dateTo: request.query.dateTo,
      planId: request.query.planId, // ← NEW
    };
    /* ... */
  },
);
```

### Backend: enrich `coolingDown[]` with name + phone (D-12)

**Source:** `frequency-service.ts` `activeMemberPopulation` (lines 234-292) — it already joins `users`. The enrichment reuses that join: pull `users.firstName`, `users.lastName`, `users.phone` into `ActiveMemberRow`, carry them through `MemberBands`, and emit in `buildCoolingDown` (lines 404-421). `phone` already lives on `users` (CONTEXT D-12). The `EngagementMember` shape (`types.ts`, has `phone`) is the gating precedent — PII is already gated by `requireAdminAnalytics` on `/frequency`.

```typescript
// in the select (analog already selects users.createdAt):
firstName: schema.users.firstName,
lastName: schema.users.lastName,
phone: schema.users.phone,
```

Then `FrequencyCoolingRow` gains `name: string` + `phone: string | null` (mirror in both backend `types.ts` and frontend `types/analytics.ts`, and the `frequencySchema` response schema).

### Frontend: chart.js + colors (all 4 new tabs)

**Source:** `src/utils/chart-colors.ts` (`COLORS`, `chartColors`).
**Apply to:** every new tab. Register only the chart.js elements each tab uses; pull series colors from `COLORS`/`chartColors`, never inline hex (UI-SPEC). Chart container always `style="height: 300px; position: relative"` inside `<q-card flat bordered><q-card-section>`.

### Frontend: error / loading conventions (all 4 new tabs + page)

**Source:** `AnaliticasPage.vue` fetch methods + `TrialSessionsReport.vue`.
**Apply to:** all new fetches.

```typescript
import { createLogger } from "src/utils/logger"; // never console.*
import { extractError } from "src/utils/extract-error";
// on failure: log.error(...) + (in tabs that own a button) $q.notify({ type: 'negative', message: 'Error al cargar las métricas' })
```

Composables expose `cleanup()` and the page calls it in `onUnmounted` (CLAUDE.md composable rule; AnaliticasPage.vue lines 647-650).

---

## No Analog Found

No new file lacks an analog. Two patterns are genuinely NEW (small) and must be authored fresh — both are noted inline above:

| Pattern                         | Where                      | Reason                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tel:` phone link               | `FrecuenciaTab.vue` (D-13) | Repo only has `wa.me` contact links (`MiembrosTab.vue:398`); no `<a href="tel:">` precedent. Trivial.                                                                                                                                      |
| Client-side CSV Blob generation | `FrecuenciaTab.vue` (D-14) | Existing CSV export (`TrialSessionsReport.vue`) fetches a backend `/export` blob; the frequency list is in-memory and gets NO export endpoint this phase, so the Blob is built client-side. The `downloadBlob` + notify pattern IS reused. |

---

## CONTRADICTIONS — planner must resolve before executing

### D-19 (`AsistenciaTab.vue` "orphan") is FALSE

CONTEXT D-19 and UI-SPEC say `AsistenciaTab.vue` is "código muerto de fase 117, nunca renderizado" and should be deleted as hygiene. **It is actively imported and rendered:**

- `el-templo-admin/src/pages/ReportesPage.vue:757` — `import AsistenciaTab from 'src/components/analytics/AsistenciaTab.vue';`
- `el-templo-admin/src/pages/ReportesPage.vue:193` — rendered in the `<q-tab-panel name="asistencia">` (the "Asistencia" operational tab for gestion, Phase 117), wired with `attendanceData` / `uniqueMembersData` / `checkInAdoptionData` props.

Deleting it would break `ReportesPage.vue` and remove a CONSERVED operational view (the Asistencia tab is NOT one of the 6 new metrics; per D-21 operational views stay). **Recommendation: do NOT delete `AsistenciaTab.vue`; flag D-19 to Nacho as based on a stale assumption.** (There may have been a duplicate orphan once, but the current file is live.) Also note `chart-colors.ts:3` documents `AsistenciaTab` as a consumer.

### D-15 legacy `getMemberAnalytics` is NOT orphan-able

CONTEXT D-15 says delete `getMemberAnalytics`/`renewalRate` "si queda huérfana". `getMemberAnalytics` is still consumed by `AnaliticasPage.vue:521` to populate the CONSERVED Miembros counts (Nuevos/Bajas/Distribución per D-21). So: remove only the `renewalRate` rendering in `MiembrosTab.vue` (D-15) and optionally the `renewalRate` field from `MemberAnalytics` + its backend computation if nothing else reads it — but KEEP the `getMemberAnalytics` method and endpoint.

---

## Metadata

**Analog search scope:** `el-templo-admin/src/components/analytics/`, `el-templo-admin/src/components/reports/`, `el-templo-admin/src/composables/`, `el-templo-admin/src/types/`, `el-templo-admin/src/pages/`, `el-templo-api/src/modules/analytics/`
**Files scanned:** ~18 (7 analytics tab components, 2 composables, 2 types files, AnaliticasPage, ReportesPage, TrialSessionsReport, routes.ts, scope.ts, frequency/ticket services)
**Pattern extraction date:** 2026-06-05
