# Phase 112: Enrollment Service + Admin Add-ons - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Centralizar el lifecycle de `program_enrollments` en un único `EnrollmentService` (extraído de `subscriptions/service.ts`, donde hoy hay 6 inserts duplicados + el `tearDownBundleEnrollments` agregado en fase 111), y sobre esa base habilitar que el admin asigne programas adicionales (add-ons) a un miembro con precio opcional. Los add-ons heredan el ciclo de vida de la sub principal: se transfieren al cambiar de plan, se pausan al pausar la sub, y se cancelan al cancelar/expirar la sub.

Refactor + feature van juntos: el refactor sin el feature no tiene payoff de usuario, el feature sin el refactor empeora el spaghetti existente.

</domain>

<decisions>
## Implementation Decisions

### Schema (`program_enrollments`)

- **D-01:** Cuatro columnas nuevas: `source` (enum NOT NULL `plan_linked | plan_bundle | admin_addon`), `price_paid` (int nullable), `assigned_by` (FK `users.id` nullable), `subscription_id` (FK `subscriptions.id` nullable).
- **D-02:** El enum `program_enrollment_status` se extiende con `paused`. Hoy es `active | completed | expired | cancelled`; pasa a incluir `paused` para reflejar el lifecycle ligado a la sub padre.
- **D-03:** Migration backfilea registros existentes — `source` derivado del plan original (plan con `linkedProgramId` → `plan_linked`, plan con `grantsAllPrograms` → `plan_bundle`); `subscription_id` resuelto donde sea unívoco. Casos ambiguos quedan `null` (decisión documentada en migration log; el research/planner define la regla concreta de desempate).
- **D-04:** Migration idempotente (re-runnable como no-op) per fase 86 / 90 / 103-01 / 111 patterns. Sin uso de `drizzle-kit generate` (meta/\_journal.json desincronizado en el repo); SQL escrito a mano.

### EnrollmentService (refactor)

- **D-05:** Vive en `el-templo-api/src/modules/programs/enrollment-service.ts`. Inyectado a `SubscriptionService` por constructor (DI pattern fase 56 / fase 105-03).
- **D-06:** Métodos públicos esperados (research/planner refina el contrato exacto): `enrollFromPlan(userId, plan, subId, tx?)`, `enrollAddon(userId, programId, subId, opts, tx?)`, `tearDownForSubscription(subId, tx?)`, `transferAddons(fromSubId, toSubId, tx?)`, `pauseForSubscription(subId, tx?)`, `resumeForSubscription(subId, tx?)`, lectura.
- **D-07:** Mutadores aceptan `tx?: TxHandle` opcional (mismo pattern que `auditLog.write` de fase 111-02). No abren transacción propia — atomicidad la decide el caller.
- **D-08:** Refactor preserva comportamiento. Tests existentes de fase 111 (teardown on cancel/expire + recompute `user.status`) deben pasar sin modificaciones — ese es el gate de no-regresión.
- **D-09:** `tearDownBundleEnrollments` (fase 111) se reemplaza por `tearDownForSubscription`, generalizado a TODAS las sources (no solo bundle). El método nuevo cubre el mismo caso + admin_addons.

### Admin Add-on Assignment

- **D-10:** Endpoint: `POST /api/admin/users/:userId/program-addons` con body `{ programId, pricePaid?, notes? }`.
- **D-11:** Requiere sub activa o pausada del target user. Sin sub → HTTP 400 con código de error explícito ("ASSIGN_PLAN_FIRST" o similar — research/planner define el código).
- **D-12:** Programa duplicado activo (cualquier source: plan_linked, plan_bundle, admin_addon) → HTTP 409. Forzar al admin a cancelar el enrollment existente primero. Esto incluye el caso edge donde el user tiene plan bundle (`grants_all_programs`) y se le quiere agregar add-on de un programa que ya está enrolled vía bundle — bloqueado.
- **D-13:** `pricePaid > 0` genera `financial_transaction` atómico con la creación del enrollment, link via `transaction_links`. **Decisión técnica delegada a research/planner:** decidir si se extiende el enum `kind` con un valor nuevo (e.g. `program_addon_charge`) y el enum `target_kind` con `enrollment`, o si se reusan `plan_charge` + `subscription` apuntando a la sub padre. Ambas opciones tienen tradeoffs (extender = correctness semántico + migration de enum; reusar = sin schema churn pero pierde trazabilidad granular). El planner debe revisar el módulo finance v4.8 y proponer la opción + cobertura de tests; revisar con el user si la decisión no es obvia.
- **D-14:** `pricePaid = 0` o `null` → enrollment se crea sin financial_transaction (regalo). Path bypassea el módulo finance.
- **D-15:** Currency del `pricePaid` hereda de la sub activa del miembro (sin override). Aligned con OOS de REQUIREMENTS.md.

### Lifecycle Hooks

- **D-16:** Pause de sub → `EnrollmentService.pauseForSubscription(subId, tx)` actualiza el status de **todas las enrollments activas** asociadas a esa sub a `paused` (no solo admin_addons). Aplica a todas las sources. Hook en `pauseSubscription` (subscriptions/service.ts:1764). Esto cierra un gap pre-existente — hoy `pauseSubscription` no toca `program_enrollments` en absoluto.
- **D-17:** Resume de sub → `EnrollmentService.resumeForSubscription(subId, tx)` revierte enrollments `paused` a `active`. Hook en `resumeSubscription`. No reactiva `cancelled` / `expired` / `completed` — solo el último estado pausado.
- **D-18:** Cancel/expire de sub → `EnrollmentService.tearDownForSubscription(subId, tx)` cancela enrollments asociadas (decisión C ya locked en REQUIREMENTS.md). Aplica a TODAS las sources, no solo bundles — generaliza el comportamiento de fase 111. **No genera refund automático** (decisión C explícita).
- **D-19:** changePlan (now y after-current) → `EnrollmentService.transferAddons(fromSubId, toSubId, tx)` actualiza `subscription_id` de admin_addons activas para apuntar a la sub nueva. Sin re-cobro (decisión A). Solo aplica a `source = admin_addon` — los `plan_linked` / `plan_bundle` se recrean desde el plan nuevo (lógica existente del flow de changePlan).
- **D-20:** changePlan con cero add-ons activos → no-op limpio en transferAddons. Sin errors, sin updates spurios.

### Member-App UX

- **D-21:** Dropdown del weekly view en home del member ya muestra todas las enrollments activas via patrón bundle (fase 104). Verificación es deliverable; si surge gap, parche mínimo. Probable outcome: cero código.

### Permissions / Audit

- **D-22:** RBAC del endpoint de asignación de add-on: `FINANCE_WRITE_ROLES` (owner | admin | gestion | recepcion). **Decisión técnica delegada a research/planner:** confirmar que recepcion debe poder asignar add-ons (consistente con que recepcion puede asignar planes hoy) o restringir a `ADMIN_ROLES`. Si hay duda, escalar al user.
- **D-23:** Cancel de add-on individual: roles que ya pueden cancelar enrollments hoy (ver `programs/service.ts:cancelEnrollment`). Mantener.
- **D-24:** Audit log (introducido en fase 111) escribe entries para: (1) asignación de add-on (incluye actor, programId, pricePaid), (2) cancelación manual de add-on (actor, motivo si lo hay). Teardown automático (cancel/expire/pause/resume de sub) NO va a audit log — ya está implícito en el evento de la sub que sí se audita.

### Claude's Discretion

- Estructura interna de plans dentro de Phase 112 (probable: schema → service refactor → API + lifecycle hooks → UI admin → verification member). Definida en `/gsd-plan-phase 112`.
- Naming exacto de columnas, índices, error codes, kinds del enum si se extiende — research/planner siguiendo conventions del codebase (snake_case en SQL, camelCase en TS).
- Estrategia exacta de tests (unit vs integration mix). Convención del módulo: integration tests contra MySQL real per CLAUDE.md.

### Folded Todos

None.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope

- `.planning/REQUIREMENTS.md` — 24 requirements (ENROLL, ADDON-SCHEMA, ADDON-API, ADDON-LIFE, ADDON-ADMIN-UI, ADDON-MEMBER-UI). All map to Phase 112.
- `.planning/ROADMAP.md` (sección "v4.85 Phase Details" → Phase 112) — Goal, success criteria, scope envelope.
- `.planning/PROJECT.md` (sección "Current Milestone v4.85") — Decisiones arquitectónicas A/C/A, out-of-scope explícitos.

### Schema y módulos relevantes

- `el-templo-api/src/db/schema/program-enrollments.ts` — Tabla `program_enrollments` actual. Phase 112 agrega columnas + extiende enum status con `paused`.
- `el-templo-api/src/db/schema/micro-programs.ts` — Tabla `programs` (definición del programa).
- `el-templo-api/src/db/schema/subscription-plans.ts` — `linkedProgramId` + `grantsAllPrograms` (sources actuales de enrollment).
- `el-templo-api/src/db/schema/subscriptions.ts` — Tabla `subscriptions` (lifecycle al que se acoplan los add-ons).
- `el-templo-api/src/db/schema/financial-transactions.ts` — Enum `kind` (`plan_charge | debt_settlement | refund | adjustment | advance_payment`). Phase 112 puede necesitar extender.
- `el-templo-api/src/db/schema/transaction-links.ts` — Enum `target_kind` (`subscription | debt_balance | transaction`). Phase 112 puede necesitar extender.

### Servicios y patrones a respetar

- `el-templo-api/src/modules/subscriptions/service.ts` — 3995 LOC. Contiene 6 inserts directos a `programEnrollments` (líneas aprox 1204, 1257, 2485, 2536, 3191, 3872) + `tearDownBundleEnrollments` (fase 111). Estos son los call sites que el refactor reemplaza.
- `el-templo-api/src/modules/subscriptions/service.ts:1764-1817` — `pauseSubscription` actual (no toca enrollments — gap que D-16 cierra).
- `el-templo-api/src/modules/subscriptions/service.ts:1822-` — `resumeSubscription` (mismo gap, D-17 lo cierra).
- `el-templo-api/src/modules/programs/service.ts` — Service actual de programas. EnrollmentService es un módulo nuevo dentro de `programs/`.
- `el-templo-api/src/modules/finance/transaction-service.ts` — TransactionService v4.8. Phase 112 lo invoca para crear financial_transaction al asignar add-on con `pricePaid > 0`.
- `el-templo-api/src/modules/finance/balance-service.ts` — BalanceService. Define `TxHandle` exportado canónicamente (per fase 111-02).
- `el-templo-api/src/modules/shared/permissions.ts` — `FINANCE_WRITE_ROLES`, `ADMIN_ROLES`, `OWNER_ROLES` para RBAC del endpoint.

### Antecedentes / patrones a heredar

- `.planning/phases/111-*/111-CONTEXT.md` y `111-VERIFICATION.md` (si existen) — Patterns para audit_log, idempotent migrations, atomic transactions, recompute user.status.
- `.planning/phases/056-*/` (Phase 56) — DI pattern original (constructor injection of services).
- `.planning/phases/105-*/` (Phase 105) — TransactionService DI pattern + financial transaction atomicity.
- `CLAUDE.md` (raíz del repo) — Standards: no `any`, no `console.log`, integration tests contra MySQL real, snake_case SQL / camelCase TS.

### Out of scope (no investigar ni planear)

- Flow combinado "renovar + regalar" (REQUIREMENTS.md "Future Requirements").
- Refund automático al cancelar add-on manualmente (REQUIREMENTS.md "Future Requirements"). El cancel manual de add-on con `pricePaid > 0` deja la `financial_transaction` como ingreso firme — el admin puede crear refund manual via finance v4.8 si quiere.
- Add-ons sin sub activa (REQUIREMENTS.md "Out of Scope").
- Reactivación automática al re-suscribirse después de cancel (REQUIREMENTS.md "Out of Scope").
- Multi-currency override en pricePaid (REQUIREMENTS.md "Out of Scope" + D-15).
- Splits mecánicos de subscriptions/service.ts (corresponde a v4.9).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`auditLog.write` helper** (fase 111-02): firma `(tx, entry)`, no abre tx propia, atomicidad del caller. Se reusa para D-24 directamente.
- **`TxHandle` type** (`finance/balance-service.ts`): export canónico. EnrollmentService importa de ahí (no redefine).
- **DI pattern** (fase 56 / 105-03): constructor injection. SubscriptionService ya recibe `transactionService`; ahora también recibe `enrollmentService`.
- **Setter DI pattern** (fase 61): para circular deps SubscriptionService↔BookingService. Si surge un ciclo SubscriptionService↔EnrollmentService, este pattern lo resuelve.
- **`FINANCE_WRITE_ROLES`** (`shared/permissions.ts:80`): incluye recepcion. Probable RBAC del endpoint de add-on (D-22).
- **Patrón bundle del member-app** (fase 104): el dropdown del home ya itera sobre todas las enrollments activas. Verificación de D-21 confirma que add-ons funcionan sin cambios.

### Established Patterns

- **Manual SQL migrations** (fase 86 / 90 / 103-01 / 111): no usar `drizzle-kit generate` (meta/\_journal.json desfasado). SQL hand-written, idempotente, defensivo (WHERE-on-BEFORE-state guards).
- **Tests integration contra MySQL real** (CLAUDE.md): nada de mocks de DB. `eltemplo_test` database, helpers en `test/helpers.ts`.
- **Status enum extensions**: el patrón es agregar el valor al enum drizzle + migration `ALTER TABLE … MODIFY COLUMN status ENUM(…)` con todos los valores.
- **Service mutator atomicidad**: caller decide tx, callee acepta `tx?` opcional (fase 111-02).

### Integration Points

- `subscriptions/service.ts:pauseSubscription` (línea 1790-1801) — agregar `await this.enrollmentService.pauseForSubscription(sub.id, tx)` dentro del `db.transaction`.
- `subscriptions/service.ts:resumeSubscription` (línea 1822+) — agregar `await this.enrollmentService.resumeForSubscription(sub.id, tx)` análogamente.
- `subscriptions/service.ts:cancelSubscription` y auto-expire — reemplazar `tearDownBundleEnrollments(...)` por `tearDownForSubscription(...)` en el EnrollmentService.
- `subscriptions/service.ts:changePlanNow` y `changePlanAfterCurrent` — agregar llamada a `transferAddons` después de crear la sub nueva, antes de cerrar la vieja (orden a verificar por planner).
- `programs/routes.ts` o admin-namespaced equivalente — registrar `POST /api/admin/users/:userId/program-addons`.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` (o equivalente) — agregar sección "Programas".

</code_context>

<specifics>
## Specific Ideas

- **Caso de uso negocio (de los audios del 2026-05-04):** Ignacio quiere "regalar" programas (Glúteos, Espartana, 30 días) a alumnos que renuevan a largo plazo. El add-on con `pricePaid = 0` cubre exactamente este caso. La feature también funciona para venta directa de programas adicionales sobre un plan presencial (caso futuro, mismo endpoint).
- **Spaghetti diagnosis:** la fase 111 fue síntoma reciente — agregar `tearDownBundleEnrollments` requirió mirar 6 sitios duplicados de creación de enrollment para entender qué teardown faltaba. El refactor de Phase 112 elimina ese costo en todas las features futuras de programas.
- **Precede a v4.9:** v4.9 (queued) hace split mecánico de `subscriptions/service.ts` (3995 LOC). v4.85 saca lógica de enrollment fuera del archivo antes del split → v4.9 se simplifica.

</specifics>

<deferred>
## Deferred Ideas

- **Flow combinado "renovar + regalar Espartana"** en un solo botón en `RenewSubscriptionDialog`. Por ahora es flow de dos pasos (renovar → asignar add-on). Se evalúa según fricción operativa real.
- **Refund explícito al cancelar add-on manualmente** antes de su completion. Política de devolución de `pricePaid` no está definida; admin puede crear refund manual via finance v4.8 si necesita.
- **Add-ons como producto vendible directamente al member desde su app** (self-service). v4.85 solo soporta asignación admin.
- **Reactivación automática de add-ons cancelados al re-suscribirse**. Decisión C explícita: si la sub muere y vuelve, los add-ons NO reviven.

### Reviewed Todos (not folded)

None.

</deferred>

---

_Phase: 112-enrollment-service-admin-add-ons_
_Context gathered: 2026-05-04_
