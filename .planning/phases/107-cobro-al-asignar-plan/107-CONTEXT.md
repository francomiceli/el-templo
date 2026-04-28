# Phase 107: Cobro al Asignar Plan - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Reemplazar el cobro implícito (auto-record con `amount = pricePaid`) por un flujo explícito en `AssignPlanDialog`: el admin tipea cuánto recibió, el dialog muestra preview en vivo del saldo pendiente, y el backend genera `financial_transaction + transaction_link` atómicos con la creación/cambio/renovación de la subscription. Cobertura completa: `mode='assign'`, `mode='change'` (proration y after_current) y `renew`.

Phase 107 NO incluye:

- Pagar saldos pendientes generados (Phase 108 — "Registrar pago")
- Tab de historial financiero en el perfil del miembro (Phase 108)
- Splits multi-método en una sola operación (deferred)
- Saldos a favor / advance_payment desde el dialog de asignación (Phase 108)
- Cambios a la regla de cálculo de proration (escapa scope)

</domain>

<decisions>
## Implementation Decisions

### UX del bloque "Cobro" en AssignPlanDialog

- **D-01:** El bloque "Cobro" vive en el step **Confirmar** (último step del stepper), debajo del summary de precio. El `q-select` de `paymentMethod` que hoy está en el step 2 (`Configurar`) se mueve al bloque Cobro del step Confirmar para mantener todos los campos de payment juntos. El step 2 queda solo con plan/precio (priceTypeApplied, startDate, boardingPass, AURA, override).
- **D-02:** El campo "Monto recibido" se pre-llena con `pricingDisplay.finalPrice` al entrar al step. Admin solo modifica si el cobro es parcial. Optimiza el caso 90% (cobro completo) y match con el comportamiento actual del backend (auto-record con pricePaid).
- **D-03:** Cuando `amountReceived < finalPrice`: warning banner amarillo above-the-fold dentro del step Confirmar, mensaje en español ej. "⚠ El plan se asigna con saldo pendiente. El miembro quedará como deudor por $X ARS." + preview en vivo del saldo (CHARGE-02). **Sin checkbox de confirmación. El botón Confirmar permanece habilitado.** El banner solo, sin label dinámico en el botón.
- **D-04:** Cuando `amountReceived > finalPrice`: validación frontend bloquea el botón Confirmar (q-input con max=`finalPrice`). El backend también valida (cap superior = `pricePaid` para defensa en profundidad). Saldos a favor / advance_payment se manejan en Phase 108 con el flow explícito de "Registrar pago".
- **D-05:** V1 soporta UN solo `paymentMethod` por cobro. Si el alumno paga con dos métodos, el admin registra cobro parcial al asignar (ej. 50k cash) y usa el flow "Registrar pago" de Phase 108 para la diferencia (ej. 30k transferencia) contra el saldo pendiente.
- **D-06:** Cuando `finalPrice = 0` (boarding pass / override 0 / plan zero): el bloque Cobro permanece **visible pero deshabilitado**, con leyenda en español "Plan gratuito - sin cobro". Los inputs (monto, payment method) están disabled. El backend no crea transaction (mantiene el guard `if (pricePaid > 0)` actual). Consistencia visual: el step Confirmar siempre muestra el bloque.
- **D-07:** En `mode='change' + startMode='now'` (proration activa): el summary del step Confirmar muestra desglose explícito en español:
  ```
  Plan: $100k
  Crédito proration: -$30k
  Neto a cobrar: $70k
  ```
  El campo "Monto recibido" se pre-llena con el **neto** (`netAmount`), y el preview de saldo se calcula `pendingBalance = netAmount - amountReceived`. En `startMode='after_current'` (sin proration) el desglose se omite y se usa el price entero del plan nuevo.
- **D-08:** Cobertura completa: Phase 107 cubre el cobro en TODOS los flujos que hoy invocan `transactionService.create` con `pricePaid` completo:
  - `assignPlan` — `subscriptions/service.ts:1117`
  - `changePlanNow` (proration) — `subscriptions/service.ts:2271`
  - `renew` / scheduled subs — `subscriptions/service.ts:2641`, `:2934`
  - Cualquier otro caller que el planner identifique al barrer el archivo

### Backend: refactor para atomicidad real (CHARGE-03)

- **D-09:** **Refactor `TransactionService.create()` y `BalanceService` para aceptar parámetro opcional `tx?: Transaction`** que reusa la connection externa en vez de abrir una nueva. Si `tx` se pasa, todas las queries del service corren contra esa conexión; si no, abre una db.transaction propia (preserva el comportamiento actual para callers externos como el endpoint REST).
- **D-10:** En `assignPlan`, `changePlan*` y `renew`: mover la llamada a `this.transactionService.create(input, adminId, tx)` **DENTRO** de la `db.transaction` existente que crea la subscription. Si el create de la transaction falla por cualquier razón (connection drop, lock timeout, constraint violation, balance-service throw, app crash mid-flight), la subscription también rollbackea. Cumple CHARGE-03 literal y elimina la categoría entera de "subscription orphan sin cobro registrado" que hoy puede ocurrir.
- **D-11:** Test de atomicidad obligatorio: simular fallo del `balance-service.update` (mock que tira error) durante `assignPlan` → verificar que ni la subscription ni la transaction quedaron persistidas (rollback completo).

### Schema/payload extension

- **D-12:** Naming del campo en payload: **`amountReceived`** (no `amountPaid`, no `chargedAmount`). Match con la semántica frontend ("monto recibido en caja").
- **D-13:** `AssignPlanInput`, `ChangePlanInput`, `RenewSubscriptionInput` (y demás inputs que cobran) ganan campo opcional `amountReceived?: number`. Si no se pasa o es `undefined`, **default = `pricePaid`** (o `netAmount` en `changePlanNow`). Mantiene backward compat con clientes existentes (apps móviles cacheadas, integraciones internas).
- **D-14:** Validación backend al recibir `amountReceived`:
  - Debe ser entero (cents/centavos no aplica — el codebase usa enteros para amounts).
  - `amountReceived >= 0` (404 sin sentido si negativo).
  - `amountReceived <= pricePaid` (o `<= netAmount` en change-now). Si excede, error 400 con mensaje claro `"amountReceived no puede exceder el monto a cobrar ($X)"`.
  - Si `amountReceived === 0` y `pricePaid > 0`: válido (representa "se asignó pero no se cobró nada"). Genera balance pendiente = `pricePaid` completo.

### Schema validation library (corrección de assumption stale)

- **D-15:** **El codebase NO usa Zod.** Los schemas de validación API son **Fastify JSON Schema** estilo `as const` (ver `el-templo-api/src/modules/subscriptions/schemas.ts`). Todo schema nuevo o extendido en Phase 107 sigue ese patrón. Esto **corrige la nota stale en `106-CONTEXT.md`** que mencionaba "Zod schemas — patrón en `reports/schemas.ts`. Crear `finance/schemas.ts` con createTransactionSchema..." — no es Zod.

### Logging / observability

- **D-16:** Cuando `amountReceived < pricePaid` (cobro parcial real, no pricePaid=0), emitir log estructurado con nivel `info` desde `subscriptions/service.ts`:
  ```ts
  this.log.info(
    {
      userId,
      subscriptionId,
      planId,
      pricePaid,
      amountReceived,
      pendingBalance: pricePaid - amountReceived,
      paymentMethod,
      branchId,
      recordedBy: adminId,
      flow: "assign" | "change-now" | "change-after-current" | "renew",
    },
    "Plan asignado con cobro parcial",
  );
  ```
  Permite a operaciones monitorear cuántos parciales hay por sucursal/admin/período sin necesitar query adhoc a `balances`.

### Tests granularity

- **D-17:** Tests **backend** (integration, contra `eltemplo_test` MySQL real, patrón `test/helpers.ts`):
  - **Happy path** — `assignPlan` con `amountReceived = pricePaid` (default backward-compat) → balance row queda en 0.
  - **Happy path** — `assignPlan` sin pasar `amountReceived` → default a `pricePaid` → idéntico al anterior (verifica backward compat).
  - **Happy path** — `assignPlan` con `amountReceived = pricePaid - 10000` → balance row positivo en 10000.
  - **Happy path** — `assignPlan` con `pricePaid = 0` (boarding pass) y `amountReceived` no pasado → no transaction creada, no balance row creada.
  - **Sad path** — `amountReceived > pricePaid` → 400 con mensaje claro.
  - **Sad path** — `amountReceived < 0` → 400.
  - **Atomicidad** — mock failure del `balance-service.update` durante `assignPlan` → assert que la subscription NO existe en DB después del error (rollback completo).
  - **Mismo set** para `changePlan` (mode `now` con proration y `after_current` sin proration) y `renew`.
- **D-18:** Tests **frontend** (Vue Test Utils si está configurado, sino smoke manual documentado en plan):
  - Default = `finalPrice` al abrir el step Confirmar.
  - Preview de saldo se actualiza en vivo cuando admin modifica `amountReceived`.
  - Banner amarillo aparece cuando `amountReceived < finalPrice`.
  - Botón Confirmar deshabilitado cuando `amountReceived > finalPrice` o `< 0`.
  - Bloque deshabilitado con leyenda cuando `finalPrice === 0`.
  - Modo `change/now` muestra desglose Plan / Crédito proration / Neto.

### Constraint de producción + rollout

- **D-19:** **Barcelona y Chapadmalal ya operan con Phase 105/106 desplegadas.** Cada subscription asignada post-deploy de Phase 105 generó un `plan_charge` con `amount = pricePaid` (cobro completo implícito). Phase 107 es **backward-compatible** (default `amountReceived = pricePaid` cuando no se pasa). NO se hace backfill ni migración de datos históricos. Las nuevas asignaciones post-deploy podrán ser parciales; las anteriores siguen registradas como cobradas completas (que es lo correcto — fueron cobradas completas).
- **D-20:** Rollout: deploy a staging primero. Smoke test obligatorio del flujo completo:
  1. Asignar plan con cobro completo (default behavior, backward compat) → caja muestra el cobro.
  2. Asignar plan con cobro parcial → balance row aparece en `balances`, AlumnosPage muestra al miembro como deudor.
  3. Cambiar plan con proration (now) y cobro parcial → desglose visible, balance correcto.
  4. Asignar con boarding pass → bloque deshabilitado, no transaction.
  5. Verificar logs estructurados en cobros parciales.
- **D-21:** Después de smoke test verde en staging, deploy a producción. NO deploy de viernes (regla operativa estándar).

### Claude's Discretion

- Texto exacto del banner amarillo (ej: `"⚠ El plan se asigna con saldo pendiente. El miembro quedará como deudor por $10.000 ARS."`) — pick algo claro en español.
- Estilo visual del desglose de proration en mode='change/now' (q-list nested vs cards apiladas vs definition list).
- Texto exacto de la leyenda "Plan gratuito - sin cobro" o variante.
- Granularity de los logs: campos extra a incluir más allá del set base (D-16).
- Naming exacto de los tests y archivos (ej. `test/subscriptions/charge-on-assign.test.ts`).
- Estructura de la `db.transaction` nested si drizzle-orm la soporta limpiamente. Si requiere refactor profundo, considerar extraer la lógica común a un helper interno.
- Si las notas del cobro (de la transaction) reusan el `notes` del form de assignPlan (que hoy va al subscription o a la transaction, sin claridad) o autogeneran un texto contextual — decidir en planning leyendo cómo usa `subscription.notes` el frontend hoy. **Default razonable:** la transaction usa `notes = "Cobro al asignar plan {planName}"` (autogenerado), y el `notes` del form sigue yendo al subscription como hoy.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements

- `.planning/ROADMAP.md` §"Phase 107: Cobro al Asignar Plan" — goal + success criteria + dependencias.
- `.planning/REQUIREMENTS.md` §"Cobro al Asignar Plan (CHARGE) — Phase 107" — CHARGE-01, CHARGE-02, CHARGE-03 (CHARGE-04 ya absorbido en Phase 105).

### Phases anteriores (carrying forward)

- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-SPEC.md` — invariantes del modelo de datos: inmutabilidad post-creación, suma de allocated_amount, integridad referencial de links, mantenimiento atómico de cache `balances`.
- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-CONTEXT.md` — convenciones de transactionService y balanceService.
- `.planning/phases/106-endpoints-transaccionales/106-CONTEXT.md` — RBAC patterns, response shapes, `affectedBalances` convention. **Nota: la mención de Zod en 106-CONTEXT.md es stale — el codebase usa Fastify JSON Schema, no Zod (ver D-15).**
- `.planning/phases/106-endpoints-transaccionales/106-VERIFICATION.md` — confirma que los endpoints REST de finance están operativos.

### Backend — código a tocar

- `el-templo-api/src/modules/subscriptions/service.ts` — el archivo central. Líneas con auto-record:
  - `:616+` (assignPlan) — refactor para `amountReceived` + atomicidad (D-09/D-10).
  - `:2271` (changePlanNow con proration) — refactor.
  - `:2641` (renew/scheduled subs) — refactor.
  - `:2934` (?) — verificar y refactorizar si aplica.
- `el-templo-api/src/modules/subscriptions/types.ts` — `AssignPlanInput`, `ChangePlanInput`, `RenewSubscriptionInput`. Agregar `amountReceived?: number`.
- `el-templo-api/src/modules/subscriptions/schemas.ts` — Fastify JSON Schema (`as const`). Extender los body schemas con la propiedad `amountReceived`.
- `el-templo-api/src/modules/subscriptions/routes.ts` — handlers que pasan input al service. Verificar que el body schema actualizado se aplique al endpoint.
- `el-templo-api/src/modules/finance/transaction-service.ts` — agregar parámetro opcional `tx?: Transaction` a `create()` (D-09). Pass-through a queries internas y al BalanceService.
- `el-templo-api/src/modules/finance/balance-service.ts` — mismo patrón de `tx` opcional.
- `el-templo-api/src/modules/finance/types.ts` — types base.

### Frontend — código a tocar

- `el-templo-admin/src/components/AssignPlanDialog.vue` (1079 LOC) — agregar bloque Cobro en step Confirmar (D-01..D-07). Mover el `q-select` de paymentMethod (línea ~481) hacia ahí. Agregar `q-input` numérico para `amountReceived` (default = `finalPrice`). Banner amarillo cuando parcial. Desglose proration en mode='change/now'.
- `el-templo-admin/src/composables/useSubscriptionsApi.ts` — extender el payload de `assignPlan`, `changePlan`, `renew` con `amountReceived`.
- `el-templo-admin/src/types/subscription.ts` — `AssignPlanInput` y demás types. Agregar `amountReceived?: number`.
- `el-templo-admin/src/types/transaction.ts` — `PAYMENT_METHOD_OPTIONS` ya existe, reusar.

### Patrones a seguir

- `el-templo-api/src/modules/subscriptions/schemas.ts:1+` — patrón JSON Schema `as const`. **NO Zod.**
- `el-templo-api/src/modules/subscriptions/service.ts` — patrón `db.transaction(async (tx) => { ... })` ya extensivo. Modelo para nesting / pass-through de tx.
- `el-templo-api/test/helpers.ts` + `el-templo-api/test/finance/transaction-service.test.ts` (Phase 105) — patrón de integration tests con createApp + autenticación.
- `el-templo-admin/src/utils/format-price.ts` — `formatPrice(amount, currency)` para mostrar montos. Reusar en banner y preview.
- `el-templo-admin/src/utils/logger.ts` — `createLogger('AssignPlanDialog')` ya en uso (línea 573). Loguear con esto.

### Convenciones del proyecto

- `CLAUDE.md` — Pino logger en API, `createLogger()` en frontend, no `any`, integration tests reales en `eltemplo_test`, migrations via custom runner (no aplica acá — Phase 107 no toca schema DB), pre-commit hooks corren Prettier.
- Memory: **3 sucursales en producción ya operan con cobros reales** (Barcelona, Chapadmalal, +1) — backward compat es no-negociable (D-19).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`AssignPlanDialog.vue` ya tiene** los building blocks: `q-input` numérico con currency (línea ~161 para priceOverrideAmount), `q-select` de payment method (línea ~481), `q-card`/`q-list` para summary del confirm step. Copiar esos patrones para el bloque Cobro.
- **`useSubscriptionsApi.assignPlan`** ya existe; solo se extiende el payload. No hay que crear composable nuevo.
- **`TransactionService.create()`** ya existe (Phase 105); el refactor es agregar parámetro `tx?` opcional. Backward-compat: callers que no pasan `tx` siguen funcionando idénticos.
- **`BalanceService`** ya mantiene la cache atómicamente; el refactor es solo el pass-through del `tx`.
- **`PAYMENT_METHOD_OPTIONS`** en `types/transaction.ts` reusable tal cual.
- **`formatPrice(amount, currency)`** en `utils/format-price.ts` reusable para el preview y el banner.
- **`pricingDisplay` computed** (línea ~747) ya calcula el `finalPrice` correcto considerando override / AURA / boarding pass. Reusar.
- **`changePlanPreviewData`** (línea 611) probablemente expone el `netAmount` para mode='change'. Verificar y reusar; sino extender el endpoint preview.

### Established Patterns

- **`db.transaction(async (tx) => { ... })`** es el patrón estándar en `subscriptions/service.ts`. Drizzle-orm soporta nesting (re-uso de la conexión cuando se pasa explícitamente). Verificar si requiere `tx.transaction(...)` anidado o solo pass-through del objeto. El planner debe leer drizzle docs para confirmar la API exacta.
- **Auto-record post-creación** es el anti-patrón a eliminar: hoy `assignPlan` commitea la sub en una tx y DESPUÉS llama a `transactionService.create()` (que abre otra tx). Phase 107 colapsa ambas en una sola.
- **Fastify route schemas** son objetos JSON Schema `as const` con `body`, `response`, `params`, `querystring` — formato Fastify nativo. Sin librería externa.
- **Integration tests** corren contra MySQL real (`eltemplo_test`). Patrón en `test/helpers.ts`. Mockear el balance-service para el test de atomicidad (vía DI a la subscription service).
- **Logging estructurado** con Pino: `request.log.info({ ...campos }, "mensaje")` en handlers, `this.log.info({ ...campos }, "mensaje")` en services.

### Integration Points

- **`subscriptions/service.ts`** es el archivo central — todas las refactorizaciones backend pasan por acá.
- **Stepper de `AssignPlanDialog.vue`** — los `step.value` y `confirmStep` (línea 670) deben absorber el rearreglo (paymentMethod fuera del step 2, dentro del Confirm).
- **`subscriptions/routes.ts`** — los handlers POST `/subscriptions/assign`, `/subscriptions/change`, `/subscriptions/renew` reciben el body actualizado.

### Constraints from Codebase

- `request.user.role` tipado como `AdminRole`, RBAC ya enforced por hooks del módulo subscriptions.
- `request.scope.country` aplica para filtros, no relevante en Phase 107 (el endpoint solo crea sobre members del scope).
- Drizzle migrations: Phase 107 NO requiere migration nueva (no toca schema DB — solo extiende payloads y refactoriza service layer). El schema de `financial_transactions`, `transaction_links`, `balances` quedó completo en Phase 105.
- No `any` types: usar `unknown` + narrowing en error handlers.

</code_context>

<specifics>
## Specific Ideas

- **Banner amarillo** above-the-fold dentro del step Confirmar, con icono de warning y texto en español: ej. `"⚠ El plan se asigna con saldo pendiente. El miembro quedará como deudor por $10.000 ARS."` — el monto se actualiza en vivo según `amountReceived` cambie.
- **Sin checkbox de confirmación, sin label dinámico en el botón** — el banner es la única señal de fricción. El admin lee el banner y confirma o ajusta el monto.
- **Desglose proration en mode='change/now'** se muestra en el summary del step Confirmar como tres lines/items (Plan / Crédito proration / Neto a cobrar) en formato `q-list` con `q-item` siguiendo el estilo del summary actual (líneas 444-475 del componente). En español.
- **Backward compat es no-negociable** porque hay 3 sucursales operando con cobros reales (Barcelona, Chapadmalal). El default `amountReceived = pricePaid` cuando no se pasa el campo asegura que cualquier cliente cacheado o flujo interno que no se actualice de inmediato siga funcionando.
- **El refactor del backend (D-09/D-10) es crítico** — sin atomicidad real, CHARGE-03 queda incumplido y persisten orphans (subscription sin cobro registrado). Dado el uso real de producción, esos orphans ya pueden estar ocurriendo silenciosamente; auditarlos en el plan o en una phase de limpieza posterior si aparecen.
- **Notas del cobro:** decisión razonable default — la transaction usa `notes` autogenerado contextual (`"Cobro al asignar plan {planName}"`); el `notes` del form sigue yendo a la subscription como hoy. No agregar input separado en v1.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-method split** (cobrar 50k cash + 30k transferencia en una sola asignación) — diferido. Si operaciones reporta necesidad frecuente, abrir fase nueva. Workaround actual: cobro parcial al asignar + "Registrar pago" (Phase 108) para la diferencia.
- **Pago anticipado / saldo a favor** desde el dialog de asignación — cubierto por Phase 108 con el flow explícito de "Registrar pago". El dialog de asignación bloquea `amountReceived > pricePaid` (D-04).
- **Revisar regla de crédito automático por proration** en `changePlanNow` — escapa scope de Phase 107. Hoy el `netAmount = priceNew - prorationCredit` se aplica por defecto sin opt-in del admin. Si operaciones quiere cambiar la lógica (ej: opt-in del crédito, o eliminarlo), abrir fase nueva. La opción D-07 (mostrar desglose explícito) hace al menos que el crédito sea visible al admin antes de confirmar.
- **Notas separadas plan vs cobro** — en v1 el `notes` del form va a la subscription y la transaction usa `notes` autogenerado contextual. Si operaciones quiere notas independientes (ej. "el alumno dijo que paga la diferencia el viernes"), agregar input separado en una iteración posterior.
- **Backfill / regeneración de transactions post-deploy** — explícitamente no se hace. Datos productivos existentes (Barcelona, Chapadmalal post-Phase 105) quedan tal cual, registrados como cobros completos.
- **Auditoría de orphans potenciales** (subscriptions creadas post-Phase 105 sin transaction asociada por algún fail silencioso del paso 2) — fuera de scope de 107. Si después del refactor aparece evidencia de orphans históricos, abrir tarea de auditoría/limpieza.

### Reviewed Todos (not folded)

Ningún todo matched contra Phase 107.

</deferred>

---

_Phase: 107-cobro-al-asignar-plan_
_Context gathered: 2026-04-28_
