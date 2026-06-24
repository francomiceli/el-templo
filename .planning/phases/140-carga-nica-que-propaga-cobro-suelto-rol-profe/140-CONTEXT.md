# Phase 140: Carga única que propaga + cobro suelto + rol profe - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

El **corazón del milestone**: el **coach** (rol "profe") registra un pago desde una **UI dead-simple mobile-web estilo PoS** en pocos toques, y ese único registro **propaga atómicamente** (activa/renueva membresía + impacta la caja correcta) de forma **idempotente** (doble-click no duplica). La misma pantalla soporta **cobro suelto** (pago a un socio que NO renueva membresía, con concepto libre). El rol **coach** se habilita con permisos **acotados**: carga → PENDIENTE; **NO** valida/observa/anula ni ve saldos de caja.

**PRIMERA fase con UI real del milestone.** Depende de 137 (validation_status por rol), 138 (resolución de caja por default), 139 (modelo de caja completo). End state: el profe carga una sola vez, la admin deja de re-tipear.

### En scope (140)

- **Pantalla del coach "Cargar pago"** en el admin (`el-templo-admin`, Quasar/Vue), **mobile-web estilo PoS** (botones grandes, simples, para el mostrador desde el celular). Dos modos: **(a) renovar plan** (autocompletar) y **(b) cobro suelto** (monto + concepto libre).
- **Renovar plan = autocompletar:** buscar socio (typeahead) → el sistema pre-carga su plan + monto a renovar (editable) → medio de pago (caja auto) → confirmar. Reusa `recordAssignmentCharge` (propagación atómica ya existente).
- **Cobro suelto:** socio conocido + monto libre + **concepto libre** (texto) + medio de pago → entra a caja, **NO renueva membresía**, nace PENDIENTE. Sin schema nuevo de tabla.
- **Rol coach habilitado para cargar:** nuevo permiso de carga acotado que incluye `coach` (NO el `FINANCE_WRITE_ROLES`/`VOID`/`ADJUSTMENT` completos). El coach ve **solo los pagos que él cargó** (hoy/recientes, tipo historial de tickets PoS) + el dato del socio necesario para autocompletar; NO ve saldos, ni cargas de otros, ni la cola de validación.
- **Idempotencia:** **ticket único por confirmación** (idempotency key generada por el cliente); mismo key repetido (reintento/doble-tap) = no-op que devuelve el resultado existente; carga nueva a propósito = key nuevo → pasa. Requiere persistir el key (migración **0156**, o tabla/columna).
- **Endpoint(s) thin** que llaman `transactionService.create` / `recordAssignmentCharge` con `cashRegisterId` resuelto (138) + `validation_status` por rol (137).
- Integration tests + **test de autorización** (CARGA-04: coach puede cargar, NO puede validar/observar/anular/ver saldos).
- **UI-SPEC:** esta fase necesita un `UI-SPEC.md` (gsd-ui-phase) — las decisiones PoS/mobile de abajo son la semilla.

### Fuera de scope (140 — otras fases / descartado)

- **Venta de producto / clase suelta / cobro anónimo (sin socio):** DESCARTADO — Franco (dueño) confirmó que "siempre se cobran planes". El cobro suelto quedó acotado a "pago a socio conocido con concepto, no-plan". (CARGA-03 reformulado, NO el producto/drop-in del brief.)
- **Modelado profundo de deuda** (cobrar saldo arrastrado formal): NO — se cubre flojamente con el concepto libre del cobro suelto.
- **Cambio de plan** desde la pantalla del coach: caso raro → queda para el admin, no ensucia el flujo rápido.
- **Reportes / bandeja de pendientes / saldos** → fase 141.
- **Config / perillas** → fase 142.

</domain>

<decisions>
## Implementation Decisions

### Pantalla de carga (UX)

- **D-01:** Pantalla **dedicada del coach** "Cargar pago", **mobile-web estilo PoS** (botones grandes y simples, ejecutar en el momento desde el celular). El admin es web-only; el coach lo usa en el teléfono. Esta es la restricción de diseño dominante para el UI-SPEC.
- **D-02:** **Renovar plan = autocompletar.** Flujo: buscar socio (typeahead nombre/DNI) → sistema pre-carga el **plan vigente del socio + monto** (editable) → elegir **medio de pago** (caja se resuelve sola) → **Confirmar**. El coach NO elige plan a mano (el sistema lo sabe). El monto queda editable (descuento/parcial). Cambiar de plan = caso aparte/admin.

### Cobro suelto

- **D-03:** Segunda opción de la pantalla del coach. **Cobro suelto = socio conocido + monto libre + concepto libre (texto) + medio de pago.** Entra a la caja (resuelta por medio de pago), **NO renueva membresía** (no toca la suscripción del socio), nace **PENDIENTE** (lo carga el coach), queda a nombre del socio con su concepto en el historial. **Sin schema de tabla nuevo.**
- **D-04 (origen del scope):** CARGA-03 "cobro suelto" salió del **brief** (`BRIEF:46`) como "el modelo lo aguanta, falta la pantalla" — prioridad **BAJA** en research (FEATURES:99), NO una necesidad que Franco haya pedido. Se RECORTÓ el caso producto/drop-in/anónimo (Franco: "siempre se cobran planes") y se REFORMULÓ a "pago a socio con concepto, no-plan".
- **D-05 (modelado — research):** El `kind` del cobro suelto es una **pregunta abierta para research/planner**: `kind='adjustment'` NO sirve (es `FINANCE_ADJUSTMENT_ROLES` = owner/admin/gestion, el coach no puede). Necesita un kind **inflow, sin link a suscripción, creable por coach, con concepto en `notes`**. Evaluar reusar un kind existente (`advance_payment`?) vs. una extensión mínima del enum (`misc_charge`/`standalone`) — el constraint "sin schema nuevo" del brief se refería a tablas; un valor de enum es admisible si ningún kind existente encaja (precedente: 139 extendió el enum). Research recomienda.

### Rol coach (permisos acotados)

- **D-06:** "Profe" = el rol **`coach`** existente (enum: member/coach/admin/owner/gestion/recepcion). Hoy `coach` NO está en `FINANCE_WRITE_ROLES`/`VOID`/`ADJUSTMENT`/`READ` (excluido por privacidad, Phase 106). 140 agrega un **permiso de CARGA acotado nuevo** (ej. `FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, 'coach']`) que habilita SOLO el/los endpoint(s) de carga del coach. **NO** se agrega coach a VOID/ADJUSTMENT/READ-completo.
- **D-07:** El coach **ve solo los pagos que él cargó** (hoy/recientes — historial de tickets PoS) + el dato del socio para autocompletar (plan vigente/monto). **NO** ve: saldos de caja, cargas de otros coaches, la cola de validación, ni el resto del admin de finanzas. Esto puede requerir un read scoped (own-loads + member-plan), distinto del `FINANCE_READ_ROLES` completo.
- **D-08:** Todo lo que carga el coach nace **PENDIENTE** (137, derivado server-side del rol, nunca del cliente). El coach **no puede** validar/observar/anular — test de autorización lo confirma (CARGA-04).

### Idempotencia

- **D-09:** **Ticket único por confirmación** (idempotency key generado por el cliente en cada "Confirmar"). El servidor deduplica por ese key: mismo key repetido (reintento/doble-tap/conexión lenta) = **no-op que devuelve el resultado existente**, NO crea un duplicado; un key nuevo (carga deliberada otra vez) = pasa. Estándar robusto (no un heurístico socio+monto+ventana). Persistir el key de forma única (migración **0156** — columna única en `financial_transactions` o tabla de idempotencia; research decide). Toda la propagación sigue en **una `db.transaction`** (CARGA-02).

### Propagación atómica (ya existe — reafirmado)

- **D-10:** La "carga única" atómica **ya existe**: `subscriptions/service.ts` envuelve en `db.transaction`: activa sub → recompute status → `recordAssignmentCharge(tx, ...)` → `transactionService.create(input, adminId, tx)`. 137 ya le sumó `cashRegisterId`/`validationStatus`/`recorderRole`. 140 **reusa** esto para el modo "renovar plan"; el cobro suelto llama `transactionService.create` directo (sin sub). Activar membresía ≠ validar pago (ya respetado).

### Claude's Discretion

- `kind` exacto del cobro suelto (D-05) — research/planner.
- Almacenamiento del idempotency key (columna única vs tabla) — research/planner.
- Forma del autocompletar: endpoint que dado un socio devuelve plan vigente + monto a renovar (reusa subscriptions/balances).
- REST shape de los endpoints de carga del coach + el read scoped de "mis cargas".
- Estructura de la pantalla PoS (componentes Quasar existentes — el research STACK dijo "sin UI kit nuevo"); se fija fino en el UI-SPEC.
- Cómo el coach selecciona la caja en el ~1% de casos donde el default no aplica (probablemente: no lo hace, queda el default).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone

- `.planning/research/modulo-contable/ARCHITECTURE.md` § "Punto 4 — Carga única que propaga" + "Endpoint de cobro suelto" — **lectura obligada**: el flujo atómico ya existe, qué se modifica, resolución de caja por default, endpoint thin de cobro suelto.
- `BRIEF-MODULO-CONTABLE-FRANCO.md` — secciones 4 (carga única, rol profe→PENDIENTE) y el origen de "cobro suelto" (línea 46, prioridad baja).
- `.planning/research/modulo-contable/FEATURES.md` (cobro suelto = prioridad BAJA) + `STACK.md` (sin UI kit nuevo, componentes Quasar existentes).

### Fases previas (de las que depende 140)

- `.planning/phases/137-.../137-SUMMARY.md` (×3) — validation_status por rol (coach→pendiente), recordAssignmentCharge ya extendido con recorderRole.
- `.planning/phases/138-.../138-SUMMARY.md` (×3) — `resolveCashRegister(paymentMethod, branchId, currency)` (la resolución de caja por default que usa la carga).
- `.planning/phases/139-.../139-SUMMARY.md` (×3) — modelo de caja completo + flag: la caja history necesita LEFT JOIN users (relevante si la vista del coach lista pagos).

### Roadmap / requirements

- `.planning/ROADMAP.md` § Phase 140 (goal, CARGA-01..04). **NOTA D-04: CARGA-03 reformulado — cobro suelto = pago a socio con concepto, no-plan; producto/anónimo descartado.**
- `.planning/REQUIREMENTS.md` — CARGA-01..CARGA-04.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `el-templo-api/src/modules/subscriptions/service.ts` — `recordAssignmentCharge` (línea ~249) + el wrapper `db.transaction` que activa sub + cobra + saldo atómico (la "carga única" ya existente). Reusar para "renovar plan".
- `el-templo-api/src/modules/finance/transaction-service.ts` — `create(input, actorId, tx?)` (el único insert site). Cobro suelto lo llama directo (sin sub).
- `el-templo-api/src/modules/finance/cash-register-service.ts` — `resolveCashRegister(paymentMethod, branchId, currency)` (138) — la caja se resuelve sola.
- `el-templo-api/src/modules/shared/permissions.ts` — `FINANCE_WRITE_ROLES`/`VOID`/`ADJUSTMENT`/`READ` (línea ~101). Agregar un `FINANCE_LOAD_ROLES` con coach (acotado). NO tocar VOID/ADJUSTMENT.
- `el-templo-api/src/db/schema/users.ts` — `roleEnum` ya tiene `coach` (no hay que crear el rol, solo habilitar el permiso de carga).
- `el-templo-api/src/modules/finance/routes.ts` — `POST /transactions` (createTransactionSchema → transactionService.create) es el análogo del endpoint de carga.
- `el-templo-admin/src/pages/CajaPage.vue` — la UI de pago admin existente (v4.8) como referencia; la pantalla del coach es NUEVA (PoS mobile), no se modifica CajaPage.

### Established Patterns

- **Rol→status server-side** (137): coach→pendiente, nunca confiar en el body.
- **Propagación atómica** (recordAssignmentCharge en db.transaction) — activar membresía ≠ validar pago.
- **Resolución de caja por default** (138) — el front casi nunca elige caja.
- **Facade pattern** en `modules/finance/`; **Pinia composition + composables con cleanup()** en el front; **componentes Quasar existentes** (STACK: sin UI kit nuevo).

### Integration Points

- **Permiso de carga del coach:** el gate del endpoint de carga incluye coach; los gates de validate/observe/void/read-completo NO. Test de autorización (CARGA-04).
- **Autocompletar:** endpoint read que dado un socio devuelve plan vigente + monto a renovar (subscriptions/balances) — el coach lo consume sin tener `FINANCE_READ_ROLES` completo (read scoped).
- **Idempotency key:** persistir único; el endpoint de carga deduplica antes de crear. Toda la propagación en una db.transaction.
- **"Mis cargas" del coach:** si lista pagos, ojo con el flag de 139 (LEFT JOIN users para filas sin member — aunque las del coach siempre tienen socio).

</code_context>

<specifics>
## Specific Ideas

- **Mobile-web estilo PoS** es la restricción de diseño central (Franco): botones grandes, simples, ejecutar en el momento desde el celular del profe en el mostrador.
- "Cobrar lo que el socio debe / renovar el plan" en pocos toques con **autocompletar** — el profe no re-tipea ni elige plan.
- Cobro suelto = pago a socio con **concepto libre**, no-plan (NO producto/anónimo).
- Idempotencia = **ticket único** (no adivinar por monto+tiempo).
- Origen del recorte: "cobro suelto" era del brief (prioridad baja), no de Franco → se acotó al caso real.

</specifics>

<deferred>
## Deferred Ideas

- **Venta de producto / clase suelta / cobro anónimo** → DESCARTADO (no es un caso real de El Templo).
- **Modelado formal de deuda arrastrada** → no en v1 (cubierto flojo por el concepto libre).
- **Cambio de plan desde la pantalla del coach** → admin / fase futura.
- **Reportes, bandeja de pendientes, saldos visibles** → fase 141.
- **Config / perillas** → fase 142.

</deferred>

---

_Phase: 140-Carga única que propaga + cobro suelto + rol profe_
_Context gathered: 2026-06-24_
