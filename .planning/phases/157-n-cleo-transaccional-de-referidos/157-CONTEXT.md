# Phase 157: Núcleo transaccional de referidos - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

El corazón "de la plata" del sistema de referidos (milestone v5.5), tres cosas encadenadas:

1. **Atribución** — quién trajo a quién, por **dos canales**: self-service (`?ref=CODE` en el registro) + asistido ("¿Quién lo trajo?" en el alta que hace recepción/gestión/profe).
2. **Cualificación** — el **primer pago** del referido activa el vínculo (`qualified`).
3. **Cómputo del descuento** — **simétrico** (ambas partes), **condicional a ambos-activos**, **acumulable con tope**, evaluado **en cada cobro** (`assignPlan`), con **registro AURA interno** (anotación, sin saldo gastable).

**Fuera de esta fase (va en 158):** pantalla "Mis referidos", notificaciones, panel admin de referidos.

**Restricción de milestone:** v5.5 es el PRÓXIMO milestone, se ejecuta DESPUÉS de v5.4. La fase 157 **cruza** con v5.4 fase 154 (reforma del alta de alumno) y fase 151 (reforma de `assignPlan`/cobros) — montar sobre lo reformado, verificar antes de duplicar.
</domain>

<decisions>
## Implementation Decisions

### Mecánica del vínculo (cerrado en el brief, NO re-preguntar)

- **D-01 (Trigger):** la recompensa se libera cuando el referido **paga su primera suscripción**, NO al registrarse. Hook en `assignPlan`.
- **D-02 (Double-sided simétrico):** un vínculo `qualified` otorga el mismo % de descuento a **ambas** partes (referidor y referido).
- **D-03 (Recurrente sin tope temporal):** el descuento persiste mes a mes indefinidamente mientras el vínculo siga activo; no vence por tiempo.
- **D-04 (Acumula con tope):** múltiples vínculos activos suman descuento hasta un máximo configurable.
- **D-05 (No-discrecional):** el descuento se auto-aplica en el cobro; el socio NO administra ni decide cuándo usarlo.
- **D-06 (AURA = anotación interna):** cada descuento aplicado se registra con `sourceType:"referral"` para trazabilidad, SIN inflar el saldo AURA gastable.
- **D-07 (Magnitud = % del plan):** el descuento se expresa como porcentaje del precio del plan (reusa `auraDiscountPercent`).
- **D-08 (Atribución doble canal):** self-service `?ref=CODE` + asistido en el alta. Ambos escriben `users.referredBy`.

### Zonas grises resueltas en esta discusión (2026-07-02)

- **D-09 (Definición de "activo"):** una parte cuenta como activa si su **cobertura está vigente** = `deriveCoveredUntil(db, userId) >= hoy` (el **helper único** introducido en fase 144). NO usar `users.status` (derivado por cron, puede desfasarse). Al cobrar la cuota de X, para cada vínculo `qualified` se evalúa la cobertura vigente de **la contraparte**.
- **D-10 (Caída de contraparte = suspende, reactivable):** el vínculo `qualified` es **permanente**; el descuento se **recomputa dinámicamente** en cada cobro según la cobertura vigente de ambos. Si una parte se cae, el descuento se **suspende** ese ciclo; si vuelve a estar al día, **se reactiva**. NO se revoca (salvo fraude/acción manual).
- **D-11 (Ventana de cualificación = sin límite):** el referido cuenta cuando pague su 1er plan, **sin importar cuánto tarde** desde el registro. El trigger de pago (D-01) ya es la barrera antifraude; no hace falta ventana temporal.
- **D-12 (Calibración = config ajustable):** sembrar en `aura_config` (fila `referral`): **10% por vínculo activo, tope 40%**. Valores **ajustables sin deploy** para calibrar con números reales. El % por vínculo y el tope son las dos perillas de erosión de ingreso.

### Zonas grises resueltas post-research (2026-07-10, con Franco)

Resuelven las 7 Open Questions de 157-RESEARCH.md — el planner NO debe re-abrirlas:

- **D-19 (Aplicación contable = reducir precio directo):** el cobro nace con `pricePaid` ya descontado (mismo modelo que el gasto AURA discrecional existente), con anotación en `referral_credits` para auditoría. NO split contable con línea `aura_credit` separada. _(OQ #3)_
- **D-20 (Umbral de cualificación = plan pago):** el vínculo pasa a `qualified` cuando el referido recibe su primera suscripción con `pricePaid > 0` — cualifica aunque quede deuda parcial; un plan 100% bonificado (precio 0) NO cualifica. _(OQ #4)_
- **D-21 (El cobro que cualifica ya descuenta):** el flip a `qualified` ocurre ANTES de computar el descuento del mismo cobro — el referido ya paga menos su primera cuota y el referidor descuenta desde su próximo cobro. _(OQ #5)_
- **D-22 (Config en dos lugares):** `aura_config` fila `referral` con `defaultAmount = 10` (% por vínculo, satisface AURA-02 literal) + `system_settings['referral.max_percent_cap'] = '40'` (tope, precedente `finance.pending_overdue_days` mig 0157). Ambos ajustables sin deploy. NO alterar el shape de `aura_config`. _(OQ #1)_
- **D-23 (Columnas nuevas, refina D-07):** `referralDiscountPercent`/`referralDiscountAmount` en `subscriptions` — D-07 reusa el CONCEPTO de % del plan, no la columna `auraDiscountPercent` (esa la escribe el gasto AURA discrecional y colisionaría). Los dos mecanismos componen de forma independiente. _(OQ #2)_
- **D-24 (Solo la contraparte, refina D-09):** al cobrar la cuota de X se evalúa únicamente la cobertura vigente de la contraparte de cada vínculo `qualified` — el pagador se vuelve activo por definición al pagar (cubre el caso "vencido que renueva"). _(OQ #6)_
- **D-25 (Código eager para nuevos, refina D-17):** el `referralCode` se genera en el momento del alta/registro para socios NUEVOS; el script de backfill idempotente queda disponible a demanda solo para los ~2000 existentes (correrlo antes de lanzar la fase 158). NO en la migración. _(OQ #7)_

### Antifraude (del brief, aplican a esta fase)

- **D-13:** impedir **auto-referido** (`referrerId != referredId`).
- **D-14:** cada nuevo miembro tiene **a lo sumo un referidor** (`referrals.referredId` UNIQUE) — no puede ser reclamado por dos. Un referidor SÍ puede traer muchos referidos.
- **D-15:** respetar el **dedup por DNI** existente (fase 148) al crear/atribuir.

### Claude's Discretion (aceptado por el usuario, con estos defaults)

- **D-16 (Formato del código de referido):** derivado legible tipo `FRAN-A3B2` (prefijo del nombre + sufijo aleatorio único). Único por socio.
- **D-17 (Backfill de códigos):** generación **lazy** (se crea al primer acceso/compartir) + un **script de backfill** disponible para poblar los existentes cuando se quiera. NO generar ~2000 de una en la migración.
- **D-18 (Almacenamiento del registro AURA):** **tabla dedicada `referral_credits`** (más limpia y auditable) en vez de netear award+spend en `aura_transactions`. La anotación `sourceType:"referral"` en `aura_transactions` queda para trazabilidad; el balance gastable NO se toca. _(El researcher/planner define el esquema exacto y cómo se relaciona con `financial_transactions.paymentMethod:"aura_credit"`.)_
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del sistema (fuente de verdad)

- `BRIEF-SISTEMA-REFERIDOS.md` (raíz del repo) — las 8 decisiones de diseño + arquitectura técnica + §7 preguntas abiertas. **Leer completo antes de planificar.**
- `.planning/ROADMAP.md` — sección "v5.5 (Sistema de Referidos)", Phase Details de la fase 157 (REQ-IDs REF/DESC/AURA inline).

### Código a reusar (mapeado en la exploración inicial)

- `el-templo-api/src/modules/aura/service.ts` — `AuraService.award()` / `spend()` / `getBalance()`. `award` usa `referenceType`/`referenceId` para vincular a una entidad.
- `el-templo-api/src/db/schema/aura-transactions.ts:17` — enum `sourceType` **ya incluye `"referral"`** + índice único `unique_user_source_ref` (idempotencia).
- `el-templo-api/src/db/schema/aura-config.ts:16` — `sourceType` ya lista `"referral"` (sembrar la fila).
- `el-templo-api/src/db/schema/users.ts:147` — patrón `createdBy` (self-FK `onDelete:"set null"`) a imitar para `referredBy`.
- `el-templo-api/src/modules/auth/routes.ts:43` — `POST /register`, ya procesa `promoCode` (`:56`,`:195`) → punto de inyección de `?ref`.
- `el-templo-app/src/pages/RegisterPage.vue:213` — ya lee `route.query.promo` y lo envía en el body → reusar para `?ref`.
- `el-templo-api/src/modules/subscriptions/service.ts` — `assignPlan` (motor de cobro; `spend()` en `:1100`/`:3266`, `getPricingPreview()` en `:3880`). Hook de cualificación + cómputo del descuento.
- `el-templo-api/src/db/schema/subscriptions.ts:60-61` — columnas `auraDiscount`/`auraDiscountPercent` ya existen (materializar el descuento acá).
- `el-templo-api/src/modules/subscriptions/types.ts:48` — `AURA_DISCOUNT_TIERS` (referencia de valuación AURA→dinero, aunque referidos usa su propio %).
- **`deriveCoveredUntil(db, userId)`** (fase 144) — helper único de "fecha cubierta"; es el criterio de "activo" (D-09). Ubicar en `booking-service.ts`/coverage helpers.
- `el-templo-api/src/db/schema/financial-transactions.ts` — `paymentMethod:"aura_credit"` ya modelado (`cashRegisterId` NULL) para la porción descontada.
- `el-templo-api/src/db/schema/promo-plans.ts` — modelo cercano de "código único + redemptionCount" (referencia de patrón, NO reusar directamente).

### Puntos de integración con v5.4 (verificar antes de duplicar)

- Fase 148 (`148-...`) + fase 154 (v5.4) — alta de alumno; el canal asistido "¿Quién lo trajo?" se monta acá.
- Fase 151 (v5.4) — reforma de `assignPlan`/cobros; el cómputo del descuento debe integrarse con la versión reformada.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **AuraService** (`modules/aura/service.ts`): award/spend atómicos con idempotencia por índice único. Para la anotación de referido.
- **Infra AURA `"referral"` pre-reservada**: enum en `aura-transactions.ts:17` y `aura-config.ts:16` — cablear, no crear.
- **Patrón self-FK `createdBy`** (`users.ts:147`): plantilla exacta para `referredBy`.
- **Canal `?promo` en registro** (`auth/routes.ts` + `RegisterPage.vue:213`): reusar para `?ref`.
- **Columnas de descuento en `subscriptions`** (`:60-61`): materializar el descuento sin schema nuevo en esa tabla.
- **`deriveCoveredUntil`** (fase 144): criterio de "activo" (D-09) ya implementado y compartido.
- **Dedup por DNI** (fase 148): reusar en la creación/atribución.

### Established Patterns

- Migraciones hand-written cuando `db:generate` está roto por drift (precedente: migs 0153/0155/0158). SQL commiteado junto al schema.
- Nunca `;` dentro de comentarios SQL (el runner splittea por `;`).
- Servicios API: facade para servicios complejos; `AuraService` se instancia ad-hoc por módulo (no hay rutas `/aura` dedicadas).

### Integration Points

- **Nueva tabla `referrals`** (fuente de verdad del vínculo): `referrerId`, `referredId` (UNIQUE), `status` (`pending|qualified|revoked`), `qualifiedAt`, `attributionChannel` (`self_service|assisted`), `createdBy`.
- **Nuevas columnas en `users`**: `referralCode` (UNIQUE), `referredBy` (self-FK).
- **Nueva tabla `referral_credits`** (D-18): registro auditable de descuentos aplicados sin inflar balance.
- **Seed `aura_config`** fila `referral` con `%`/tope (D-12).
- **Hook en `assignPlan`**: (a) marcar `qualified` en primer pago; (b) computar descuento simétrico por vínculos activos (D-09/D-10) con tope (D-04/D-12); (c) escribir anotación + `referral_credits`.

</code_context>

<specifics>
## Specific Ideas

- El código legible tipo `FRAN-A3B2` (D-16) es preferencia explícita de forma: compartible, reconocible, no un UUID opaco.
- "No queremos que el usuario tenga AURA en su poder y decida aplicarlo a gusto" (cita del usuario) → D-05/D-06: auto-aplicación, AURA solo como registro interno.
- El descuento debe reflejar "si cualquiera de los dos se cae, el descuento por referido se cae también" (cita) → D-09/D-10.

</specifics>

<deferred>
## Deferred Ideas

- **Fase 158 (v5.5):** pantalla "Mis referidos" (estado por vínculo + descuento vigente), notificaciones (vínculo activado / descuento por caerse), panel admin de referidos.
- **Categoría de notificación** (`motivacion` vs nueva `referidos`) → se decide en la fase 158.
- **Coordinación de orden con v5.4:** ejecutar 157 DESPUÉS de las fases 154/151 de v5.4 para montar sobre el alta y los cobros reformados (evita retrabajo). Verificar en plan-phase.

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (rollout de datos v5.1) — falso positivo del matcher (keywords genéricas), sin relación con referidos. No integrado.

</deferred>

---

_Phase: 157-Núcleo transaccional de referidos_
_Context gathered: 2026-07-02_
