# Phase 106: Endpoints Transaccionales - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Exponer endpoints REST sobre el `TransactionService` y `BalanceService` creados en Phase 105 — `POST /transactions`, `POST /transactions/:id/void`, `GET /transactions` (paginado + filtrado), `GET /members/:id/financial-history` — con RBAC adecuado por rol y scope por país para no-owners. Migrar `usePaymentsApi.ts` y `CajaPage.vue` del admin a los nuevos endpoints (cierra los 404s deferred desde Phase 105-07). Cubrir con integration tests.

Phase 106 NO incluye nuevos features visuales — Phase 107 (AssignPlanDialog "Cobro"), Phase 108 (Registrar pago + historial por miembro), Phase 109 (CajaPage v2 + aging) se construyen encima.

</domain>

<decisions>
## Implementation Decisions

### RBAC por endpoint

Definir nuevas constantes en `el-templo-api/src/modules/shared/permissions.ts`:

- **D-01:** `FINANCE_ADJUSTMENT_ROLES = ['owner', 'admin', 'gestion']` — quien puede crear `kind=adjustment` (ajuste libre, sensible). Más amplio que la spec original (que decía solo owner) pero alineado con el rol gestion existente que ya opera caja.
- **D-02:** `FINANCE_WRITE_ROLES = ['owner', 'admin', 'gestion', 'recepcion']` — quien puede crear `kind ∈ {plan_charge, debt_settlement, refund, advance_payment}` (cobros operativos). Excluye `coach` (no opera caja).
- **D-03:** `FINANCE_VOID_ROLES = ['owner', 'admin', 'gestion']` — quien puede anular. Excluye `recepcion` (riesgo de abuso por reversiones silenciosas) y `coach`.
- **D-04:** `FINANCE_READ_ROLES = ['owner', 'admin', 'gestion', 'recepcion']` — quien puede leer (`GET /transactions` y `GET /members/:id/financial-history`). Excluye `coach` (privacy: el rol coach no necesita ver historial financiero del alumno).

Implementación: en `routes.ts` del módulo finance, usar el patrón existente de `addHook("onRequest", ...)` con check por endpoint específico. Para `POST /transactions`, el handler verifica el `kind` del payload y aplica `FINANCE_ADJUSTMENT_ROLES` o `FINANCE_WRITE_ROLES` según corresponda (no se puede determinar a nivel hook porque depende del body — verificar dentro del handler antes de llamar al service).

### Branch / Country Scope

- **D-05:** Reusar `attachCountryScope` middleware existente para todos los endpoints de finance. Owner ve todas las transacciones; no-owners ven solo las del país de su sucursal. Patrón idéntico a `reportsRoutes`.
- **D-06:** En `POST /transactions`, validar que el `branchId` del payload pertenezca al país del usuario (para no-owners). Si no, rechazar 403. Owner puede crear contra cualquier branchId existente.
- **D-07:** En `POST /transactions/:id/void`, validar antes de anular que la transacción a anular pertenece al país del usuario (para no-owners). Owner puede anular cualquier.

### URL Structure

- **D-08:** Prefix base `/api/admin/finance/` para todas las rutas del módulo:
  - `POST /api/admin/finance/transactions` — create
  - `POST /api/admin/finance/transactions/:id/void` — void
  - `GET /api/admin/finance/transactions` — list paginado + filtrado
- **D-09:** `GET /api/admin/members/:id/financial-history` vive bajo `/members/:id` (sub-resource REST) aunque la lógica está en el módulo `finance/`. El handler se importa en `members/routes.ts` o se monta en otro register con un prefix dedicado. Patrón existente: `members/routes.ts` ya tiene rutas como `/notes` bajo `/members/:id`. Decidir en planning si se hace via export desde finance o via composición en members/routes.

### Response Shapes

- **D-10:** `POST /api/admin/finance/transactions` retorna:

  ```ts
  {
    transaction: FinancialTransactionRow,
    links: TransactionLinkRow[],
    affectedBalances: BalanceRow[]  // rows de `balances` modificadas
  }
  ```

  El `affectedBalances` permite que el frontend (AssignPlanDialog en Phase 107, dialog "Registrar pago" en Phase 108) muestre el saldo nuevo sin re-fetch.

- **D-11:** `POST /api/admin/finance/transactions/:id/void` retorna solo:

  ```ts
  {
    transaction: FinancialTransactionRow;
  } // con voidedAt/voidedBy/voidReason populated
  ```

  Mínimo viable. El frontend invalida la cache de balances localmente (re-fetch).

- **D-12:** `GET /api/admin/finance/transactions` retorna `PaginatedResult<TransactionListItem>` donde `TransactionListItem` incluye campos clave + member name + branch name + summary de links (no las rows completas — eso se ve al expandir a detail). Filtros: `branchId, kind, dateFrom, dateTo, memberId, paymentMethod, search` (búsqueda por nombre via `buildMemberNameSearchCondition`). Paginación: default `page=1, pageSize=50, max pageSize=200`.

- **D-13:** `GET /api/admin/members/:id/financial-history` retorna `PaginatedResult<FinancialHistoryItem>` ordenado `transaction_date DESC` con cada item incluyendo:
  ```ts
  {
    transaction: FinancialTransactionRow,
    links: Array<{ targetKind, targetId, allocatedAmount, conceptLabel? }>,
    voidInfo?: { voidedAt, voidedBy, voidReason }
  }
  ```
  `conceptLabel` es opcional — para target_kind='subscription' es algo como "Mensualidad Marzo 2026 — Plan Pro" (resuelto via JOIN). Default page=1, pageSize=50, max 200. La agrupación por concepto pendiente que pide PAYMENT-03 (Phase 108) se calcula en el frontend a partir de este flat array — no es un endpoint separado.

### CajaPage Migration (deferred from Plan 105-07)

- **D-14:** Phase 106 incluye migrar `usePaymentsApi.ts` y `CajaPage.vue` para consumir `/api/admin/finance/transactions` (con los filtros equivalentes que CajaPage usa hoy). Esto cierra los 2 404s en producción.
- **D-15:** La migración es un **swap quirúrgico** — el shape del request/response del nuevo endpoint preserva la información que CajaPage hoy muestra (date, member name, amount, payment method, branch). No se rediseña la UI; eso queda para Phase 109 (CajaPage v2 con segmentación por kind y aging).
- **D-16:** Si CajaPage usa endpoints adicionales del módulo viejo (ej: `GET /api/admin/payments/summary`), Phase 106 también los reescribe contra `financialTransactions` (analítica equivalente). Decidir alcance exacto en planning leyendo `usePaymentsApi.ts` y `CajaPage.vue` line by line.

### Constraints from Phase 105 (carrying forward)

- Service layer ya existe: `TransactionService.create(input, recordedBy)` y `TransactionService.void(id, voidedBy, reason)` — Phase 106 solo expone HTTP.
- Atomicidad ya está garantizada por el service (Phase 105 D-04). El handler hace `try { service.create() } catch (...) { handleServiceError() }` — la transaction DB la maneja el service.
- Inmutabilidad post-creación ya enforced por el service (no `update` method). El endpoint void es la única forma de modificar.
- Cache `balances` ya se mantiene atómicamente por BalanceService (Phase 105 D-04). Los reads del endpoint no la tocan; solo la leen.

### Claude's Discretion

- Naming exacto de las constantes RBAC (`FINANCE_ADJUSTMENT_ROLES` vs `ADJUSTMENT_ROLES` etc.) — pick names alineados con el patrón `<DOMAIN>_<ACTION>_ROLES` existente.
- Estructura interna del módulo: ¿un solo `routes.ts` o sub-archivos por endpoint si crece? Recomendación: un solo `routes.ts` por ahora (siguiendo el patrón de reports/routes.ts ~600 LOC).
- Naming de schemas Zod (`createTransactionSchema`, `voidTransactionSchema`, etc.).
- Tests granularity: cuántos test cases por endpoint. Recomendación: happy path + RBAC denial (per role excluido) + validation errors + atomicidad (service-level ya cubierto en Phase 105) + paginación bounds.
- Excel export: spec NO menciona Excel para finance/transactions. Phase 109 (CAJA-04) lo agrega para CajaPage v2. NO incluir en Phase 106.
- TransactionListItem vs FinancialHistoryItem: si comparten suficiente shape, define un type base. Pick lo que sea más DRY.
- Pagination total count cost: si la query con muchos filtros es lenta, considerar `SQL_CALC_FOUND_ROWS` o COUNT(_) separado. PaginatedResult del codebase actual usa COUNT(_) — seguir ese patrón.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 105 (carrying forward)

- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-SPEC.md` — Locked schema y service-layer invariants. Phase 106 construye encima.
- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-CONTEXT.md` — D-04 facade pattern, D-09 integration tests. Mismas convenciones aplican.
- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-VERIFICATION.md` — confirma que TransactionService + BalanceService están operativos.
- `el-templo-api/src/modules/finance/transaction-service.ts` — el service que los endpoints exponen. Lee `create()` y `void()` signatures.
- `el-templo-api/src/modules/finance/balance-service.ts` — para el `affectedBalances` en el response de create.
- `el-templo-api/src/modules/finance/types.ts` — types base para construir los response shapes (FinancialTransactionRow, BalanceRow, etc).
- `el-templo-api/src/modules/finance/index.ts` — barrel.

### Patrones del Codebase para REST + RBAC + scope

- `el-templo-api/src/modules/reports/routes.ts:43-52` — patrón `addHook("onRequest", authenticate + role check + attachCountryScope)`. **Modelo principal a seguir para finance/routes.ts.**
- `el-templo-api/src/modules/reports/types.ts:150` — `PaginatedResult<T>` definition. Reusar.
- `el-templo-api/src/modules/reports/service.ts:58, 155` — uso de PaginatedResult (`getAccessLog`, `getCharges`). Patrón de filters + pagination + COUNT(\*).
- `el-templo-api/src/modules/shared/permissions.ts` — agregar `FINANCE_ADJUSTMENT_ROLES`, `FINANCE_WRITE_ROLES`, `FINANCE_VOID_ROLES`, `FINANCE_READ_ROLES` aquí. Mantener style `[role, role, role] as const`.
- `el-templo-api/src/modules/shared/country-scope.ts:36` — `attachCountryScope(request, db)` middleware. Reusar tal cual.
- `el-templo-api/src/modules/shared/error-handler.ts` — `handleServiceError(err, reply, request.log, "operation")`. Reusar para todos los handlers.
- `el-templo-api/src/modules/shared/member-search.ts` — `buildMemberNameSearchCondition` para filtro `?search=` por nombre de miembro. Reusar en `GET /transactions`.
- `el-templo-api/src/modules/members/routes.ts:23, 89, 499, 745, 787` — patrones de role check granulares por handler (incluso después del hook a nivel module). Útil para POST /transactions donde el role check depende del kind.

### Registro en app.ts

- `el-templo-api/src/app.ts:149-151` — `app.register(reportsRoutes, { prefix: "/api/admin/reports" })`. Mismo patrón para finance: `app.register(financeRoutes, { prefix: "/api/admin/finance" })`.
- `el-templo-api/src/app.ts:111` — `app.register(memberRoutes, { prefix: "/api/admin/members" })`. La ruta `/api/admin/members/:id/financial-history` se monta donde resulte más limpio: dentro de `members/routes.ts` importando un handler exportado desde `finance/`, o como un register separado con prefix `/api/admin/members`.

### Frontend admin (CajaPage migration)

- `el-templo-admin/src/composables/usePaymentsApi.ts` — composable a migrar al endpoint nuevo. Phase 105-06 SUMMARY lo dejó intencionalmente en el filesystem.
- `el-templo-admin/src/pages/CajaPage.vue` líneas 368, 385 — sites de uso de `usePaymentsApi`. Verificar qué shape esperan y adaptar al payload nuevo de `/api/admin/finance/transactions`.

### Convenciones del Proyecto

- `CLAUDE.md` — Pino logger, no `any`, integration tests reales en `eltemplo_test`.
- `el-templo-api/test/helpers.ts` — `createApp()` + autenticación. Phase 105 ya lo usa para test/finance/transaction-service.test.ts. Phase 106 agrega test/finance/transactions-api.test.ts (o similar) para los endpoints HTTP.
- `.planning/REQUIREMENTS.md` §"Endpoints API (API)" — API-01 a API-07 (estado: pendientes).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **TransactionService** y **BalanceService** ya existen — Phase 106 solo expone vía HTTP. No tocar la lógica del service.
- **`PaginatedResult<T>`** type — reusar tal cual desde reports/types.ts (o moverlo a shared/types.ts si más módulos lo necesitan).
- **`attachCountryScope`** middleware — pegar al hook del módulo finance.
- **`buildMemberNameSearchCondition`** — reusar para el filtro `?search=` por nombre.
- **`handleServiceError`** — error handler estándar.
- **Zod schemas** — patrón en `reports/schemas.ts`. Crear `finance/schemas.ts` con createTransactionSchema, voidTransactionSchema, listTransactionsSchema, financialHistorySchema.
- **Tests con createApp()** — patrón en `test/helpers.ts`. Ya usado en `test/finance/transaction-service.test.ts` (Phase 105).
- **CAJA_ROLES** existente — referencia para el shape de las nuevas constantes FINANCE\_\*.

### Established Patterns

- **Route module structure:** `index.ts (export router) | types.ts | schemas.ts | service.ts (ya existe) | routes.ts (nuevo en 106)`.
- **Handler shape:**
  ```ts
  fastify.post("/path", { schema: zodSchema }, async (request, reply) => {
    try {
      // role check si depende del body
      // service call
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "create transaction");
    }
  });
  ```
- **role check post-hook:** cuando el rol mínimo depende del body (ej: kind=adjustment), el hook a nivel module aplica el rol más laxo (FINANCE_WRITE_ROLES) y el handler valida el rol más estricto si el kind lo requiere (FINANCE_ADJUSTMENT_ROLES). Patrón análogo en `members/routes.ts:499`.

### Integration Points

- **`el-templo-api/src/app.ts`** — agregar `app.register(financeRoutes, { prefix: "/api/admin/finance" })` cerca de los otros admin registers (después de members/subscriptions).
- **`el-templo-api/src/modules/finance/index.ts`** — barrel exporta `financeRoutes`.
- **`el-templo-admin/src/composables/usePaymentsApi.ts`** — refactor a `useTransactionsApi.ts` (rename + endpoint update) o mantener nombre con endpoint nuevo. Decidir en planning.
- **`el-templo-admin/src/pages/CajaPage.vue`** — actualizar imports + shape esperado.

### Constraints from Codebase

- `request.user.role` está tipado como `AdminRole` — usar el type existente.
- `request.scope.country` es opcional para owner — siempre verificar `if (!request.scope.isOwner) { ... apply country filter }`.
- COUNT(\*) sobre tabla `financial_transactions` con muchos rows en el futuro puede ser caro — Phase 106 se queda con el patrón actual (COUNT separado). Si la performance baja, Phase 109 (Caja v2) puede optimizar con cursor-based o caching.

</code_context>

<specifics>
## Specific Ideas

- El RBAC discusión fue: la spec original era literal de la REQUIREMENTS.md, pero el usuario expandió `gestion` a varios endpoints porque ya opera caja en el modelo actual. Esto refleja la realidad operativa, no una desviación arbitraria.
- Excluir `coach` de lecturas financieras es una decisión de privacy explícita — un coach no necesita ver historial de pagos para entrenar a un alumno.
- `affectedBalances` en el response del create es una optimización de UX para Phase 107/108: AssignPlanDialog y "Registrar pago" pueden mostrar el saldo nuevo inmediatamente sin re-fetch.
- Phase 106 NO toca features visuales nuevos en CajaPage — solo migra al endpoint nuevo manteniendo el comportamiento. Phase 109 hace el rediseño con segmentación por kind y aging.
- La pregunta sobre "historial por concepto pendiente" (PAYMENT-03 de Phase 108) se resuelve calculando agrupación en el frontend a partir del flat array. No requiere endpoint nuevo.

</specifics>

<deferred>
## Deferred Ideas

- **Excel export de transactions** — Phase 109 (CAJA-04) lo construye sobre el endpoint que Phase 106 expone. No incluir en 106.
- **Cursor-based pagination** — solo si la performance del COUNT(\*) baja. Hoy el patrón offset/limit es consistente con reports.
- **Multi-branch users** — el codebase no tiene `users.branchIds[]`. Si en el futuro un admin opera múltiples sucursales, agregar el concepto. Por ahora `users.branchId` (singular) es suficiente.
- **Branch scope estricto** — más restrictivo que country scope. Solo si aparece evidencia de que un admin de Mar del Plata no debe ver transacciones de Chapadmalal. Hoy el use case es ver toda Argentina.
- **Endpoint para "outstanding concepts del miembro"** (lo que necesita el dialog "Registrar pago" de PAYMENT-02 en Phase 108) — no requerido por API-01 a API-07. Phase 108 puede agregarlo o calcularlo del flat array.

### Reviewed Todos (not folded)

Ningún todo matched contra Phase 106.

</deferred>

---

_Phase: 106-endpoints-transaccionales_
_Context gathered: 2026-04-28_
