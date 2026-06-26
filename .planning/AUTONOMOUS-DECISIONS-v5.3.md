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
