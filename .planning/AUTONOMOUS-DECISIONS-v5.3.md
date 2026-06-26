# Autónomo v5.3 — Log de decisiones (para revisar con Franco a la mañana)

Run desatendido del milestone v5.3 (fases 145-147). Reglas acordadas:

- **Ante ambigüedad/bloqueo NO frenar:** tomar la decisión más razonable según el
  brief (`BRIEF-FEEDBACK-V52-CAJA.md`), registrarla acá y seguir.
- **No pushear nada** (regla de Franco "siempre preguntar antes de pushear").
  Todo queda commiteado local en `staging`. Franco revisa y pushea a la mañana.
- Saltear `discuss-phase`. Cadena `plan-phase → execute-phase` por fase, secuencial.
- Auto-aceptar checkpoints del executor. Correr los tests de cada fase.

## Decisiones tomadas (cada una a confirmar)

_(Se completa durante el run. Formato: Fase NNN — decisión — por qué — alternativa.)_

### Fase 145 — PoS del profe

- **Saltear discuss/CONTEXT.md** — uso el brief como fuente de decisiones (ya está todo cerrado). Alternativa: correr discuss (innecesario, perdería tiempo).
- **Saltear research** — son cambios puntuales sobre código conocido (CargarPagoPage.vue, coach-load-routes.ts, BandejaPendientesTab.vue). Alternativa: research (no aporta).
- **Saltear UI-SPEC** (gate UI) — el brief y los requirements ya tienen el detalle visual (aviso de deuda, dropdown Motivo, chip). Alternativa: generar UI-SPEC formal (overhead innecesario para 3 cambios chicos de UI).
- **Saltear plan-checker formal en 145** (fase chica, bajo riesgo: UI + 1 columna enum) para reservar contexto a la fase 146 (pesada). El planner ya hizo coverage audit y el executor verifica acceptance_criteria + corre tests. El plan-checker SÍ se corre en 146. Alternativa: correrlo igual (insurance barato pero gasta contexto en el run nocturno).
- Migración 0159 = columna `misc_reason` enum `('sin_plan','otro')` NULL en `financial_transactions`.

#### 145-01 (ejecutado)

- **Moneda del cobro suelto ahora sigue al plan del socio** — al cargar `autocompletar` también en modo misc (necesario para el banner de deuda POS-01), `currencySymbol` y el `currency` que se manda en `miscCharge` pasan a reflejar la moneda del plan vigente (`autocompletar.currency`, fallback `'ARS'`). Antes en misc siempre era ARS porque `autocompletar` quedaba `null`. **Por qué:** es más correcto (un socio con plan EUR cobra en EUR) y reusa el mismo patrón que renew. Socio sin plan → `hasRenewable=false`, `currency=null` → sigue ARS (sin cambio). **Alternativa descartada:** desacoplar la moneda de misc de `autocompletar` para preservar el ARS fijo (más código, y dejaría el símbolo del monto inconsistente con el banner). A confirmar con Franco si se prefiere forzar ARS en cobro suelto.
- **Default del dropdown Motivo = 'sin_plan'** (caso operativo principal según el brief). El ref es nullable (`'sin_plan' | 'otro' | null`) por pedido del plan, pero arranca y se resetea a `'sin_plan'`; `canConfirm` igual exige que esté seteado. **Alternativa:** arrancar sin selección (forzaría un tap extra al profe en el caso más común).
- **Banner de deuda ubicado debajo del q-select de socio, fuera de los bloques de modo** — depende sólo de `autocompletar?.outstanding > 0`, así aplica idéntico a renew y misc sin duplicar markup. Sobrevive el cambio de modo porque `onModeChange` recarga `autocompletar` en ambos modos.

#### 145-02 (ejecutado)

- **Chip "Sin plan — asignar" dentro del slot `#body-cell-socio`, no como columna nueva** — el plan lo prefería explícitamente; renderizado en un `<div>` debajo del nombre del socio (`q-chip` dense, color `warning`, ícono `person_add`, tamaño `sm`). Reusa `goToMember(row.memberId)` (sin segundo `router.push`). **Alternativa descartada:** columna propia en la grilla (agregaría ancho a una tabla ya densa).
- **Condición de visibilidad del chip:** `row.miscReason === 'sin_plan' && row.memberId`. El guard de `memberId` evita un chip que navegaría a `/alumnos/null`. Filas con `miscReason` null/'otro' no muestran chip (por diseño del requirement).
- **Sin nueva ambigüedad de scope** — todo el contrato (ruta `/alumnos/:userId`, líneas de `select`/`map`, mirror manual del tipo) estaba cerrado en el plan; no hubo desviaciones. Error pre-existente `onExportBandeja` (TS2339, línea 38) en `BandejaPendientesTab.vue` queda fuera de scope (ya documentado en 145-01, no introducido por este plan).

### Fase 146 — Caja: validación e imputación fundacional

#### 146-01 (ejecutado) — CAJA-01 + CAJA-04: caja sugerida = sede del profe

- **Fallback amplio en `resolveSuggestedCaja`** — el `try/catch` alrededor de `resolveCashRegister` captura CUALQUIER error (sin caja efectivo en la sede del profe Y moneda inconsistente), no sólo el caso "branchId no resolvible" del behavior. Devuelve `undefined` → `create` resuelve por la sede del socio (comportamiento previo). **Por qué:** es estrictamente más seguro ("no romper" el cobro del profe); si la resolución por sede del socio también falla, el error original de `create` sí surfacea. **Alternativa descartada:** catch acotado sólo a `BadRequestError` de "no caja" (dejaría que un mismatch de moneda del profe rompa un cobro que hoy funciona por sede del socio).
- **DRY: `resolveUserBranchId` compartido** — extraje la resolución `users.branchId` + fallback "Templo Online" a un helper único; `resolveMemberBranchId` (sede del socio, ledger) y `resolveRecorderBranchId` (sede del profe, caja) lo delegan. **Alternativa descartada:** duplicar el cuerpo (viola DRY, CLAUDE.md pide flaggearlo agresivamente).
- **`TransactionService.resolveCashRegister` público** — en vez de agregar un `CashRegisterService` al constructor de `SubscriptionService` (afecta todos los sitios de instanciación), expuse un método público que delega a `cashRegisterService.resolveCashRegister`. `SubscriptionService` ya tiene un `TransactionService` inyectado → cero DI nueva. **Alternativa descartada:** DI extra de `CashRegisterService` (más superficie, más sitios a tocar).
- **Pre-resolución del caja en renew guardada por `renewalPrice > 0`** — sólo se pre-resuelve la caja sugerida si habrá charge (precio > 0); una renovación gratis no crea transacción, así que evitamos un throw innecesario. **Alternativa:** resolver siempre (arriesga un error en un path no-op).
- **`recordAssignmentCharge.cashRegisterId` opcional reutilizable por plan 03** — el param queda genérico (override de caja); los 4 callers internos admin no lo pasan → `undefined` → caja por sede del socio (sin regresión, verificado con `charge-on-assign.test.ts` 14/14 verdes). El plan 03 lo reutiliza para imputar el anticipo.
- **Tests de Task 1 y Task 2 en un mismo `describe` ("caja sugerida por sede del profe")** — crean sede B + socio B + caja banco ARS una vez en `beforeAll`; cubren misc cash, misc transfer, settle cash y renew cash. CAJA-04 no necesitó cambio de UI (la PoS ya no expone caja/sede); sólo se agregó un comentario marcando CAJA-04 en el schema.
