# Phase 109: Caja v2 + Reportes - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Cierre del milestone v4.8: actualizar `CajaPage` para reflejar el modelo transaccional con segmentación por `kind` (cobros de plan, pagos de saldo, ajustes, reembolsos, pagos anticipados) además del corte actual por método de pago y sucursal. Agregar reporte de **antigüedad de deudas** (naming UI: "Deudas") como 5to reporte en `ReportesPage` con cards de totales por bucket (0-30 / 31-60 / 61-90 / 90+ días) + tabla detallada con filtros server-side. Actualizar Excel exports al modelo nuevo (kind como columna, conceptos concatenados, allocated amounts).

Phase 109 NO incluye:

- Rediseño completo de CajaPage — se preserva la UI actual y se suma un bloque nuevo de "Por tipo de transacción" debajo del existente.
- Aging por concepto que no esté en `balances` (la cache es la fuente única).
- Métricas calculadas no derivables del modelo (cohort retention, predicciones, churn) — fuera de scope v4.8.
- Nuevos endpoints CRUD — se reusa el endpoint summary existente (Phase 106-03) extendido y se crea UN endpoint para el reporte de Deudas.

</domain>

<decisions>
## Implementation Decisions

### Naming convention (CRÍTICA)

- **D-01:** **"aging" es naming SOLO interno (código, paths, variables, function names). NUNCA aparece en UI.** Toda referencia visible al usuario va en español: "Deudas" (label del reporte en menú), "Antigüedad" (encabezado de columna), "Hasta 30 días / 31-60 / 61-90 / 90+" (buckets en cards y tabla). Si "aging" aparece en algún string que el admin pueda llegar a ver, es bug.

### Reporte "Deudas" en ReportesPage

- **D-02:** Ubicación = sección nueva en `ReportesPage` existente (5to reporte, junto a accesos / cobros / vencimientos / inactivos). Mantiene consistencia operativa con el patrón actual: filtros + tabla + botón "Exportar Excel".
- **D-03:** Naming en menú/UI: **"Deudas"** (simple, directo, sin jerga).
- **D-04:** Scope = TODOS los saldos pendientes en la cache `balances WHERE amount > 0`, sin filtrar por target_kind. Incluye `target_kind='subscription'` (mensualidades pendientes — caso común post-Phase 107) Y `target_kind='debt_balance'` (deudas libres — raro pero contemplado).
- **D-05:** Estructura UI:
  - **Cards de totales arriba** (visión ejecutiva): 4 cards horizontales con totales monetarios por bucket: "Hasta 30 días: $X" / "31-60: $Y" / "61-90: $Z" / "90+: $W". Si owner y hay >1 currency con saldos, las cards se separan por moneda (sets de 4 cards por currency).
  - **Tabla detallada abajo** con columnas: Miembro, Plan/Concepto, Sucursal, Monto, Antigüedad (días), Bucket, Moneda. Default sort: antigüedad DESC (más viejo primero).
  - **Filtros** above-table: sucursal (q-select), moneda (q-select, solo visible para owner), búsqueda por nombre miembro (q-input search).
- **D-06:** Multi-currency:
  - Non-owner: solo ve la moneda de su país (scope automático).
  - Owner: ve cards separadas por moneda (set de 4 cards × N monedas) + selector opcional de currency para focus. **NUNCA sumar monedas distintas en un único total.**
- **D-07:** Paginación + filtros server-side. Backend retorna `PaginatedResult<DebtRow>`. Default `page=1, pageSize=50`. Botón "Cargar más" en el pie. Filtros (`branchId`, `currency`, `search`) van en query params. Match con patrón de CajaPage y FinancialHistoryTab (Phase 108).
- **D-08:** Endpoint dedicado: `GET /api/admin/reports/outstanding-balances` (naming en inglés en código; UI siempre habla de "Deudas"). Source: `SELECT FROM balances WHERE amount > 0 LEFT JOIN subscriptions LEFT JOIN subscription_plans LEFT JOIN branches LEFT JOIN users` + `CASE WHEN DATEDIFF(CURDATE(), effective_date) <= 30 THEN '0-30' WHEN <= 60 THEN '31-60' WHEN <= 90 THEN '61-90' ELSE '90+' END AS bucket`. La response incluye también una sección de totales agregados por bucket (no requiere segundo endpoint para las cards arriba).
- **D-09:** RBAC: reusa `FINANCE_READ_ROLES` (Phase 106 D-04). Coach NO puede ver el reporte. Cross-country reads filtradas por `attachCountryScope` middleware (non-owner solo ve su país).

### CajaPage summary — segmentación por kind (CAJA-01)

- **D-10:** Visualización: **bloque nuevo debajo del actual**. Estructura:
  - Bloque existente intacto: cards de payment method (cash / transferencia / tarjeta) + Mensual.
  - Bloque nuevo, header "Por tipo de transacción", cards horizontales por kind:
    - Cobro de plan (verde)
    - Pago de saldo (azul)
    - Reembolso (rojo)
    - Ajuste (amarillo/naranja)
    - Pago anticipado (violeta)
  - Cada card muestra el total en la moneda activa del filtro.
- **D-11:** Backend: **extender** el endpoint `GET /api/admin/finance/transactions/summary` (de Phase 106-03) agregando campo `revenueByKind: Record<TransactionKind, number>` a la response. Additive only — clientes existentes que no leen ese campo siguen funcionando. Backward-compat preservada.

### CajaPage filtros + tabla — kind (CAJA-02)

- **D-12:** Filtro nuevo: q-select **single-select** "Tipo" con opción "Todos" + 5 kinds en español. Combina con filtros existentes (fecha, sucursal, método). Match con UI actual.
- **D-13:** Columna nueva "Tipo" en la tabla: **badge color-coded con label en español**. Reusa pattern del badge "Anulado" de Phase 108. Colores definidos en D-10 (mismos que las cards).
- **D-14:** El backend del listing endpoint (`GET /api/admin/finance/transactions`) ya soporta filtro por `kind` desde Phase 106-03. La página agrega el filtro al UI.

### Excel exports (CAJA-04)

- **D-15:** **CajaPage export**: una row por transaction. Columnas: Fecha, Tipo (label español), Monto total, Moneda, Método de pago, Sucursal, Miembro (nombre completo), Conceptos (texto concatenado de target_labels separados por coma — ej: "Mensualidad Marzo 2026, Mensualidad Abril 2026"), Notas, Anulado (Sí/No), Razón anulación (si aplica). **No** se explota una transaction con N links en N rows — sumar el Excel daría totales inflados.
- **D-16:** **Reporte Deudas export**: una row por concepto pendiente individual. Columnas: Miembro, Plan/Concepto, Sucursal, Monto, Moneda, Antigüedad (días), Bucket, Fecha devengo (effective_date), Tipo (subscription / debt_balance). Granular para que operaciones haga pivot tables en Excel propias.
- **D-17:** Reusar el patrón existente de `ReportesPage`: `xlsx` library + `downloadBlob` helper. Naming de archivos: `caja-<YYYY-MM-DD>.xlsx` y `deudas-<YYYY-MM-DD>.xlsx`.

### Convergencia con phases anteriores

- **D-18:** KIND_LABELS_ES ya existe en Phase 108 (`PAYMENT_METHOD_LABELS_ES` análogo). Reusar; si faltan keys, completar.
- **D-19:** Currency formatting: reusar `formatPrice(amount, currency)` de `el-templo-admin/src/utils/format-price.ts`.
- **D-20:** Date formatting: reusar `formatDate` de `el-templo-admin/src/utils/format-date.ts`.

### Performance considerations

- **D-21:** El endpoint `outstanding-balances` puede tener miles de rows en producción a futuro. Indexes a verificar (mostly already exist desde Phase 105):
  - `balances(member_id, amount)` — para filtrar `amount > 0`.
  - `balances(target_kind, target_id)` — para JOINs.
  - `subscriptions(branch_id, start_date)` — para filtros + sort por antigüedad.
- **D-22:** El query del endpoint usa `LIMIT/OFFSET` (no cursor-based). Consistente con resto del codebase. Si la performance baja a futuro, optimizar entonces.

### Claude's Discretion

- Color exacto de cada badge de kind (5 colores). Sugerencia: verde positivo / azul neutro / rojo salida / amarillo cuidado / violeta especial. Pick los colores de la paleta Quasar más cercanos.
- Texto exacto de las cards de totales por bucket ("Hasta 30 días" vs "0 a 30 días" vs "Menos de 30").
- Si el reporte Deudas tiene también un export "resumen" (pivot table por miembro) o solo el detalle granular (D-16). Default: solo detalle granular; si operaciones lo pide, agregar.
- Default sort y default filtros del reporte Deudas al cargar la sección.
- Si el bloque "Por tipo de transacción" en CajaPage muestra todos los 5 kinds siempre, o solo los que tienen monto > 0 en el período filtrado.
- Paginación del Excel export (¿exporta todo el resultado del filtro o solo la página actual?). Default: todo el resultado con confirm si >1000 rows.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements

- `.planning/ROADMAP.md` §"Phase 109: Caja v2 + Reportes" — goal + success criteria + dependencias.
- `.planning/REQUIREMENTS.md` §"Caja y Reportes (CAJA) — Phase 109" — CAJA-01, CAJA-02, CAJA-03, CAJA-04.

### Phases anteriores (carrying forward)

- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-SPEC.md` — invariantes de `balances` cache (sumas atómicas, una row por target).
- `.planning/phases/106-endpoints-transaccionales/106-CONTEXT.md` — endpoint summary actual (`GET /api/admin/finance/transactions/summary`) + listing endpoint (`GET /api/admin/finance/transactions`) con filtro por kind ya soportado.
- `.planning/phases/106-endpoints-transaccionales/106-VERIFICATION.md` — confirma que summary endpoint y listing endpoint están operativos.
- `.planning/phases/107-cobro-al-asignar-plan/107-CONTEXT.md` — convención de no aceptar saldos a favor (pero `balances.amount` puede ser negativo en caso de refund).
- `.planning/phases/108-pago-de-saldo-historial-financiero/108-CONTEXT.md` — KIND_LABELS_ES, PAYMENT_METHOD_LABELS_ES, badges color-coded patterns.
- `.planning/phases/108-pago-de-saldo-historial-financiero/108-PATTERNS.md` — voided row visual pattern (CajaPage:184-192, 342) ya replicado en historial; reusar para CajaPage cuando aplique.

### Backend — código a tocar

- `el-templo-api/src/modules/finance/transaction-service.ts` — extender el método de summary para retornar `revenueByKind` (D-11). Agregar nuevo método `getOutstandingBalances(filters, page, pageSize)` para el reporte de Deudas (D-08).
- `el-templo-api/src/modules/finance/types.ts` — agregar tipos: `RevenueByKind`, `DebtRow`, `DebtBucket`, `OutstandingBalancesResult`.
- `el-templo-api/src/modules/finance/schemas.ts` — extender summary schema con `revenueByKind`. Crear schema para outstanding-balances response.
- `el-templo-api/src/modules/finance/routes.ts` — sin cambios al summary route (solo extiende response shape, schema permite el nuevo campo).
- `el-templo-api/src/modules/reports/routes.ts` (o `members/routes.ts` si conviene) — montar `GET /api/admin/reports/outstanding-balances`.
- `el-templo-api/src/modules/reports/service.ts` — método `getOutstandingBalances()` (decidir en planning si vive en reports o en finance — por consistencia con Phase 108 outstanding-concepts, podría vivir en finance/transaction-service o en reports/service).
- `el-templo-api/test/reports/outstanding-balances.test.ts` (nuevo) — integration tests cubriendo happy + RBAC + cross-country + paginación + buckets correctos + multi-currency.
- `el-templo-api/test/finance/summary-by-kind.test.ts` (nuevo o extender existente) — integration tests del nuevo campo `revenueByKind`.

### Frontend admin — código a tocar

- `el-templo-admin/src/pages/CajaPage.vue` (656 LOC):
  - Agregar bloque "Por tipo de transacción" debajo del actual (D-10).
  - Agregar filtro single-select "Tipo" (D-12).
  - Agregar columna "Tipo" en la tabla con badge color-coded (D-13).
  - Actualizar `onExport` para incluir las nuevas columnas en Excel (D-15).
- `el-templo-admin/src/pages/ReportesPage.vue` (1461 LOC) — agregar 5to reporte "Deudas" siguiendo el patrón de los 4 existentes (filtros + tabla + Exportar). UI: cards de totales arriba + tabla con filtros server-side + paginación "Cargar más".
- `el-templo-admin/src/composables/useTransactionsApi.ts` — agregar método `getOutstandingBalances(filters, page, pageSize)`. Verificar si el summary actual ya soporta el nuevo campo `revenueByKind` o si requiere ajuste.
- `el-templo-admin/src/types/transaction.ts` — agregar tipos `DebtRow`, `DebtBucket`, `OutstandingBalancesQuery`, `OutstandingBalancesResult`.

### Patrones a seguir

- `el-templo-admin/src/pages/ReportesPage.vue` líneas con los 4 reportes existentes — exact pattern de filtros + tabla + downloadBlob para xlsx. Para "Deudas" replicar la estructura.
- `el-templo-admin/src/pages/CajaPage.vue` líneas 39-87 (cards summary actual) — analog para las cards nuevas de "Por tipo de transacción".
- `el-templo-admin/src/components/FinancialHistoryTab.vue` (de Phase 108) — patrón de paginación "Cargar más" y badges color-coded para kind. Reusar.
- `el-templo-api/src/modules/finance/transaction-service.ts` `getOutstandingConcepts` (de Phase 108) — analog para `getOutstandingBalances` (similar JOIN, distinto scope: global por filtros vs por miembro).

### Convenciones del proyecto

- `CLAUDE.md` — Pino logger, no `any`, integration tests reales en `eltemplo_test`, JSON Schema as const NOT Zod, pre-commit hooks corren Prettier.
- xlsx export pattern: `downloadBlob(blob, filename)` helper. Library: `xlsx` (ya instalada).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Endpoint summary existente** (`GET /api/admin/finance/transactions/summary`) — solo se extiende con `revenueByKind`. No nuevo endpoint para CAJA-01.
- **Endpoint listing existente** (`GET /api/admin/finance/transactions`) — ya soporta filtro `?kind=` desde Phase 106-03. La página solo agrega el dropdown.
- **`balances` cache** — fuente única para el reporte de Deudas. Mantenida atómicamente desde Phase 105.
- **`KIND_LABELS_ES`** y `PAYMENT_METHOD_LABELS_ES` — definidos en Phase 108 frontend. Reusar.
- **`formatPrice` y `formatDate`** — utils existentes. Reusar.
- **Badge color-coded pattern** — pattern del "Anulado" de Phase 108 + voided row de CajaPage. Reusar.
- **`xlsx` library + `downloadBlob` helper** — patrón establecido en ReportesPage. Reusar.
- **Pagination pattern** (`PaginatedResult<T>` + "Cargar más" botón) — establecido en CajaPage, FinancialHistoryTab. Reusar.

### Established Patterns

- **Endpoint sub-recurso REST** bajo `/api/admin/reports/<name>` o `/api/admin/finance/<name>` — Phase 106 establece el patrón. Decidir en planning dónde vive `outstanding-balances` (preferencia: `reports/` por convención semántica con los otros reportes; pero el query es contra finance tables).
- **JSON Schema as const** estilo Fastify nativo, NOT Zod (D-15 de Phase 107).
- **`attachCountryScope` middleware** — non-owner ve solo su país. Owner ve todo. Reusar.
- **`addHook("onRequest", ...)` con role check** — patrón del módulo finance/reports. Reusar.
- **Backward-compat additive** para extender response shapes — Phase 107 lo locked como invariante.

### Integration Points

- `el-templo-admin/src/pages/CajaPage.vue` — el archivo central de UI a extender. Mantener UI actual + agregar bloque nuevo.
- `el-templo-admin/src/pages/ReportesPage.vue` — patrón de 4 reportes existentes. Sumar el 5to "Deudas".
- `el-templo-api/src/modules/finance/transaction-service.ts` — service layer central. Extender summary + agregar getOutstandingBalances.

### Constraints from Codebase

- `request.user.role` tipado como `AdminRole`.
- `request.scope.country` para non-owner. Owner = scope global.
- Drizzle queries con joins: usar `leftJoin` para no perder rows con `target_kind='debt_balance'`.
- No `any` types: usar `unknown` + narrowing.

</code_context>

<specifics>
## Specific Ideas

### Mock-up del bloque nuevo en CajaPage (D-10)

```
┌──────────────────────────────────────────────────────────────────┐
│ Caja                                                              │
│                                                                   │
│ [filtros: fecha, sucursal, método, tipo (NUEVO)]                  │
│                                                                   │
│ ─── Por método de pago (existente) ──────────────────────────     │
│ ┌──────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐                 │
│ │Cash  │ │Transferenc.│ │Tarjeta   │ │Mensual   │                 │
│ │$X    │ │$Y          │ │$Z        │ │$W        │                 │
│ └──────┘ └────────────┘ └──────────┘ └──────────┘                 │
│                                                                   │
│ ─── Por tipo de transacción (NUEVO) ─────────────────────────     │
│ ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────┐ ┌────────┐ │
│ │Cobro plan   │ │Pago saldo    │ │Reembolso │ │Ajuste│ │Anticip.│ │
│ │$A 🟢        │ │$B 🔵          │ │$C 🔴     │ │$D 🟡 │ │$E 🟣   │ │
│ └─────────────┘ └──────────────┘ └──────────┘ └──────┘ └────────┘ │
│                                                                   │
│ [tabla: Fecha | Tipo (badge) | Monto | Método | Sucursal | ...]  │
└──────────────────────────────────────────────────────────────────┘
```

### Mock-up del reporte Deudas en ReportesPage (D-05)

```
┌──────────────────────────────────────────────────────────────────┐
│ Reportes › Deudas                                                 │
│                                                                   │
│ [filtros: sucursal, moneda (solo owner), búsqueda nombre]         │
│                                                                   │
│ ─── Totales por antigüedad (ARS) ─────────                        │
│ ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│ │Hasta 30 días │ │31-60 días│ │61-90 días│ │90+ días  │           │
│ │$200.000      │ │$120.000  │ │$80.000   │ │$50.000   │           │
│ │N alumnos     │ │N alumnos │ │N alumnos │ │N alumnos │           │
│ └──────────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                   │
│ [tabla detalle, sort por antigüedad DESC]                         │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ Miembro        │ Plan        │ Sucursal │ Monto │ Días│Bucket││
│ │ Juan Pérez     │ Mens. Mar   │ MdP      │ $20k  │ 60  │31-60 ││
│ │ ...                                                         │  │
│ └─────────────────────────────────────────────────────────────┘  │
│                                              [Cargar más]        │
│                                          [Exportar Excel]        │
└──────────────────────────────────────────────────────────────────┘
```

### Bucket boundaries (D-05)

Definidos por DATEDIFF(CURDATE(), effective_date):

- `0-30`: 0 ≤ días ≤ 30
- `31-60`: 31 ≤ días ≤ 60
- `61-90`: 61 ≤ días ≤ 90
- `90+`: días > 90

Si effective_date es futuro, días = 0 → cae en bucket `0-30` (consistente con Phase 108 D-04).

### Convergencia operativa con Phase 108

- El reporte Deudas y el dialog "Registrar pago" comparten data fuente (`balances WHERE amount > 0`). Si admin abre el reporte, ve a Juan con $50k abiertos; click en Juan → AlumnoDetailPage → tab Finanzas → "Registrar pago" del Phase 108. Flujo end-to-end coherente.

</specifics>

<deferred>
## Deferred Ideas

- **Pivot table export del reporte Deudas** (totales por miembro × buckets) — solo detalle granular en v1 (D-16). Si operaciones lo pide explícitamente, agregar como segundo export en una iteración posterior.
- **Predicciones / cohort retention / churn** — fuera de scope de v4.8. Métricas calculadas avanzadas son otra fase.
- **Drilldown desde card de bucket a tabla filtrada** (click en "31-60" → tabla pre-filtra a ese bucket) — nice-to-have, no bloquea scope. Dejar para iteración posterior si surge la necesidad.
- **Comparativas mes-vs-mes de revenueByKind** — fuera de scope. CAJA-01 es solo segmentación del período actual.
- **Export PDF de reportes** — solo Excel en v1.
- **Doc operacional para admins** — anotado en REQUIREMENTS.md (CAJA-05 movido fuera del milestone, es entregable de docs).
- **Aging por concepto fuera de balances cache** (ej: deudas de servicios externos) — no aplica al modelo del Templo.
- **Notificaciones automáticas a alumnos con deudas viejas** (>60 días) — fuera de scope. Es feature de comunicaciones, no de reportes.

### Reviewed Todos (not folded)

Ningún todo matched contra Phase 109.

</deferred>

---

_Phase: 109-caja-v2-reportes_
_Context gathered: 2026-04-28_
