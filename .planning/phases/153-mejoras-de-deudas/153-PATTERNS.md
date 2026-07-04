# Phase 153: Mejoras de Deudas - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 13 new/modified files
**Analogs found:** 12 / 13 (1 partial: VencidosTab no tiene analog exacto de UI, pero DeudasReport cubre el 90%)

## File Classification

| New/Modified File                                                                    | Role        | Data Flow        | Closest Analog                                                                                                     | Match Quality                      |
| ------------------------------------------------------------------------------------ | ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `el-templo-admin/src/constants/deudas.ts` (NEW)                                      | config      | —                | `el-templo-admin/src/constants/caja.ts`                                                                            | exact                              |
| `el-templo-admin/src/pages/DeudasPage.vue` (MOD → hub de 3 tabs)                     | page        | request-response | `el-templo-admin/src/pages/CajaPage.vue`                                                                           | exact                              |
| `el-templo-admin/src/components/deudas/PorSocioTab.vue` (NEW, extraído)              | component   | request-response | cuerpo actual de `DeudasPage.vue`                                                                                  | exact (es el mismo código, movido) |
| `el-templo-admin/src/components/deudas/PorDeudaTab.vue` (MOVE de `DeudasReport.vue`) | component   | request-response | `el-templo-admin/src/components/DeudasReport.vue`                                                                  | exact (se muda, no se reescribe)   |
| `el-templo-admin/src/components/deudas/VencidosTab.vue` (NEW)                        | component   | request-response | `DeudasReport.vue` (tabla+filtros, sin export ni buckets)                                                          | role-match                         |
| `el-templo-admin/src/pages/ReportesPage.vue` (MOD, pierde tab deudas)                | page        | request-response | sí mismo (4 puntos de remoción abajo)                                                                              | exact                              |
| `el-templo-admin/src/config/templo-config.ts` (MOD, roles por tab)                   | config      | —                | sí mismo (`DEUDAS_ROLES` / `REPORTES_ROLES`)                                                                       | exact                              |
| `el-templo-admin/src/composables/useTransactionsApi.ts` (MOD, fetch vencidos)        | composable  | request-response | `getOutstandingBalances` en el mismo archivo                                                                       | exact                              |
| `el-templo-api/src/modules/reports/service.ts` (MOD: enriquecer OB + query vencidos) | service     | CRUD (read)      | sí mismo (`getOutstandingBalances` + `deriveEffectiveDateAndLabelOB`) + `analytics/service.ts` (predicado overdue) | exact                              |
| `el-templo-api/src/modules/reports/routes.ts` (MOD: endpoint vencidos)               | route       | request-response | ruta `/outstanding-balances` en el mismo archivo                                                                   | exact                              |
| `el-templo-api/src/modules/reports/schemas.ts` (MOD)                                 | config      | —                | `outstandingBalancesSchema`                                                                                        | exact                              |
| `el-templo-api/src/modules/reports/types.ts` (MOD)                                   | model/types | —                | `OutstandingBalanceRow` y afines                                                                                   | exact                              |
| `el-templo-api/test/reports/expired-members.test.ts` (NEW) + extensión de OB tests   | test        | request-response | `el-templo-api/test/reports/outstanding-balances.test.ts`                                                          | exact                              |

**Nota de diseño (Claude's Discretion resuelta por analog):** el endpoint de vencidos debe vivir en `modules/reports/` — el plugin ya tiene el guard `CAJA_ROLES` (gestion/admin/owner) a nivel `onRequest`, con lo que el 403 de coach exigido por D-12 sale gratis (149 D-04: la seguridad vive en la API). `modules/coach/` queda intacto. Enriquecer "Por deuda" = extender el `getOutstandingBalances` de reports (mismo endpoint, campos nuevos), no endpoint nuevo.

---

## Pattern Assignments

### `el-templo-admin/src/constants/deudas.ts` (NEW — config de tabs)

**Analog:** `el-templo-admin/src/constants/caja.ts` (46 líneas, fase 141/152) — copiar entero adaptando nombres.

**Patrón completo** (`constants/caja.ts:21-45`):

```typescript
export const CAJA_TABS = {
  pendientes: 'pendientes',
  saldos: 'saldos',
  transacciones: 'transacciones',
  movimientosCaja: 'movimientosCaja',
  cuentas: 'cuentas',
} as const;

export type CajaTab = (typeof CAJA_TABS)[keyof typeof CAJA_TABS];

/** Landing tab (Phase 152 / D-01): Movimientos de caja is the portada. */
export const CAJA_DEFAULT_TAB: CajaTab = CAJA_TABS.movimientosCaja;

export const CAJA_TAB_NAMES: readonly CajaTab[] = [
  CAJA_TABS.movimientosCaja,
  CAJA_TABS.pendientes,
  ...
];
```

Para Deudas: `DEUDAS_TABS = { porSocio, porDeuda, vencidos }`, `DEUDAS_DEFAULT_TAB = porSocio` (D-03). Los nombres de tab son el contrato `?tab=`.

---

### `el-templo-admin/src/pages/DeudasPage.vue` (MOD — hub de 3 tabs)

**Analog:** `el-templo-admin/src/pages/CajaPage.vue` (133 líneas, fase 152) — el patrón de hub de tabs canónico del admin.

**Template: q-tabs + q-tab-panels con componentes hijos** (`CajaPage.vue:26-74`):

```vue
<q-tabs
  v-model="activeTab"
  align="left"
  active-color="primary"
  indicator-color="primary"
  dense
  class="text-grey-7"
>
  <q-tab :name="CAJA_TABS.movimientosCaja" label="Movimientos de caja" icon="swap_horiz" />
  <q-tab :name="CAJA_TABS.pendientes" label="Pendientes" icon="inbox" />
  ...
</q-tabs>

<q-separator />

<q-tab-panels
  v-model="activeTab"
  keep-alive
  :swipeable="false"
  class="bg-transparent"
>
  <q-tab-panel :name="CAJA_TABS.pendientes" class="q-px-none">
    <BandejaPendientesTab :selected-country="selectedCountry" :is-owner="isOwner" ... />
  </q-tab-panel>
  ...
</q-tab-panels>
```

Cada tab es un componente en `src/components/caja/*Tab.vue` que recibe props del hub — replicar con `src/components/deudas/*Tab.vue`.

**Tab model sincronizado a `?tab=`** (`CajaPage.vue:117-132`):

```typescript
function tabFromQuery(): CajaTab {
  const q = route.query.tab;
  if (
    typeof q === "string" &&
    (CAJA_TAB_NAMES as readonly string[]).includes(q)
  ) {
    return q as CajaTab;
  }
  return CAJA_DEFAULT_TAB;
}

const activeTab = ref<CajaTab>(tabFromQuery());

// Persist the active tab to the URL without polluting history (replace).
watch(activeTab, (tab) => {
  if (route.query.tab !== tab) {
    void router.replace({ query: { ...route.query, tab } });
  }
});
```

**Gating por rol en el hub** (`CajaPage.vue:98` — mismo store/patrón para D-12):

```typescript
const authStore = useAuthStore();
const isOwner = computed(() => authStore.user?.role === "owner");
```

Para D-12: computar visibilidad de tabs con el rol del `useAuthStore` contra un role-set de `templo-config.ts` (ver Shared Patterns). El coach solo ve "Por socio"; `tabFromQuery()` debe caer a `DEUDAS_DEFAULT_TAB` si el tab pedido no es visible para el rol (no solo si no existe).

---

### `el-templo-admin/src/components/deudas/PorSocioTab.vue` (NEW — extracción)

**Analog:** el cuerpo actual de `el-templo-admin/src/pages/DeudasPage.vue` (113 líneas) — mover verbatim, **sin cambios de columnas** (D-01). El precedente exacto es la fase 152: "Transacciones — verbatim migration of the previous CajaPage body" (`CajaPage.vue:60-63`).

**Data-fetch actual a preservar** (`DeudasPage.vue:53-60, 91-104`):

```typescript
import {
  useCoachApi,
  type CoachOutstandingBalanceRow,
} from "src/composables/useCoachApi";
const { loading, error, getOutstandingBalances } = useCoachApi();

async function reload() {
  try {
    const params =
      search.value.trim().length > 0 ? { search: search.value } : {};
    const result = await getOutstandingBalances(params);
    rows.value = result.rows.map((r) => ({
      ...r,
      // q-table needs a stable unique key — same member can appear once per
      // currency, so combine both.
      rowKey: `${r.memberId}-${r.currency}`,
    }));
  } catch (err) {
    log.error("Failed to load coach outstanding balances", err);
  }
}
```

Sigue pegándole a `/admin/coach/outstanding-balances` (proyección mínima, D-12: ese endpoint NO gana campos).

---

### `el-templo-admin/src/components/deudas/PorDeudaTab.vue` (MOVE — `DeudasReport.vue`)

**Analog:** `el-templo-admin/src/components/DeudasReport.vue` (364 líneas) — se muda con export Excel, buckets y "Cargar más" incluidos (D-02). Su interfaz de props actual (`DeudasReport.vue:141-148`):

```typescript
interface Props {
  branchOptions: BranchOption[];
  displayCurrency: "ARS" | "EUR";
  countryScope: "AR" | "ES" | undefined;
  isOwner: boolean;
}
```

Hoy `ReportesPage.vue` se las provee (líneas 524-529: `deudasBranchOptions`, `displayCurrency`, `countryScope`, `isOwner`). El nuevo hub `DeudasPage.vue` deberá proveer equivalentes — ver cómo ReportesPage arma `branchOptions` o replicar el patrón country-selector de `CajaPage.vue:100-106`.

**Columnas nuevas (DEUDA-01/02/03):** agregar a la lista de `columns` (`DeudasReport.vue:188-252`) las columnas Motivo (`reasonLabel`) y Fecha de registro (`registeredAt` = `balances.createdAt`), y la nota libre en tooltip (D-11) siguiendo el patrón de slot ya usado:

```vue
<template #body-cell-fechaDevengo="props">
  <q-td :props="props">
    {{ formatDate(props.row.effectiveDate) }}
  </q-td>
</template>
```

**Fetch + paginación + bucket totals** (`DeudasReport.vue:278-313`) y **export por Blob** (`DeudasReport.vue:339-363`) quedan como están.

---

### `el-templo-admin/src/components/deudas/VencidosTab.vue` (NEW)

**Analog (role-match):** `DeudasReport.vue` — misma estructura q-table + filtros + no-data slot, PERO sin monto (D-06), sin buckets ni export. Columnas: nombre, teléfono, plan vencido, fecha de vencimiento, días transcurridos. Orden default: vencimiento más reciente primero.

**Patrón de tabla read-only con formato de fila** (`DeudasReport.vue:81-117`):

```vue
<q-table
  :rows="items"
  :columns="columns"
  :row-key="rowKey"
  :loading="loading"
  flat
  bordered
  :pagination="{ rowsPerPage: 0 }"
  hide-pagination
>
  <template #no-data>
    <div class="full-width row q-py-md justify-center text-grey-6">
      No hay deudas pendientes
    </div>
  </template>
</q-table>
```

**Patrón de error/log en load** (`DeudasReport.vue:306-312`):

```typescript
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Error desconocido';
  log.error('Failed to load Deudas report', { error: message });
  $q.notify({ type: 'negative', message });
} finally {
  loading.value = false;
}
```

---

### `el-templo-admin/src/pages/ReportesPage.vue` (MOD — remoción)

**Analog:** sí mismo. 5 puntos exactos de remoción:

| Línea   | Qué sacar                                                          |
| ------- | ------------------------------------------------------------------ |
| 63      | `<q-tab name="deudas" label="Deudas" icon="warning" />`            |
| 520-530 | `<q-tab-panel name="deudas">` con `<DeudasReport ... />`           |
| 755     | `import DeudasReport from 'src/components/DeudasReport.vue';`      |
| 858-861 | `const deudasBranchOptions = computed(() => branchOptions.value);` |
| 926     | `'deudas'` en `VALID_TABS`                                         |

**Links rotos ya resueltos por diseño** (`ReportesPage.vue:920-934`): `?tab=deudas` cae al default `'accesos'` automáticamente porque `VALID_TABS` valida antes de setear:

```typescript
const initialTab = (() => {
  const q = route.query.tab;
  return typeof q === "string" && VALID_TABS.includes(q) ? q : "accesos";
})();
```

Opción (discreción): interceptar `tab === 'deudas'` y hacer `router.replace('/deudas?tab=porDeuda')` para redirect explícito.

---

### `el-templo-admin/src/config/templo-config.ts` (MOD — roles por tab)

**Analog:** sí mismo — los role-sets existentes (líneas 51 y 56):

```typescript
/**
 * Deudas: Dueño + Templo override (coach + gestion). Mirrors COACH_DEBTS_ROLES
 * of the API (coach so profes can look up what to collect at the door).
 */
export const DEUDAS_ROLES: AdminRole[] = ["coach", "gestion", "admin", "owner"];

/**
 * Reportes: Dueño + Templo override (gestion). Mirrors CAJA_ROLES of the API.
 */
export const REPORTES_ROLES: AdminRole[] = ["gestion", "admin", "owner"];
```

Patrón a seguir: agregar un set nuevo tipo `DEUDAS_DETAIL_ROLES: AdminRole[] = ['gestion', 'admin', 'owner']` con docstring que diga que **espeja `CAJA_ROLES` de la API** (el guard del plugin reports). Regla de dirección de imports (header del archivo, líneas 4-14): este config importa de `types/admin.ts`, nada del core importa el config — el hub `DeudasPage.vue` sí puede importarlo (como hace el drawer). Recordar el mantra de la línea 12: "The nav only HIDES items — it is NOT security (D-04). The real gate is the API."

---

### `el-templo-admin/src/composables/useTransactionsApi.ts` (MOD — fetch de vencidos)

**Analog:** `getOutstandingBalances` en el mismo archivo (líneas 617-634):

```typescript
async function getOutstandingBalances(
  filters: OutstandingBalancesFilters = {},
): Promise<OutstandingBalancesResult> {
  loading.value = true;
  error.value = null;
  try {
    const { data } = await api.get<OutstandingBalancesResult>(
      "/admin/reports/outstanding-balances",
      { params: filters },
    );
    return data;
  } catch (err: unknown) {
    error.value = extractError(err, "Error cargando deudas");
    throw err;
  } finally {
    loading.value = false;
  }
}
```

Copiar para `getExpiredMembers()` → `GET /admin/reports/expired-members` (o el path que elija el planner dentro de reports). Registrar en el objeto de retorno del composable (líneas 809-810).

---

### `el-templo-api/src/modules/reports/service.ts` (MOD — motivo/período + query de vencidos)

**Analog A — derivación de label por origen** (`reports/service.ts:187-213`), el punto exacto a extender para D-08/D-09:

```typescript
function deriveEffectiveDateAndLabelOB(input: {
  targetKind: "subscription" | "debt_balance";
  targetId: number;
  subscriptionStartDate: string | null;
  planName: string | null;
  balanceCreatedAt: Date | string;
}): { effectiveDate: string; conceptLabel: string } {
  if (
    input.targetKind === "subscription" &&
    input.subscriptionStartDate !== null
  ) {
    const effectiveDate = input.subscriptionStartDate;
    const d = new Date(effectiveDate + "T00:00:00");
    const month = MONTHS_ES_OB[d.getMonth()] ?? "";
    const year = d.getFullYear();
    const planName = input.planName ?? "Plan";
    const conceptLabel = `Mensualidad ${month} ${year} — ${planName}`;
    return { effectiveDate, conceptLabel };
  }
  // fallback debt_balance / orphaned:
  const effectiveDate = created.toISOString().slice(0, 10);
  return { effectiveDate, conceptLabel: "Saldo a regularizar" };
}
```

- **D-09 (período como rango):** agregar `subscriptions.endDate` a la proyección del query (hoy solo trae `startDate`, línea 733) y cambiar el label a `"Cuota {plan} — {dd/mm} al {dd/mm}"`.
- **D-08 (motivo de cobro suelto):** el fallback "Saldo a regularizar" se reemplaza por el `miscReason`/`notes` de la transacción origen. **Cadena de derivación verificada:** `balances` (target_kind='debt_balance', target_id) → `transaction_links` (mismo target_kind+target_id, índice `idx_tx_links_target` en `db/schema/transaction-links.ts:44`) → `financial_transactions.miscReason` (`db/schema/financial-transactions.ts:104`: enum `misc_reason` `sin_plan`/`otro`, solo en `kind='advance_payment'`) + `notes` (línea 97) para el tooltip D-11.
- **D-10 (fecha de registro):** `balances.createdAt` ya viene en la proyección (`balanceCreatedAt`, línea 735) — solo hay que exponerlo como campo propio en la fila.

**Analog B — estructura del query OB** (`reports/service.ts:653-793`): patrón de `conds: SQL[]` + LEFT JOINs condicionados por targetKind + count/rows/totals en 3 queries:

```typescript
const conds: SQL[] = [gt(schema.balances.amount, 0)];
...
.leftJoin(
  schema.subscriptions,
  and(
    eq(schema.balances.targetKind, "subscription"),
    eq(schema.subscriptions.id, schema.balances.targetId),
  ),
)
.leftJoin(schema.subscriptionPlans, eq(schema.subscriptionPlans.id, schema.subscriptions.planId))
.leftJoin(schema.branches, eq(schema.branches.id, schema.subscriptions.branchId))
.leftJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
.where(whereClause)
```

**Analog C — predicado "vencido sin renovar"** (`analytics/service.ts:609-645`, fase 121/117), la base SQL del tab Vencidos (D-04/D-05):

```typescript
const overdueConditions: SQL[] = [
  sql`${schema.subscriptions.endDate} < CURDATE()`,
  sql`${schema.subscriptions.endDate} >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
  // "vencido sin renovar": negate the canonical active predicate so a member
  // who renewed (has an in-effect sub) drops out of the overdue worklist.
  sql`NOT ${activeMemberExists(schema.subscriptions.userId)}`,
  ...scope.conditions,
];

const overdueRows = await this.db
  .select({
    userId: schema.subscriptions.userId,
    firstName: schema.users.firstName,
    lastName: schema.users.lastName,
    planName: schema.subscriptionPlans.name,
    phone: schema.users.phone,
    daysOverdue: sql<number>`DATEDIFF(CURDATE(), ${schema.subscriptions.endDate})`,
    ...
  })
  .from(schema.subscriptions)
  .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
  ...
```

Adaptaciones para 153: ventana 60 días (D-05, no 30), dedup por miembro conservando el vencimiento más reciente (patrón `overdueByUser` Map en `analytics/service.ts:647-669`), y **exclusión de datos sucios** (CONTEXT: ~4260 subs con `end_date < start_date`, todas `cancelled`) — agregar `sql\`${schema.subscriptions.endDate} >= ${schema.subscriptions.startDate}\``o excluir`status='cancelled'`.

**Helper canónico** `activeMemberExists` (`el-templo-api/src/modules/shared/active-member.ts:27-35`) — importar, NUNCA leer `users.status`:

```typescript
export function activeMemberExists(userIdColumn: AnyColumn): SQL {
  return sql`EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = ${userIdColumn}
      AND s.subscription_status IN ('active','paused')
      AND s.start_date <= CURDATE()
      AND (s.end_date IS NULL OR s.end_date >= CURDATE())
  )`;
}
```

**OJO — export Excel duplica la lógica:** `exportOutstandingBalances` (`reports/service.ts:1642-1729`) repite la derivación de `conceptLabel` — si "Por deuda" gana motivo/período/fecha, el export debe ganar las mismas columnas (DRY: extraer la derivación compartida, ya existe como helper `deriveEffectiveDateAndLabelOB` usado por ambos, líneas 762 y 1707).

---

### `el-templo-api/src/modules/reports/routes.ts` (MOD — endpoint de vencidos)

**Analog:** la ruta `/outstanding-balances` en el mismo archivo (líneas 247-293) — copiar estructura entera:

```typescript
fastify.get<{
  Querystring: {
    branchId?: number;
    country?: "AR" | "ES";
    currency?: string;
    search?: string;
    page?: number;
    limit?: number;
  };
}>(
  "/outstanding-balances",
  {
    schema: outstandingBalancesSchema,
    preHandler: [
      requireBranchAccess({ from: "query.branchId", optional: true }),
    ],
  },
  async (request, reply) => {
    try {
      // Owner-aware country resolution (mirrors GET /api/admin/finance/transactions):
      let country: "AR" | "ES" | undefined;
      if (request.scope.isOwner) {
        country = request.query.country;
      } else {
        country = request.scope.country ?? undefined;
      }
      const filters: OutstandingBalancesFilters = { ... };
      return await reportsService.getOutstandingBalances(filters, {
        isOwner: request.scope.isOwner,
      });
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get outstanding balances report");
    }
  },
);
```

El guard de rol NO se declara por ruta: es el hook a nivel plugin (ver Shared Patterns) — cualquier ruta nueva dentro de `reportsRoutes` ya devuelve 403 a coach/recepcion. Prefijo registrado en `app.ts:199-201`: `/api/admin/reports`.

---

### `el-templo-api/src/modules/reports/schemas.ts` + `types.ts` (MOD)

**Analog:** `outstandingBalancesSchema` / `outstandingBalancesExportSchema` (importados en `routes.ts:32-33`) y los tipos `OutstandingBalanceRow`, `OutstandingBalancesFilters`, `OutstandingBalancesResult` (`service.ts:25-27`). Extender la fila con `reasonLabel`/`periodStart`/`periodEnd`/`registeredAt`/`notes` (nombres a discreción del planner) y crear el trío schema/filters/result para vencidos con la misma forma paginada.

---

### `el-templo-api/test/reports/expired-members.test.ts` (NEW) + extensión de OB tests

**Analog:** `el-templo-api/test/reports/outstanding-balances.test.ts` (854 líneas) — el test canónico de esta superficie. Copiar:

**Imports + fixtures** (líneas 25-73):

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const REPORTS_URL = "/api/admin/reports";

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
```

**Setup con re-seed por test** (líneas 321-342):

```typescript
beforeAll(async () => {
  app = await createTestApp();
  const seeded = await seedFixtures(app);
  Object.assign(ctx, seeded);
});

beforeEach(async () => {
  await cleanAllTestData(app);
  await clearLedger(app);
  // re-seed branches (cleanAllTestData wipes them per layer-3 ordering)
  const seeded = await seedFixtures(app);
  Object.assign(ctx, seeded);
  await seedRolesAndPlans(app, ctx);
});
```

**Matriz RBAC** (líneas 346-389) — patrón exacto para el "coach 403" que exige el CONTEXT:

```typescript
it("RBAC1: coach receives 403", async () => {
  const res = await app.inject({
    method: "GET",
    url: `${REPORTS_URL}/outstanding-balances`,
    headers: { authorization: `Bearer ${ctx.coachToken}` },
  });
  expect(res.statusCode).toBe(403);
});
```

**Casos mínimos que pide el CONTEXT** (mapear al catálogo existente: BUCKETS/SORT/FILTER-\*/CROSS-COUNTRY en líneas 415-803):

- vencidos dentro/fuera de ventana 60d (usar `dateOffset(-59)` / `dateOffset(-61)`)
- exclusión de subs con ventana invertida (`end_date < start_date`, `cancelled`)
- socio con deuda Y vencido aparece en ambos endpoints (D-07)
- coach 403 y recepcion 403 en el endpoint nuevo
- motivo derivado por origen: cuota vs suelto `sin_plan` vs suelto `otro` (seed de `financial_transactions.miscReason` + `transaction_links` a `debt_balance`)

---

## Shared Patterns

### Guard de rol a nivel plugin (la seguridad vive en la API — 149 D-04)

**Source:** `el-templo-api/src/modules/reports/routes.ts:53-62`
**Apply to:** todo endpoint nuevo de "Por deuda"/"Vencidos" (heredado automáticamente si viven en reports)

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(CAJA_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso requerido",
    });
  }
  await attachCountryScope(request, fastify.db);
});
```

`CAJA_ROLES` = gestion/admin/owner (`modules/shared/permissions.ts:91-94`); `COACH_DEBTS_ROLES` = coach+gestion+admin+owner (`permissions.ts:115-118`, usado por `coach/routes.ts:24-33` — NO tocar).

### Scoping por rol (coach → branchIds, gestion/admin → country, owner → todo)

**Source:** `el-templo-api/src/modules/coach/service.ts:43-54` (versión completa con coach) y `reports/routes.ts:264-271` (versión owner-aware de reports)
**Apply to:** query de vencidos y cualquier extensión del OB

```typescript
// coach/service.ts — scope completo:
if (scope.role === "coach" && scope.branchIds.length === 0) {
  return { rows: [] };
}
const conds: SQL[] = [gt(schema.balances.amount, 0)];
if (scope.role === "coach") {
  conds.push(inArray(schema.users.branchId, scope.branchIds));
} else if (!scope.isOwner) {
  if (scope.country === null) return { rows: [] };
  conds.push(eq(schema.users.country, scope.country));
}

// reports/routes.ts — resolución owner-aware de country:
let country: "AR" | "ES" | undefined;
if (request.scope.isOwner) {
  country = request.query.country; // owner sin ?country ve TODOS los países
} else {
  country = request.scope.country ?? undefined;
}
```

### Búsqueda por nombre compartida

**Source:** `el-templo-api/src/modules/shared/member-search.ts` — usada idéntica en coach (`coach/service.ts:56-63`) y reports (`reports/service.ts:680-687`)

```typescript
if (filters.search !== undefined && filters.search.trim().length > 0) {
  const searchCond = buildMemberNameSearchCondition(filters.search, {
    includeDni: false,
  });
  if (searchCond !== null) {
    conds.push(searchCond);
  }
}
```

### Manejo de errores en rutas API

**Source:** `el-templo-api/src/modules/reports/routes.ts:284-292` (`handleServiceError` de `../shared/error-handler`)
**Apply to:** todos los handlers nuevos

```typescript
} catch (err: unknown) {
  handleServiceError(err, reply, request.log, "get expired members report");
}
```

### Logging + notify en componentes admin

**Source:** `el-templo-admin/src/components/DeudasReport.vue:306-312` (createLogger + $q.notify, nunca console.\*)
**Apply to:** todos los componentes de tab nuevos

---

## No Analog Found

| File | Role | Data Flow | Reason                                                                                                                                                                                    |
| ---- | ---- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —    | —    | —         | Todos los archivos tienen analog. El único parcial es `VencidosTab.vue` (no existe una tabla "leads sin monto" en el admin), pero `DeudasReport.vue` menos buckets/export/monto lo cubre. |

## Metadata

**Analog search scope:** `el-templo-admin/src/{pages,components,constants,config,composables}`, `el-templo-api/src/modules/{reports,coach,analytics,finance,shared}`, `el-templo-api/src/db/schema`, `el-templo-api/test/reports`, `el-templo-api/src/app.ts`
**Files scanned:** 20 (14 leídos con excerpts, 6 grep-only)
**Pattern extraction date:** 2026-07-04

**Hallazgos clave para el planner (no obvios desde el CONTEXT):**

1. La cadena de derivación D-08 está confirmada: `balances(debt_balance, target_id)` → `transaction_links(target_kind='debt_balance', target_id)` con índice `idx_tx_links_target` → `financial_transactions.miscReason/notes`. No hace falta migración.
2. El OB query de reports hoy NO proyecta `subscriptions.endDate` (solo `startDate`, `service.ts:733`) — D-09 requiere agregarlo a la proyección de `getOutstandingBalances` Y de `exportOutstandingBalances` (líneas 1642-1729, lógica duplicada que debe mantenerse en sync vía el helper compartido).
3. El filtro `branchId`/`country` del OB de reports **excluye filas `debt_balance`** por diseño (LEFT JOIN sin subscription, `service.ts:664-674`) — el enriquecimiento de motivo debe convivir con eso.
4. El guard plugin-level de reports ya resuelve el "coach 403" de D-12 sin código nuevo; el endpoint coach queda intacto.
5. `?tab=deudas` en Reportes ya degrada solo a `'accesos'` por la validación de `VALID_TABS` (`ReportesPage.vue:930-933`) — el redirect explícito a `/deudas` es opcional.
