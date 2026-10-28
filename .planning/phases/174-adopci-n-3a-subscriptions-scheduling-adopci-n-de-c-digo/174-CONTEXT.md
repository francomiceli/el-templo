# Phase 174: Adopción 3a — `subscriptions` + `scheduling`: adopción de código - Context

**Gathered:** 2026-08-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Los dos módulos de la operación diaria —`subscriptions` (planes/suscripciones/pricing) y `scheduling` (grilla/reservas/asistencia)— quedan migrados a nivel **CÓDIGO** al patrón de tenancy completo: cada acceso recibe `ctx: TenantContext`, envuelve sus `WHERE` con `tenantWhere(tabla, ctx)` y sus `INSERT` con `tenantValues(ctx, {...})`, más las guardas de ancla (p. ej. `assertBranchDelGimnasio`). La cadena de pricing (override → boarding pass → AURA → referral) da **el mismo resultado antes y después**.

**Esta fase NO enciende el sentinel ni corre batería de aislamiento** — eso es la fase 174.1 (allowlist saldada + `TENANT_STRICT_MODULES` + batería ISO). End state de la 174: asignar, renovar, cambiar plan, reservar, cancelar y marcar asistencia funcionan idénticamente para El Templo, con el código listo para aislar.

Además, la 174 salda las deudas que la 173 dirigió acá (ver D-05).

**Fuera de alcance (explícito):** el switch a strict, la batería de aislamiento, los fixtures de segundo tenant y cualquier test de precio cross-tenant → todo eso es 174.1. La migración de `referrals`, `programs` y `analytics` → sus propias fases (175+).
</domain>

<decisions>
## Implementation Decisions

### Rebanado en planes

- **D-01 [informational]:** (decisión de proceso de planificación, ya consumida por el planner — no es un entregable de ejecutor rastreable por plan). La fase se corta en **~5-6 planes por flujo funcional** (techo ~6), NO por módulo (2-3 gordos) ni por tabla (~10-13 chicos). Rationale: la lección dura de la 173 fue que 31 planes en cadena son inmanejables, pero 2 planes gigantes reintroducen el problema de tamaño. Descomposición sugerida (el planner la afina):
  1. `subscriptions` — lecturas + lifecycle (assign/change/cancel/pause/resume/renew ya reciben ctx; faltan ~40 lecturas + ~12 inserts crudos).
  2. `subscriptions` — cadena de pricing con **golden tests** (ver D-06): `assignPlan`, `changePlan`, `renewSubscription` + previews `getChangePlanPreview`/`getPricingPreview`.
  3. `scheduling` — `booking-service.ts` (el de mayor deuda: ~35 `from` crudos).
  4. `scheduling` — `service.ts` + `activity-service.ts` + `holiday-service.ts` + `schedule-exceptions.ts` + `trials-service.ts`.
  5. `attendance` — `service.ts` (submódulo acoplado por la tabla `attendance`; ~10/21 `from` ya con tenantWhere).
  6. Cierre de deudas 173 (threading de ctx de `autoExpireSubscriptions`, ver D-05/D-07).

### Frontera de deuda 174 vs 175

- **D-02:** La 174 salda **SOLO la deuda que toca `subscriptions`/`scheduling`**:
  - `autoExpireSubscriptions` con ctx real por el camino member-facing (incl. el cruce a `scheduling/booking-service.ts:137`) — ver D-07.
  - Inserts sin `tenantValues` de estos módulos.
  - `holidays` con `tenantWhere` (usada en `scheduling/holiday-service.ts`, `booking-service.ts`, `subscriptions/booking-population.ts`, hoy cruda).
  - El **one-liner de `program_enrollments`** (`enrollment-service.ts:407-419`, `tenantValues` faltante) — barato y ya ubicado; entra de paso aunque el archivo sea de `programs`.
- **D-03:** **NO** entran a la 174 (esperan a su módulo / 175 / hardening aparte):
  - `getReferralOverview` (ya recibe ctx desde 173; solo le falta el `tenantWhere` interno, y `referrals` no es strict) → deuda de _referrals_.
  - El interior de `computeReferralDiscountPercent` (`referrals/service.ts:206`, sin ctx) → _referrals_. La cadena de pricing lo llama pero no se lo threadea acá.
  - La FK compuesta de `user_branches` → es un **hardening de schema (migración)**, no adopción de código.
- **D-04:** **Corrección documentada del criterio #3 del ROADMAP:** `activeMemberExists` vive en `src/modules/shared/active-member.ts:27`, es un **predicado SQL puro** (no hace su propio query con ctx) y **no lo usan `subscriptions`/`scheduling`** hoy. El criterio #3 lo atribuye mal a esta fase — no hay nada que "darle ctx real" acá. Se registra la discrepancia; el dueño real es quien lo consuma con deuda (analytics/reports en 175).
- **D-05:** Deudas de la 173 confirmadas como dueño-174 (de `deferred-items.md` de la 173): guards `isNotNull` provisorios del camino member-facing de `autoExpireSubscriptions`/`activateScheduledSub`, e inserts sin `tenantValues` de subs/sched. (El barrido de 58 inserts de 173-25 no bloquea throws — se saldan los que caen en subs/sched; el resto viaja a su módulo.)

### Red de seguridad del pricing

- **D-06:** Antes de tocar la cadena de pricing se capturan **characterization/golden tests** (mismos inputs → mismo número de salida) para `assignPlan`, `changePlan`, `renewSubscription` y los 2 previews, **incluyendo combos referral + boarding pass + AURA**. Se corren ANTES y DESPUÉS de la migración: el criterio de aceptación del plan de pricing es **diff cero**. Rationale: el pricing está **replicado inline** en 3 métodos (no hay función única centralizada), así que un golden explícito atrapa regresiones sutiles que la suite existente (>60 casos, pero ninguno multi-tenant) podría no cubrir. El criterio #1 del ROADMAP lo pide explícito. El caso de precio **cross-tenant** (segundo tenant paga su propio precio) es de la 174.1, no de acá.

### ctx del camino cron/member-facing

- **D-07:** `autoExpireSubscriptions` (hoy `ctx=null` con guards provisorios) se resuelve así:
  - **Camino member-facing (con actor):** threadear **ctx real** por `getMemberSubscriptions`/`getMemberSubscriptionHistory` hasta sus ~8 call sites (`subscriptions/service.ts:1116,1437,2823,4245`, `member-routes.ts:165`, `routes.ts:288,301`, `scheduling/booking-service.ts:137`). Con ctx real se **restaura `assertBranchDelGimnasio`** en la migración virtual→física de sede de `activateScheduledSub` (hoy salteada, `service.ts:5210-5212`).
  - **Camino cron (barrido genuinamente cross-tenant, `autoExpireDueSubscriptions` desde `jobs/auto-resume-pauses.ts:129`):** se formaliza **UNA excepción `tenant-safe` documentada** (tag embebido que lee el sentinel), en vez de forzar ctx por-tenant en un job legítimamente global. Objetivo: que la 174.1 pueda ir strict con **esa única exención registrada**, no un agujero silencioso.

### Claude's Discretion

- La descomposición exacta en planes (nombres, límites de `files_modified`, orden) la fija el planner; D-01 fija el criterio (por flujo, techo ~6) y una sugerencia.
- La forma técnica exacta del tag `tenant-safe` para el cron (comentario vs marca embebida en SQL) — según el patrón que el sentinel/lint ya lee (la 173 documentó "tag EMBEBIDO en SQL para el sentinel vs comentario TS para el lint").
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requisitos de la fase

- `.planning/ROADMAP.md` — Phase 174 (goal, success criteria 1-4) y Phase 174.1 (qué queda fuera: switch + batería ISO).
- `.planning/REQUIREMENTS.md` — ADO-03 (`subscriptions` con cadena de pricing intacta), ADO-04 (`scheduling`).

### Deudas heredadas (fuente de D-02..D-07)

- `.planning/phases/173-adopci-n-2-members-guarda-de-consistencia-de-anclas/deferred-items.md` — inventario de deudas dirigidas a 174/175: `autoExpireSubscriptions`/`activateScheduledSub` con ctx=null (§173-23), `program_enrollments` INSERT sin `tenantValues` (§173-28), FK compuesta de `user_branches` (§173-28), `getReferralOverview` (§173-27), 58 inserts sin `tenantValues` (§173-25).

### Método y trampas de ejecución (heredado de la 173)

- `CLAUDE.md` §"Ejecución de fases GSD con modelo barato" — fable planifica / cadena de ejecutores sonnet secuenciales en worktree compartido / orquestador verifica tras cada plan; tests foreground-only, prohibido `pgrep` en loop, lecciones acumuladas en cada prompt.
- Memoria de proyecto: `project_saas_multitenancy_fase173.md` (método validado + ~15 bugs reales que ningún plan anticipó).

### Gates de tenancy que dispara trabajo nuevo

- `reference_gates_tenancy_ruta_job_nueva.md` (memoria) — manifest + cron inventory + lint (`tenantWhere`, NO allowlist) al agregar ruta/job.
  </canonical_refs>

<code_context>

## Existing Code Insights

_(Del scout de código sobre el worktree `et-173`, que tiene el código más nuevo con `members` ya strict.)_

### Estado de adopción actual (ningún archivo 100% migrado ni 100% crudo)

- **`subscriptions/service.ts`** (6177 líneas) — parcial: 16 métodos públicos ya con `ctx`; de 66 `.from()` solo 26 con `tenantWhere`; de 16 `.insert()` solo 4 con `tenantValues`. **~40 lecturas + ~12 inserts crudos.**
- **`subscriptions/booking-population.ts`** (384) — **totalmente crudo** (0 ctx).
- **`subscriptions/member-routes.ts`** (259) — casi crudo (2 `assertTenant` en 4 handlers).
- **`scheduling/booking-service.ts`** (2281, el más grande) — 27 ctx, solo 4/39 `from` con tenantWhere. **Mayor superficie cruda del módulo.**
- **`scheduling/service.ts`** (1020) — 6 ctx, 3/19 `from`, 0/6 inserts.
- **`scheduling/trials-service.ts`** (1208) — el más avanzado: 10/20 `from`, 2/5 inserts.
- **`scheduling/activity-service.ts`** (212) y **`holiday-service.ts`** (174) — totalmente crudos.
- **`attendance/service.ts`** (1296, submódulo acoplado por tabla `attendance`) — 38 ctx, 10/21 `from`, 0/5 inserts.

### Allowlist del lint (`el-templo-api/tenant-lint-allowlist.json`, 339 total; script `pnpm lint:tenant` → `src/db/scripts/lint-tenant.ts`)

**62 entradas (18%)** de estos módulos: subscriptions 20 (`service.ts` 12, `booking-population.ts` 6, `member-routes.ts` 2), scheduling 30 (`booking-service.ts` 10, `service.ts` 5, `holiday-service.ts` 4, `trials-service.ts` 4, `activity-service.ts` 3, `capacity.ts` 2, `routes.ts` 1, `schedule-exceptions.ts` 1), attendance 8 + `analytics/attendance-metrics-service.ts` 4 (adyacente). **Saldar estas 62 (menos las adyacentes de analytics) habilita el switch de la 174.1.**

### Cadena de pricing (D-06)

Replicada **inline** en `subscriptions/service.ts`: `assignPlan` (~1271, bloque 1468-1650), `changePlan` (~3281, bloque 3902-4040), `renewSubscription` (~4148, bloque ~4900+), previews `getChangePlanPreview` (~3176) y `getPricingPreview` (~4808). Auxiliares: `resolvePriceType` (5302), `getBasePrice` (5337), `AURA_DISCOUNT_TIERS` (`types.ts:70`), `computeReferralDiscountPercent` (`referrals/service.ts:206`, **sin ctx**, llamada desde `service.ts:466,3242,4880`), `deriveCoveredUntil` (`service.ts:192`). Tests: `test/subscriptions/{charge-on-assign,change-plan,renewal,zero-price-gate,especial-pass}.test.ts` (>60 casos) + `test/finance/*`. **Ninguno multi-tenant** (los fixtures de segundo tenant viven en `test/fixtures/second-tenant.ts`, usados solo en `test/tenancy/*`).

### Deudas — ubicación exacta (D-05/D-07)

- `autoExpireSubscriptions` — `subscriptions/service.ts:4912`, solo `userId`, **sin ctx**. Wrapper cron `autoExpireDueSubscriptions` (2324) barre todos los tenants (desde `jobs/auto-resume-pauses.ts:129`).
- `activateScheduledSub(ctx, id)` — `service.ts:5051`, diseñado `ctx: TenantContext | null`; con `ctx=null` usa guard `isNotNull(users.tenantId)` (5192) y **saltea `assertBranchDelGimnasio`** (5210-5212, "deuda dueño fase 174").
- `activeMemberExists` — `shared/active-member.ts:27`, predicado SQL puro, **no lo usan subs/sched** (D-04).
- `getReferralOverview` — `referrals/service.ts:270`, **ya con ctx**; falta `tenantWhere` interno (referrals no strict) → NO 174 (D-03).

### `class_coach_assignments` y `holidays`

Ambas tenant-scoped (col `tenant_id`, fase 167). **`class_coach_assignments` no se usa en subs/sched** (consumidores: reports/ratings) → nada que migrar acá. **`holidays`** sí es candidata directa (crudas en holiday-service/booking-service/booking-population).
</code_context>

<specifics>
## Specific Ideas

- **Criterio de éxito no negociable:** suite existente verde **sin ajustar expectativas** (criterio #4). Sin cambio para staff ni socio.
- **Orden dentro de cada plan de pricing:** golden PRIMERO (capturar), migrar DESPUÉS, golden de nuevo → diff cero como acceptance.
- Reusar el patrón de guard `isNotNull(tabla.tenantId)` de 173-08/173-23 solo donde no hay actor; con actor, ctx real.
  </specifics>

<deferred>
## Deferred Ideas

- **`getReferralOverview` + interior de `computeReferralDiscountPercent`** (tenantWhere sobre `referrals`) → fase que adopte `referrals` (175+).
- **`activeMemberExists` con tenantWhere en sus callers** (analytics/reports) → fase de esos módulos (175). Registrar que el criterio #3 del ROADMAP lo listó mal en la 174 (D-04).
- **FK compuesta de `user_branches`** hacia `branches(tenant_id, id)` → hardening de schema (migración) aparte, no esta fase.
- **Barrido general de los 58 inserts sin `tenantValues`** fuera de subs/sched → su módulo natural.
- **Batería de aislamiento, allowlist en cero, switch a `TENANT_STRICT_MODULES`, test de precio cross-tenant** → fase **174.1**.
  </deferred>

---

_Phase: 174-Adopción 3a — `subscriptions` + `scheduling`: adopción de código_
_Context gathered: 2026-08-09_
