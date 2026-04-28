# Phase 105: Modelo de Datos + Drop del Viejo - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Reemplazar `payments` y `debts` con un modelo transaccional de tres tablas (`financial_transactions`, `transaction_links`, `balances` cacheada), service layer con invariantes y mantenimiento atómico de cache, drop completo del código viejo (incluyendo callers en analytics, reports, subscriptions, job de auto-resume y UI de "Deudor" en MemberFormDialog), y reescritura de "Solo deudores" en AlumnosPage contra la nueva cache.

Phase 105 es **schema + service layer + cleanup E2E**. Phase 106 expone los endpoints nuevos (`POST /transactions`, etc.). 105 toca un endpoint existente (`GET /admin/members`) solo lo necesario para que AlumnosPage no rompa al dropear `debts`.

</domain>

<spec_lock>

## Requirements (locked via SPEC.md)

**9 requirements lockeados.** Ver `105-SPEC.md` para el texto completo de cada requirement, boundaries, y acceptance criteria.

Downstream agents (researcher, planner, executor) DEBEN leer `105-SPEC.md` antes de planificar o implementar. Los requirements no se duplican acá.

**In scope (de SPEC.md):**

- Schema Drizzle de `financial_transactions`, `transaction_links`, `balances`
- Migration SQL única manual (CREATE nuevas + DROP `payments`/`debts`)
- Service layer con CRUD + invariantes + mantenimiento de cache
- Eliminación de `el-templo-api/src/modules/payments/`, `members/debts-service.ts`
- Eliminación de sección "Deuda" del `MemberFormDialog.vue`
- Reescritura del filtro "Solo deudores" + banner de `AlumnosPage` contra cache `balances`
- Tests unitarios de invariantes y mantenimiento de cache

**Out of scope (de SPEC.md):**

- Endpoints REST nuevos (Phase 106)
- UI "Cobro" en `AssignPlanDialog` (Phase 107)
- UI "Registrar pago" + "Historial financiero" (Phase 108)
- CajaPage v2 con segmentación por kind y aging (Phase 109)
- Reconciliation cron (diferido a v4.9, ver `deferred-items.md`)
- Migración de datos históricos (descartada — drop sin backfill)
- Mercado Pago / Stripe (milestone v6.x)

</spec_lock>

<decisions>
## Implementation Decisions

### Blast Radius Cleanup (callers de payments/debts)

- **D-01:** Reescribir `analytics/service.ts` (`monthlyRevenue`, `revenueByMethod`) y `reports/service.ts` (queries de `payments` en líneas 169, 191, 434, 755+) contra `financial_transactions` en Phase 105 — NO stub, NO defer. Filtros equivalentes: `WHERE kind IN ('plan_charge', 'debt_settlement') AND voided_at IS NULL` para revenue real (cobros, no movimientos internos como adjustments). Razón: tener todo verde end-to-end después de 105 — admin no pierde dashboards entre 105→109.

- **D-02:** Reemplazar `paymentService.recordPayment(...)` con `transactionService.create({kind: 'plan_charge', direction: 'inflow', links: [{target_kind: 'subscription', target_id: subscriptionId, allocated_amount: pricePaid}]})` inline en los 4 callsites de `subscriptions/service.ts` (assignPlan, renew, etc.) y en `jobs/auto-resume-pauses.ts`. Mantiene contrato funcional: asignar plan con `pricePaid > 0` sigue dejando huella financiera. Phase 107 después reemplaza este auto-creado por flow explícito con UI "Cobro".

### Estructura del Módulo

- **D-03:** Nuevo módulo en `el-templo-api/src/modules/finance/`. Umbrella amplio para soportar a futuro reportes, caja, aging dentro del mismo módulo. Convención del proyecto: nombres de dominio (members/, scheduling/), no de entidad.

- **D-04:** Facade pattern — `TransactionService` + `BalanceService` separados. Sigue el patrón de `edit-service.ts → domain services` referenciado en CLAUDE.md.
  - `BalanceService`: encapsula lectura/escritura de cache `balances`. Expone `applyDelta(tx, links, sign)` que se llama dentro de la misma DB transaction.
  - `TransactionService`: orquesta `create`, `void`, `getById`, `listForMember`. En cada `create`/`void` abre `db.transaction(async (tx) => ...)`, inserta en `financial_transactions`, inserta los `transaction_links`, llama `BalanceService.applyDelta(tx, ...)`. Atomicidad garantizada por la DB transaction.
  - Testeable independientemente. Permite que Phase 109 agregue `AgingService` o `ReconciliationService` al mismo módulo sin sobrecargar `TransactionService`.

- **D-05:** Enums solo en Drizzle schema (`el-templo-api/src/db/schema/financial-transactions.ts`, `transaction-links.ts`, `balances.ts`). Tipos TS se infieren con `typeof table.$inferSelect`. Single source of truth. Convención del proyecto (ver `aura-transactions.ts`, `payments.ts`). Si admin/app necesitan los literales, los importan como `keyof typeof financialTransactions._.columns.kind.enumValues` o exportan una union desde shared types.

### Lifecycle de `balances` Rows

- **D-06:** Creación lazy. El row aparece la primera vez que una transacción con link a ese target lo toca. Subscriptions sin actividad financiera no tienen row en `balances`. `BalanceService.applyDelta` hace `INSERT ... ON DUPLICATE KEY UPDATE` (o equivalente Drizzle: `tx.insert(...).onDuplicateKeyUpdate(...)`).

- **D-07:** Cuando `amount` llega a 0 (saldado), el row se mantiene. NO DELETE. Razones: auditoría directa (el row es evidencia de que el concepto existió y fue saldado), simplifica void (revertir = sumar de vuelta sobre row existente), query "Solo deudores" usa `WHERE amount > 0` y los rows con cero quedan fuera naturalmente.

- **D-08:** `amount` negativo permitido — representa saldo a favor del miembro. Casos cubiertos: cobro con redondeo (cash sin vuelto), pago duplicado pre-void, refund parcial sobre concepto saldado, advance_payment con link a mes futuro. Consistente con SPEC ("positivo = miembro debe, negativo = saldo a favor; cero = saldado").

### Test Strategy

- **D-09:** Integration tests contra MySQL real (`eltemplo_test`), siguiendo convención post-Phase 19 (CLAUDE.md). Usar `createApp()` de `test/helpers.ts`. Cobertura obligatoria:
  - Invariante inmutabilidad: intentar UPDATE de campo no permitido → error.
  - Invariante suma: crear transacción con `Σ allocated ≠ amount` y links no vacíos → error con mensaje claro.
  - Invariante integridad referencial: crear link a `subscription_id` inexistente → error.
  - Mantenimiento de cache create: `plan_charge` 90k contra subscription pricePaid=100k → `balances.amount = 10000`. `debt_settlement` 5k después → 5000. Void del settlement → 10000.
  - `kind='adjustment', links=[]` → no error.
  - UNIQUE constraint en `transaction_links` (insertar duplicado → error).

### Frontend Scope dentro de Phase 105

- **D-10:** Phase 105 incluye:
  - Reescritura de `members/service.ts:166-276` (query de "Solo deudores" + agregado de deuda total por currency) contra `balances`. El endpoint existente `GET /admin/members?withDebts=true` (o como se llame el query param actual) sigue funcionando con el mismo contrato hacia el cliente.
  - Si el contrato existente no permite expresar "members con balance > 0", agregar un endpoint dedicado mínimo (`GET /admin/members/with-balances` o similar) que sirva exclusivamente al filtro "Solo deudores" y al banner. Decidir en planning según lo que descubra el researcher al leer `members/routes.ts` y la composable de admin.
  - `AlumnosPage.vue` (filtro línea 55, banner línea 149, columna línea 538) actualizada para consumir la nueva forma. Funcionalidad equivalente para el admin, sin downtime de UX.
  - Endpoints **nuevos** (POST /transactions, etc.) NO se agregan en 105 — eso es Phase 106. La regla se rompe solo donde es necesaria para que el drop no rompa AlumnosPage.

### MemberFormDialog Cleanup

- **D-11:** Eliminar quirúrgicamente:
  - HTML de la sección "Deuda" (líneas 420-464 de `MemberFormDialog.vue`).
  - Campos `isDebtor`, `debtAmount`, `debtCurrency`, `debtNote` del form schema TS.
  - Mismo set de campos del payload del `PATCH /members/:id` y de los Zod schemas en `members/schemas.ts`.
  - El endpoint usa `additionalProperties: false` (o equivalente Zod `.strict()`), así que payloads viejos con esos campos van a ser rechazados con 400. Razón: forzar a clientes desincronizados a refrescar (el push de la versión nueva del admin app fuerza el reload).
  - Si quedan miembros con deuda activa al momento del deploy, ese estado se pierde con el drop de `debts` — usuario confirmó "no migrar datos históricos" en SPEC.md.

### Migration Constraints (refresco de SPEC)

- Migration manual en `el-templo-api/src/db/migrations/0106_*.sql` (siguiente número después de 0105). NO `drizzle-kit generate`.
- Orden dentro del archivo: `CREATE TABLE financial_transactions` → `CREATE TABLE transaction_links` → `CREATE TABLE balances` → `DROP TABLE payments` → `DROP TABLE debts`. CREATE primero garantiza que si la migration falla a mitad, las tablas viejas siguen existiendo. (Si a Phase 105 le interesa atomicidad estricta, se puede envolver todo en una `START TRANSACTION` / `COMMIT` — pero MySQL no hace DDL transactional para CREATE/DROP TABLE; el orden es la única protección).
- Verificar antes del deploy que la branch `Templo Online` existe en seed (`el-templo-api/src/db/seed-production.ts:75` confirmado). El service layer asume su existencia para online users.

### Claude's Discretion

- Naming exacto de métodos del service (`create` vs `record`, `void` vs `cancel`). Recomendación: `create` y `void` siguen la nomenclatura del SPEC y del código viejo (`recordPayment` se reemplaza por `create({kind: 'plan_charge'})`).
- Estructura interna del facade (cómo `TransactionService` recibe `BalanceService` — DI por constructor, factory, etc.). Seguir el patrón de cómo `subscriptions/service.ts` recibe `paymentService?: PaymentService`.
- Cómo expresar el invariante "Σ allocated_amount = amount" — calcular en el service (más legible) o vía CHECK constraint en MySQL (más estricto pero requiere MySQL 8+).
- Mensajes de error exactos (en español por convención del proyecto).
- Si conviene un helper `tx` parameter en `BalanceService.applyDelta` para hacer lockable la firma a "solo se llama desde dentro de una transaction" (TypeScript brand types).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec & Análisis (lock)

- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-SPEC.md` — Locked requirements, boundaries, acceptance criteria. **MUST read before planning.**
- `.planning/research/v48-financial-model-analysis.md` — Análisis profundo del modelo, gray areas con voto pre-spec, casos de uso, riesgos. Contexto detrás del por qué se reemplaza payments+debts.
- `.planning/REQUIREMENTS.md` §"Modelo de Datos (TXN) — Phase 105" — Mapeo TXN-01 a TXN-07.
- `.planning/phases/105-modelo-de-datos-drop-del-viejo/deferred-items.md` — Reconciliation cron diferido a v4.9 con criterio explícito de retomar.

### Schema & Patrones del Codebase

- `el-templo-api/src/db/schema/payments.ts` — Schema actual a reemplazar (referencia de nomenclatura: voidedAt/voidedBy/voidReason, índices, FKs).
- `el-templo-api/src/db/schema/debts.ts` — Schema a borrar.
- `el-templo-api/src/db/schema/aura-transactions.ts` — Patrón de mysqlEnum + relations en el proyecto.
- `el-templo-api/src/db/schema/index.ts` — Export point central; quitar `payments`, `debts` y agregar las 3 nuevas tablas.
- `el-templo-api/src/modules/payments/service.ts:52, 113` — Patrón actual de `db.transaction(async (tx) => ...)` con Drizzle (referencia para implementar atomicidad de create/void).

### Callers a refactorizar (D-01, D-02)

- `el-templo-api/src/modules/analytics/service.ts:788-870+` — `monthlyRevenue`, `revenueByMethod` queryan `schema.payments`.
- `el-templo-api/src/modules/reports/service.ts:169, 191, 434, 755+` — Reportes que queryan `payments` (algunos via SQL raw, otros via schema).
- `el-templo-api/src/modules/subscriptions/service.ts:43, 115, 1117, 2261, 2622, 2871` — `paymentService?: PaymentService` con 4 callsites de `recordPayment` en assignPlan/renew/etc.
- `el-templo-api/src/jobs/auto-resume-pauses.ts:17, 23` — Job que instancia `PaymentService`.
- `el-templo-api/src/modules/members/service.ts:166-276, 509` — Query de "Solo deudores" + total deuda por currency contra `schema.debts`.
- `el-templo-api/src/modules/members/routes.ts:23, 453, 526` — Importa `DebtService`, mensajes en comments.
- `el-templo-api/src/modules/members/debts-service.ts` — Archivo completo a borrar (149 LOC).

### Frontend cleanup (D-10, D-11)

- `el-templo-admin/src/components/MemberFormDialog.vue` líneas 420-464 — Sección "Deuda" a eliminar.
- `el-templo-admin/src/pages/AlumnosPage.vue` líneas 55 (filtro), 149 (banner), 538 (columna) — Reescritura contra el endpoint nuevo basado en `balances`.
- `el-templo-admin/src/composables/` — Composable que llama al endpoint de members con filtro `onlyDebtors` (a verificar nombre exacto en planning).

### Convenciones del Proyecto

- `CLAUDE.md` — Standards post-Phase 19 (logging Pino/createLogger, no `any`, integration tests reales, migrations con custom runner `pnpm db:migrate` no `drizzle-kit migrate`, no `drizzle-kit generate` en non-interactive runs).
- `.planning/codebase/STRUCTURE.md` — Layout de módulos (`index.ts | types.ts | schemas.ts | service.ts | routes.ts`).
- `el-templo-api/test/helpers.ts` — `createApp()`, autenticación, request builders para integration tests.
- `el-templo-api/src/db/seed-production.ts:75` — Confirma que branch "Templo Online" existe en seed (D-08 supuesto).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`db.transaction(async (tx) => ...)` pattern** — ya usado en `payments/service.ts`, `aura/service.ts`, `subscriptions/service.ts`, `sessions/service.ts`, `scheduling/booking-service.ts`. Aplicar el mismo patrón en `TransactionService.create` y `TransactionService.void`.
- **Test helpers** — `test/helpers.ts` con `createApp()` y request authentication. Reusar para los integration tests de `finance/`.
- **`buildMemberNameSearchCondition`** (de `modules/shared`) — usado en `payments/service.ts`. Reutilizable si `TransactionService.list` soporta search por nombre de miembro (probablemente Phase 106, no 105).
- **`PaginatedResult<T>`** — patrón existente en `modules/shared` para responses paginadas. Reusable cuando 106 agregue `GET /transactions`.
- **Zod `.strict()` o `additionalProperties: false`** — patrón existente para rechazar campos extra en payloads (D-11).
- **Custom migration runner** — `src/db/run-migrations.ts` lee `el-templo-api/src/db/migrations/*.sql` numerados, trackea aplicadas en tabla `_migrations`. Aplicar la nueva migration manualmente en este formato.

### Established Patterns

- **Module layout** — `index.ts | types.ts | schemas.ts | service.ts | routes.ts`. `finance/` debería seguir el mismo. Para 105 sin endpoints, `routes.ts` puede omitirse hasta 106 (o crearse vacío con TODO).
- **Facade pattern** — `edit-service.ts → domain services` (referenciado en CLAUDE.md como ejemplo).
- **Service classes** — instanciadas en `app.ts` o en routes.ts con `new XService(db, log)`. Pasarse por DI a otros services (ver `subscriptions/service.ts:115` que recibe `paymentService?: PaymentService`).
- **Enum-only-in-schema** — `aura-transactions.ts:13` exporta `sourceTypeEnum`, no duplica en types.ts.
- **Pino logger** — pasar `log: FastifyBaseLogger` o `pino.Logger` al constructor del service. Nunca `console.log`.

### Integration Points

- **`el-templo-api/src/db/schema/index.ts`** — agregar exports de las 3 tablas nuevas, quitar `payments` y `debts`. Verificar que no rompa imports en otros archivos.
- **`el-templo-api/src/app.ts`** — Phase 106 va a registrar las routes de `finance/`. Phase 105 puede agregar la instancia del service si subscriptions lo necesita por DI (ver D-02).
- **Migration runner** — el archivo SQL nuevo `0106_*.sql` se aplica con `pnpm db:migrate`. Verificar local + staging antes de prod.

### Constraints from Codebase

- **Drizzle no soporta CHECK constraints en MySQL bien** — el invariante `Σ allocated = amount` se enforce en el service layer, no en SQL. (Si MySQL 8+ está garantizado, considerar CHECK como defensa en profundidad — pero no es bloqueante).
- **`drizzle-kit migrate` está prohibido** (CLAUDE.md). Usar el custom runner `src/db/run-migrations.ts`. Esto refuerza la decisión del SPEC de migration manual.
- **Tests post-Phase 19** — `console.log` y `any` están prohibidos (lint los pesca). Aplicar a todos los nuevos archivos.

</code_context>

<specifics>
## Specific Ideas

- El placeholder de la nota de deuda en `MemberFormDialog.vue` ("Aclarar de qué suscripción es la deuda...") es la prueba autoejecutable de que el modelo viejo es insuficiente. Eliminarlo es el cierre simbólico del modelo viejo.
- "Templo Online" como branch virtual: ya seedeada en producción (`seed-production.ts:75`). Online users le entran a esa branch en `branch_id` de `financial_transactions`. Confirmar también en seed local antes de tests integration.
- Testeo del invariante "Σ allocated = amount" — un test particularmente útil es: link único con `allocated = amount` (happy), 2 links que suman `amount` (happy), 2 links que NO suman (sad), 0 links con `kind='plan_charge'` (sad — debe fallar), 0 links con `kind='adjustment'` (happy — excepción permitida).
- El facade pattern (D-04) es preferencia explícita del usuario alineada con el patrón de `edit-service.ts` que ya existe en el codebase.

</specifics>

<deferred>
## Deferred Ideas

- **Reconciliation cron de cache `balances`** — diferido a v4.9 (criterio en `deferred-items.md` de la fase). No re-discutir en 105.
- **CHECK constraints en MySQL para invariante de suma** — defensa en profundidad opcional. Si Phase 105 quiere agregarla, es low-cost. Si no, el service layer es la única defensa y los integration tests cubren.
- **Helper `tx` brand type** — TypeScript trick para que `BalanceService.applyDelta` solo sea llamable desde dentro de una db.transaction. Mejora type-safety pero no es necesario para 105. Considerar en 106+.
- **Refactor de `subscriptions/service.ts`** para que la inyección de `transactionService` no sea opcional (`?:`). Hoy `paymentService?` es opcional para soportar tests legacy. Cuando 106 lockee el flow, hacer no-opcional.
- **Endpoint dedicado `/admin/members/with-balances`** — solo si el endpoint actual de members no permite expresar "balance > 0" sin romper su contrato. Decidir en planning con visibilidad del código.
- **Migración de datos históricos** — explícitamente descartada. No re-abrir.

### Reviewed Todos (not folded)

Ningún todo matched contra Phase 105 (`gsd-sdk query todo.match-phase 105` → 0 results).

</deferred>

---

_Phase: 105-modelo-de-datos-drop-del-viejo_
_Context gathered: 2026-04-28_
