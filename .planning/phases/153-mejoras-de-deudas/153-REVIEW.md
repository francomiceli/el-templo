---
phase: 153-mejoras-de-deudas
reviewed: 2026-07-04T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - el-templo-admin/src/components/deudas/PorDeudaTab.vue
  - el-templo-admin/src/components/deudas/PorSocioTab.vue
  - el-templo-admin/src/components/deudas/VencidosTab.vue
  - el-templo-admin/src/composables/useTransactionsApi.ts
  - el-templo-admin/src/config/templo-config.ts
  - el-templo-admin/src/constants/deudas.ts
  - el-templo-admin/src/pages/DeudasPage.vue
  - el-templo-admin/src/pages/ReportesPage.vue
  - el-templo-admin/src/types/transaction.ts
  - el-templo-api/src/modules/reports/routes.ts
  - el-templo-api/src/modules/reports/schemas.ts
  - el-templo-api/src/modules/reports/service.ts
  - el-templo-api/src/modules/reports/types.ts
  - el-templo-api/test/reports/expired-members.test.ts
  - el-templo-api/test/reports/outstanding-balances.test.ts
findings:
  critical: 0
  warning: 8
  info: 6
  total: 14
status: issues_found
---

# Phase 153: Code Review Report

**Reviewed:** 2026-07-04
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Revisión adversarial de la fase 153 (Mejoras de Deudas): hub de 3 tabs en `DeudasPage`, mudanza del reporte por deuda desde Reportes, campos derivados motivo/período/fecha de registro sobre outstanding-balances, y el endpoint nuevo `GET /admin/reports/expired-members` (Vencidos).

**Invariantes del contexto verificados y cumplidos:**

- Coach → 403 en los endpoints de detalle vía guard plugin-level `CAJA_ROLES` en `reports/routes.ts:55-64` (sin guard per-route, como pedía el plan). Cubierto por tests RBAC en ambos suites, incluyendo recepción 403.
- El payload de expired-members NO expone monto/moneda: ni el service lo proyecta ni el schema lo permite (`schemas.ts:418-439`, fast-json-stringify strippea extras). Test NO-AMOUNT lo asserta.
- Sin migración: todo derivado de `balances` + `financial_transactions` + `subscriptions`.
- Módulo coach intacto (`git diff` vacío sobre `modules/coach/`), y `useCoachApi.getOutstandingBalances` sigue siendo la proyección mínima consumida por PorSocioTab.
- Motivo derivado gateado por `transaction_links.target_kind='debt_balance'` en `buildDebtOriginTxSubquery` (service.ts:704-724), con GROUP BY que garantiza 1:1 y no multiplica filas.
- Exclusión del dato sucio histórico (`end_date >= start_date`, service.ts:1039) con test dedicado.

No encontré Criticals. Sí encontré 8 Warnings: el más relevante es el falso positivo de "vencido sin renovar" para socios con renovación `scheduled` (contradice la semántica de renovación que la misma clase usa en el reporte de vencimientos), seguido de la exposición de socios soft-deleted en la lista de contacto de Vencidos y la paginación no determinística del endpoint nuevo.

## Warnings

### WR-01: Vencidos incluye como "sin renovar" a socios que YA renovaron con una suscripción `scheduled`

**File:** `el-templo-api/src/modules/reports/service.ts:1040-1043`
**Issue:** El predicado de exclusión es `NOT activeMemberExists(...)`, y `activeMemberExists` (shared/active-member.ts) solo considera subs `active|paused` con `start_date <= CURDATE()`. Un socio cuyo plan venció hace N días pero que ya compró la renovación con inicio futuro (`subscription_status='scheduled'`, patrón real del dominio: la fase 144 define cobertura como cadena active+**scheduled**, y `getExpiringMemberships` en este mismo archivo trata `scheduled` como "ya renovó" en `coverageExists`, service.ts:517-527) aparece igual en el tab Vencidos como lead de renovación. Gestión lo contactaría para renovar algo que ya pagó. Es fiel al predicado fase-121 que D-04 manda reusar, pero contradice la semántica de renovación del resto del módulo y el propósito del tab ("sin renovar").
**Fix:** Agregar a las conds una exclusión de cobertura futura, espejo de la que ya existe en el archivo:

```ts
sql`NOT EXISTS (
  SELECT 1 FROM subscriptions s2
  WHERE s2.user_id = ${schema.subscriptions.userId}
    AND s2.subscription_status IN ('active','paused','scheduled')
    AND (s2.end_date IS NULL OR s2.end_date >= CURDATE())
)`,
```

(o extender el predicado con un parámetro `includeScheduled` para no tocar los consumidores de analytics). Agregar test: socio con sub vencida in-window + sub `scheduled` a futuro → excluido.

### WR-02: Vencidos expone nombre y teléfono de socios soft-deleted

**File:** `el-templo-api/src/modules/reports/service.ts:1076`
**Issue:** El query hace `INNER JOIN users` sin filtrar `users.deleted_at IS NULL` (la columna existe: `db/schema/users.ts:127`). Un socio dado de baja lógicamente cuyo plan venció dentro de la ventana de 60 días aparece como lead de renovación con su PII (nombre + teléfono) en una lista cuyo propósito explícito es contactar gente. El mismo archivo ya filtra `u.deleted_at IS NULL` en pendingLeads del reporte de conversión (service.ts:1369), así que la omisión es una inconsistencia, no una convención.
**Fix:**

```ts
conds.push(isNull(schema.users.deletedAt));
```

(`isNull` ya está importado). Agregar test: socio deleted con sub vencida in-window → excluido.

### WR-03: Paginación no determinística en expired-members — "Cargar más" puede duplicar u omitir filas

**File:** `el-templo-api/src/modules/reports/service.ts:1065-1113` (y `el-templo-admin/src/components/deudas/VencidosTab.vue:152-167`)
**Issue:** El SELECT no tiene `ORDER BY`; el orden de `rawRows` (y por lo tanto el orden de inserción en el Map de dedup) queda a criterio del planner de MySQL y puede variar entre requests. El sort JS por `daysOverdue ASC` es estable pero no tiene tiebreaker, así que los empates (varios socios vencidos el mismo día — caso común con ciclos mensuales) pueden cambiar de posición entre la request de página 1 y la de página 2. El slice `allRows.slice(offset, offset + limit)` entonces puede devolver un userId ya entregado (duplicado de `row-key` en q-table) u omitir otro. El mismo defecto (pre-existente, fase 109) aplica a `getOutstandingBalances`: `ORDER BY COALESCE(startDate, DATE(createdAt)) ASC` sin tiebreaker único + LIMIT/OFFSET (service.ts:880-884).
**Fix:** Tiebreaker determinístico en el sort JS:

```ts
const allRows = [...expiredByUser.values()].sort(
  (a, b) => a.daysOverdue - b.daysOverdue || a.userId - b.userId,
);
```

Para outstanding-balances, agregar `balances.id` (o `targetKind, targetId`) como segunda clave del ORDER BY SQL.

### WR-04: El motivo derivado puede salir de un advance_payment ANULADO (flujo "Corregir")

**File:** `el-templo-api/src/modules/reports/service.ts:704-724`
**Issue:** `buildDebtOriginTxSubquery` resuelve el origen como `MIN(financial_transactions.id)` de los advance_payment linkeados al debt_balance, sin filtrar `voided_at IS NULL`. El flujo Corregir de la fase 137/141 es void+recreate: si un cobro suelto pendiente se corrige, el debt_balance queda linkeado tanto a la transacción anulada (id menor) como a la recreada (id mayor). `MIN(id)` elige siempre la ANULADA, así que el motivo (`miscReason`) y sobre todo la nota libre (D-11, tooltip) mostrados serían los de la transacción vieja, no los de la vigente.
**Fix:** Excluir anuladas en el join del derived table:

```ts
.innerJoin(
  schema.financialTransactions,
  and(
    eq(schema.financialTransactions.id, schema.transactionLinks.transactionId),
    eq(schema.financialTransactions.kind, "advance_payment"),
    isNull(schema.financialTransactions.voidedAt),
  ),
)
```

Agregar test: debt_balance con origen anulado + origen recreado → motivo/nota del recreado.

### WR-05: `scope.country === null` (corrupción de datos) degrada a "ver todos los países" en el endpoint nuevo

**File:** `el-templo-api/src/modules/reports/routes.ts:319-324` (patrón replicado de :268-273)
**Issue:** Para non-owner, `country = request.scope.country ?? undefined`. `attachCountryScope` documenta explícitamente que `country: null` para admin/gestion es el camino **fail-closed** ante corrupción de `users.country` (country-scope.ts:10-17), confiando en que `canAccessBranch` deniegue después. Pero estos listados no pasan por `canAccessBranch` cuando no viene `branchId`: el `?? undefined` convierte el null fail-closed en "sin filtro de país" → una gestión con `users.country` corrupto vería deudas y leads (PII) de TODOS los países. Pre-existente en outstanding-balances (109); la fase 153 lo replica en código nuevo en vez de cerrarlo.
**Fix:** Fail-closed explícito para non-owner:

```ts
if (!request.scope.isOwner && request.scope.country === null) {
  return reply
    .code(403)
    .send({ error: "Acceso denegado", message: "Scope de país no resuelto" });
}
```

(aplicar en los 3 handlers que usan el patrón: outstanding-balances, su export, y expired-members).

### WR-06: Gestión/admin de España ve los totales por antigüedad formateados como ARS

**File:** `el-templo-admin/src/pages/DeudasPage.vue:119-127` + `el-templo-admin/src/components/deudas/PorDeudaTab.vue:73`
**Issue:** Para non-owner el selector de país está oculto y `selectedCountry` queda fijo en `'AR'`, así que `displayCurrency` es siempre `'ARS'`. El backend para non-owner devuelve `bucketTotals` flat en la moneda de SU país (EUR para gestión ES), pero el frontend los renderiza con `formatPrice(x, 'ARS')` → montos en euros mostrados con `$` y locale es-AR. Comportamiento heredado de la vista en ReportesPage, pero sigue siendo dinero mostrado con la moneda equivocada para todo el staff de ES.
**Fix:** Derivar la moneda de los datos, no del selector: el backend ya devuelve `currency` por fila; alternativamente exponer la moneda del scope en la respuesta, o inferirla de `rows[0]?.currency ?? displayCurrency` en `PorDeudaTab.load()`.

### WR-07: Race de respuestas fuera de orden entre `load(true)` y `load(false)` en los tabs nuevos

**File:** `el-templo-admin/src/components/deudas/PorDeudaTab.vue:329-364`, `el-templo-admin/src/components/deudas/VencidosTab.vue:152-175`
**Issue:** `load()` no guarda contra reentrada ni descarta respuestas obsoletas. Los watchers de filtros disparan `load(true)` aunque haya un `load(false)` ("Cargar más") en vuelo: si la respuesta del reset llega antes que la del append (o viceversa con un cambio de filtro), `items.value.push(...res.rows)` mezcla páginas de filtros distintos o duplica filas (colisión de row-key). El botón se deshabilita con `:loading`, pero los inputs de filtro no, y el debounce no serializa contra requests en vuelo.
**Fix:** Token de request (patrón estándar):

```ts
let requestSeq = 0;
async function load(reset = true) {
  const seq = ++requestSeq;
  // ... await api...
  if (seq !== requestSeq) return; // respuesta obsoleta, descartar
  // ... aplicar resultado
}
```

### WR-08: Gaps de cobertura en los tests de integración

**File:** `el-templo-api/test/reports/expired-members.test.ts`, `el-templo-api/test/reports/outstanding-balances.test.ts`
**Issue:** Faltan casos que el propio código promete o que cubren los Warnings de arriba:

- expired-members: sin test de filtro `branchId`, sin test de paginación (el endpoint la implementa en JS y el schema la expone), sin test de owner con `?country=` explícito, sin caso "renovó con `scheduled`" (WR-01), sin caso socio soft-deleted (WR-02), sin boundary exacto de 60 días (se testea 59/61 pero no 60, que es inclusivo).
- outstanding-balances: sin test de debt_balance con MÚLTIPLES advance_payment linkeados (el determinismo MIN(id) que el docstring de `buildDebtOriginTxSubquery` promete), sin test de origen anulado (WR-04), y el endpoint `/outstanding-balances/export` no tiene ningún test que verifique las columnas nuevas Motivo/Período/Fecha de registro.
  **Fix:** Agregar los casos listados; los seeds helper existentes (`seedDebtBalanceWithOrigin`, `addSubscriptionForMember`) ya soportan casi todos sin infraestructura nueva.

## Info

### IN-01: Parámetro `scope` muerto en `getExpiredMembers`

**File:** `el-templo-api/src/modules/reports/service.ts:1026-1029`
**Issue:** La firma recibe `scope: { isOwner: boolean }` (y el route lo pasa) pero el cuerpo nunca lo usa — a diferencia de `getOutstandingBalances`, donde `isOwner` decide la forma de bucketTotals.
**Fix:** Eliminar el parámetro de la firma y del call site, o documentar por qué se reserva.

### IN-02: `DEUDAS_TAB_NAMES` exportado y nunca usado; la lista se duplica inline en la página

**File:** `el-templo-admin/src/constants/deudas.ts:34-38` + `el-templo-admin/src/pages/DeudasPage.vue:103-107`
**Issue:** La constante se declara "para validación de ?tab=" pero `DeudasPage` reconstruye la lista a mano en `visibleTabs` (violación DRY leve + export muerto).
**Fix:** `visibleTabs = canSeeDetail ? DEUDAS_TAB_NAMES : [DEUDAS_TABS.porSocio]` (DEUDAS_TAB_NAMES ya tiene el orden correcto), o borrar la constante.

### IN-03: Comentario desactualizado "9 columns (D-16)" en el export de Deudas

**File:** `el-templo-api/src/modules/reports/routes.ts:601-604`
**Issue:** El comentario del endpoint dice 9 columnas (fase 109 D-16), pero la fase 153 lo llevó a 13 (`sheet.columns`, líneas 644-658).
**Fix:** Actualizar el comentario a "13 columns (109 D-16 + 153 Motivo/Período/Fecha de registro)".

### IN-04: `registeredAt` se deriva vía `toISOString()` (UTC) mientras el resto del aging usa día local

**File:** `el-templo-api/src/modules/reports/service.ts:183-186`
**Issue:** `isoDatePortionOB` convierte `balances.createdAt` con `toISOString().slice(0,10)` (día UTC), pero `computeAgeInDaysOB` y el ORDER BY SQL (`DATE(created_at)`, timezone de sesión) trabajan en día local. Si el proceso Node no corre en UTC, una deuda registrada de noche muestra "Fecha de registro" del día siguiente y, para debt_balance (donde `effectiveDate = registeredAt`), corre el aging un día. El propio test REGISTERED-AT tuvo que assertear con rango ±1 día por esto. Sin impacto en prod si el server corre UTC.
**Fix:** Derivar el día con getters locales (`getFullYear/getMonth/getDate`) o fijar una única convención de timezone para las tres derivaciones.

### IN-05: Período con `end_date` null — UI y Excel divergen

**File:** `el-templo-admin/src/components/deudas/PorDeudaTab.vue:104` vs `el-templo-api/src/modules/reports/routes.ts:806-817`
**Issue:** La UI solo muestra el período cuando existen `periodStart` Y `periodEnd`; el Excel (`formatPeriodDDMM`) muestra solo el inicio cuando el fin es null. Una misma deuda de sub sin end_date tiene período en el export pero no en pantalla. Además el formato dd/mm sin año es ambiguo para ciclos que cruzan el año (ej. 15/12–14/01).
**Fix:** Unificar: mostrar `toDDMM(start)` solo-inicio también en la UI, y considerar incluir el año cuando start y end caen en años distintos.

### IN-06: `activeTab` no se revalida si `visibleTabs` cambia después del setup; `?tab=` inválido queda en la URL

**File:** `el-templo-admin/src/pages/DeudasPage.vue:153-168`
**Issue:** `tabFromQuery()` se evalúa una sola vez al crear el ref. Si `authStore.user` se hidrata asíncronamente después del setup, un gestion que entra con `?tab=porDeuda` cae a "Por socio" y no se corrige. Además, cuando el tab pedido es inválido (coach forzando `?tab=vencidos`), el query param obsoleto queda en la URL porque el watch solo escribe en cambios de `activeTab`.
**Fix:** `watch(visibleTabs, () => { if (!visibleTabs.value.includes(activeTab.value)) activeTab.value = DEUDAS_DEFAULT_TAB; })` y un `router.replace` inicial cuando `route.query.tab !== activeTab.value`.

---

_Reviewed: 2026-07-04_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
