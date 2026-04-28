# Phase 105: Modelo de Datos + Drop del Viejo — Specification

**Created:** 2026-04-27
**Ambiguity score:** 0.12
**Requirements:** 9 locked

## Goal

Reemplazar las tablas `payments` y `debts` con un modelo transaccional unificado de tres tablas (`financial_transactions`, `transaction_links`, `balances` cacheada) más el service layer que mantiene los invariantes y la cache. El admin puede seguir usando el filtro "Solo deudores" en `AlumnosPage` apuntando ahora a la nueva cache. El milestone v4.8 queda con base de datos lista para que las siguientes fases construyan endpoints y UX encima.

## Background

**Estado actual del código:**

- `el-templo-api/src/db/schema/payments.ts`: tabla `payments` (Phase 49) con FK obligatoria a `subscription_id`. No modela cobros que no sean de plan.
- `el-templo-api/src/db/schema/debts.ts`: tabla `debts` (Phase 101) sin FK a payments ni subscriptions; un row activo por usuario (invariante en service layer); editable a mano. Decisión D-05 explícita: "no integration with payments table in v1".
- `el-templo-api/src/modules/payments/`: módulo completo (`service.ts` 499 LOC, `routes.ts`, `schemas.ts`, `types.ts`).
- `el-templo-api/src/modules/members/debts-service.ts`: 149 LOC con upsert/cancel/getActiveDebt.
- `el-templo-admin/src/components/MemberFormDialog.vue` líneas 420-464: sección "Deuda" con toggle "Deudor", `debtAmount`, `debtCurrency`, `debtNote`. Placeholder de la nota: _"Aclarar de qué suscripción es la deuda (ej: debe $20000 de la mensualidad de abril)"_ — la prueba autoejecutable de que el modelo es insuficiente.
- `el-templo-admin/src/pages/AlumnosPage.vue`: filtro "Solo deudores" (línea 55), banner deuda total (línea 149), columna Deuda condicional (línea 538). Hace queries directas contra `debts`.

**Por qué este reemplazo:**

El requerimiento operativo (Maman, 2026-04-27) era integrar la deuda al cargar membresía. El análisis profundo (`.planning/research/v48-financial-model-analysis.md`) reveló que el problema real es que `payments` y `debts` no comparten modelo: cobrar saldo de deuda no deja huella en caja (no aparece en `monthlyRevenue`); cargar otra deuda pisa la anterior (upsert silencioso); anular un pago no revierte la deuda asociada (porque no hay asociación). El modelo nuevo unifica todo en transacciones con links.

**Por qué empezamos de cero (sin backfill):**

Decisión locked del usuario (2026-04-27): `payments` y `debts` se dropean completamente en esta fase, sin migrar datos históricos ni mantener las tablas viejas. No hay deudas activas que preservar.

## Requirements

### 1. **Tabla `financial_transactions`** (cubre TXN-01)

- Current: No existe. Las transacciones financieras viven hoy fragmentadas en `payments` (cobros de plan) y `debts` (saldos sin trazabilidad).
- Target: Tabla `financial_transactions` creada con schema completo (Drizzle): `id`, `member_id` (FK users, NOT NULL), `kind` enum (`plan_charge`, `debt_settlement`, `refund`, `adjustment`, `advance_payment`), `direction` enum (`inflow`, `outflow`), `amount` int, `currency` varchar(3) default `'ARS'`, `payment_method` enum (`cash`, `transfer`, `card`, `aura_credit`, `internal`), `transaction_date` date NOT NULL (cuándo entró a caja), `effective_date` date NOT NULL (qué mes devenga), `branch_id` (FK branches, **NOT NULL** — online usa la virtual "Templo Online"), `recorded_by` (FK users, NOT NULL), `voided_at` timestamp nullable, `voided_by` (FK users) nullable, `void_reason` text nullable, `notes` text nullable, `created_at`, `updated_at`. Índices: por `member_id`, por `transaction_date`, por (`branch_id`, `transaction_date`), por (`kind`, `voided_at`).
- Acceptance: Schema en `el-templo-api/src/db/schema/financial-transactions.ts` exporta la tabla; migration SQL incluye CREATE TABLE con todos los campos y enums; `pnpm db:migrate` aplica limpio en local; `pnpm typecheck` verde.

### 2. **Tabla `transaction_links` (pivot)** (cubre TXN-02)

- Current: No existe.
- Target: Tabla pivot `transaction_links` creada con `id`, `transaction_id` (FK financial_transactions, NOT NULL), `target_kind` enum (`subscription`, `debt_balance`, `transaction`), `target_id` int NOT NULL, `allocated_amount` int NOT NULL, `created_at`. Constraint UNIQUE(`transaction_id`, `target_kind`, `target_id`). Índices: por (`target_kind`, `target_id`) para lookups eficientes "qué transacciones afectan al concepto X".
- Acceptance: Schema exporta la tabla; migration aplica; UNIQUE constraint impide insertar duplicados (verificado por test que intenta insertar dos rows iguales y espera error).

### 3. **Tabla `balances` (cache de saldos pendientes)** (NUEVO en spec — derivado de Q1 Round 1)

- Current: No existe. Los saldos pendientes se modelan hoy como rows editables en `debts`.
- Target: Tabla `balances` con `id`, `member_id` (FK users, NOT NULL), `target_kind` enum (`subscription`, `debt_balance`), `target_id` int NOT NULL, `currency` varchar(3) NOT NULL, `amount` int NOT NULL (saldo actual; positivo = miembro debe, negativo = saldo a favor; cero = saldado), `last_recomputed_at` timestamp NOT NULL. Constraint UNIQUE(`member_id`, `target_kind`, `target_id`, `currency`). Índices: por `member_id`, por (`amount`, `member_id`) para listado "deudores".
- Acceptance: Schema exporta la tabla; migration aplica; consultar "Solo deudores" se resuelve con `SELECT DISTINCT member_id FROM balances WHERE amount > 0` sin JOIN a transactions.

### 4. **Drop de `payments` y `debts`** (cubre TXN-03 + TXN-04 backend)

- Current: Ambas tablas existen con datos en producción y staging.
- Target: Migration SQL incluye `DROP TABLE payments` y `DROP TABLE debts` después del CREATE TABLE de las nuevas. Schema files `payments.ts` y `debts.ts` eliminados. Module `el-templo-api/src/modules/payments/` eliminado completo. Archivo `el-templo-api/src/modules/members/debts-service.ts` eliminado. Tests relacionados eliminados o adaptados.
- Acceptance: `grep -r "from '.*\\(payments\\|debts\\)'" el-templo-api/src` retorna 0 matches en código fuente (comments inline OK si son históricos en migrations o changelogs). `pnpm typecheck` verde sin imports rotos. `pnpm test` verde sin tests rotos.

### 5. **Eliminación de UI "Deudor" en `MemberFormDialog`** (cubre TXN-04 frontend; CHARGE-04 queda redundante en REQUIREMENTS y debe removerse)

- Current: `MemberFormDialog.vue` líneas 420-464 tiene sección "Deuda" con toggle, monto, moneda, nota libre.
- Target: Las líneas 420-464 eliminadas. Campos `isDebtor`, `debtAmount`, `debtCurrency`, `debtNote` eliminados del form schema y del payload del API de update miembro (`PATCH /members/:id`).
- Acceptance: El form no contiene la sección "Deuda" al renderizarse. El admin app compila sin referencias a `debtAmount`/`debtCurrency`/`debtNote`. El endpoint `PATCH /members/:id` rechaza si recibe esos campos (additionalProperties:false).

### 6. **Reescritura del filtro "Solo deudores" en `AlumnosPage`** (NUEVO en spec — derivado de Q1 Round 3)

- Current: El filtro y banner usan endpoints + service que queryan la tabla `debts`. Al dropearla, todo rompe.
- Target: El filtro y banner pasan a usar la cache `balances`. Endpoint que retorna miembros filtrados retorna también `totalDebtByCurrency` (aggregate de `balances WHERE amount > 0` agrupado por currency).
- Acceptance: AlumnosPage con "Solo deudores" activado muestra los miembros con balances positivos en `balances`. Banner muestra el total. Funcionalidad funcional equivalente a la actual, sin downtime de UX visible al admin.

### 7. **Service layer: invariantes de transacciones** (cubre TXN-05, TXN-06, TXN-07)

- Current: No existe — `payments` y `debts` services tienen reglas distintas.
- Target: `TransactionService` (o equivalente) en `el-templo-api/src/modules/finance/` (o nombre acordado en discuss-phase) expone métodos `create`, `void`, `getById`, `listForMember`, etc. Enforced:
  - **Inmutabilidad post-creación**: no permite UPDATE de `financial_transactions` excepto sobre `voided_at`, `voided_by`, `void_reason`. Modificaciones reales = void + recreate.
  - **Suma de allocated_amount**: si la transacción tiene N≥1 links, `Σ allocated_amount = amount`. Excepción: transacciones sin links son válidas para `kind ∈ {advance_payment, adjustment}`.
  - **Integridad referencial de links**: al crear una transacción con links, el service valida que `target_id` exista en la tabla correspondiente al `target_kind` (subscriptions, balances, transactions).
- Acceptance: Tests unitarios cubren los 3 invariantes con happy + sad paths. Intentar UPDATE de un campo no permitido tira error. Crear transacción con `Σ allocated ≠ amount` y links no vacíos tira error con mensaje claro. Crear link a `subscription_id` inexistente tira error.

### 8. **Service layer: mantenimiento de cache `balances`** (NUEVO en spec — derivado de Q1 Round 1+2)

- Current: No existe.
- Target: `TransactionService` mantiene la cache `balances` invariablemente. En cada `create` o `void`:
  - Para cada link de la transacción: aplicar `+allocated_amount` (si direction=`inflow` la transacción decrementa el saldo del concepto; si direction=`outflow` lo incrementa) sobre el row correspondiente en `balances`. Crear el row si no existe.
  - En `void`: revertir todos los efectos de los links de la transacción anulada.
  - Race conditions: la cache se mantiene en la misma DB transaction que el `create` o `void` (atómica). No hay riesgo de write parcial.
- Acceptance: Test unitario crea transacción `plan_charge` de 90k contra una subscription cuyo `pricePaid=100k` → `balances` row para esa subscription tiene `amount=10000` (debe 10k). Después un `debt_settlement` de 5k contra el mismo concepto → `balances.amount=5000`. Después void del debt_settlement → `balances.amount=10000`.

### 9. **Adjustment sin link permitido** (cubre TXN-06; resuelto en Q3 Round 2)

- Current: N/A — adjustment no existe hoy.
- Target: El service layer permite crear `kind='adjustment'` sin links (crédito o cargo libre sobre la cuenta del miembro, no atribuído a un concepto específico). El balance del miembro = suma de inflows/outflows incluyendo adjustments libres.
- Acceptance: Test unitario crea `kind='adjustment', direction='inflow', amount=5000, links=[]` y completa sin error. El "saldo total" del miembro (a futuro, fuera de Phase 105) reflejará este crédito.

## Boundaries

**In scope:**

- Schema Drizzle de las 3 tablas nuevas (`financial_transactions`, `transaction_links`, `balances`)
- Migration SQL única (manual, no `drizzle-kit generate`) que: CREATE las nuevas, DROP `payments`, DROP `debts`
- Service layer (`TransactionService` o equivalente) con CRUD básico + invariantes + mantenimiento de cache
- Eliminación de `el-templo-api/src/modules/payments/` y `members/debts-service.ts` y archivos relacionados
- Eliminación de la sección "Deuda" del `MemberFormDialog.vue` y los campos del form schema
- Reescritura del filtro "Solo deudores" + banner de `AlumnosPage` contra la cache `balances`
- Tests unitarios de los invariantes y del mantenimiento de cache

**Out of scope:**

- Endpoints REST nuevos — Phase 106 los expone (`POST /transactions`, etc.)
- UI de "Cobro" en `AssignPlanDialog` — Phase 107
- UI de "Registrar pago" + "Historial financiero" en perfil — Phase 108
- CajaPage v2 (summary segmentado por kind, aging report) — Phase 109
- Reconciliation cron job — diferida a v4.9, anotada en `deferred-items.md` (criterio: agregar si aparece evidencia de drift entre cache y datos crudos en producción)
- Mercado Pago / Stripe — milestone v6.x ecosistema
- Migración de datos históricos de `payments` y `debts` — explícitamente descartada (decisión usuario 2026-04-27)
- Dual-write o freeze period — N/A porque empezamos de cero

## Constraints

- **Migration manual, no `drizzle-kit generate`** — convención del proyecto post-Phase 86 (evitar prompts interactivos en non-interactive runs). Migration vive en `el-templo-api/src/db/migrations/0103_*.sql` (o número siguiente al último aplicado).
- **`balances` cache es atómica con la transacción** — no usar updates separados que abran ventana de inconsistencia. Si `INSERT financial_transactions` y `UPDATE balances` no van en una transacción DB, el invariante puede romperse en concurrent writes.
- **`branch_id` siempre NOT NULL** — online users se atribuyen a la virtual branch "Templo Online" (debe existir en seed; verificar en discuss-phase).
- **No modificar `subscriptions` table** — Phase 105 NO toca `pricePaid`, `priceOverrideAmount`, `auraDiscount`, `boardingPassUsed`. Esos campos siguen siendo legítimos para descuentos reales (no para deuda implícita).

## Acceptance Criteria

- [ ] `financial_transactions`, `transaction_links`, `balances` existen como tablas en MySQL local después de `pnpm db:migrate`
- [ ] `payments` y `debts` no existen como tablas después de la misma migration (verificable con `SHOW TABLES`)
- [ ] `el-templo-api/src/modules/payments/` no existe en el filesystem
- [ ] `el-templo-api/src/modules/members/debts-service.ts` no existe en el filesystem
- [ ] `grep -rE "(from ['\"].*\\b(payments|debts)\\b['\"])" el-templo-api/src` retorna 0 matches en código (comments OK)
- [ ] `grep -rE "isDebtor|debtAmount|debtCurrency|debtNote" el-templo-admin/src` retorna 0 matches
- [ ] `pnpm typecheck` verde en `el-templo-api` y `el-templo-admin`
- [ ] `pnpm lint` verde en `el-templo-api` y `el-templo-admin`
- [ ] `pnpm test` verde (suite completa, no solo nuevos tests)
- [ ] `MemberFormDialog.vue` no contiene la sección "Deuda" (visual check + grep "Deudor" devuelve 0 en ese archivo)
- [ ] `AlumnosPage` con filtro "Solo deudores" activado muestra correctamente los miembros con `balances.amount > 0` (smoke test manual con seed data)
- [ ] Tests unitarios cubren: invariante inmutabilidad, invariante suma allocated, invariante integridad referencial, mantenimiento de cache en create/void, adjustment sin links

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes                                                                                  |
| ------------------- | ----- | ----- | ------ | -------------------------------------------------------------------------------------- |
| Goal Clarity        | 0.90  | 0.75  | ✓      | 9 reqs con Current/Target/Acceptance específicos                                       |
| Boundary Clarity    | 0.90  | 0.70  | ✓      | In/Out scope explícitos; CHARGE-04 deduplicado a Phase 105                             |
| Constraint Clarity  | 0.85  | 0.65  | ✓      | 3 gray areas resueltas (dates, cache, branch_id); reconciliation diferida con criterio |
| Acceptance Criteria | 0.85  | 0.70  | ✓      | 12 checks pass/fail concretos (grep + typecheck + tests + smoke)                       |
| **Ambiguity**       | 0.12  | ≤0.20 | ✓      | Gate cleared con holgura                                                               |

## Interview Log

| Round | Perspective     | Question summary                                          | Decision locked                                                                           |
| ----- | --------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1     | Researcher      | transaction_date vs effective_date: separadas o una sola? | Separadas (ambas NOT NULL)                                                                |
| 1     | Researcher      | Saldo: cacheado o derivado puro?                          | Cacheado (tabla `balances` mantenida por service layer)                                   |
| 1     | Researcher      | branch_id nullable o always required?                     | NOT NULL — online usa virtual "Templo Online"                                             |
| 2     | Boundary Keeper | Cache scope: ¿incluye reconciliation cron?                | Schema + service-layer maintenance en Phase 105; reconciliation diferida a v4.9 (anotada) |
| 2     | Boundary Keeper | Quién remueve UI "Deudor"?                                | Phase 105 (TXN-04). CHARGE-04 queda redundante en REQUIREMENTS                            |
| 2     | Simplifier      | Adjustment sin link: permitido?                           | Sí, permitido (crédito libre sobre la cuenta)                                             |
| 3     | Boundary Keeper | Filter "Solo deudores" en AlumnosPage: ¿qué pasa al drop? | Reescribir contra `balances` en Phase 105 (no perder feature)                             |
| 3     | Failure Analyst | AC para "limpieza completa de código viejo"               | grep + typecheck + tests + lint, todos verde                                              |

---

_Phase: 105-modelo-de-datos-drop-del-viejo_
_Spec created: 2026-04-27_
_Next step: /gsd-discuss-phase 105 — implementation decisions (estructura del módulo, ubicación del service, naming, transacciones DB con drizzle, etc.)_
