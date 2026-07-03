# Phase 151: Registrar cobro (Pagos → Cobros) - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Rediseño del PoS de cobros del admin: `PagosPage.vue` (980 líneas, 3 modos con expansiones anidadas) + `coach-load-routes.ts`. Rename "Pagos"→"Cobros" en toda la superficie incluida la ruta (COBRO-01), flujo unificado en pantallas/pasos separados desktop+mobile (COBRO-02), listado histórico con fecha+hora y CTA arriba (COBRO-03), y cuenta bancaria obligatoria para transferencia/tarjeta con creación rápida inline admin/owner-only (COBRO-04). Requirements: COBRO-01, COBRO-02, COBRO-03, COBRO-04.

NO incluye: exigencia de cuenta en otras superficies de cobro (ficha del socio, AssignPlanDialog — convergen en fase 154), datos del frente de la tarjeta (COBRO-F1, diferido), reordenamiento de tabs de Caja (fase 152), cambios al motor de validación más allá del prellenado de cuenta.

**Arrastrado de fases previas (no re-decidir):** 149 D-14 landing por rol (el empleado aterriza en el PoS — apunta a la ruta renombrada); 149 D-04 gating frontend + API consistente; 150 D-07 cuentas cerradas fuera de los selectores operativos; 150 D-11 la creación inline reusa el form de creación de cuenta como componente (`CuentaBancariaFormDialog.vue`); 150 D-12 ABM de cuentas admin/owner-only. Constraint SaaS transversal: sin Templo-ismos nuevos en core.

</domain>

<decisions>
## Implementation Decisions

### Estructura del flujo por pasos (COBRO-02)

- **D-01: Flujo unificado, sin toggle de modos.** Desaparece el toggle Pago de plan / Alta + plan / Cobro suelto. Un solo camino: se elige/crea el socio primero y "¿a qué se asocia el cobro?" (plan vigente / asignar plan nuevo / cobro suelto) es un paso del flujo. Es lo que pide el doc de Nacho ("no suma darle alternativas a alguien que no querés que piense"). Los 3 endpoints de la API se conservan — el flujo decide cuál llamar al confirmar.
- **D-02: Una sola ruta con paso por pantalla.** Cada paso ocupa la pantalla completa (render por paso + header con progreso y botón atrás) dentro de una única ruta. Estado en el componente — sin rutas hijas, sin store, sin pérdida de estado por refresh de sub-rutas. Se descartó QStepper (conserva efecto acordeón) y rutas separadas por paso (plumbing innecesario).
- **D-03: 4 pasos con resumen final.** 1) Socio (buscar o crear alumno: mini-form Nombre/Apellido/DNI + dedup + sede, como fase 148) → 2) Qué se cobra (plan vigente a renovar / asignar plan nuevo con grilla por tier + Zero + turnos fijos / cobro suelto con concepto + motivo) → 3) Cómo se paga (medio de pago + cuenta bancaria si transferencia/tarjeta + monto) → 4) Resumen y Confirmar.
- **D-04: Dos columnas en desktop.** En pantallas anchas: paso activo a la izquierda + resumen acumulado de lo ya elegido a la derecha (socio, plan, monto…). En mobile el resumen se colapsa a un header compacto. El resumen del paso 4 y el panel derecho comparten componente.

### Semántica cuenta↔cobro en la API (COBRO-04)

- **D-05: Prellenado corregible, no definitivo.** El cobro pendiente por transferencia/tarjeta nace imputado a la cuenta bancaria que eligió el profe; en la Bandeja de pendientes el validador la ve prellenada y puede corregirla al validar. Se conserva el paso de imputación de v5.3 (multibanco) — mejor dato en origen sin perder el control del dueño. **Nota de invariante:** v5.3 (T-146-01) blindó los endpoints del PoS con `additionalProperties:false` rechazando `cashRegisterId`; esta fase introduce la elección de cuenta como campo nuevo validado server-side (tipo banco + activa + moneda del cobro), manteniendo el rechazo del `cashRegisterId` crudo para cash.
- **D-06: Aplica a todos los roles que cargan.** Cualquier cobro por transferencia/tarjeta desde el PoS exige cuenta, sin importar quién lo carga. Para admin/owner (cuyos cobros nacen validados) la cuenta elegida es la imputación final directa.
- **D-07: Solo el PoS en esta fase.** La exigencia vive en los endpoints del flujo de Cobros. Las otras superficies (RegisterPaymentDialog en ficha del socio, AssignPlanDialog) convergen en la fase 154 cuando "Registrar cobro" pase a ser acción de fila en Alumnos — probablemente reusando este flujo.

### Creación rápida inline y permisos (COBRO-04)

- **D-08: Quick-create solo admin/owner.** Sin cuentas disponibles: el dueño ve el botón "Crear cuenta" inline que abre el `CuentaBancariaFormDialog` de la fase 150 (150 D-11); el profe/recepción ve un aviso ("pedí al dueño que cargue una cuenta bancaria") y **no puede finalizar** por transferencia/tarjeta — efectivo sigue disponible. Respeta 150 D-12 (creación de cuentas admin/owner-only); el caso real de "no hay cuentas" es el onboarding white-label, donde configura el dueño.

### Rename + listado (COBRO-01, COBRO-03)

- **D-09: Rename incluye la ruta.** Nav, título de página, textos Y la ruta pasan a `/cobros`, con redirect `/pagos`→`/cobros`. La landing del empleado (149 D-14) apunta a `/cobros`. Renombrar también los identificadores visibles de cara al white-label (labels); constantes internas (`PAGOS_ROLES`) a criterio del planner.
- **D-10: Listado histórico honesto con fecha+hora.** Se mantiene lo que ya devuelve `GET /mis-cargas` (últimas 50 cargas propias, sin cambio de endpoint) pero con título "Cobros" y cada fila con fecha + hora (hoy muestra solo hora y el título "Mis cargas de hoy" miente — confirmado en código: no filtra por día).
- **D-11: Portada = CTA arriba + listado abajo.** `/cobros` abre con el botón grande "Registrar cobro" arriba y el listado histórico abajo. Tocar el CTA entra al flujo de 4 pasos (donde "Continuar" avanza cada paso). Cumple el "Continuar arriba del listado" del doc.

### Claude's Discretion

- Selector de cuentas: filtrar por cuentas tipo banco **activas** de la **moneda del cobro** (invariantes de 150); forma exacta del campo nuevo en la API y su validación server-side.
- "+ Nueva cuenta" visible también cuando SÍ hay cuentas (conveniencia para admin/owner) — no solo en estado vacío.
- "Sin cuentas de la moneda del cobro" se trata como estado vacío, con la moneda preseleccionada en el dialog de creación.
- Nombre de las constantes internas post-rename (`PAGOS_ROLES`, keys de composables) — coherencia sin obsesión.
- Formato exacto de fecha+hora en el listado (agrupado por día o fila plana).
- Dónde vive el aviso de deuda del socio (POS-01 de v5.3) dentro del flujo por pasos — probablemente en el paso 1 al elegir socio, conservando el comportamiento actual.
- Detalle del header de progreso (steps numerados vs barra) y transiciones entre pasos.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.docs/saas-multitenancy/Correcciones El Templo.md` — doc crudo de Nacho; §PAGOS ("una sola cosa que hacer", pantallas separadas, Continuar arriba de Mis cargas, históricos con fecha, denominarse "Cobros") + §CAJA ítem 3 (pagos sí o sí asociados a cuenta de cobro, obligar a cargar cuenta o no poder finalizar).
- `.docs/saas-multitenancy/01-analisis-correcciones-admin.md` — §3 Finanzas: registrar cobro = ⬜ UX-PURO; cobro obligado a cuenta = 🟩 NÚCLEO; validación de movimientos de profes = 🟨 REPLANTEAR-TENANCY (no romper el workflow de validación).

### Superficie a rediseñar

- `el-templo-admin/src/pages/PagosPage.vue` — página actual (980 líneas): 3 modos, expansiones anidadas, sticky Confirmar, "Mis cargas de hoy", idempotency key por intento (D-09 de 140), dedup DNI on-blur (148), precios por medio de pago (`getBasePriceFor`), toggle Zero, FixedSchedulePicker para planes fixed. TODO ese comportamiento funcional se conserva — cambia la forma.
- `el-templo-api/src/modules/finance/coach-load-routes.ts` — endpoints del PoS (`/pay-plan`, `/misc`, `/alta`, `/autocompletar/:id`, `/mis-cargas`); invariante v5.3: body rechaza `cashRegisterId`/`validationStatus` (`additionalProperties:false`), caja derivada server-side, `recordedBy` forzado. COBRO-04 modifica esto SOLO para la cuenta bancaria de transferencia/tarjeta (D-05).
- `el-templo-admin/src/router/routes.ts` — ruta `/pagos` + landing por rol (149 D-14) a actualizar por el rename (D-09).

### Cuentas bancarias (fase 150 — dependencia directa)

- `.planning/phases/150-cuentas-bancarias-flexibles/150-CONTEXT.md` — D-03 (nombre visible derivado), D-07 (cerrada fuera de selectores operativos), D-11 (form de creación como componente reutilizable para esta fase), D-12 (ABM admin/owner-only).
- `el-templo-admin/src/components/caja/CuentaBancariaFormDialog.vue` — dialog de creación a reusar para el quick-create inline (D-08).
- `el-templo-api/src/modules/finance/cash-register-service.ts` — servicio de cuentas (listado de activas tipo banco para el selector; validación de la cuenta elegida).

### Validación / Bandeja (v5.3 — interacción con D-05)

- `el-templo-admin/src/components/caja/BandejaPendientesTab.vue` — bandeja donde el validador ve el prellenado de cuenta y puede corregirlo al validar (imputación multibanco v5.3).
- `el-templo-api/src/modules/finance/transaction-service.ts` — create/list/validate de transacciones; punto donde el prellenado de `cashRegisterId` entra y donde la validación lo confirma/corrige.

### RBAC

- `.planning/phases/149-nav-por-categor-as-rbac/149-CONTEXT.md` — D-04 (gating frontend + API consistente), D-14 (landing por rol → PoS del empleado).
- `el-templo-api/src/modules/shared/permissions.ts` — `FINANCE_LOAD_ROLES` (roles del PoS) y `ADMIN_ROLES` (gate del quick-create D-08).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `PagosPage.vue` — toda la lógica funcional existente (typeahead de socio, autocompletar, dedup DNI, grilla de planes por tier, Zero, FixedSchedulePicker, idempotency, precios por medio de pago) se redistribuye en pasos; no se reescribe el comportamiento.
- `CuentaBancariaFormDialog.vue` (fase 150) — quick-create inline sin desarrollo nuevo de form.
- `FixedSchedulePicker.vue` — picker de turnos fijos, se muda al paso 2 tal cual.
- `GET /coach-load/mis-cargas` — ya devuelve histórico (limit 50) con `createdAt`; el fix de COBRO-03 es 100% frontend (label + formato fecha+hora).
- Composables `useFinanceLoadApi` / `useMembersApi` / `useSubscriptionsApi` — la capa de datos no cambia; cambia la orquestación visual.

### Established Patterns

- **Idempotency key por intento de confirmación** (140 D-09): generada lazy en el primer tap de Confirmar, reusada en retries, regenerada tras éxito. El paso 4 debe conservar exactamente esta semántica.
- **Server-derived, never from body** (v5.3 T-146-01): `validation_status`, `branchId`, `recordedBy` siguen derivándose server-side. La cuenta bancaria es la ÚNICA excepción nueva, validada server-side (tipo banco + activa + moneda).
- **Tests de integración obligatorios** para los cambios de rutas API (`el-templo-api/test/`), incluyendo: transferencia/tarjeta sin cuenta → 400; cuenta inválida (cerrada, efectivo, moneda equivocada) → 400; cash con cuenta → rechazado; prellenado visible en la bandeja.
- **La seguridad real vive en la API** (149 D-04): el gate del quick-create (D-08) va en el endpoint de creación (ya existe con ADMIN_ROLES de 150), la UI solo esconde el botón.

### Integration Points

- `coach-load-routes.ts` — schemas de `/pay-plan`, `/misc`, `/alta`: campo nuevo de cuenta bancaria (requerido si transfer/card, rechazado si cash).
- `transaction-service.ts` create — aceptar el override de `cashRegisterId` bancario desde las rutas del PoS (hoy lo deriva `resolveCashRegister`).
- `BandejaPendientesTab.vue` — mostrar la cuenta prellenada en la fila/detalle del pendiente y permitir corregirla (hoy la imputación arranca vacía).
- `routes.ts` (admin) — rename de ruta + redirect + landing por rol.
- Fase 154 reusará este flujo como acción de fila en Alumnos — diseñar la entrada al wizard de modo que pueda abrirse con un socio preseleccionado (prop/query), sin sobre-ingeniería ahora.

</code_context>

<specifics>
## Specific Ideas

- Nacho, literal: "no suma darle alternativas a alguien que no querés que piense" — el flujo unificado (D-01) es la traducción directa; el paso 2 pregunta a qué se asocia el cobro en vez de pedir elegir modo upfront.
- "La sucesión de expansiones no hacen sentido en la pantalla de la PC, quizás sí del celular… la versión más sencilla que aplique a las dos es que sean como pantallas separadas" — D-02/D-04 responden exactamente a esto (pasos + dos columnas en desktop).
- "Los 'pagos de hoy' no tienen fecha sin embargo no son solo los registros del día sino los registros históricos" — verificado en código: `GET /mis-cargas` no filtra por fecha (limit 50). D-10 corrige el label y agrega fecha, sin tocar el endpoint.

</specifics>

<deferred>
## Deferred Ideas

- **Datos del frente de la tarjeta** (antifraude / pagos al exterior) — COBRO-F1, ya diferido en REQUIREMENTS.md; no entra en esta fase.
- **Exigencia de cuenta en las demás superficies de cobro** (ficha del socio, AssignPlanDialog) — fase 154 (D-07).
- **"Mis cargas" como desplegable colapsable** (idea de Nacho "un único desplegable paralelo") — la portada CTA+listado (D-11) lo cubre sin colapsable; si el listado molesta en mobile, evaluar colapsable en el UI-SPEC o en fase 152.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — poblar `milestone_exercise_id`) — revisado y NO incorporado por tercera vez (149, 150, 151): rollout de datos del sistema de entrenamiento v5.1, sin relación con el PoS de cobros (match débil por keywords genéricas).

</deferred>

---

_Phase: 151-Registrar cobro (Pagos → Cobros)_
_Context gathered: 2026-07-03_
