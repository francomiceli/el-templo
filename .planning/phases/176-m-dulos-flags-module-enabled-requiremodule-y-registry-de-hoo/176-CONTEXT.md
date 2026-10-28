# Phase 176: Módulos — flags `module.*.enabled`, `requireModule` y registry de hooks - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Lo que es El Templo deja de ser "lo que hace el sistema" y pasa a ser 4 módulos encendidos para el tenant 1. Tres piezas (doc 04): flags `module.<nombre>.enabled` en `tenant_settings` (ON para tenant 1, OFF por default), guard `requireModule` (404, 100% de las 141 rutas `templo-module` del manifiesto, CI fail-closed), y registry de hooks tipado con la superficie mínima: filter `pricing.adjust` (bloqueante, 4 clientes: override → boarding pass → AURA → referral) + event `streak.milestone` (best-effort), registrados en un composition root explícito y único. Requirements: MOD-01, MOD-02. Solo `el-templo-api` salvo lo indicado en decisiones.

**El diseño está CERRADO y VALIDADO con Nacho (doc 04 §8, 2026-07-02) — no re-litigar:** 3 piezas mínimas / flags KV en `tenant_settings` / composition root `src/modules-boot.ts` sin auto-discovery / filters propagan + events aíslan / 4 módulos gruesos (`templo-training`, `templo-gamification`, `templo-marketing`, `templo-onboarding`) / `moduleInput` sobre opaco / cache in-memory por tenant TTL ~60s / default OFF fail-closed con seed ON para tenant 1 en migración.

</domain>

<decisions>
## Implementation Decisions

### Logística del tren (base de trabajo y viaje)

- **D-01:** La 176 se ejecuta en un **worktree nuevo** (`feat/176-modulos`) creado desde el **HEAD del tren v6.0 `2a4f5c92`** (`feat/173-adopcion-members`). Verificado: ese commit ya incluye el saldado de D6 (fixtures, `16177e5d`) y es ancestro de `origin/staging` (`41f1bd7a`). NO se ejecuta sobre master (la fase depende del core scopeado/strict del tren).
- **D-02:** Viaje: la 176 entra a **staging** cuando esté lista, y después **todo v6.0 junto (incluida la 176) se promociona a master** — la Fase C de promoción espera a la 176. Contexto: staging ya fue validado como apto para master; Franco prefiere sumar la 176 antes de promocionar.
- **D-03:** Método de ejecución: patrón validado de la fase 173/175.1 — planes GSD detallados ejecutados con `gsd-executor` en sonnet, secuencial (worktree compartido), verificación del orquestador tras cada plan. Reglas de prompt para sonnet en memoria `project_saas_multitenancy_fase173.md`.

### Alcance del composition root

- **D-04:** **Híbrido.** `src/modules-boot.ts` registra los hooks (filters/events) de los 4 módulos + las rutas en formato `ModuleDef` de **marketing (5 registros), onboarding (1) y gamification (1)** — baratos de mover. Los **7 plugins fp de SPOM/training quedan donde están en `app.ts`** con `requireModule` agregado in-place; migran al manifest en fases futuras (el doc 04 §5 lo anticipa explícitamente).
- **D-05:** MOD-02 se cumple con los hooks en el composition root único; la migración de rutas es progresiva, no un requisito de esta fase.

### Marketing público sin tenant (vacío detectado en scout)

- **D-06:** Las rutas públicas de blog/academy/app-landing (sin `authenticate` → sin `attachScope` → sin `scope.tenantId`) resuelven **default tenant 1 vía UN helper explícito**, documentado como deuda consciente. Así `requireModule` cubre el 100% de las 35 rutas marketing del manifiesto sin cambiar comportamiento. La resolución por Host (mapeo dominio→tenant) queda **diferida** hasta que exista multi-dominio real (YAGNI).
- **D-07:** NO reclasificar las públicas como `global` en el manifiesto — el contenido de marketing es del módulo y debe apagarse con él.

### Frontend (§6 del doc 04)

- **D-08:** **API-only.** La 176 expone `enabledModules: string[]` en la respuesta de sesión (`/api/auth/me` o equivalente). **NADA de UI**: el gating del nav del admin por módulo y el reemplazo del hack `canAccessTraining` por email hardcodeado (`el-templo-admin/src/utils/trainingAccess.ts:11` + espejo `el-templo-api/src/modules/shared/permissions.ts:44`) se **difieren** — cambiar quién ve el nav de training es decisión de producto a validar con Nacho aparte. Coherente con "cero cambio visible para el staff".

### Claude's Discretion

- **Verificación byte-idéntica del pricing:** cómo garantizar que los precios post-registry son idénticos a los pre-registry (p.ej. tests golden pre/post sobre la matriz override/boarding/AURA/preview/por país) queda a criterio de researcher/planner — es táctica de verificación, no decisión de producto. El criterio de éxito 4 del roadmap lo exige.
- **Coordinación con forks pendientes de `subscriptions/service.ts`:** el refactor extrae UNA función core de pricing usada por los 4 métodos (doc 04 §4.2). Ojo con los forks sin reconciliar: fase 177 paquete de clases (D-13 exclusión de descuentos, NO pusheada) y alta prorrateada (en master, deuda de reconciliación con el tren). El planner debe verificar el estado real de la cadena en la base elegida (`2a4f5c92`) y no asumir los números de línea del doc 04 (pre-tenancy).
- **Misterio de rutas aura:** el manifiesto cuenta solo 1 ruta `templo-gamification` (bar-challenge); las rutas de `aura` no aparecen registradas directas en `app.ts` — el researcher debe determinar dónde se montan y si su clasificación en el manifiesto es correcta antes de gatearlas.
- **Numeración de migración** (seed de flags ON para tenant 1): verificar el máximo real aplicado al momento de ejecutar (el tren anda por 0200+; 0205/0206 reservadas por 177/178 en worktrees).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del mecanismo (fuente de verdad)

- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — LA spec de esta fase: 3 piezas, granularidad de los 4 módulos (§2.1), guard (§3), contrato de hooks con `PricingAdjustCtx` (§4), composition root (§5), frontend (§6), decisiones validadas (§8). Números de línea de código citados son pre-tenancy — verificar contra la base real.
- `.docs/saas-multitenancy/02-inventario-modulos.md` — clasificación core vs Templo de las carpetas API; regla de dirección de imports.
- `.planning/REQUIREMENTS.md` — MOD-01 y MOD-02 (líneas 68-71).

### Código existente que esta fase engancha

- `el-templo-api/src/db/schema/tenants.ts` (líneas 73-85) — tabla `tenant_settings` KV ya creada (unique `(tenantId, settingKey)`), nace vacía, sin consumidores de runtime.
- `el-templo-api/test/tenant-manifest.ts` — 373 rutas clasificadas; 141 `templo-module` (102 training, 35 marketing, 3 onboarding, 1 gamification). El gate de cobertura del guard deriva de acá.
- `el-templo-api/test/tenancy/iso-01-manifiesto.test.ts` — gate fail-closed bidireccional manifiesto↔rutas reales; el chequeo "templo-module sin requireModule = CI rojo" se suma a esta familia.
- `el-templo-api/src/modules/subscriptions/service.ts` — cadena de pricing duplicada en `assignPlan` (~1734-1840), `changePlanAfterCurrent` (~4399), `renewSubscription` (~4866-4924), `getPricingPreview` (~5437-5465); `AuraService` inyectado por constructor (~318-323).
- `el-templo-api/src/modules/streaks/service.ts` (líneas 277-302) — recompensa AURA best-effort (try/catch + log.warn) que se convierte en el event `streak.milestone`.
- `el-templo-api/src/modules/settings/service.ts` (líneas 37-60) — patrón `getFlag`/`setFlag` contra `system_settings` (default OFF): precedente reusable para la lectura tipada de flags, pero contra `tenant_settings`.
- `el-templo-api/src/app.ts` — registro manual de ~50 plugins; los Templo: training líneas 168-187 (7), marketing 199-211 (5), onboarding 336, gamification (bar-challenge) 339.
- `el-templo-api/src/modules/shared/country-scope.ts` (~línea 120-127) — `attachScope`/`attachCountryScope` requiere `request.user` (post-authenticate); por eso el vacío de rutas públicas (D-06).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `tenant_settings` (schema listo, fase 166) — hogar de los flags; solo falta la capa de lectura tipada + cache TTL.
- Patrón `getFlag`/`parseOrDefault` de `settings/service.ts` — plantilla para el resolver de flags de módulo.
- Familia de gates `test/tenancy/iso-*` + manifiesto — el gate "templo-module ⇒ requireModule" es una extensión mecánica de infra ya probada.
- Guards existentes por ruta (`fastify.authenticate`, `attachScope`) — `requireModule` se compone detrás de ellos (orden: authenticate → attachScope → requireModule).

### Established Patterns

- **Greenfield total del mecanismo:** cero `requireModule`/`HookRegistry`/`modules-boot` en el código — no hay legacy que respetar, solo el contrato del doc 04.
- 23 sitios `new AuraService(...)` dispersos (routes + jobs) — el registry elimina la necesidad en `SubscriptionService`/`StreakService`; el resto NO es alcance de esta fase.
- Guards se aplican por ruta/plugin (no hooks globales en `app.ts`).

### Integration Points

- `buildApp()` llama `registerModules(app, hooks)` después de los registros core.
- Seed de flags: migración nueva (numeración a verificar) que inserta las 4 keys ON para tenant 1.
- `enabledModules` en la respuesta de sesión (D-08) — único punto de contacto con frontends en esta fase.

</code_context>

<specifics>
## Specific Ideas

- Franco quiere la 176 **dentro del paquete v6.0 que va a master**: staging primero, y la promoción (Fase C) sale con la 176 incluida.
- "Cero cambio para el Templo" es el criterio rector: precios byte-idénticos, mismas pantallas, mismos flujos con los flags ON.

</specifics>

<deferred>
## Deferred Ideas

- **Gating del nav del admin por módulo + reemplazo del hack `canAccessTraining`** (doc 04 §6) — diferido; requiere decisión de producto con Nacho sobre quién ve training.
- **Resolución de tenant por Host/dominio** para rutas públicas — diferido hasta multi-dominio real.
- **Migración de los 7 plugins fp de SPOM/training al formato `ModuleDef`** — gradual, fases futuras.
- **Promoción de flags KV a tabla `tenant_modules`** — solo si aparece billing (doc 04 §8.2).

### Reviewed Todos (not folded)

- `v51-milestone-data-rollout.md` (Rollout de datos v5.1 — `milestone_exercise_id`) — falso positivo del matcher por la palabra "milestone"; nada que ver con `streak.milestone`. Sigue pendiente en su propio carril.

</deferred>

---

_Phase: 176-Módulos — flags `module._.enabled`, `requireModule` y registry de hooks\*
_Context gathered: 2026-08-20_
