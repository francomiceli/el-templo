# Phase 108: Pago de Saldo + Historial Financiero - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Cerrar el ciclo "asignar plan con cobro parcial → registrar pago contra saldo pendiente" que Phase 107 dejó abierto. Construye:

1. Endpoint backend `GET /api/admin/members/:id/outstanding-concepts` que retorna la lista autoritativa de saldos abiertos del miembro con descripción humana + antigüedad.
2. Botón "Registrar pago" en `AlumnoDetailPage` (deshabilitado si no hay saldos pendientes) que abre dialog con monto + método + fecha + notas + lista de conceptos pendientes con split allocation auto-FIFO.
3. Tab "Historial financiero" en `AlumnoDetailPage` (q-tabs nuevo) con timeline cronológico de todas las transacciones del miembro, expandible por fila para ver el split de links, con botón "Anular" gated por RBAC.

Phase 108 NO incluye:

- UI para ventas / donaciones / adjustments libres sin saldo pendiente (kind=adjustment inflow sin link) — fuera de scope.
- Refunds parciales (refund con monto < transaction original) — diferido.
- Multi-method split en un solo pago (50k cash + 30k transferencia) — diferido (mismo argumento que Phase 107).
- Saldos a favor / advance_payment desde el dialog — explícitamente bloqueado por decisión del usuario.
- Dialog multi-moneda (selector de currency) — alumnos no operan en >1 moneda.

</domain>

<decisions>
## Implementation Decisions

### Endpoint outstanding concepts

- **D-01:** Crear endpoint dedicado `GET /api/admin/members/:id/outstanding-concepts` que retorna array autoritativo de saldos abiertos. Shape:
  ```ts
  Array<{
    targetKind: "subscription" | "debt_balance";
    targetId: number;
    description: string; // texto humano
    currency: string; // ARS / EUR
    balance: number; // saldo pendiente positivo (entero)
    ageInDays: number; // días desde effective_date
    effectiveDate: string; // ISO date para auditoría / orden FIFO
  }>;
  ```
  Source: `SELECT FROM balances WHERE member_id=:id AND amount > 0` + JOIN con `subscriptions` + `plans` para descripción y `effective_date`. Ordenar por `effective_date` ASC (más viejo primero, para que el frontend mantenga el orden FIFO sin re-sort).
- **D-02:** El endpoint NO es paginado — un miembro casi nunca tiene >20 saldos abiertos. El array completo cabe en una respuesta.
- **D-03:** Cuando el miembro no tiene saldos abiertos, retornar `[]` (no error 404). El frontend usa el length para decidir si habilita el botón "Registrar pago".

### Cálculo de antigüedad y descripción del concepto

- **D-04:** `ageInDays` se calcula desde el `effective_date` del concepto (cuándo devenga, no cuándo se cobró por primera vez). Match con la semántica operativa "hace cuántos días debería haberse pagado". SQL: `DATEDIFF(CURDATE(), effective_date)`. Si effective_date es futuro (raro), `ageInDays = 0`.
- **D-05:** `effective_date` para `targetKind='subscription'` viene del campo `subscriptions.startDate` o equivalente que represente el inicio del período del plan (verificar en planning leyendo `subscriptions.ts` schema). Para `targetKind='debt_balance'` (caso poco usado) usar el `effective_date` de la transaction que originó ese balance.
- **D-06:** Descripción del concepto:
  - `targetKind='subscription'`: formato `"Mensualidad <Mes> <Año> — <NombrePlan>"` (ej: `"Mensualidad Marzo 2026 — Performance Mensual"`). Mes/año derivados del `effective_date`. Nombre del plan via JOIN a `plans.name`.
  - `targetKind='debt_balance'`: fallback `"Saldo libre #<id>"`. Caso poco frecuente; si en el futuro se necesita más detalle, se puede extender.

### Split allocation UX

- **D-07:** UX del dialog "Registrar pago":
  - **Default Auto-FIFO**: al abrir el dialog, el sistema pre-llena los inputs de allocation empezando por el concepto más viejo y avanzando hasta agotar el monto recibido o cubrir todos los saldos.
  - **Botón "Pagar todo"**: pre-llena `monto recibido = Σ saldos` y aloca el split exacto que cubre todo. Útil cuando alumno trae el total exacto.
  - **Modificación manual**: cada `q-input` por concepto es editable. Admin puede ajustar el split como quiera.
  - **Suma en vivo**: el dialog muestra `Total asignado: $X / $Y` actualizándose en cada cambio. Visualmente ✓ cuando coincide, en rojo cuando no.
- **D-08:** Si admin selecciona un concepto pero aloca `$0`, ese concepto NO se incluye en los `links` del payload (sin sentido enviar un link con allocatedAmount=0 que el invariante de SPEC §7 rechazaría).

### Validación Σ allocated = monto recibido

- **D-09:** **Σ allocated DEBE ser exactamente igual al monto recibido**. Bot Confirmar disabled hasta que coincidan. Si admin recibió de más, se le da vuelto físicamente; el sistema NO acepta saldos a favor / advance_payment desde este flujo.
- **D-10:** Frontend valida en vivo (UX) + backend valida en service layer (defensa en profundidad). Si payload llega con Σ ≠ monto, backend rechaza 400 con mensaje claro `"Σ allocated ($X) debe ser igual al monto total ($Y)"`. Cumple PAYMENT-02 literal.
- **D-11:** Σ allocated > 0 obligatorio (al menos un link debe tener allocatedAmount > 0). No se aceptan transacciones de pago sin links — eso violaría el invariante de SPEC §7 (kind='debt_settlement' requiere N≥1 links).

### Historial financiero — granularity y UI

- **D-12:** Granularity: **una row por transacción, expandible para ver el split de links**. El componente usa `q-list` + `q-expansion-item` (Quasar nativo). La row colapsada muestra fecha, monto, payment method, kind label en español, y total cubierto (si aplica). Al expandir, muestra cada link: `[$30k → Mensualidad Marzo 2026] [$20k → Mensualidad Abril 2026]`.
- **D-13:** UI patrón en `AlumnoDetailPage`: introducir `q-tabs` con dos pestañas:
  - "General" (contenido actual de la página)
  - "Historial financiero" (nuevo)
    Si la página hoy ya tiene tabs, sumamos uno. Si no tiene, refactorizamos a tab layout.
- **D-14:** Paginación del historial: **default size = 50, botón "Cargar más"** al pie de la lista. Match con patrón de CajaPage. Reusar el endpoint `GET /api/admin/members/:id/financial-history` que Phase 106 ya construyó (`PaginatedResult<FinancialHistoryItem>`).
- **D-15:** Visualización de transacciones anuladas: row con texto en strikethrough + badge rojo "Anulado" + razón visible al expandir. NO se ocultan por default — auditoría operativa requiere verlas.

### Botón "Anular" en el historial

- **D-16:** Cada row del historial financiero tiene un botón "Anular" (q-btn icon=cancel) **solo visible para roles** `owner | admin | gestion` (RBAC reusado de Phase 106 D-03 / `FINANCE_VOID_ROLES`). Recepción y coach NO ven el botón.
- **D-17:** Click en "Anular" abre dialog secundario con `q-input` "Razón de anulación" (textarea, requerido, min 5 chars). Confirmar dispara `POST /api/admin/finance/transactions/:id/void` (endpoint existente desde Phase 106). Cuando termina exitosamente, refresca el historial y los outstanding concepts (porque los saldos cambiaron).
- **D-18:** Anular es destructivo pero auditado: la transacción no se borra, se marca con `voided_at`, `voided_by`, `void_reason`. El balance revierte automáticamente (lógica del service ya en Phase 105/106). Los efectos de ese revert son visibles inmediatamente en el dialog "Registrar pago" (el saldo vuelve a aparecer pendiente).

### Botón "Registrar pago" — sin saldos pendientes

- **D-19:** Cuando el alumno tiene `outstanding-concepts.length === 0`, el botón "Registrar pago" en `AlumnoDetailPage` queda **deshabilitado con tooltip "Sin saldos pendientes"**. Match con PAYMENT-01/02/03 literal — Phase 108 cubre solo "pago de saldo", no otros tipos de cobro.
- **D-20:** Casos no cubiertos por este botón (ventas de merch, pagos anticipados, donaciones) requieren un flujo distinto que no es scope de Phase 108. Si operaciones lo necesita, abrir nueva fase con UI de adjustments libres.

### Multi-moneda

- **D-21:** Asumir un único currency por alumno (la de su sucursal). El dialog "Registrar pago" no tiene selector de moneda — usa la moneda implícita de los saldos abiertos. Si por una anomalía de data un alumno tiene saldos en >1 moneda (no debería pasar), loguear `warn` a Sentry y mostrar solo los de la moneda mayoritaria. No bloquear UX.

### Atomicidad y RBAC del registrar pago

- **D-22:** El backend reusa el endpoint existente `POST /api/admin/finance/transactions` (Phase 106). El payload del dialog: `kind='debt_settlement', direction='inflow', amount=monto recibido, links=[{ targetKind, targetId, allocatedAmount }, ...]`. Atomicidad ya garantizada por TransactionService (Phase 105 invariantes + Phase 107 tx pass-through).
- **D-23:** RBAC del botón "Registrar pago" reusa `FINANCE_WRITE_ROLES` (Phase 106 D-02): owner, admin, gestion, recepción. Coach NO puede registrar pagos.
- **D-24:** Single payment method per pago. Multi-method split queda diferido a futuro (mismo argumento que Phase 107: si admin necesita split, registra primero un pago parcial y otro pago contra el saldo restante).

### Claude's Discretion

- Texto exacto del tooltip "Sin saldos pendientes".
- Estilo visual del badge "Anulado" (color, posición).
- Orden de columnas en la tabla del historial (fecha, monto, método, kind, ...).
- Si el dialog "Anular" ofrece razones pre-armadas (dropdown "Error de tipeo", "Cliente devolvió", "Otro") o solo input libre.
- Naming exacto de tests.
- Si el endpoint outstanding-concepts retorna también el `pricePaid` original del plan (para mostrar "$80k esperado, $20k pendiente") o solo el balance — decidir leyendo si el frontend lo necesita visualmente.
- Granularity de los logs del backend (qué loguear cuando se registra un pago de saldo).
- Si el "Cargar más" del historial usa offset/limit (consistente con CajaPage) o cursor-based.
- Estilo del q-list expandible: q-expansion-item nativo vs componente custom con animación.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements

- `.planning/ROADMAP.md` §"Phase 108: Pago de Saldo + Historial Financiero" — goal + success criteria + dependencias.
- `.planning/REQUIREMENTS.md` §"Pago de Saldo + Historial Financiero (PAYMENT) — Phase 108" — PAYMENT-01, PAYMENT-02, PAYMENT-03.

### Phases anteriores (carrying forward)

- `.planning/phases/105-modelo-de-datos-drop-del-viejo/105-SPEC.md` — invariantes locked: §7 (suma allocated_amount=amount, integridad referencial), §8 (cache balances atómica), §9 (adjustment sin links permitido pero no aplica acá).
- `.planning/phases/106-endpoints-transaccionales/106-CONTEXT.md` — endpoints REST + RBAC patterns + response shapes (`affectedBalances` convention). D-13 ya menciona que la agrupación por concepto pendiente se calcula del flat array — Phase 108 lo cambia agregando endpoint dedicado.
- `.planning/phases/106-endpoints-transaccionales/106-VERIFICATION.md` — confirma que endpoints REST de finance están operativos, incluyendo POST /transactions, POST /transactions/:id/void, GET /members/:id/financial-history.
- `.planning/phases/107-cobro-al-asignar-plan/107-CONTEXT.md` — convención de no aceptar saldos a favor (D-04 cap superior); 108 mantiene la misma postura (D-09 acá).

### Backend — código a tocar

- `el-templo-api/src/modules/finance/transaction-service.ts` — sin cambios, solo lectura. El endpoint POST /transactions existente cubre el "Registrar pago".
- `el-templo-api/src/modules/finance/balance-service.ts` — sin cambios, solo lectura. La cache se mantiene atómica.
- `el-templo-api/src/modules/finance/routes.ts` — verificar que el endpoint POST /void ya está expuesto (debería estar desde Phase 106).
- `el-templo-api/src/modules/members/routes.ts` — montar el nuevo endpoint `GET /:id/outstanding-concepts` con auth + RBAC (FINANCE_READ_ROLES). Patrón igual al `GET /:id/financial-history` ya existente.
- `el-templo-api/src/modules/members/service.ts` o nuevo `el-templo-api/src/modules/finance/outstanding-service.ts` — método `getOutstandingConcepts(memberId)` que hace el query + JOIN + format. Decidir ubicación en planning.
- `el-templo-api/src/modules/finance/types.ts` — agregar type `OutstandingConcept`.
- `el-templo-api/src/modules/finance/schemas.ts` o nuevo — JSON Schema para la response del endpoint.
- `el-templo-api/test/members/outstanding-concepts.test.ts` (nuevo) — integration tests del endpoint.

### Frontend admin — código a tocar

- `el-templo-admin/src/composables/useTransactionsApi.ts` — extender con métodos: `getOutstandingConcepts(memberId)`, `getFinancialHistory(memberId, page, pageSize)`, `voidTransaction(id, reason)`. Phase 106-05 ya migró este composable; verificar shape actual.
- `el-templo-admin/src/types/transaction.ts` — agregar types: `OutstandingConcept`, `FinancialHistoryItem` (si no existe), `RegisterPaymentInput`.
- `el-templo-admin/src/components/RegisterPaymentDialog.vue` (NUEVO) — el dialog con lista de conceptos + split allocation + validación Σ + payment method.
- `el-templo-admin/src/components/FinancialHistoryTab.vue` (NUEVO) — el contenido del tab "Historial financiero", con q-list + q-expansion-item + paginación + botón Anular.
- `el-templo-admin/src/components/VoidTransactionDialog.vue` (NUEVO) — dialog secundario con razón obligatoria.
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — agregar q-tabs ("General" + "Historial financiero"), botón "Registrar pago" condicional al length de outstanding, mounting de los nuevos componentes.

### Patrones a seguir

- `el-templo-admin/src/pages/CajaPage.vue` — patrón de paginación con "Cargar más" + filtros + q-table. Reusar.
- `el-templo-admin/src/components/AssignPlanDialog.vue` — patrón de q-input numérico con prefix $, validación en vivo, botón Confirmar disabled cuando hay error. Reusar para el dialog "Registrar pago".
- `el-templo-api/src/modules/members/routes.ts` (al final) — patrón de subrutas con auth hook. Modelo para `GET /:id/outstanding-concepts`.
- `el-templo-api/src/modules/finance/routes.ts` — Phase 106 introdujo este. Modelo para schemas/handler patterns.
- `el-templo-api/test/finance/transactions-api.test.ts` (Phase 106) — patrón de integration test con createApp + auth helpers.
- `el-templo-admin/src/utils/format-price.ts` — `formatPrice(amount, currency)` para mostrar saldos.
- `el-templo-admin/src/utils/format-date.ts` — `formatDate` para timeline.

### Convenciones del proyecto

- `CLAUDE.md` — Pino logger en API, `createLogger()` en frontend, no `any`, integration tests reales en `eltemplo_test`, JSON Schema as const NOT Zod, pre-commit hooks corren Prettier.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **POST /api/admin/finance/transactions** ya existe (Phase 106). El dialog "Registrar pago" no requiere endpoint backend nuevo; usa el genérico con `kind='debt_settlement'`.
- **POST /api/admin/finance/transactions/:id/void** ya existe (Phase 106). El botón "Anular" del historial llama directamente.
- **GET /api/admin/members/:id/financial-history** ya existe (Phase 106). El tab "Historial financiero" lo consume tal cual.
- **TransactionService.create()** ya garantiza atomicidad (Phase 107 D-09/D-10 le agregó tx? param). Phase 108 no toca service layer.
- **BalanceService** ya mantiene la cache atómicamente. Phase 108 no toca.
- **`useTransactionsApi`** composable existente del Phase 106-05. Phase 108 lo extiende con métodos.
- **`PAYMENT_METHOD_OPTIONS`** y **`useTransactionsApi`** types ya están consolidados.
- **`q-tabs` de Quasar** — componente nativo, sin custom code necesario.
- **`q-expansion-item` de Quasar** — para el detalle de splits en el historial.

### Established Patterns

- **Endpoint con sub-recurso REST:** `GET /api/admin/members/:id/<sub>` ya tiene precedente con `financial-history` y otros notes. El nuevo `outstanding-concepts` lo replica.
- **JSON Schema as const:** Fastify nativo, NOT Zod. Replicar pattern de `subscriptions/schemas.ts:307` (numeric integer).
- **RBAC granular:** middleware `addHook("onRequest", authenticate + role check)` a nivel módulo + checks en handlers cuando el rol depende del payload. Phase 106 lo establece.
- **Pino logger estructurado:** `request.log.info({...}, 'msg')` en handlers, `this.log.info({...}, 'msg')` en services.
- **Composition API en stores/dialogs:** `defineStore` con `setup` function. Composables exponen `cleanup()`. No `onUnmounted` dentro de composables.

### Integration Points

- `el-templo-admin/src/pages/AlumnoDetailPage.vue` — el archivo central del frontend. Refactor a layout con tabs.
- `el-templo-api/src/modules/members/routes.ts` — donde se monta el nuevo endpoint sub-recurso.
- `el-templo-api/src/modules/finance/` — donde vive la lógica del query (sea en outstanding-service.ts dedicado o en una función dentro de transaction-service.ts).

### Constraints from Codebase

- `request.user.role` tipado como `AdminRole`.
- `request.scope.country` aplica para owner/non-owner. Para `outstanding-concepts`, no-owner solo puede ver miembros de su scope (heredado del auth check sobre `:id`).
- Drizzle migrations: Phase 108 NO requiere migration nueva (no toca schema DB).
- No `any` types: usar `unknown` + narrowing en error handlers.

</code_context>

<specifics>
## Specific Ideas

- **El dialog "Registrar pago" se ve así (mental model)**:

  ```
  ┌──────────────────────────────────────────────────────┐
  │ Registrar pago — Juan Pérez                           │
  │                                                       │
  │ Monto recibido: [____$50.000__] ARS                   │
  │ Método:        [▼ Efectivo    ]                      │
  │ Fecha:         [2026-04-28]   Notas: [....]           │
  │                                                       │
  │ Conceptos pendientes (FIFO)                          [Pagar todo] │
  │                                                       │
  │ Mensualidad Marzo 2026 — Performance Mensual          │
  │   Saldo: $20.000 ARS · Hace 58 días                  │
  │   Asignar: [____$20.000__] ✓                          │
  │                                                       │
  │ Mensualidad Abril 2026 — Performance Mensual          │
  │   Saldo: $30.000 ARS · Hace 27 días                  │
  │   Asignar: [____$30.000__] ✓                          │
  │                                                       │
  │  Total asignado: $50.000 / $50.000 ✓                 │
  │                                            [Confirmar] │
  └──────────────────────────────────────────────────────┘
  ```

- **Σ ≠ monto bloquea Confirmar.** Si admin tipea $50k recibido pero Σ allocated = $48k, botón disabled + texto rojo "Faltan $2k por asignar". Los $2k no quedan como crédito; admin tiene que ajustar para que coincida. Si el alumno trajo de más, físicamente le da vuelto.

- **Auto-FIFO al abrir el dialog** ordena los conceptos por `effective_date` ASC y aloca empezando del más viejo hasta agotar el monto recibido. Si admin cambia el monto recibido después de abrir, se re-ejecuta el auto-FIFO (watch).

- **Anular es siempre revertible solo desde SQL** (la transacción anulada no se puede des-anular vía UI). Si admin se equivoca al anular, contacto al dev. Esto es estándar contable — la anulación no debería ser reversible operativamente.

- **El tab "Historial financiero" muestra TODO el historial del miembro**, incluyendo:
  - Cobros al asignar plan (kind=plan_charge desde Phase 107)
  - Pagos de saldo (kind=debt_settlement desde Phase 108)
  - Adjustments (cuando aparezcan)
  - Refunds (cuando aparezcan)
  - Transactions anuladas (con strikethrough + badge "Anulado")

- **Convergencia con Phase 107:** ambas fases bloquean saldos a favor. Phase 107: `amountReceived <= pricePaid`. Phase 108: `Σ allocated = monto recibido`. La regla operativa es consistente: "el alumno paga exacto, no se aceptan créditos en cuenta".

</specifics>

<deferred>
## Deferred Ideas

- **UI para registrar otros tipos de cobro** (ventas de merch, donaciones, pagos anticipados) — kind='adjustment' inflow sin link. Excede scope de PAYMENT-01/02/03. Si operaciones lo necesita, abrir fase nueva.
- **Refunds parciales** (refund con monto < transaction original) — más complejo que el void simple. Diferido. Si surge, abrir fase nueva.
- **Multi-method split** en un solo pago (50k cash + 30k transferencia) — diferido. Workaround: registrar dos pagos secuenciales, uno por método.
- **Saldo a favor desde el dialog "Registrar pago"** — explícitamente rechazado por decisión del usuario. No se reabre.
- **Multi-moneda en el dialog** — alumnos no operan en >1 moneda. Si aparece data anomaly, log a Sentry pero no UI especial.
- **Anular y des-anular vía UI** — la anulación es one-way. Si se necesita revertir, intervención manual.
- **Filtros avanzados en el historial** (por kind, payment method, fecha range) — no requeridos por PAYMENT-03 literal. Si aparece la necesidad, agregar después.
- **Exports del historial** (Excel, PDF) — no requerido por PAYMENT-03. Phase 109 (CAJA-04) cubre exports de CajaPage; el historial individual del miembro queda fuera.
- **Pre-armado de razones de anulación** (dropdown con "Error de tipeo", "Cliente devolvió", "Otro") — Claude's Discretion. Si en planning queda claro que ayuda, agregar; sino input libre.

### Reviewed Todos (not folded)

Ningún todo matched contra Phase 108.

</deferred>

---

_Phase: 108-pago-de-saldo-historial-financiero_
_Context gathered: 2026-04-28_
