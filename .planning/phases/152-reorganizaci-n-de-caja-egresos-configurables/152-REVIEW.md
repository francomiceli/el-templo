---
phase: 152-reorganizaci-n-de-caja-egresos-configurables
reviewed: 2026-07-04T15:14:41Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - el-templo-admin/src/components/caja/CategoriaEgresoFormDialog.vue
  - el-templo-admin/src/components/caja/CuentasTab.vue
  - el-templo-admin/src/components/caja/DateRangeFilter.vue
  - el-templo-admin/src/components/caja/MovEgresosTab.vue
  - el-templo-admin/src/components/caja/MovimientosTab.vue
  - el-templo-admin/src/components/caja/RegistrarMovEgresoDialog.vue
  - el-templo-admin/src/components/caja/SaldosPorCajaTab.vue
  - el-templo-admin/src/composables/useTransactionsApi.ts
  - el-templo-admin/src/constants/caja.ts
  - el-templo-admin/src/pages/CajaPage.vue
  - el-templo-admin/src/types/transaction.ts
  - el-templo-admin/src/utils/date-range.ts
  - el-templo-admin/src/utils/validation-status.ts
  - el-templo-api/src/db/migrations/0165_validated_by_and_cost_center_abm.sql
  - el-templo-api/src/db/schema/cost-centers.ts
  - el-templo-api/src/db/schema/financial-transactions.ts
  - el-templo-api/src/modules/finance/cash-register-service.ts
  - el-templo-api/src/modules/finance/routes.ts
  - el-templo-api/src/modules/finance/schemas.ts
  - el-templo-api/src/modules/finance/transaction-service.ts
  - el-templo-api/src/modules/finance/types.ts
  - el-templo-api/test/finance/cost-centers-abm.test.ts
  - el-templo-api/test/finance/validate-caja.test.ts
findings:
  critical: 1
  warning: 5
  info: 8
  total: 14
status: issues_found
---

# Phase 152: Code Review Report

**Reviewed:** 2026-07-04T15:14:41Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Revisión adversarial de la fase 152 (reorganización de Caja + ABM de categorías de egreso + validador denormalizado + filtro por estado + control de fecha compartido). El backend del ABM (service + routes + schemas + tests RBAC/unicidad) está sólido: baja lógica sin DELETE, guard de unicidad pre-write con respaldo de índice único, RBAC ADMIN_ROLES en handler y tests que cubren 409/403/selector-vs-ABM. La migración 0165 respeta la regla de "sin `;` en comentarios SQL" (verificado línea por línea), el backfill desde audit_log es seguro (1 evento por tx garantizado por el guard pendiente→validado) y el orden rename→unique-index es correcto.

Se encontró **1 defecto crítico**: el read path nuevo de D-06 ("Validado al registrar") consume `createdAt` del listado, pero el response schema de `GET /transactions` no declara esa propiedad y fast-json-stringify la **strippea** — la fecha del detalle queda vacía en producción. Además hay 5 warnings: el export Excel del Historial ignora el filtro `estado` nuevo (D-04), el POST de categorías confía en el `country` del body para admins no-owner, el scope por país de saldos/cajas es un no-op server-side para owners, el filtro Tipo de MovEgresos es client-side sobre paginación server-side (contradiciendo el propio criterio D-04 de la fase), y hay drift de timezone (UTC vs ART) en el default del mes.

## Critical Issues

### CR-01: `createdAt` se strippea del response de GET /transactions → la fecha de "Validado al registrar" (D-06) queda vacía

**File:** `el-templo-api/src/modules/finance/schemas.ts:257-293` (+ consumo en `el-templo-admin/src/components/caja/MovimientosTab.vue:394-403`)
**Issue:** El nuevo branch D-06 del detalle del Historial de cobros renderiza `formatDate(detailTransaction.createdAt)` (MovimientosTab.vue:400) y el service lo devuelve (`transaction-service.ts:1231` — `createdAt: r.createdAt.toISOString()`), pero `transactionListItemProperties` en `listTransactionsSchema` **no declara `createdAt`**. Fastify serializa con fast-json-stringify, que **elimina toda propiedad no listada** cuando `additionalProperties` no está en `true` — hecho documentado en este mismo archivo por el comentario de `financialHistorySchema` ("STRIPS unlisted fields by default — without it the entire FinancialTransactionRow is wiped to {}"). Resultado: `detailTransaction.createdAt` llega `undefined` al front, `formatDate(undefined)` lanza dentro del try y devuelve `undefined` → la línea "Validado al registrar · {recorder} · " se muestra **sin fecha**. El test `validate-caja.test.ts` (D-06, líneas 386-401) verifica `validatedAt`/`validatorName` pero nunca asserta `createdAt` en el response del listado, por eso no lo detecta.
**Fix:**

```ts
// schemas.ts — transactionListItemProperties
const transactionListItemProperties = {
  // ...existentes...
  validatedAt: { type: ["string", "null"] },
  validatorName: { type: ["string", "null"] },
  createdAt: { type: "string" }, // ISO timestamp del alta — consumido por D-06
  linkSummary: {
    /* ... */
  },
} as const;
```

Y agregar un assert en `validate-caja.test.ts` (`listRowById`) de que `createdAt` viene no-null en el row del listado.

## Warnings

### WR-01: El export Excel del Historial de cobros ignora el filtro `estado` (D-04) recién agregado

**File:** `el-templo-admin/src/components/caja/MovimientosTab.vue:806-817`, `el-templo-api/src/modules/finance/schemas.ts:557-577`, `el-templo-api/src/modules/finance/routes.ts:876-916`
**Issue:** La fase 152 agregó el filtro server-side `validationStatus` al listado, pero el export quedó desincronizado en las tres capas: `onExportCaja` no pasa `filters.estado`; `exportTransactionsSchema` no acepta `validationStatus` (y con `additionalProperties:false` lo rechazaría con 400 si el front lo mandara); y el handler de `/transactions/export` no lo forwardea a `exportRowsForExcel` (aunque `buildListConditions` ya lo soporta, transaction-service.ts:1651-1658). Un usuario que filtra "Pendientes" y clickea "Exportar Excel" recibe un archivo con **todas** las filas — el export no refleja la vista filtrada. El Excel tampoco tiene columna Estado, aunque la tabla ahora la muestra.
**Fix:** (1) agregar `validationStatus: { type: "string", enum: ["validado", "pendiente"] }` al querystring de `exportTransactionsSchema`; (2) forwardearlo en el handler a `filters`; (3) en `onExportCaja` pasar `validationStatus: filters.estado ?? undefined`; (4) opcional: columna "Estado" en el sheet usando `VALIDATION_STATUS_LABELS_ES` (ya existe en routes.ts:1671).

### WR-02: POST /cost-centers confía en `body.country` para admins no-owner (scope no pinneado en escritura)

**File:** `el-templo-api/src/modules/finance/routes.ts:1204-1224`, `el-templo-admin/src/pages/CajaPage.vue:106`, `el-templo-admin/src/components/caja/CategoriaEgresoFormDialog.vue:104-107`
**Issue:** `ADMIN_ROLES = ["admin", "owner"]` — existe el rol `admin` no-owner, que está country-scoped. Todos los reads del módulo pinnean al non-owner a `request.scope.country` (p.ej. `GET /cost-centers/all`, routes.ts:1305-1312), pero el **create** toma `request.body.country` sin verificarlo contra el scope: un admin de ES puede crear categorías `country: 'AR'`. El front lo agrava: para non-owner el selector de país está oculto y `selectedCountry` queda hardcodeado en `'AR'` (CajaPage.vue:106), así que un admin de ES que crea una categoría la escribe en AR y **no la ve en su propio listado** (que el server pinnea a ES) — creación "fantasma" sin feedback.
**Fix:** En el handler de POST /cost-centers, para non-owner pisar el país con el scope:

```ts
const country = request.scope.isOwner
  ? request.body.country
  : (request.scope.country ?? request.body.country);
const center = await cashRegisterService.createCostCenter(
  request.body.name,
  country,
);
```

(mismo patrón owner-aware que los GET). Agregar un test: admin no-owner ES creando con `country: 'AR'` → la fila queda en ES (o 400).

### WR-03: `listActiveCajasWithBalance` ignora `country` para owners — el selector AR/ES de Saldos y del dialog de movimiento es un no-op server-side

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:315-355`, `el-templo-api/src/modules/finance/routes.ts:1130-1152`
**Issue:** La route resuelve `country` owner-aware y lo pasa en `scope`, pero el service solo lo aplica en la rama `if (scope && !scope.isOwner)` (línea 339). Para un owner, el `?country=` se descarta silenciosamente: `SaldosPorCajaTab` y el selector de cajas de `RegistrarMovEgresoDialog` (que llama `getCashRegisterBalances({ country })`) muestran **todas** las cajas de ambos países sin importar el toggle AR/ES del hub — incluido el export de saldos. Preexistente a 152, pero la fase movió el selector de país al header compartido del hub (D-01), lo que refuerza la expectativa de que TODOS los tabs escopeen igual (el propio comentario de MovimientosTab lo dice: "every tab scopes to the same country"). Riesgo práctico: el owner en AR ve cajas ES en el selector de origen/destino del movimiento (el guard de moneda mitiga, pero cajas EUR↔EUR cruzadas quedan elegibles).
**Fix:** Aplicar el filtro de país también para owner cuando viene definido:

```ts
if (scope) {
  if (!scope.isOwner) {
    if (c.branchId === null) continue;
    if (c.branchCountry !== scope.country) continue;
  } else if (scope.country !== null) {
    // owner con ?country: acotar cajas branch-scoped a ese país
    // (definir si central/banco branch-less se muestran siempre o por moneda)
    if (c.branchId !== null && c.branchCountry !== scope.country) continue;
  }
}
```

### WR-04: Filtro "Tipo" de MovEgresosTab es client-side sobre una lista server-paginada — total y páginas inconsistentes

**File:** `el-templo-admin/src/components/caja/MovEgresosTab.vue:344-389, 360-366, 478-481`
**Issue:** `filteredRows` filtra por `kind` solo sobre la página actual, pero `tablePagination.rowsNumber` sigue siendo el total sin filtrar del server. Con "Egresos" seleccionado, el paginador anuncia N totales mientras la página puede quedar vacía (las filas expense están en otras páginas); además `onFilterChange` al cambiar tipo resetea página y **recarga contra el server**, que ignora el filtro (round-trip inútil). El export de este tab tampoco respeta tipo. Esto contradice el racional que la MISMA fase aplicó al filtro estado del Historial ("un filtro client-side solo cubriría la página actual", transaction-service.ts:1649-1650).
**Fix:** Llevar `tipo` al server como hizo D-04 con `validationStatus`: agregar `kind`/`kinds` opcional a `movementsHistorySchema` + `MovEgresoFilters` + condición en `listMovEgresos` (mapear 'cobros' → `inArray(kind, COBRO_KINDS)`), y pasar el filtro en `loadHistory`/`onExportMovEgresos`. Alternativa mínima: ocultar el paginador/ajustar `rowsNumber` cuando tipo ≠ 'todos' — pero rompe el export igual.

### WR-05: Drift de timezone en el mes default (`toISOString()` = UTC) — el rango inicial salta al mes siguiente después de las 21:00 ART

**File:** `el-templo-admin/src/utils/date-range.ts:27-29`, `el-templo-admin/src/components/caja/DateRangeFilter.vue:90-94`
**Issue:** `currentMonthRange()` y `deriveInitialMonth()` derivan el mes de `new Date().toISOString().slice(0, 7)` — mes **UTC**. En Argentina (UTC-3), del último día del mes a las 21:00-23:59 el ISO ya es el mes siguiente: el Historial y Movimientos de caja abren con el filtro en un mes que "todavía no empezó" y muestran cero filas. El repo ya conoce esta clase de bug: `format-date.ts` normaliza con `T12:00:00` explícitamente "to avoid day-boundary drift (midnight UTC = previous day in UTC-3)". El helper nuevo (extraído en 152) consolida el patrón erróneo en un único lugar compartido por dos tabs.
**Fix:**

```ts
export function currentMonthRange(): DateRangeValue {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return monthToRange(month);
}
```

y en `deriveInitialMonth()` usar el mismo cálculo local en el fallback.

## Info

### IN-01: El comentario de `listTransactionsSchema` afirma un passthrough que no existe (causa raíz de CR-01)

**File:** `el-templo-api/src/modules/finance/schemas.ts:318-324`
**Issue:** "additionalProperties intentionally omitted (Fastify defaults to passthrough for response serialization)" es falso — fast-json-stringify strippea lo no declarado, como documenta correctamente el comentario de `financialHistorySchema` (líneas 448-455) en el mismo archivo. Los dos comentarios se contradicen; el incorrecto es el que indujo CR-01.
**Fix:** Corregir el comentario: con un objeto 200 declarado, solo sobreviven las propiedades listadas; passthrough real requiere `additionalProperties: true` o no declarar el 200.

### IN-02: Comentario stale en CajaPage — "landing = Pendientes (D-01)"

**File:** `el-templo-admin/src/pages/CajaPage.vue:113`
**Issue:** La fase 152 (D-01) cambió la portada a `movimientosCaja` (el código y `constants/caja.ts:32` lo reflejan), pero el comentario del bloque Tab model sigue diciendo "landing = Pendientes (D-01)".
**Fix:** Actualizar a "landing = Movimientos de caja (152 D-01)".

### IN-03: Etiquetas de kind duplicadas e inconsistentes entre tabs

**File:** `el-templo-admin/src/components/caja/MovimientosTab.vue:485-491` vs `MovEgresosTab.vue:288-296` vs `el-templo-api/src/modules/finance/routes.ts:1659-1668`
**Issue:** `advance_payment` es "Pago anticipado" en MovimientosTab/Excel backend y "Cobro suelto" en MovEgresosTab; `refund` es "Reembolso" vs "Reintegro"; `cash_transfer` es "Movimiento entre cajas" (backend) vs "Movimiento" (front). Tres mapas paralelos para el mismo enum. La fase extrajo `validation-status.ts` justamente por DRY — el mapa de kinds quedó afuera.
**Fix:** Extraer un `src/utils/kind-labels.ts` compartido (mismo patrón que validation-status.ts) y unificar el término por kind.

### IN-04: TOCTOU en `assertUniqueName` — creación concurrente devuelve 500 en vez de 409

**File:** `el-templo-api/src/modules/finance/cash-register-service.ts:424-446, 456-468`
**Issue:** check-then-insert sin transacción: dos creates concurrentes con el mismo (name, country) pasan ambos el guard y el segundo revienta con ER_DUP_ENTRY del índice único, que `handleServiceError` mapea a 500 genérico (no a 409). El diseño belt-and-suspenders es correcto; solo el error residual queda mal tipificado.
**Fix:** En `createCostCenter`/`renameCostCenter`, catch de ER_DUP_ENTRY (`err.code === 'ER_DUP_ENTRY'` con narrowing) → rethrow `ConflictError` con el mismo mensaje del guard.

### IN-05: El prefill 'Retiros' del retiro del dueño es frágil ante el ABM nuevo

**File:** `el-templo-admin/src/components/caja/CuentasTab.vue:199`, `RegistrarMovEgresoDialog.vue:276-279`
**Issue:** El ABM de 152 permite desactivar o renombrar la categoría 'Retiros'. Si eso pasa, `prefillCostCenterName="Retiros"` no la encuentra (getCostCenters es active-only) y cae silenciosamente en 'Varios'/primera — el retiro del dueño se registra bajo la categoría equivocada sin aviso, a diferencia del prefill de caja que sí notifica (`RegistrarMovEgresoDialog.vue:269-274`).
**Fix:** Espejar el warning del prefill de caja: si `prefillCostCenterName` no matchea, `$q.notify({ type: 'warning', message: 'La categoría "Retiros" no está disponible; verificá el centro de costo antes de confirmar.' })`.

### IN-06: Filas `adjustment` outflow se muestran sin signo negativo en el arqueo

**File:** `el-templo-admin/src/components/caja/MovEgresosTab.vue:315-317, 98-109`
**Issue:** `isEgreso()` decide el "−" rojo solo por `kind` (expense/refund). Un ajuste de reconciliación hacia abajo (`kind='adjustment'`, `direction='outflow'`) resta de la caja pero se muestra como monto positivo con badge warning — el arqueo visual no cuadra con el saldo. El campo `direction` ya viene en cada fila.
**Fix:** `return row.direction === 'outflow' && row.kind !== 'cash_transfer';` (conserva la exclusión deliberada del traspaso).

### IN-07: Opciones del filtro Caja construidas solo con las filas de la página actual

**File:** `el-templo-admin/src/components/caja/MovEgresosTab.vue:436-452`
**Issue:** `rebuildCashRegisterOptions` deriva el dropdown de `rows.value` (la página vigente): una caja sin movimientos en la página actual no es seleccionable como filtro. Ya existe `getCashRegisterBalances` que devuelve el catálogo completo de cajas activas.
**Fix:** Poblar el dropdown desde `getCashRegisterBalances({ country })` en `onMounted`/watch de país, en lugar de derivarlo de las filas.

### IN-08: Gaps de cobertura en cost-centers-abm.test.ts

**File:** `el-templo-api/test/finance/cost-centers-abm.test.ts`
**Issue:** No hay test de que el mismo nombre en países distintos SÍ es válido (la mitad de D-08: unicidad _por país_, el índice es compuesto). Tampoco se cubre: reactivar y volver a usar la categoría en un egreso (ciclo completo), ni el trim server-side (crear `"  Marketing  "` → guardado sin espacios / colisión con `"Marketing"` existente).
**Fix:** Agregar: (1) crear `{name: X, country: 'AR'}` y `{name: X, country: 'ES'}` → ambos 201; (2) reactivate → egreso 201; (3) create con espacios → 409 contra el nombre trimmeado existente.

---

_Reviewed: 2026-07-04T15:14:41Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
