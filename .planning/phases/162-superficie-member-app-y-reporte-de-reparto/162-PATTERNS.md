# Phase 162: Superficie — member app y reporte de reparto - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 15 (new + modified)
**Analogs found:** 15 / 15 (100% — fase brownfield de superficie, cero patrones inéditos)

> Cada archivo de esta fase copia un patrón existente y verificado. El trabajo es **cablear estado que ya existe** (161) a **superficie que ya existe** (grilla, store, dialog, tab de analytics, export XLSX, card de home). No hay mecanismos nuevos que inventar.

---

## File Classification

| New/Modified File                                                      | Role           | Data Flow                   | Closest Analog                                                          | Match Quality       |
| ---------------------------------------------------------------------- | -------------- | --------------------------- | ----------------------------------------------------------------------- | ------------------- |
| `el-templo-api/src/modules/scheduling/service.ts` (MOD)                | service        | request-response            | mismo archivo: `activityMaxCapacity` en `getWeeklyGrid`                 | exact (self-mirror) |
| `el-templo-api/src/modules/scheduling/types.ts` (MOD)                  | model/type     | —                           | `WeeklySlotView` campos existentes (`:54-69`)                           | exact               |
| `el-templo-api/src/modules/scheduling/schemas.ts` (MOD)                | config/schema  | —                           | `weeklySlotViewSchema` (`:57-71`)                                       | exact               |
| `el-templo-api/src/modules/subscriptions/member-routes.ts` (MOD)       | route          | request-response            | `GET /coverage` (`:126-135`) + `GET /me/subscription` (`:56-110`)       | exact               |
| `el-templo-api/src/modules/subscriptions/service.ts` (reuse)           | service        | CRUD                        | `getMemberSubscriptions` plural (`:963`) + `getPlanById`                | reuse (no cambios)  |
| `el-templo-api/src/modules/analytics/especial-report-service.ts` (NEW) | service        | transform/aggregate         | `attendance-metrics-service.ts` (query sobre `attendance`)              | role-match          |
| `el-templo-api/src/modules/analytics/routes.ts` (MOD)                  | route          | request-response + file-I/O | `/churned-members` + `/churned-members/export` (`:539-606`)             | exact               |
| `el-templo-app/src/types/scheduling.ts` (MOD)                          | model/type     | —                           | `WeeklySlotView` mirror (`:15-29`)                                      | exact               |
| `el-templo-app/src/stores/useUserStore.ts` (MOD)                       | store          | request-response            | `loadSubscription` (`:248`) + `hasPresencialReservationAccess` (`:193`) | exact               |
| `el-templo-app/src/pages/ReservasPage.vue` (MOD)                       | component      | request-response            | mismo archivo: `showCoverageDialog` + `confirmReserve` catch (`:1270`)  | exact (self-mirror) |
| `el-templo-app/src/modules/progression/pages/MiTemplo.vue` (MOD)       | component      | —                           | `ReferralCtaCard` (`:22`)                                               | role-match          |
| `el-templo-admin/src/pages/AnaliticasPage.vue` (MOD)                   | component/page | request-response            | tab "Referidos A/B" (commit `de95b69a`)                                 | exact               |
| `el-templo-admin/src/composables/useAnalyticsApi.ts` (MOD)             | composable     | request-response + file-I/O | `getReferralAbResults` + `exportChurnedMembers` (`:293`)                | exact               |
| `el-templo-admin/src/types/analytics.ts` (MOD)                         | model/type     | —                           | `ReferralAbResults` (`:801-821`)                                        | exact               |
| `el-templo-admin/src/components/analytics/EspecialesTab.vue` (NEW)     | component      | —                           | `ReferidosAbTab.vue` + `MiembrosTab.vue` (export + q-table)             | exact               |

**Tests (integration, MySQL real):**

| Test File                                                             | Analog                                                                                 |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `el-templo-api/test/subscriptions/especial-pass-member.test.ts` (NEW) | `test/subscriptions/especial-pass.test.ts` / `especial-consumption.test.ts` (161)      |
| `el-templo-api/test/analytics/especial-report.test.ts` (NEW)          | tests de analytics de fase 121/123 + attendance helpers de 161                         |
| grid member test (EXTEND)                                             | test existente de `getWeeklyGrid` en `test/scheduling/*` — asertar `slots[].isSpecial` |

---

## Pattern Assignments

### `scheduling/service.ts` — exponer `isSpecial` en `getWeeklyGrid` (service, request-response)

**Analog:** mismo archivo, el recorrido de `activityMaxCapacity` (ya presente). Espejar exactamente los 2 puntos de tocado.

**El JOIN a `activities` YA existe** (`service.ts:189-192`) — solo falta seleccionar la columna y propagarla.

**Punto 1 — `.select()` de `scheduleRows` (`service.ts:168-183`)** — agregar junto a `activityMaxCapacity`:

```typescript
activityName: schema.activities.name,
// Phase 155-01 (D-06/D-07): per-slot effective capacity source.
activityMaxCapacity: schema.activities.maxCapacity,
isSpecial: schema.activities.isSpecial,   // ← NUEVO (162 APP-01)
```

**Punto 2 — `slots.push({...})` (`service.ts:299-319`)** — agregar junto a los demás campos derivados:

```typescript
slots.push({
  id: row.id,
  // ... campos existentes ...
  unconfirmedAttendance: 0,
  isSpecial: row.isSpecial, // ← NUEVO
});
```

> **Nota:** `isSpecial` es la columna `is_special` de `activities` (ya usada por `getScheduleSlotRaw` en 161-05, verificado). Drizzle la mapea a `schema.activities.isSpecial`.

---

### `scheduling/types.ts` — `WeeklySlotView` (model/type)

**Analog:** los campos existentes de `WeeklySlotView` (`:54-69`).

**Extracto (`:54-69`)** — agregar el campo con el mismo estilo comentado:

```typescript
export interface WeeklySlotView extends ScheduleSlot {
  bookedCount: number;
  trialCount: number;
  maxCapacity: number;
  isFull: boolean;
  isHoliday: boolean;
  cancelledForDate: boolean;
  exceptionReason: string | null;
  unconfirmedAttendance: number;
  /** Phase 162 (APP-01): actividad especial (activities.is_special) — el app pinta el badge. */
  isSpecial: boolean; // ← NUEVO
}
```

---

### `scheduling/schemas.ts` — `weeklySlotViewSchema` (config/schema) — CRÍTICO

**Analog:** `weeklySlotViewSchema` (`:57-71`). **Sin este paso el badge NUNCA aparece** (fast-json-stringify strippea props no declaradas — Pitfall 2).

**Extracto (`:57-71`)** — agregar dentro de `properties`:

```typescript
const weeklySlotViewSchema = {
  type: "object",
  properties: {
    ...scheduleSlotSchema.properties,
    bookedCount: { type: "integer" },
    trialCount: { type: "integer" },
    maxCapacity: { type: "integer" },
    isFull: { type: "boolean" },
    isHoliday: { type: "boolean" },
    cancelledForDate: { type: "boolean" },
    exceptionReason: { type: ["string", "null"] },
    isSpecial: { type: "boolean" }, // ← NUEVO (o el badge del member se strippea)
  },
} as const;
```

> **Cobertura doble gratis:** `weeklySlotViewSchema` es el `items` tanto del grid admin (`schemas.ts:256`) como del member (`:769`). Un cambio cubre ambas superficies.

---

### `subscriptions/member-routes.ts` — `GET /me/especial-pass` (route, request-response) — NUEVO endpoint

**Analog primario (IDOR + guard):** `GET /coverage` (`:126-135`) — userId server-derived de `request.user`, NUNCA param.
**Analog secundario (forma de respuesta + days remaining):** `GET /me/subscription` (`:56-110`).

**Guard heredado del plugin (`:50-53`)** — no re-agregar, ya cubre todas las rutas:

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  await attachCountryScope(request, fastify.db);
});
```

**Patrón IDOR a copiar (`/coverage`, `:126-135`)** — el userId sale de `request.user`, sin param:

```typescript
fastify.get("/coverage", async (request) => {
  const coveredUntil = await subscriptionService.getCoveredUntil(
    request.user.userId,
  );
  const daysRemaining =
    coveredUntil === null ? null : wholeDaysUntil(coveredUntil);
  return { coveredUntil, daysRemaining };
});
```

**Implementación nueva (RESEARCH Pattern 2)** — usa `getMemberSubscriptions` plural + `categoryGroup` + `getPlanById.requiresPresencial`:

```typescript
fastify.get("/me/especial-pass", async (request) => {
  const subs = await subscriptionService.getMemberSubscriptions(
    request.user.userId,
  );
  const pass = subs.find(
    (s) =>
      categoryGroup(s.planCategory) === "especial" &&
      (s.status === "active" || s.status === "paused"),
  );
  if (!pass) return { hasPass: false };
  const plan = await subscriptionService.getPlanById(pass.planId);
  return {
    hasPass: true,
    classesRemaining: pass.classesRemaining ?? 0,
    classesBudget: pass.classesBudget ?? 0,
    endDate: pass.endDate,
    isSocio: plan?.requiresPresencial ?? false, // requiresPresencial=1 → Socio
  };
});
```

**Dependencias verificadas:**

- `categoryGroup(c)` — `subscriptions/types.ts:39` (`presencial | especial | online`). Usar en vez de `isOnlinePlan` (que aún lumpea especial con online — ver comentario `types.ts:44-51`).
- `getMemberSubscriptions` plural — `service.ts:963`, ya trae `planCategory`, `classesRemaining`, `classesBudget`, `status`, `endDate`.
- `getPlanById(...).requiresPresencial` — `service.ts` (mapPlanRow `:5020`; 161-02 lo agregó a `PlanListItem`).

> **NO extender `/me/subscription` a array** — media app consume el `subscription` singular (gating de entrenamiento, multiBranch, program selector). Endpoint aditivo = cero regresión.

---

### `analytics/especial-report-service.ts` — REP-01 socio/externo (service, transform/aggregate) — NUEVO

**Analog:** `analytics/attendance-metrics-service.ts` — estructura de service que agrega sobre `attendance`.

**Estructura de clase a copiar (`attendance-metrics-service.ts:26-49`):**

```typescript
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { applyScope } from "./scope";

export class AttendanceMetricsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
  // ... métodos que hacen .select().from(schema.attendance).innerJoin(...)
}
```

**Hallazgo crítico (RESEARCH Pattern 6):** `attendance` (`db/schema/attendance.ts:24-55`) NO tiene `subscription_id` — solo `memberId`, `scheduleId`, `sessionDate`, `branchId`, `checkedInAt`. La clasificación socio/externo se deriva del plan `requires_presencial` de la sub especial que **cubre `session_date`**:

```
attendance (mes) ── INNER JOIN schedules ── INNER JOIN activities (is_special = true)
                 ── LEFT JOIN subscriptions (userId, planCategory='especial',
                       startDate <= session_date <= endDate)
                 ── JOIN subscription_plans (requires_presencial)
GROUP BY activity_id, (requires_presencial → 'socio' | 'externo')
```

- `requires_presencial = 1` → **socio**; `= 0` → **externo**.
- **Edge (Open Question 3):** asistencia sin sub especial que cubra la fecha → clasificar por la sub especial más reciente del member, o "sin clasificar". El planner define la regla; el test la fija.

**Índice disponible:** `idx_attendance_schedule_session_date` (`attendance.ts:50-53`) sostiene el JOIN por `scheduleId` + `sessionDate`.

**D-05 (contador subs activas):** conteo separado de subs `especial` activas por origen — misma capa, query sobre `subscriptions` + `subscription_plans.requires_presencial`. Referencia de conteo especial ya existente: `service.ts:1056` (`categoryGroup(s.planCategory) === "especial"`).

---

### `analytics/routes.ts` — endpoints del reporte (route, request-response + file-I/O) — MOD

**Analog exacto:** `/churned-members` (JSON) + `/churned-members/export` (XLSX) (`:539-606`).

**Imports ya presentes (`:24-57`)** — reusar tal cual:

```typescript
import { handleServiceError } from "../shared/error-handler";
import { Workbook } from "exceljs";
import { styleHeaderRow, sendExcelReply } from "../shared/excel";
import { requireBranchAccess } from "../shared/branch-access";
// requireAdminAnalytics definido local en :66
```

**Patrón de ruta protegida + export (extracto `/churned-members/export`, `:546-606`):**

```typescript
fastify.get<{
  Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
}>(
  "/churned-members/export",
  {
    schema: churnedMembersExportSchema,
    preHandler: [
      requireAdminAnalytics,
      requireBranchAccess({ from: "query.branchId", optional: true }),
    ],
  },
  async (request, reply) => {
    try {
      const members = await memberFlowsService.getChurnedMembers(filters);
      const workbook = new Workbook();
      workbook.creator = "El Templo";
      workbook.created = new Date();
      const sheet = workbook.addWorksheet("Bajas");
      sheet.columns = [
        { header: "Miembro", key: "memberName", width: 30 } /* ... */,
      ];
      styleHeaderRow(sheet);
      for (const m of members)
        sheet.addRow({
          /* ... */
        });
      return sendExcelReply(workbook, reply, "bajas");
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "export churned members");
    }
  },
);
```

**Rutas nuevas (RESEARCH):**

- `GET /admin/analytics/especiales?month=YYYY-MM` → JSON (filas por actividad × origen + KPIs D-05). `month` validado por JSON-schema (formato `YYYY-MM`).
- `GET /admin/analytics/especiales/export?month=YYYY-MM` → XLSX via `sendExcelReply(workbook, reply, "especiales")`.

**Columnas del sheet (RESEARCH Code Example):**

```typescript
sheet.columns = [
  { header: "Actividad", key: "activityName", width: 28 },
  { header: "Origen", key: "origin", width: 12 }, // 'Socio' | 'Externo'
  { header: "Asistencias", key: "count", width: 14 },
  { header: "Mes", key: "month", width: 12 },
];
```

> `sendExcelReply` (`shared/excel.ts:29`) ya resuelve content-type, `Content-Disposition` y filename fechado (`especiales-<YYYY-MM-DD>.xlsx`). **No armar el XLSX a mano.**

---

### `el-templo-app/src/types/scheduling.ts` — mirror del frontend (model/type)

**Analog:** los campos de `WeeklySlotView` (`:15-29`).

**Extracto (`:15-29`)** — agregar el campo (el header del archivo aclara "Mirrors API types"):

```typescript
export interface WeeklySlotView {
  id: number;
  // ... campos existentes ...
  isFull: boolean;
  isHoliday: boolean;
  isSpecial: boolean; // ← NUEVO (mirror de scheduling/types.ts)
}
```

> **CI NO typechequea el app.** Correr `vue-tsc --noEmit` local o el badge falla en runtime.

---

### `el-templo-app/src/stores/useUserStore.ts` — capabilities del pase (store)

**Analog:** `loadSubscription` (`:248-270`) para la action; `hasPresencialReservationAccess` (`:193-200`) para las computed.

**Patrón de action a copiar (`loadSubscription`, `:248-263`):**

```typescript
async function loadSubscription() {
  subscriptionLoading.value = true;
  try {
    const response = await api.get<MemberSubscription>(
      "/members/subscription/me/subscription",
    );
    if (response.status === 204 || !response.data) subscription.value = null;
    else subscription.value = response.data;
  } catch {
    subscription.value = null;
  } finally {
    subscriptionLoading.value = false;
  }
}
```

**Patrón de capability a copiar (`hasPresencialReservationAccess`, `:193-200`):**

```typescript
const hasPresencialReservationAccess = computed(() => {
  const sub = subscription.value;
  if (!sub) return false;
  if (
    sub.status !== "active" &&
    sub.status !== "paused" &&
    sub.status !== "scheduled"
  )
    return false;
  return sub.planCategory === "presencial";
});
```

**Nuevo (RESEARCH Pattern 3)** — refs + action + computed del pase, SIN tocar `subscription` singular ni `hasPresencialReservationAccess` (sostienen el resto del app):

```typescript
const especialPass = ref<{
  hasPass: boolean;
  classesRemaining: number;
  classesBudget: number;
  endDate: string | null;
  isSocio: boolean;
} | null>(null);
async function loadEspecialPass() {
  /* GET /members/subscription/me/especial-pass, mismo try/catch que loadSubscription */
}
const hasEspecialPass = computed(() => especialPass.value?.hasPass === true);
const especialClassesRemaining = computed(
  () => especialPass.value?.classesRemaining ?? 0,
);
const hasOnlyEspecialPass = computed(
  () => hasEspecialPass.value && !hasPresencialReservationAccess.value,
);
```

Exportarlos en el return del `defineStore`. Limpiar `especialPass.value = null` en `clearProfile` (`:234-242`).

---

### `el-templo-app/src/pages/ReservasPage.vue` — badge + estados + dialog + gate (component)

**Analog:** el mismo archivo (self-mirror del patrón `COVERAGE_EXPIRED`).

**1. Gate de página (`:707`, empty-state `:55`)** — ampliar para que el externo-solo-pase entre:

```typescript
// actual (:707):
const canReservePresencial = computed(
  () => userStore.hasPresencialReservationAccess,
);
// NUEVO — usar en el v-else-if del empty-state (:55) en lugar de canReservePresencial:
const canAccessGrid = computed(
  () => userStore.hasPresencialReservationAccess || userStore.hasEspecialPass,
);
```

**2. Mensaje informativo APP-03 — patrón `COVERAGE_EXPIRED` (catch de `confirmReserve`, `:1270-1275`):**

```typescript
if (
  axios.isAxiosError(err) &&
  err.response?.data?.code === "COVERAGE_EXPIRED"
) {
  reserveDialog.value.show = false;
  showCoverageDialog.value = true;
  return;
}
```

Espejar con rama para `PASS_REQUIRED` (backend ya lo devuelve, 161-06):

```typescript
if (axios.isAxiosError(err) && err.response?.data?.code === "PASS_REQUIRED") {
  reserveDialog.value.show = false;
  showAuraInfoDialog.value = true; // dialog informativo, sin pago (D-02)
  return;
}
```

**3. Dialog informativo — clon de `showCoverageDialog` (`:610-638`)** con acento dorado y UNA sola acción (sin CTA de compra):

```vue
<q-dialog v-model="showCoverageDialog">
  <q-card class="coverage-dialog">
    <q-card-section class="coverage-dialog__body">
      <q-icon class="coverage-dialog__icon" name="event_busy" size="2.5em" />
      <h3 class="coverage-dialog__title">Necesitás renovar tu membresía</h3>
      <p class="coverage-dialog__text">...</p>
    </q-card-section>
    <q-card-actions class="coverage-dialog__actions">
      <q-btn unelevated no-caps class="coverage-dialog__primary full-width" label="Renovar por WhatsApp" @click="openCoverageWhatsApp" />
    </q-card-actions>
  </q-card>
</q-dialog>
```

Copy exacto del dialog Aura en UI-SPEC §APP-03 (ícono `auto_awesome`, título "Actividades con Aura", body con precios $10.000/$20.000, único botón "Entendido" `v-close-popup`).

**4. Badge por slot** — en la slot-card, junto a `activityName`:

```vue
<q-badge
  v-if="slot.isSpecial"
  class="slot-card__badge--special"
  label="Especial"
/>
```

CSS dorado en UI-SPEC §Color (Aged Gold `#7d6520` sobre `#f5ecd9`; RESERVADO exclusivamente al distintivo especial).

**5. Recargar el pase** — llamar `userStore.loadEspecialPass()` donde hoy se llama `loadGrid()`/`loadSubscription()` (al montar + tras reserva/cancelación) para que el contador x/2 no mienta (Pitfall 3).

> WhatsApp CTA reutiliza `buildWhatsAppUrl` (`openWhatsApp`, `:722-724`). Naming lock (D-01): NUNCA "pase(s)" en UI visible.

---

### `el-templo-app/.../MiTemplo.vue` — card del pase (component)

**Analog:** `ReferralCtaCard` (`:22`) — primera card premium, gateada por condición.

**Extracto (`:21-22`):**

```vue
<!-- Referidos (fase 158): primera card visible — misma estética premium -->
<ReferralCtaCard />
```

Agregar una card análoga (o extender el `info-card` de suscripción existente) visible solo si `userStore.hasEspecialPass`, con ícono `auto_awesome` dorado, label "Actividades con Aura", value "{classesRemaining} de 2 clases este mes". Markup en UI-SPEC §APP-02 ítem 2.

---

### `el-templo-admin/src/pages/AnaliticasPage.vue` — tab "Especiales" (component/page)

**Analog exacto:** tab "Referidos A/B", commit `de95b69a`. Espejar los 5 puntos de tocado:

**1. `<q-tab>` (junto a `:180`):**

```vue
<q-tab name="referidos-ab" label="Referidos A/B" icon="science" />
<!-- NUEVO: -->
<q-tab name="especiales" label="Especiales" icon="auto_awesome" />
```

**2. `<q-tab-panel>` (junto a `:299`):**

```vue
<q-tab-panel name="referidos-ab">
  <ReferidosAbTab :data="referralAbData" :loading="loadingReferralAb" />
</q-tab-panel>
<!-- NUEVO: -->
<q-tab-panel name="especiales">
  <EspecialesTab :data="especialesData" :loading="loadingEspeciales" />
</q-tab-panel>
```

**3. import del componente + del type (junto a `:323`, `:339`).**

**4. refs de estado (junto a `:573-575`):**

```typescript
const referralAbData = ref<ReferralAbResults | null>(null);
const loadingReferralAb = ref(false);
// NUEVO:
const especialesData = ref<EspecialesReport | null>(null);
const loadingEspeciales = ref(false);
```

**5. fetch + switch en `fetchTabData` (`:800-851`):**

```typescript
async function fetchReferralAb() {
  loadingReferralAb.value = true;
  try {
    referralAbData.value = await analyticsApi.getReferralAbResults();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching referral A/B results', { error: message });
    referralAbData.value = null;
  } finally {
    loadingReferralAb.value = false;
  }
}
// ... y en el switch de fetchTabData:
case 'referidos-ab': await fetchReferralAb(); break;
case 'especiales':   await fetchEspeciales(); break;   // ← NUEVO
```

> Ícono `auto_awesome` (coherente con el acento Aura), NO `star` (ya lo usa "Clases").

---

### `el-templo-admin/src/composables/useAnalyticsApi.ts` — getEspecialesReport + exportEspeciales (composable)

**Analog 1 (JSON):** `getReferralAbResults` (commit `de95b69a`, `:387`).

```typescript
async function getReferralAbResults(): Promise<ReferralAbResults> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<ReferralAbResults>(
      "/admin/referrals/ab-results",
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando resultados del A/B test");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

**Analog 2 (blob XLSX):** `exportChurnedMembers` (`:293-308`):

```typescript
async function exportChurnedMembers(
  filters: AnalyticsFilters = {},
): Promise<Blob> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get("/admin/analytics/churned-members/export", {
      params: buildParams(filters),
      responseType: "blob",
    });
    return data as Blob;
  } catch (err: unknown) {
    error.value = extractError(err, "Error exportando bajas");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Agregar `getEspecialesReport(month)` (patrón 1, param `month`) + `exportEspeciales(month)` (patrón 2, `responseType: 'blob'`). Recordar exponerlos en el `return` del composable (`:428-431`) e importar el type nuevo (`:31`).

---

### `el-templo-admin/src/types/analytics.ts` — interfaces del reporte (model/type)

**Analog:** `ReferralAbResults` / `ReferralAbVariantResult` (`:801-821`, commit `de95b69a`):

```typescript
export interface ReferralAbVariantResult {
  variant: "A" | "B";
  exposedMembers: number;
  // ...
}
export interface ReferralAbResults {
  variants: ReferralAbVariantResult[];
}
```

Definir `EspecialesReport` (KPIs socio/externo + filas actividad×origen), espejo del type del API — con el comentario de referencia al type del backend, como el análogo.

---

### `el-templo-admin/src/components/analytics/EspecialesTab.vue` — tab del reporte (component) — NUEVO

**Analog 1 (estructura props/loading/skeleton):** `ReferidosAbTab.vue` (completo).

```vue
<script setup lang="ts">
import { computed } from "vue";
import type { ReferralAbResults } from "src/types/analytics";
const props = defineProps<{
  data: ReferralAbResults | null;
  loading: boolean;
}>();
</script>
```

Header (`text-h6` + `text-caption` descriptivo), bloque `v-if="loading"` con `q-skeleton`, `v-else-if="data"`, `v-else` "Sin datos todavía." — copiar la estructura de `ReferidosAbTab.vue:4-79`.

**Analog 2 (q-table + export blob):** `MiembrosTab.vue` — `churnedColumns` (`:502`) y `onExportChurned` (`:477-500`):

```typescript
async function onExportChurned() {
  exportingChurned.value = true;
  try {
    const blob = await analyticsApi.exportChurnedMembers({
      branchId: props.branchId,
      ...range,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bajas-${churnedMonth.value}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    $q.notify({
      type: "negative",
      message: extractError(err, "Error exportando bajas"),
    });
  } finally {
    exportingChurned.value = false;
  }
}
```

El export nuevo usa `a.download = \`especiales-${month}.xlsx\``. Contenido del tab (KPIs socio/externo, tabla sin montos, selector de mes, empty state) en UI-SPEC §"Component Contract — Admin (REP-01)".

---

## Shared Patterns

### Export XLSX (cross-cutting: API)

**Source:** `el-templo-api/src/modules/shared/excel.ts` (`styleHeaderRow`, `sendExcelReply`)
**Apply to:** `analytics/routes.ts` (endpoint `/especiales/export`)

```typescript
const workbook = new Workbook();
workbook.creator = "El Templo";
workbook.created = new Date();
const sheet = workbook.addWorksheet("Especiales");
sheet.columns = [
  /* headers */
];
styleHeaderRow(sheet);
for (const r of rows) sheet.addRow(r);
return sendExcelReply(workbook, reply, "especiales");
```

### Guard admin analytics + branch scope (cross-cutting: API)

**Source:** `analytics/routes.ts:66` (`requireAdminAnalytics`) + `shared/branch-access.ts` (`requireBranchAccess`)
**Apply to:** ambas rutas del reporte REP-01

```typescript
preHandler: [
  requireAdminAnalytics,
  requireBranchAccess({ from: "query.branchId", optional: true }),
];
```

### IDOR mitigation — userId server-derived (cross-cutting: API)

**Source:** `subscriptions/member-routes.ts:126-135` (`/coverage`)
**Apply to:** `GET /me/especial-pass` — NUNCA aceptar un userId param; siempre `request.user.userId`.

### Error de reserva tipado por `code` (cross-cutting: app)

**Source:** `ReservasPage.vue:1270` (`axios.isAxiosError(err) && err.response?.data?.code === '...'`)
**Apply to:** rama `PASS_REQUIRED` del catch de `confirmReserve`.

### Tab lazy en Analíticas (cross-cutting: admin)

**Source:** commit `de95b69a` (4 archivos: `AnaliticasPage.vue` + `useAnalyticsApi.ts` + `types/analytics.ts` + `components/analytics/ReferidosAbTab.vue`)
**Apply to:** tab "Especiales" — mismos 4 archivos + reutilizar `MiembrosTab`/`ReferidosAbTab` como estructura.

### `categoryGroup` para rutear categoría (cross-cutting: API)

**Source:** `subscriptions/types.ts:39` — `categoryGroup(c): 'presencial' | 'especial' | 'online'`
**Apply to:** filtro de la sub especial en `/me/especial-pass` y en el reporte. **NO usar `isOnlinePlan`** (lumpea especial con online — `types.ts:44-51`).

---

## No Analog Found

Ninguno. Los 15 archivos tienen un análogo concreto en el codebase (la mayoría exactos o self-mirror). Esta fase es 100% "cablear estado existente a superficie existente".

Los tres puntos de decisión residuales NO son "falta de análogo" sino Open Questions de diseño que el planner resuelve (documentadas en RESEARCH §Open Questions):

1. Endpoint nuevo vs extender `/me/subscription` (recomendado: nuevo, análogo `/coverage`).
2. Externo-solo-pase: grilla completa con gating por slot vs filtrada (recomendado: completa; UI-SPEC E5 propone ocultar regulares client-side).
3. REP-01: regla de fallback para asistencia sin sub que cubra la fecha (el test la fija).

---

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/{scheduling,subscriptions,analytics,shared}`
- `el-templo-app/src/{pages,stores,types,modules/progression/pages}`
- `el-templo-admin/src/{pages,composables,types,components/analytics}`
- Commit `de95b69a` (patrón "tab nuevo en Analíticas")

**Files scanned:** ~18 (todos leídos en rangos targeted, sin re-lecturas)
**Pattern extraction date:** 2026-07-14
