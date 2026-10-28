# Phase 176: Módulos — flags `module.*.enabled`, `requireModule` y registry de hooks - Research

**Researched:** 2026-08-20
**Domain:** Fastify 5 plugin/hook architecture · feature-flags por tenant · refactor de cadena de pricing · gates de CI fail-closed
**Confidence:** HIGH (todo lo que sigue está verificado contra el código real de `2a4f5c92` o probado empíricamente con Fastify 5.7.4; cero dependencia de docs externos)

**Base de código auditada:** worktree `/home/franco/projects/et-173`, rama `feat/173-adopcion-members`, HEAD **`2a4f5c92`** — confirmado idéntico al commit que fija D-01. [VERIFIED: `git -C /home/franco/projects/et-173 log`]

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** La 176 se ejecuta en un **worktree nuevo** (`feat/176-modulos`) creado desde el **HEAD del tren v6.0 `2a4f5c92`** (`feat/173-adopcion-members`). Verificado: ese commit ya incluye el saldado de D6 (fixtures, `16177e5d`) y es ancestro de `origin/staging` (`41f1bd7a`). NO se ejecuta sobre master (la fase depende del core scopeado/strict del tren).
- **D-02:** Viaje: la 176 entra a **staging** cuando esté lista, y después **todo v6.0 junto (incluida la 176) se promociona a master** — la Fase C de promoción espera a la 176.
- **D-03:** Método de ejecución: patrón validado de la fase 173/175.1 — planes GSD detallados ejecutados con `gsd-executor` en sonnet, secuencial (worktree compartido), verificación del orquestador tras cada plan.
- **D-04:** **Híbrido.** `src/modules-boot.ts` registra los hooks (filters/events) de los 4 módulos + las rutas en formato `ModuleDef` de **marketing (5 registros), onboarding (1) y gamification (1)** — baratos de mover. Los **7 plugins fp de SPOM/training quedan donde están en `app.ts`** con `requireModule` agregado in-place; migran al manifest en fases futuras.
- **D-05:** MOD-02 se cumple con los hooks en el composition root único; la migración de rutas es progresiva, no un requisito de esta fase.
- **D-06:** Las rutas públicas de blog/academy/app-landing (sin `authenticate` → sin `attachScope` → sin `scope.tenantId`) resuelven **default tenant 1 vía UN helper explícito**, documentado como deuda consciente. La resolución por Host queda **diferida** (YAGNI).
- **D-07:** NO reclasificar las públicas como `global` en el manifiesto — el contenido de marketing es del módulo y debe apagarse con él.
- **D-08:** **API-only.** La 176 expone `enabledModules: string[]` en la respuesta de sesión (`/api/auth/me` o equivalente). **NADA de UI**: el gating del nav del admin y el reemplazo del hack `canAccessTraining` se **difieren**.

### Claude's Discretion

- **Verificación byte-idéntica del pricing** (táctica de tests golden pre/post) — resuelto en §"Táctica de verificación byte-idéntica" más abajo.
- **Coordinación con forks pendientes de `subscriptions/service.ts`** (fase 177, alta prorrateada) — resuelto en §"Riesgo de colisión con forks".
- **Misterio de rutas aura** — RESUELTO, ver §"Misterio de rutas aura".
- **Numeración de migración** — RESUELTO: `0207`, ver §"Numeración de migración".

### Deferred Ideas (OUT OF SCOPE)

- Gating del nav del admin por módulo + reemplazo del hack `canAccessTraining` (doc 04 §6).
- Resolución de tenant por Host/dominio para rutas públicas.
- Migración de los 7 plugins fp de SPOM/training al formato `ModuleDef`.
- Promoción de flags KV a tabla `tenant_modules`.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                                                                                                                                     | Research Support                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MOD-01** | Flags `module.<nombre>.enabled` en `tenant_settings` + guard `requireModule` (404) gatean las rutas de los 4 módulos Templo — prendidos para tenant 1, apagados por default para tenants nuevos | §"Pieza 1 — flags" (schema listo, patrón `getFlag`, migración 0207 idempotente), §"Pieza 2 — el guard" (técnica `onRoute`-append verificada empíricamente, mapeo completo 141/141 rutas → 18 registros), §"Gate de cobertura" |
| **MOD-02** | Registry de hooks tipado (filter `pricing.adjust` bloqueante + event `streak.milestone` best-effort), composition root explícito                                                                | §"Pieza 3 — el registry", §"La cadena de pricing REAL", §"El event `streak.milestone`", §"Composition root"                                                                                                                   |

</phase_requirements>

## Summary

La fase es **greenfield sobre infra ya construida**: no hay una línea de `requireModule`/`HookRegistry`/`modules-boot` en `2a4f5c92` [VERIFIED: grep], pero sí están listos los tres cimientos que la fase necesita — la tabla `tenant_settings` (fase 166, vacía y sin consumidores), el manifiesto de 370 rutas con su gate bidireccional fail-closed (fase 171), y una **suite golden de pricing ya escrita para exactamente este propósito** (`test/subscriptions/pricing-golden.test.ts`, 897 líneas, fase 174-02). El riesgo técnico real no está en inventar el mecanismo: está en tres trampas de Fastify y en cuatro divergencias entre el doc 04 y el código actual.

**Las tres trampas de Fastify** (las tres verificadas empíricamente en esta sesión con Fastify 5.7.4, no asumidas): (1) `onRoute` **no ve** los hooks agregados con `instance.addHook`, así que el patrón que propone el doc 04 §3 sería invisible para el gate de cobertura — la única red que garantiza el 100% de las 141 rutas; (2) los hooks `onRequest` **de instancia corren ANTES** que los `onRequest` por-ruta, así que un `addHook` de scope dejaría a `requireModule` corriendo antes de `authenticate`/`attachScope` — sin tenant que consultar; (3) un `addHook` dentro de un plugin `fp(...)` **no encapsula** y aplicaría el 404 a toda la API. La salida que resuelve las tres a la vez está probada abajo: un hook `onRoute` de scope que **appendea el guard al array `onRequest` por-ruta**. Una línea por registro, orden correcto garantizado, y visible al gate.

**Las cuatro divergencias con el doc 04:** la cadena de pricing tiene hoy **cinco ramas y seis métodos**, no cuatro; `renewSubscription` **no tiene AURA ni boarding pass** (hereda el precio) y por lo tanto no es cliente del filter; `changePlanNow` tiene boarding pass pero **no** AURA; y la rama de máxima prioridad hoy es `prorateToMonthEnd` (la feature de alta prorrateada **ya viajó al tren** en el back-merge de master). Además, los **referidos son core**, no Templo (sus rutas están clasificadas `tenant-scoped`): de los "4 clientes" que nombra el CONTEXT, solo **dos** (boarding pass y AURA) cruzan al handler del módulo.

**Primary recommendation:** implementar el guard con la técnica `onRoute`-append sobre los 18 registros ya identificados (mapeo 141/141 cerrado, ver tabla), extraer UNA función core de pricing que cubra **solo** los 4 sitios con superficie Templo (`assignPlan`, `changePlanAfterCurrent`, `changePlanNow`, `getPricingPreview`), y usar `pricing-golden.test.ts` como criterio de diff-cero corriéndolo verde antes y después sin tocar un literal.

## Architectural Responsibility Map

| Capability                                         | Primary Tier                                     | Secondary Tier                     | Rationale                                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lectura de flags `module.*.enabled`                | API / Backend (service + cache in-memory)        | Database (`tenant_settings`)       | El flag es autoridad server-side; el cliente nunca lo manda ni lo puede forzar (mismo criterio que `scope.tenantId`, fase 166).                                    |
| Gating de rutas (404)                              | API / Backend (hook `onRequest` por-ruta)        | —                                  | Frontera de activación, no de seguridad (doc 04 §7). Corre en el pipeline de Fastify, antes del handler.                                                           |
| Registry de hooks (filter/event)                   | API / Backend (composition root en proceso)      | —                                  | Todo síncrono in-process. No hay cola, ni bus, ni cruce de tier.                                                                                                   |
| Cadena de pricing — override, prorrateo, referidos | API / Backend (**core**)                         | —                                  | Cualquier gimnasio ajusta precio a mano, prorratea y tiene referidos: las tres rutas de referidos están clasificadas `tenant-scoped` en el manifiesto, o sea core. |
| Cadena de pricing — boarding pass, AURA            | API / Backend (**módulo `templo-gamification`**) | Registry (filter `pricing.adjust`) | Los dos únicos pasos exclusivos de El Templo. Son los que cruzan al handler del módulo.                                                                            |
| Recompensa AURA por racha                          | API / Backend (**módulo**) vía event             | Core `StreakService` emite         | El núcleo de racha es core, la recompensa es del módulo (doc 04 §4.3).                                                                                             |
| `enabledModules` en la sesión                      | API / Backend (`GET /api/auth/me`)               | Frontend (consumo diferido)        | D-08: la 176 solo lo EXPONE. El nav del admin no se toca.                                                                                                          |

## Project Constraints (from CLAUDE.md)

Directivas aplicables a esta fase; el planner debe verificar que ningún plan las contradiga:

| Directiva                                                                                           | Impacto en esta fase                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API: usar el logger de Fastify (`request.log`/`app.log`), nunca `console.log`**                   | El guard, el registry y los handlers de events loguean con `request.log`/`this.log`. El `catch` del event best-effort usa `log.warn` (espeja `streaks/service.ts:295`).                    |
| **Sin `any`. `catch (err: unknown)` + `instanceof Error`**                                          | El `HookRegistry` tipado es el corazón de MOD-02: `FilterMap`/`EventMap` con firmas cerradas. `moduleInput` es `Record<string, unknown>` (opaco, no `any`) y el módulo lo valida/estrecha. |
| **Rutas nuevas ⇒ tests de integración en `el-templo-api/test/` contra MySQL real**                  | Los tests del guard y del flag corren contra `eltemplo_test` con `createTestApp()`. No hay unit tests puros posibles para el gate (ver §"por qué necesita MySQL").                         |
| **Migraciones: escritas a mano, `pnpm db:migrate`, NUNCA `drizzle-kit migrate`/`push`**             | La migración 0207 del seed va a mano.                                                                                                                                                      |
| **Nunca `;` dentro de un comentario `--` de SQL**                                                   | Trampa activa: la migración 0207 es puro comentario + `INSERT ... SELECT ... WHERE NOT EXISTS`. Copiar el estilo de `0168_seed_pricing_zero_price.sql`.                                    |
| **`.env.example` al agregar env vars**                                                              | La fase no necesita env vars nuevas (el TTL del cache puede ser una constante). Si el planner introduce una, este archivo entra al plan.                                                   |
| **Nunca instalar/actualizar dependencias sin preguntar**                                            | La fase **no requiere ningún paquete nuevo** (ver §"Package Legitimacy Audit").                                                                                                            |
| **No correr la suite completa local (CI lo hace); typecheck sí**                                    | Los planes deben pedir `pnpm exec tsc --noEmit` + los archivos de test puntuales, no `pnpm test` completo.                                                                                 |
| **Delegar barridos a subagentes sonnet; ejecución de planes con `gsd-executor` sonnet, secuencial** | D-03. Tests SOLO en foreground con timeout amplio; prohibido `run_in_background`.                                                                                                          |

Del skill `el-templo-db-migrations` (Hard Rules 1-6): numeración a mano tomando el máximo+1; commitear el `.sql` en el mismo commit que el schema; test data JAMÁS en migración (esta migración toca datos de **prod** — staging y prod comparten host MySQL).

---

## Preguntas abiertas del CONTEXT — resueltas

### 1. Misterio de rutas aura — RESUELTO

**AURA no expone ninguna ruta HTTP.** Es un service interno puro: `src/modules/aura/` contiene exactamente `index.ts`, `service.ts`, `types.ts` — no hay `routes.ts`. `src/modules/lifestyle/` tiene solo `index.ts` + `seed/`. Grep de `/api/aura` y de cualquier registro de `auraRoutes` en `src/`: **cero resultados**. [VERIFIED: `ls src/modules/aura/`, `grep -rn "auraRoutes\|/api/aura" src/`]

El propio manifiesto ya lo dice, en el comentario de la sección `templo-gamification` (`test/tenant-manifest.ts:1136-1137`): _"AURA no expone rutas propias (es un service interno), así que el módulo aporta una sola."_ **La clasificación del manifiesto es correcta: 1 sola ruta de gamification (`POST /api/bar-challenge/result`).** No hay rutas escondidas que gatear. [VERIFIED: código + manifiesto]

**PERO hay un hallazgo colateral que el planner debe conocer:** `AuraService` se instancia en **23 sitios** repartidos en 25 archivos, incluidos **routes core** (`auth/routes.ts`, `members/routes.ts`, `attendance/routes.ts`, `finance/routes.ts`, `scheduling/routes.ts`, `goal-plans/routes.ts`) y **4 jobs** (`auto-resume-pauses`, `mark-no-shows`, `tenure-milestones`, `wellhub-sync`). [VERIFIED: `grep -rn "new AuraService" src/ | wc -l` → 23]

Consecuencia honesta: **apagar `templo-gamification` NO deja de exponer el saldo AURA** — sigue viajando en respuestas de rutas core (`/api/auth/me` devuelve campos de bar-challenge; varias rutas de members leen balance) y los 4 crons siguen otorgando AURA. Esta fase **cierra la superficie de rutas del módulo (1 ruta)**, no la superficie de datos. Es coherente con el alcance del doc 04 (la regla de dirección de imports es la que a término mata esos acoples), pero debe quedar **escrito como deuda consciente** en el SUMMARY, porque "módulo OFF ⇒ el tenant no ve AURA" no será verdad al terminar la fase. El registry solo saca `auraService` del constructor de **dos** services (`SubscriptionService`, `StreakService`); los otros 21 sitios están fuera de alcance (el propio doc 04 §4.2 lo dice).

### 2. Estado real de la cadena de pricing en `2a4f5c92`

Ver §"La cadena de pricing REAL" abajo — es el hallazgo más denso del research. Resumen: **6 métodos, 5 ramas, 4 clientes reales del filter**; los números de línea del doc 04 (`1045-1112`) están obsoletos por ~700 líneas.

### 3. Táctica de verificación byte-idéntica — RESUELTO con activo preexistente

Ver §"Táctica de verificación byte-idéntica". El activo: `test/subscriptions/pricing-golden.test.ts` ya existe y fue escrito con este propósito exacto.

### 4. Numeración de migración — RESUELTA: `0207`

Máximo real en `2a4f5c92`: **`0206_tv_show_alternative.sql`**. Cero prefijos duplicados dentro de esta base. [VERIFIED: `ls src/db/migrations/ | cut -c1-4 | sort | uniq -d` → vacío; máximo → 0206]

Por qué 0205 y 0206 ya están acá: el HEAD del tren `2a4f5c92` es un **back-merge de `origin/master`** que trajo `0205_tv_deuteros_auto_rotate.sql` (fase TV deuteros) y `0206_tv_show_alternative.sql` (fase 178, pusheada a master el 2026-08-19). O sea: **las dos "reservas" que el CONTEXT menciona ya están consumidas y presentes en la base de la 176.**

⚠️ **Colisión pendiente que NO es de esta fase pero que el planner debe conocer:** el worktree de la fase 177 tiene `0205_paquete_clases_matrix.sql`, y algún worktree tiene `0206_tv_deuteros_auto_rotate.sql` — o sea que la 177 (no pusheada) va a chocar con el 0205 que ya está en master. [VERIFIED: `ls /home/franco/projects/*/el-templo-api/src/db/migrations/ | grep -E '^020[5-9]' | sort -u`]

**Recomendación:** la 176 usa **`0207_seed_module_flags.sql`**, y el plan debe incluir un paso de verificación _en el momento de escribir la migración_ (`ls src/db/migrations/*.sql | sort | tail -3`), porque si la 177 se renumera antes de que la 176 llegue a staging, podría tomar 0207. Si eso pasa, la 176 se corre a 0208 — es una renumeración de un solo archivo, barata, siempre que se detecte antes del merge (el runner aplica por orden lexicográfico de filename, y dos migraciones con el mismo prefijo ordenan por el resto del nombre, así que una colisión NO falla ruidosamente: se aplican las dos en orden alfabético. Es un fallo silencioso, por eso el chequeo va explícito en el plan).

---

## Standard Stack

**Esta fase no introduce ni actualiza una sola dependencia.** Todo se construye con lo que ya está instalado. [VERIFIED: la superficie del diseño son hooks de Fastify, Drizzle y vitest, todos presentes]

### Core (ya instalado, versiones verificadas en la base)

| Librería               | Versión   | Propósito en esta fase                                                | Por qué es la estándar acá                                                                                                                                              |
| ---------------------- | --------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fastify`              | **5.7.4** | Hooks `onRoute`/`onRequest`, encapsulación de plugins, `RouteOptions` | Es el framework del API. Toda la mecánica del guard es API nativa de Fastify 5 — sin librería de "feature flags". [VERIFIED: `require('fastify/package.json').version`] |
| `fastify-plugin`       | **5.1.0** | Los 7 wrappers `fp(...)` de training que quedan in-place (D-04)       | Ya en uso. **Advertencia:** `fp` desactiva la encapsulación — ver Pitfall 3. [VERIFIED: `require('fastify-plugin/package.json').version`]                               |
| `drizzle-orm` (mysql2) | en uso    | Lectura de `tenant_settings`                                          | Único ORM del proyecto.                                                                                                                                                 |
| `vitest`               | en uso    | Gate de cobertura + golden de pricing                                 | Runner de la suite; `test/setup.ts` provisiona una DB por worker.                                                                                                       |

### Alternativas consideradas

| En vez de                                          | Se podría usar                                                     | Tradeoff                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard con hooks nativos de Fastify                 | Una librería de feature-flags (Unleash, LaunchDarkly, `flagsmith`) | **Rechazado sin dudarlo.** El doc 04 §7 es explícito: no es un sistema de billing ni de experimentación. Un SaaS externo para 4 booleanos por tenant agrega red-trip, dependencia y superficie de fallo a cambio de nada.                                            |
| Cache in-memory con `Map` + timestamp              | `lru-cache` / `node-cache`                                         | La necesidad es 4 booleanos por tenant con TTL 60s. Un `Map<number, {flags, expiresAt}>` de ~15 líneas no justifica una dependencia. [ASSUMED — juicio de diseño, no hay precedente en el repo: `grep -rn "new Map("` en `src/` no muestra **ningún** cache con TTL] |
| `config` por-ruta de Fastify para marcar el módulo | Marca por función (`fn.temploModule`)                              | Las dos funcionan y las dos son visibles a `onRoute`. La marca por función es superior: **es la misma referencia que se ejecuta**, así que el gate verifica el guard REAL, no una etiqueta paralela que podría quedar desincronizada. Ver §"Gate de cobertura".      |

**Instalación:** ninguna. El planner NO debe incluir un `pnpm add` en ningún plan de esta fase.

## Package Legitimacy Audit

**No aplica: la fase no instala ningún paquete externo.** Todo el código nuevo se apoya en dependencias ya presentes en `el-templo-api/package.json` y versionadas en el lockfile del repo. Ningún plan debería introducir un `pnpm add`; si alguno lo hace, es señal de que el diseño se desvió (ver "Alternativas consideradas": la tentación concreta es una librería de feature-flags o de cache).

Verificación de las versiones citadas: hecha **contra el `node_modules` del propio worktree**, no contra el registry — que es la comprobación relevante acá (qué versión corre de verdad), y evita por completo el vector de slopsquatting porque no se resuelve ningún nombre nuevo. [VERIFIED: `node -e "require('fastify/package.json').version"` en `/home/franco/projects/et-173/el-templo-api`]

---

## Architecture Patterns

### Diagrama del sistema — qué toca un request cuando el mecanismo está en su lugar

```
                          buildApp()
                               │
       ┌───────────────────────┼────────────────────────────┐
       │                       │                            │
   cimientos core        registros core             registerModules(app, hooks)
   (cors, db, r2,        (~30 registros              [src/modules-boot.ts]
    auth)                 tenant-scoped)             ÚNICO archivo core que
       │                       │                     importa módulos
       │                       │                            │
       │                       │                ┌───────────┴───────────┐
       │                       │            ModuleDef              hooks del módulo
       │                       │         (marketing 5,          filters: pricing.adjust
       │                       │          onboarding 1,         events:  streak.milestone
       │                       │          gamification 1)               │
       │                       │                │                       │
       │                       │        moduleScope(name)               │
       │                       │        ├─ addHook onRoute:             │
       │                       │        │  append requireModule(name)   │
       │                       │        └─ register(rutas)              │
       │                       │                                        │
   [training: 12 registros quedan in-place en app.ts (D-04),            │
    envueltos con el MISMO moduleScope helper]                          │
       │                                                                │
       ▼                                                                ▼
─── REQUEST ────────────────────────────────────────────         HookRegistry
   │                                                              (tipado, cerrado)
   ├─▶ hooks onRequest DE INSTANCIA (auth+scope de plugin)              │
   │      p.ej. memberSubscriptionRoutes, adminRoutes                   │
   ├─▶ hooks onRequest POR-RUTA, en orden de array:                     │
   │      [ fastify.authenticate , attachScope? , requireModule ]       │
   │                                    │                               │
   │                                    ├─ tenant OFF ──▶ 404 ✂         │
   │                                    └─ tenant ON  ──▶ sigue         │
   ├─▶ preValidation / preHandler (schemas, roles)                      │
   └─▶ HANDLER ──▶ SubscriptionService.resolvePrice()  ────runFilter───▶│
                        core: prorrateo → override                      │
                        filter: boarding pass → AURA  ◀────ctx mutado───┤
                        core: referidos                                 │
                                                                        │
                   StreakService.updateStreak() ────────emit───────────▶│
                        milestone detectado, best-effort (try/catch)    │
                                                                   award AURA
```

Los dos caminos de datos que importan: el **request HTTP** (arriba) que puede morir en 404 antes de tocar un dato, y la **llamada in-process** desde un service core al registry (abajo a la derecha) que es donde el core deja de conocer "aura" y "boarding pass".

### Estructura de archivos recomendada

```
el-templo-api/src/
├── modules-boot.ts                    # NUEVO — composition root, único core→módulo
├── modules/shared/
│   ├── modules.ts                     # NUEVO — MODULE_NAMES + tipo ModuleName (fuente única)
│   ├── module-flags.ts                # NUEVO — resolver de flags + cache TTL + invalidate()
│   ├── module-registry.ts             # NUEVO — requireModule(), moduleScope(), registerModule()
│   └── hooks.ts                       # NUEVO — HookRegistry, FilterMap, EventMap, PricingAdjustCtx
├── modules/subscriptions/
│   └── pricing.ts                     # NUEVO — la función core extraída (resolvePrice)
├── modules/aura/
│   └── module.ts                      # NUEVO — ModuleDef de templo-gamification (filter + event)
├── db/migrations/
│   └── 0207_seed_module_flags.sql     # NUEVO — 4 flags ON para tenant 1, idempotente
└── app.ts                             # MODIFICADO — 12 registros de training envueltos + registerModules()

el-templo-api/test/
├── tenancy/iso-01-manifiesto.test.ts  # MODIFICADO — + gate "templo-module ⇒ requireModule"
├── tenancy/mod-01-guard.test.ts       # NUEVO — comportamiento: flag OFF ⇒ 404
└── subscriptions/pricing-golden.test.ts # SIN TOCAR UN LITERAL — criterio de diff cero
```

### Pattern 1 — El guard: `onRoute` que appendea al array `onRequest` por-ruta

**Qué:** en vez de `fastify.addHook("onRequest", requireModule(...))` (lo que propone el doc 04 §3), el scope del módulo cuelga un hook `onRoute` que **appendea** el guard al array `onRequest` de cada ruta que se registre después.

**Cuándo usarlo:** siempre, en los 18 registros. Es la única de las tres técnicas candidatas que satisface las tres restricciones a la vez.

**Por qué (las tres restricciones y cómo cada técnica falla):**

| Técnica                                     | Orden correcto (post-`authenticate`) | Visible al gate `onRoute` | Cubre rutas sin `onRequest` propio | Veredicto                                                     |
| ------------------------------------------- | ------------------------------------ | ------------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `addHook("onRequest")` de scope (doc 04 §3) | ❌ **corre ANTES** de los per-route  | ❌ invisible              | ✅                                 | Rechazada                                                     |
| `addHook("preHandler")` de scope            | ✅                                   | ❌ invisible              | ✅                                 | Rechazada (además el 400 de validación se adelantaría al 404) |
| Editar las 141 rutas a mano                 | ✅                                   | ✅                        | ✅                                 | Rechazada: 141 ediciones, y una ruta nueva nace sin guard     |
| **`onRoute` que appendea a `onRequest`**    | ✅                                   | ✅                        | ✅                                 | **Elegida**                                                   |

```ts
// Source: verificado empíricamente en esta sesión contra fastify 5.7.4
// (script en /home/franco/projects/et-173/el-templo-api, node -e)
// src/modules/shared/module-registry.ts

/** Marca que el gate ISO-01 lee para afirmar cobertura. Va en la MISMA función
 *  que se ejecuta: no puede desincronizarse de la realidad. */
export interface ModuleGuard {
  (request: FastifyRequest, reply: FastifyReply): Promise<void>;
  temploModule: ModuleName;
}

export function requireModule(name: ModuleName, db: DbInstance): ModuleGuard {
  const guard = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = await resolveTenantForGuard(request, db); // ver Pattern 2
    if (!(await isModuleEnabled(tenantId, name, db))) {
      return reply.code(404).send({ error: "No encontrado" });
    }
  };
  (guard as ModuleGuard).temploModule = name;
  return guard as ModuleGuard;
}

/** Envuelve UN registro de rutas en un scope encapsulado que appendea el guard
 *  a toda ruta registrada adentro. Una línea por registro. */
export async function moduleScope(
  app: FastifyInstance,
  name: ModuleName,
  plugin: FastifyPluginAsync,
  opts: { prefix?: string } = {},
): Promise<void> {
  await app.register(async (scoped) => {
    const guard = requireModule(name, scoped.db);
    scoped.addHook("onRoute", (route) => {
      route.onRequest = route.onRequest
        ? [
            ...(Array.isArray(route.onRequest)
              ? route.onRequest
              : [route.onRequest]),
            guard,
          ]
        : [guard];
    });
    await scoped.register(plugin, opts);
  });
}
```

Evidencia de la ejecución real del script de verificación (Fastify 5.7.4):

```
ORDEN: authenticate -> attachScope -> requireModule -> handler
       requireModule -> handler-publica          (ruta sin onRequest propio)
lo que ve el gate (refs post-ready):
  GET /api/test/x        => anon,anon,GUARD:templo-training
  GET /api/test/publica  => GUARD:templo-training
```

**Detalle no obvio, imprescindible para el gate:** el hook `onRoute` de la RAÍZ (el seam `BuildAppOptions`) corre **antes** que el del scope hijo, así que si el test serializa la info en el acto no ve el guard. **Pero el objeto `RouteOptions` es el mismo por referencia**: guardando la referencia y leyéndola después de `app.ready()`, la mutación del hijo sí se ve. [VERIFIED: probado con y sin diferir la lectura — sin diferir da `null`, difiriendo da la marca]

### Pattern 2 — Resolución del tenant dentro del guard (el patrón de auth es heterogéneo)

**Qué:** el guard no puede asumir `request.scope`. El repo resuelve auth y scope de **cuatro formas distintas** según el módulo. [VERIFIED: barrido de los 18 archivos de rutas]

| Patrón                                                                                        | Dónde                                                                                  | Qué tiene el guard disponible                             |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `{ onRequest: [fastify.authenticate] }` por-ruta, `attachCountryScope` **dentro del handler** | spom, sessions, progression, tree-progress, goal-plans, programs, exercise-adjustments | `request.user` ✅, `request.scope` ❌                     |
| `addHook("onRequest")` de plugin con `authenticate` (+ `canAccessTraining`)                   | adminRoutes, tree-editor, exercise-adjustments-coach, check-ins, onboarding            | `request.user` ✅, `request.scope` ❌                     |
| `addHook("onRequest")` de plugin con `authenticate` **+ `attachCountryScope`**                | memberSubscriptionRoutes y ~29 archivos core más                                       | `request.user` ✅, `request.scope` ✅                     |
| `{ preHandler: [fastify.authenticate] }` **por-ruta**                                         | **todo marketing**: blog, academy, gladius, franchise, app-landing                     | `request.user` ❌ (preHandler corre DESPUÉS de onRequest) |
| `attachCountryScope` dentro del handler, sin hook                                             | bar-challenge, `/api/auth/me`                                                          | `request.user` ✅, `request.scope` ❌                     |

**Implementación recomendada (fail-closed y sin efectos colaterales):**

```ts
// src/modules/shared/module-registry.ts
async function resolveTenantForGuard(
  request: FastifyRequest,
  db: DbInstance,
): Promise<number> {
  // 1. El scope ya está resuelto por un hook de instancia (mayoría del core).
  if (request.scope?.tenantId != null) return request.scope.tenantId;
  // 2. Autenticado pero sin scope todavía: SELECT mínimo del ancla.
  //    NO se llama attachCountryScope: adelantaría el 403 TENANT_SUSPENDED y
  //    cambiaría el código de error observable de rutas que hoy responden otra cosa.
  if (typeof request.user?.userId === "number") {
    const [row] = await db
      .select({ tenantId: schema.users.tenantId })
      .from(schema.users)
      .where(eq(schema.users.id, request.user.userId))
      .limit(1);
    if (row?.tenantId != null) return row.tenantId;
  }
  // 3. D-06: superficie pública (marketing) — tenant por defecto, deuda consciente.
  return DEFAULT_PUBLIC_TENANT_ID; // = 1
}
```

**Consecuencia honesta que el planner debe aceptar y escribir:** en **todo marketing** (35 de las 141 rutas, incluidas las 16 admin de blog que SÍ están autenticadas por `preHandler`) el guard cae siempre en la rama (3) y resuelve tenant 1, autenticado o no. Con un solo tenant real es indistinguible; con multi-tenant, las rutas admin de blog consultarían el flag del tenant equivocado. Es exactamente el alcance de D-06 ("deuda consciente") pero **más amplio de lo que D-06 enuncia** (D-06 habla de "las públicas"; en la realidad del código son las 35). Dos salidas para el planner: (a) aceptarlo y documentarlo con precisión — recomendado, cero riesgo, coherente con "cero cambio para el Templo"; (b) mover el `authenticate` de las 16 rutas admin de blog de `preHandler` a `onRequest` — es correcto pero toca 16 rutas y cambia el orden del pipeline en una superficie que nadie pidió tocar. **Recomiendo (a)**, con el matiz escrito.

### Pattern 3 — El registry tipado

```ts
// src/modules/shared/hooks.ts — contrato CERRADO. Agregar un hook = agregar
// una entrada a estos dos mapas, visible en el diff del PR.
export interface FilterMap {
  "pricing.adjust": (ctx: PricingAdjustCtx) => Promise<void>;
}
export interface EventMap {
  "streak.milestone": (evt: StreakMilestoneEvent) => Promise<void>;
}

export class HookRegistry {
  // filters: PROPAGAN (el spend de AURA debe abortar el alta — hoy ya es así,
  // service.ts:1825 lanza InsufficientBalanceError sin catch)
  async runFilter<K extends keyof FilterMap>(
    key: K,
    tenantId: number,
    ctx,
  ): Promise<void>;
  // events: AÍSLAN (try/catch + log.warn por handler — espeja streaks/service.ts:295-300)
  async emit<K extends keyof EventMap>(
    key: K,
    tenantId: number,
    evt,
  ): Promise<void>;
}
```

Los handlers se filtran por módulo habilitado para el tenant del request **dentro** de `runFilter`/`emit`: el registry conoce a qué módulo pertenece cada handler y consulta el mismo resolver de flags que el guard. Un módulo OFF no corre su filter — y ahí es donde "módulo OFF ⇒ sin descuento AURA" se vuelve verdad para el precio, aunque la ruta de bar-challenge sea la única que devuelve 404.

### Anti-patrones a evitar

- **`fastify.addHook("onRequest", requireModule(...))` a nivel de instancia** — es lo que propone literalmente el doc 04 §3 y **está mal para esta base**: corre antes de `authenticate` (sin tenant) y es invisible al gate. El doc es de diseño, escrito antes de conocer el pipeline real; esta es la corrección concreta.
- **Cualquier `addHook` dentro del cuerpo de un `fp(...)`** — `fastify-plugin` desactiva la encapsulación: el hook treparía a la raíz y devolvería 404 en **toda** la API. Ver Pitfall 3.
- **Duplicar la lista de nombres de módulos** — hoy `MODULOS_TEMPLO` vive como `const` NO exportada en `test/tenant-manifest.ts:149`. Definir la lista canónica en `src/modules/shared/modules.ts` y hacer que el manifiesto **la importe** (los tests ya importan de `src/`: `test/helpers.ts:59` importa `../src/modules/shared/tenant`). Un typo en un nombre deja de ser posible.
- **Cambiar la forma del response de `getPricingPreview`** — ver Pitfall 5.
- **Meter `renewSubscription` en la función core con llamada al filter** — hoy no tiene AURA ni boarding pass; hacerlo llamar al filter le agregaría comportamiento que nunca tuvo. Ver §"La cadena de pricing REAL".

---

## La cadena de pricing REAL en `2a4f5c92`

El doc 04 §4.2 dice "duplicada en `assignPlan` / `changePlanAfterCurrent` / `renewSubscription` / `getPricingPreview`", con la cadena `override → boarding_pass → AURA` en `service.ts:1045-1112`. **Los cuatro datos están desactualizados.** Estado real, medido método por método (el archivo hoy tiene 6.946 líneas): [VERIFIED: lectura directa de los seis bloques]

| Método                   | Línea (real)                    | prorrateo                              | override | boarding pass                            | AURA                                      | referidos              | ¿Cliente del filter?    |
| ------------------------ | ------------------------------- | -------------------------------------- | -------- | ---------------------------------------- | ----------------------------------------- | ---------------------- | ----------------------- |
| `assignPlan`             | **1524** (cadena **1729-1861**) | ✅ máx. prioridad                      | ✅       | ✅ (1792)                                | ✅ (1814-1836)                            | ✅ (1851)              | **SÍ**                  |
| `changePlanNow`          | **3756** (cadena **3838-3910**) | — (usa prorrateo de crédito remanente) | ✅       | ✅ (3865)                                | ❌ **NO**                                 | ✅ (3899)              | **SÍ** (solo boarding)  |
| `changePlanAfterCurrent` | **4287** (cadena **4399-4482**) | —                                      | ✅       | ✅ (4423)                                | ✅ (4446-4464)                            | ✅ (4468)              | **SÍ**                  |
| `renewSubscription`      | **4664** (precio **4864-4952**) | ✅                                     | ✅       | ❌ **NO**                                | ❌ **NO** (hereda `currentSub.pricePaid`) | ✅ (4942)              | **NO**                  |
| `getPricingPreview`      | **5410**                        | —                                      | —        | ✅ solo `boardingPassEligible` (lectura) | ✅ `getBalance` (5439), sin `spend`       | ✅ solo-lectura (5478) | **SÍ** (`commit:false`) |
| `getChangePlanPreview`   | **3632**                        | —                                      | ✅       | ❌                                       | ❌                                        | ✅                     | **NO**                  |

**Cinco correcciones al modelo mental del CONTEXT y del doc 04:**

1. **La rama de máxima prioridad hoy es `prorateToMonthEnd`** (alta prorrateada), no el override. Y es **excluyente por validación explícita**: combinarla con boarding pass o con AURA lanza `BadRequestError` (`service.ts:1751-1760`). **La feature de alta prorrateada YA ESTÁ en el tren** — llegó por el back-merge de master que ES el commit `2a4f5c92`. El CONTEXT la lista como fork sin reconciliar; en esta base ya está reconciliada. [VERIFIED: código presente en `assignPlan` y en `renewSubscription`]

2. **Los referidos son CORE, no módulo.** Las rutas `/api/members/referrals` y `/api/admin/referrals` están clasificadas `tenant-scoped` en el manifiesto, no `templo-module`. [VERIFIED: manifiesto] O sea: de los "4 clientes: override → boarding pass → AURA → referral" que nombra el CONTEXT, **solo boarding pass y AURA cruzan al handler del módulo**. Override, prorrateo y referidos se quedan en la función core. Esto **reduce** el alcance del refactor, no lo amplía.

3. **`renewSubscription` no es cliente del filter.** Su precio se hereda de `currentSub.pricePaid` (con add-back del descuento de referido del período anterior, `4864-4865`) y solo lo pisan prorrateo u override. Meterle una llamada al filter le agregaría una capacidad que hoy no tiene = cambio de comportamiento = viola "cero cambio para el Templo". **Corroboración independiente:** la VERIFICATION de la fase 177 llegó a la misma conclusión por otro camino — _"`renewSubscription` correctly has no such field to guard"_ (3 sitios de boarding pass, no 4).

4. **`changePlanNow` es un quinto sitio que el doc 04 no menciona** y tiene boarding pass pero no AURA. **`getChangePlanPreview` es un sexto** sin ninguno de los dos. El docblock de `pricing-golden.test.ts` ya lo había documentado: _"changePlanNow: NO soporta auraSpend (confirmado leyendo el código)"_.

5. **El bloque de referidos está FUERA del `if/else` de la cadena** en los cuatro métodos que lo tienen: corre después, sobre el precio ya resuelto, con dos guards (`planCategory !== "especial"` y `!prorateToMonthEnd`). La función core extraída tiene que preservar ese orden exacto: `[prorrateo | override | filter(boarding|AURA) | base] → referidos`.

**Superficie de tipos a mover a `moduleInput`:** `auraSpend?: number` (`types.ts:291`) y `boardingPass?: boolean` (`types.ts:294`). Los dos campos aparecen en solo **6 archivos** de `src/`: `types.ts`, `service.ts`, `routes.ts`, `schemas.ts`, `db/schema/subscriptions.ts`, `db/schema/users.ts`. [VERIFIED: `grep -rln`]

---

## Táctica de verificación byte-idéntica del pricing

**El activo ya existe y fue escrito para esto mismo.** `test/subscriptions/pricing-golden.test.ts` — 897 líneas, fase 174-02 (D-06). Su docblock declara literalmente el contrato que la 176 necesita:

> _"se corre GREEN contra el código PRE-migración (esta corrida) y se vuelve a correr, SIN TOCAR NINGÚN LITERAL, contra el código migrado. Criterio de aceptación: diff CERO. Todos los números `toBe(N)` son la cifra REAL que produce el código de HOY — no una re-derivación de la fórmula."_

Cobertura actual, contada del archivo: **26 casos sobre los 6 métodos** — `assignPlan` (base, override, boardingPass, los 4 tiers de AURA, referral, combo triple), `changePlanNow` (base/boarding/referral con prorrateo), `changePlanAfterCurrent` (5 casos), `renewSubscription` (4, incluido AURA heredado), `getChangePlanPreview` parity (2), `getPricingPreview` parity (3). [VERIFIED: `grep -n "it(\|describe(" test/subscriptions/pricing-golden.test.ts`]

**Protocolo recomendado para el planner (3 pasos, en este orden):**

1. **Wave 0 — baseline sellado.** Antes de tocar una línea de `service.ts`, correr `pnpm exec vitest run test/subscriptions/pricing-golden.test.ts --hookTimeout=250000` y **guardar la salida en el SUMMARY del plan**. Si ya está roja en la base, el refactor arranca sin red y hay que arreglarla primero.
2. **Cerrar los dos huecos ANTES del refactor** (con la misma disciplina: literales = cifra real de HOY, obtenida corriendo el test contra el código actual):
   - **Por país:** el golden **no tiene un solo caso ES/EUR** [VERIFIED: `grep -cE '"ES"|EUR'` → 0]. La discreción del CONTEXT pide explícitamente "por país". Agregar al menos un caso ES con AURA + referidos, porque `getBasePrice` y los planes son por país y un error de moneda no lo atrapa ninguno de los 26 casos actuales.
   - **Los 4 tiers de AURA en `changePlanAfterCurrent`:** hoy cubre "1 tier representativo" (dice su docblock). El `Math.floor(base * pct/100)` es donde vive el riesgo de off-by-one al mover la fórmula al handler del módulo.
3. **Post-refactor: diff cero, sin tocar un literal.** Volver a correr. Y sumar los **casos nuevos que solo existen después de la fase** (archivo aparte, `test/tenancy/mod-02-pricing-module-off.test.ts`, para no contaminar el golden): con `templo-gamification` OFF, `auraSpend` y `boardingPass` en el body deben ser **ignorados** (no error) y el precio debe ser el base — más el override, el prorrateo y los referidos, que siguen funcionando porque son core.

**Sobre "byte-idéntico":** el criterio operativo real es _cifra idéntica en `pricePaid`, `priceTypeApplied`, `auraDiscount`, `auraDiscountPercent`, `referralDiscountPercent`, `referralDiscountAmount`, `boardingPassUsed`, `priceOverrideAmount`, `priceOverrideReason` y en el response de preview_. El golden ya afirma sobre esas columnas. No hace falta inventar un mecanismo de snapshot nuevo.

---

## Riesgo de colisión con forks pendientes

| Fork                              | ¿Está en `2a4f5c92`?               | Colisión con la 176                                                                                                                                                                                                                                                                                                                             | Mitigación recomendada                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alta prorrateada fin de mes**   | ✅ **SÍ** (llegó en el back-merge) | Ninguna pendiente — el refactor **debe preservar** `prorateToMonthEnd` como rama de máxima prioridad y sus dos `BadRequestError` de exclusión mutua                                                                                                                                                                                             | Caso explícito en el golden (ya existe `test/subscriptions/assign-proration-month-end.test.ts`); correrlo también pre/post                                                                                                                                                                                                                |
| **Fase 177 (paquete de clases)**  | ❌ **NO** (no pusheada)            | 🔴 **ALTA y directa.** La 177 inserta `excludedFromBoardingPass(plan.planCategory)` en **los 3 sitios de boarding pass** (`assignPlan` 1460, `changePlanNow` 3270, `changePlanAfterCurrent` 3771 en SU base) y excluye a los paquetes de AURA y referidos — exactamente las ramas que la 176 extrae a una función core y a un handler de módulo | El merge será conflictivo **sí o sí**. Que el plan lo escriba en el SUMMARY: quien mergee debe reconciliar moviendo los guards de la 177 **adentro** de la función core (`excludedFromBoardingPass` es una regla de **categoría de plan** = core) y del handler del módulo (la parte AURA). No es un conflicto textual resoluble a ciegas |
| **Migración 0205 de la 177**      | ❌                                 | Colisión de numeración ya existente con `0205_tv_deuteros_auto_rotate.sql` (que está en master **y** en esta base)                                                                                                                                                                                                                              | Fuera del alcance de la 176; la 176 toma 0207 y verifica el máximo al escribir el archivo                                                                                                                                                                                                                                                 |
| **Fix PDF `ec9b6623`, campaigns** | ✅ SÍ (mismo back-merge)           | Ninguna                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                                                                         |

---

## Mapeo completo: las 141 rutas `templo-module` → 18 registros

Este es el insumo operativo de MOD-01. El manifiesto real de `2a4f5c92` tiene **370 entradas** (`ENTRADAS_BASELINE = 370` en `iso-01-manifiesto.test.ts:171`), repartidas en **223 tenant-scoped · 6 global · 141 templo-module**. [VERIFIED: parseo del `Record` + la constante del gate]

> ⚠️ **Los headers de `tenant-manifest.ts` dicen 374 / 225 / 8 y están STALE** — el propio archivo advierte que "el que manda es el gate". El CONTEXT dice 373. **El número real es 370.** Si un plan escribe 373 o 374, el gate se pone rojo.

El reparto por módulo cierra exacto contra el manifiesto (102 / 35 / 3 / 1 = 141):

| Módulo                | Registro en `app.ts`                   | Prefijo                                | Rutas   | Forma del registro           |
| --------------------- | -------------------------------------- | -------------------------------------- | ------- | ---------------------------- |
| `templo-training`     | `adminRoutes` (193)                    | `/api/admin`                           | **62**  | register directo (encapsula) |
| `templo-training`     | `spomPlugin` (168)                     | _(ninguno → `/spom/_`)\*               | 5       | `fp` → register interno      |
| `templo-training`     | `sessionsPlugin` (171)                 | `/api/sessions`                        | 5       | `fp` → register interno      |
| `templo-training`     | `progressionPlugin` (174)              | `/api/progression`                     | 3       | `fp` → register interno      |
| `templo-training`     | `treeProgressPlugin` (177)             | `/api/tree-progress`                   | 1       | `fp` → register interno      |
| `templo-training`     | `treeEditorPlugin` (180)               | `/api/admin/tree-editor`               | 9       | `fp` → register interno      |
| `templo-training`     | `exerciseAdjustmentsPlugin` (183)      | `/api/exercise-adjustments`            | 1       | `fp` → register interno      |
| `templo-training`     | `exerciseAdjustmentsCoachPlugin` (187) | `/api/admin/exercise-adjustments`      | 1       | `fp` → register interno      |
| `templo-training`     | `goalPlanRoutes` (196)                 | `/api` → `/api/goal-plans/*`           | 6       | register directo             |
| `templo-training`     | `programRoutes` (349)                  | `/api` → `/api/members/programs\|me/*` | 6       | register directo             |
| `templo-training`     | `checkInRoutes` (342)                  | `/api/check-ins`                       | 2       | register directo             |
| `templo-training`     | `checkInAdminRoutes` (344)             | `/api/admin/check-ins`                 | 1       | register directo             |
| `templo-marketing`    | `blogRoutes` (205)                     | `/api/blog`                            | 16      | register directo             |
| `templo-marketing`    | `gladiusRoutes` (202)                  | `/api/gladius`                         | 7       | register directo             |
| `templo-marketing`    | `franchiseRoutes` (199)                | `/api/franchise`                       | 5       | register directo             |
| `templo-marketing`    | `appLandingRoutes` (211)               | `/api/app`                             | 5       | register directo             |
| `templo-marketing`    | `academyRoutes` (208)                  | `/api/academy`                         | 2       | register directo             |
| `templo-onboarding`   | `onboardingRoutes` (336)               | `/api/onboarding`                      | 3       | register directo             |
| `templo-gamification` | `barChallengeRoutes` (339)             | `/api/bar-challenge`                   | 1       | register directo             |
|                       |                                        |                                        | **141** | **18 registros**             |

**Hallazgo dimensionante #1 — la frontera registro↔módulo es LIMPIA.** Barrí las 370 entradas cruzándolas contra los prefijos reales de `app.ts`: **ningún registro mezcla `templo-module` con otra categoría**. El único prefijo que parece mixto (`/api/admin/check-ins`) son **dos registros distintos** (`checkInAdminRoutes` templo, `checkInRosterRoutes` tenant-scoped) que comparten prefijo. [VERIFIED: script de agrupación sobre el manifiesto] Consecuencia enorme: **el guard se puede aplicar por scope de registro, no ruta por ruta.** 18 ediciones en vez de 141.

**Hallazgo dimensionante #2 — `adminRoutes` es 100% templo-training (62 rutas, el 44% del total).** Sorprende porque `/api/admin` suena a core, pero es el editor de entrenamiento y ya tiene su propio gate de plugin (`canAccessTraining`, `admin/routes.ts:67-74`). Es una sola línea para cubrir 62 rutas.

**Hallazgo dimensionante #3 — D-04 subcuenta el training.** El CONTEXT dice "los 7 plugins fp quedan in-place"; esos 7 cubren **25** de las 102 rutas de training. Las otras **77** vienen de **5 registros directos** (`adminRoutes`, `goalPlanRoutes`, `programRoutes`, `checkInRoutes`, `checkInAdminRoutes`) que el CONTEXT no menciona. **"Training in-place" son 12 registros, no 7.** No contradice D-04 (esos 5 tampoco migran a `ModuleDef`), pero el planner debe dimensionar 12.

---

## Gate de cobertura: "templo-module sin `requireModule` = CI rojo"

`test/tenancy/iso-01-manifiesto.test.ts` es una familia de 5 tests contra el app real + 6 contra fixtures sintéticos. **El archivo ya anticipa esta fase por escrito, dos veces**: _"la fase 176 va a LEER esa etiqueta para exigir `requireModule` en la ruta"_ (líneas 350 y 516). El gate nuevo es una extensión mecánica.

**Cambio necesario en el `beforeAll` (mínimo, y es el único punto delicado):** hoy el hook serializa `method`/`url` en el acto. Hay que **además guardar la referencia** al `RouteOptions` y leer `onRequest` **después** de `createTestApp()` (que ya hace `ready()`), porque el hook de la raíz corre antes que el del scope hijo. `BuildAppOptions.onRoute` ya recibe el objeto completo, así que **`src/app.ts` no se toca**. [VERIFIED: probado en el script]

```ts
// test/tenancy/iso-01-manifiesto.test.ts — sexto test
it("toda ruta templo-module del manifiesto lleva requireModule de SU módulo", () => {
  const sinGuard: string[] = [];
  const moduloCruzado: string[] = [];
  for (const [clave, entrada] of Object.entries(TENANT_MANIFEST)) {
    if (entrada.categoria !== "templo-module") continue;
    const guard = guardsPorRuta.get(clave); // leído post-ready de las refs
    if (!guard) sinGuard.push(clave);
    else if (guard !== entrada.modulo) moduloCruzado.push(`${clave} (guard=${guard}, manifiesto=${entrada.modulo})`);
  }
  expect(sinGuard, "…141 rutas templo-module deben llevar guard…").toEqual([]);
  expect(moduloCruzado, "…el módulo del guard debe coincidir con el del manifiesto…").toEqual([]);
});

it("ninguna ruta NO-templo lleva requireModule (el guard no se derrama)", () => {
  // El recíproco: atrapa el derrame de un addHook mal encapsulado — el modo de
  // falla más caro de esta fase (Pitfall 3). Sin este lado, un guard que trepó a
  // la raíz y devuelve 404 en TODA la API pasaría el test de arriba en verde.
  const derramadas = /* toda clave con guard cuya entrada NO es templo-module */;
  expect(derramadas).toEqual([]);
});
```

Los dos lados son obligatorios: el primero afirma cobertura, el segundo afirma **contención**. Y siguen el estilo del archivo — mensaje de error largo que dice qué pasó, qué hacer y por qué importa (es la convención dura de esa familia de tests).

**El gate corre en CI sin tocar el workflow:** el step "Run integration tests" es `pnpm test` sobre toda la suite. [VERIFIED: `.github/workflows/ci.yml`] No hace falta un step nuevo.

**Por qué el gate necesita MySQL** (está escrito en el archivo, líneas 55-65): `buildApp()` hace un `SELECT` sobre `formats` durante el registro de `sessions/routes.ts`. No se puede mover a `test/unit/`.

---

## Don't Hand-Roll

| Problema                            | No construyas                                                           | Usá                                                                             | Por qué                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saber qué rutas hay que gatear      | Un barrido manual de `app.ts`                                           | `TENANT_MANIFEST` + el mapeo de este research                                   | La lista ya está aprobada por Franco (checkpoint 171-06) y tiene gate bidireccional. Un barrido paralelo se desincroniza.                                                    |
| Verificar que el precio no se movió | Snapshots nuevos, comparadores ad-hoc                                   | `test/subscriptions/pricing-golden.test.ts`                                     | 897 líneas, 26 casos, cifras reales, escrito para exactamente este contrato de diff-cero.                                                                                    |
| Detectar rutas sin guard            | Un script de lint que grepee `requireModule(` en `src/`                 | El gate `onRoute` (marca en la función real)                                    | Un grep ve el texto; el gate ve la función que **se ejecuta**. Un guard registrado en el scope equivocado pasa el grep y falla el gate.                                      |
| Sembrar los flags                   | Un `db:push`, un seed de `src/db/seed.ts`, o un `INSERT` a mano en prod | Migración `0207` idempotente estilo `0168`                                      | `_migrations` es la única fuente de verdad, y staging/prod comparten host: un seed re-ejecutable es un incidente esperando.                                                  |
| Feature flags                       | Una lib externa o un archivo de config                                  | `tenant_settings` + `parseOrDefault`                                            | Ya hay tabla, ya hay patrón (`settings/service.ts:37-60`), y el flag tiene que ser **por tenant**, que es justo lo que ninguna lib genérica sabe sin configurarle el tenant. |
| Crear un segundo gimnasio en tests  | `INSERT` a mano en cada test                                            | `seedSecondTenant()` de `test/fixtures/second-tenant.ts` (`TENANT_DOS = 90671`) | Fixture canónica de la familia iso-03, con su `limpiarSegundoGimnasio()`.                                                                                                    |

**Key insight:** esta fase es la que _cosecha_ la infra de las fases 166-175. Casi todo lo que parece que hay que construir, ya está construido — el trabajo real es enchufar sin mover una cifra.

---

## Common Pitfalls

### Pitfall 1 — El patrón del doc 04 §3 no funciona en esta base (y falla en silencio)

**Qué sale mal:** `fastify.addHook("onRequest", requireModule(...))` a nivel de scope corre **antes** de `authenticate`/`attachScope`, así que `request.scope` y `request.user` están vacíos. Con el fallback a tenant 1, **todo funciona perfecto en El Templo** y el bug solo aparece con el segundo gimnasio.
**Por qué pasa:** Fastify ejecuta TODOS los hooks `onRequest` de instancia (padre y luego hijo) antes de cualquier `onRequest` por-ruta. [VERIFIED: script — `scope-instance-hook → inner-instance-hook → per-route authenticate`]
**Cómo evitarlo:** Pattern 1 (`onRoute`-append).
**Señal temprana:** un test con `seedSecondTenant()` y `templo-training` OFF que **igual** responde 200.

### Pitfall 2 — El gate no ve los hooks de instancia

**Qué sale mal:** se implementa el guard con `addHook`, se escribe el gate, y el gate reporta **141 rutas sin guard** aunque el 404 funcione. O peor: se "arregla" el gate leyendo otra cosa y queda verde por vacuidad.
**Por qué pasa:** `RouteOptions.onRequest` solo contiene lo declarado **en la definición de la ruta**. [VERIFIED: caso A del script → `onRequest: —`]
**Cómo evitarlo:** append por-ruta + leer las referencias **después de `ready()`**.
**Señal temprana:** el sexto test da exactamente 141 faltantes (todas, no algunas).

### Pitfall 3 — Un `addHook` dentro de un `fp(...)` devuelve 404 en toda la API

**Qué sale mal:** los 7 wrappers de training son `fp(async (fastify) => { fastify.register(xRoutes) })`. Poner el `addHook` en el cuerpo del `fp` lo cuelga de **la raíz** — el guard de `templo-training` aplica a `/api/admin/finance`, a `/health`, a todo.
**Por qué pasa:** `fastify-plugin` existe para romper la encapsulación (es su propósito). El `fastify.register(xRoutes)` **interno** sí encapsula: ahí adentro es seguro.
**Cómo evitarlo:** usar siempre `moduleScope()`, que crea su propio scope con `register`. Nunca tocar el cuerpo del `fp` directamente.
**Señal temprana:** el segundo test del gate (el recíproco "el guard no se derrama") se pone rojo con cientos de rutas. **Por eso ese test no es opcional.**

### Pitfall 4 — El cache de flags convierte los tests en dependientes del orden

**Qué sale mal:** un test apaga `templo-marketing` para tenant 1, y los 26 archivos que pegan rutas templo-module en el mismo worker empiezan a fallar con 404 — hasta 60 segundos después, en otro archivo, sin relación aparente.
**Por qué pasa:** `vitest.config.ts` usa `isolate: false` y una DB por worker; un cache in-memory de módulo **se comparte entre archivos del mismo worker**. **No hay un solo cache con TTL en `src/` hoy** — este sería el primero, así que no hay precedente que copiar. [VERIFIED: `grep -rn "new Map("` en `src/`]
**Cómo evitarlo:** exportar `invalidateModuleFlags(tenantId?)` desde `module-flags.ts`; llamarla en cualquier setter y en `afterEach` de todo test que toque flags. Alternativa más dura: TTL = 0 cuando `NODE_ENV === "test"`.
**Señal temprana:** un test verde solo, rojo en la suite (o al revés).

### Pitfall 5 — Cambiar la forma del response de `getPricingPreview` rompe el admin

**Qué sale mal:** `PricingPreview` expone hoy `auraBalance`, `availableTiers`, `boardingPassEligible`, `auraToSpend` en el tipo **core** (`types.ts:506+`). La tentación del `moduleInput`/`moduleOutput` opaco es sacarlos. El PoS del admin los lee para pintar el selector de AURA → pantalla rota, sin que ningún test de API lo note (CI **no typechequea el admin**).
**Por qué pasa:** D-08 dice "API-only, nada de UI" — que también significa **no romper la UI existente**.
**Cómo evitarlo:** el `moduleOutput` se **mergea** en el response con las MISMAS keys. Contrato HTTP byte-idéntico. Con el módulo OFF: `auraBalance: 0`, `availableTiers: []`, `boardingPassEligible: false` (valores neutros, no campos ausentes — un `undefined` rompe distinto).
**Señal temprana:** los 3 tests de parity de `getPricingPreview` en el golden.

### Pitfall 6 — El seed en la migración y el orden del backfill

**Qué sale mal:** la migración inserta los flags ON pero el `INSERT` no es idempotente, o lleva un `;` dentro de un comentario `--` y parte el archivo a la mitad (rompió todo CI una vez, migración 0119).
**Cómo evitarlo:** copiar `0168_seed_pricing_zero_price.sql` literal: comentario de cabecera sin punto y coma + `INSERT ... SELECT ... WHERE NOT EXISTS`. Cuatro bloques, uno por módulo, `tenant_id = 1` explícito (el tenant Templo es id=1 explícito desde `0190`).
**Señal temprana:** `pnpm db:migrate` local en una base limpia + una segunda corrida (debe ser no-op de 0 filas).

### Pitfall 7 — Suponer que los crons quedan gateados

**Qué sale mal:** se asume que "módulo OFF" apaga el módulo entero. Los 8 jobs de `src/jobs/` **no pasan por rutas** — `tenure-milestones`, `mark-no-shows`, `auto-resume-pauses` y `wellhub-sync` instancian `AuraService` y siguen otorgando AURA con `templo-gamification` OFF.
**Cómo evitarlo:** no arreglarlo en esta fase (fuera de alcance), **pero escribirlo** en el SUMMARY como deuda nombrada. Un lector futuro que asuma cobertura total del flag va a tomar una decisión equivocada.

### Pitfall 8 — Números stale en los headers

**Qué sale mal:** un plan escribe "373 rutas" (CONTEXT) o "374" (header del manifiesto) y el cuarto test del gate se pone rojo.
**Cómo evitarlo:** **370** es el número real (`ENTRADAS_BASELINE`). Esta fase **no debería moverlo**: no agrega rutas. Si el baseline se mueve, alguien agregó una ruta sin querer.

---

## Runtime State Inventory

Esta fase agrega un mecanismo nuevo, no renombra ni migra nada. Aun así, introduce **estado persistido nuevo** (los flags) y eso tiene consecuencias operativas fuera del código:

| Categoría                      | Encontrado                                                                                                                                                                                      | Acción requerida                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Datos almacenados**          | `tenant_settings` nace **vacía** y sin consumidores de runtime (declarado en `0190` y en `tenants.ts`). Al terminar la fase tendrá 4 filas para tenant 1.                                       | Migración `0207` idempotente. Sin backfill: no hay datos previos que migrar.                                                          |
| **Config de servicio vivo**    | Ninguna. Los flags no viven en n8n, Datadog ni ningún panel externo — la palanca es la DB.                                                                                                      | Ninguna.                                                                                                                              |
| **Estado registrado en el SO** | Ninguno. La fase no toca crons, pm2 ni systemd. Los 8 jobs de `src/jobs/` siguen igual (Pitfall 7).                                                                                             | Ninguna.                                                                                                                              |
| **Secrets / env vars**         | Ninguno nuevo. El TTL del cache va como constante en código (si el planner lo hace configurable, entra `.env.example`).                                                                         | Ninguna, salvo esa decisión.                                                                                                          |
| **Artefactos de build**        | Ninguno. Sin renames de paquete ni de módulo. **Sí**: los 3 frontends no se rebuildean (la fase es API-only) — `enabledModules` es aditivo y ningún cliente lo consume todavía.                 | Ninguna.                                                                                                                              |
| **Estado en la DB de test**    | `TABLES_TO_CLEAN` **no incluye** `tenants` ni `tenant_settings` → los flags seedeados por migración **sobreviven** a `cleanAllTestData()`. `test/setup.ts` aplica las migraciones committeadas. | Ninguna — es la conducta deseada, y es lo que hace que los 26 archivos de test que pegan rutas templo-module sigan verdes. [VERIFIED] |

**Riesgo operativo real y único:** si la migración `0207` no llega a prod **antes** de que el código con `requireModule` se despliegue, el default fail-closed apaga los 4 módulos y **El Templo queda con 141 rutas en 404**. El pipeline de deploy corre `migrate` antes de `restart` (CLAUDE.md: _build → backup → rsync → migrate → restart → smoke test → auto-rollback_), así que el orden está garantizado por el pipeline. **Pero el smoke test pega a `/health`, que es `global`** — no detectaría el 404 masivo. **Recomendación fuerte para el planner:** que el plan de deploy incluya una verificación post-deploy sobre **una ruta templo de cada módulo** (p.ej. `GET /api/blog/posts`, que es pública), no solo `/health`.

---

## Code Examples

### Resolver de flags con cache TTL (patrón `getFlag` adaptado a `tenant_settings`)

```ts
// src/modules/shared/module-flags.ts
// Patrón tomado de src/modules/settings/service.ts:37-60 (getFlag/setFlag contra
// system_settings, default OFF). Diferencias: la key lleva namespace de módulo, la
// query filtra por tenant_id, y se cachea porque corre en CADA request gateado.
import { and, eq } from "drizzle-orm";
import { tenantSettings } from "../../db/schema";

const TTL_MS = 60_000; // doc 04 §2 — apagar tarda ≤60s en propagar
const ON = "true"; // OJO: system_settings usa 'on'/'off';
// acá el doc 04 §2 fija "true"/"false"
const cache = new Map<number, { flags: Set<string>; expiresAt: number }>();

export function invalidateModuleFlags(tenantId?: number): void {
  if (tenantId == null) cache.clear();
  else cache.delete(tenantId);
}

export async function enabledModules(
  tenantId: number,
  db: DbInstance,
): Promise<Set<string>> {
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.flags;

  const rows = await db
    .select({
      key: tenantSettings.settingKey,
      value: tenantSettings.settingValue,
    })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId));

  const flags = new Set(
    rows
      .filter(
        (r) =>
          r.key.startsWith("module.") &&
          r.key.endsWith(".enabled") &&
          r.value === ON,
      )
      .map((r) => r.key.slice("module.".length, -".enabled".length)),
  );
  cache.set(tenantId, { flags, expiresAt: Date.now() + TTL_MS });
  return flags; // ausente ⇒ OFF (fail-closed, doc 04 §2)
}
```

### Migración de seed (estilo `0168`, idempotente, sin `;` en comentarios)

```sql
-- 0207_seed_module_flags.sql
-- Fase 176 (MOD-01): siembra los 4 flags de módulo en ON para El Templo (tenant 1),
-- para que el comportamiento de prod sea idéntico el día del deploy. El default en
-- codigo es OFF (fail-closed), asi que un tenant nuevo nace SIN metodologia Templo.
-- Idempotente: INSERT ... SELECT ... WHERE NOT EXISTS, un re-run es no-op de 0 filas
-- y jamas pisa un valor apagado a mano desde el admin.
-- Escrita a mano: db:generate esta roto por el drift de sessions.goal_plan_type.
-- NOTA: sin punto y coma dentro de estos comentarios (el runner splitea por punto y
-- coma ANTES de stripear los comentarios de doble guion).
INSERT INTO `tenant_settings` (`tenant_id`, `setting_key`, `setting_value`)
SELECT 1, 'module.templo-training.enabled', 'true'
WHERE NOT EXISTS (
  SELECT 1 FROM `tenant_settings`
  WHERE `tenant_id` = 1 AND `setting_key` = 'module.templo-training.enabled'
);
-- … idéntico para templo-gamification, templo-marketing, templo-onboarding
```

### El event `streak.milestone` (lo que reemplaza a `streaks/service.ts:274-303`)

```ts
// ANTES (código real, service.ts:274-303): StreakService conoce AURA
if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
  milestoneReached = currentStreak;
  try {
    const config = await this.getStreakMilestoneConfig();      // lee system_settings
    const bonusAmount = configKey ? config[configKey] : 0;
    if (bonusAmount > 0) { await this.auraService.award({ … }); this.log.info(…); }
  } catch (auraErr: unknown) { this.log.warn({ err: auraErr, … }, "Failed to award …"); }
}

// DESPUÉS: el core solo anuncia el hecho consumado
if ((STREAK_MILESTONES as readonly number[]).includes(currentStreak)) {
  milestoneReached = currentStreak;
  await this.hooks.emit("streak.milestone", ctx.tenantId, {
    userId, milestone: currentStreak, streakDays: currentStreak,
  });   // el try/catch + log.warn se MUEVEN adentro de emit(): misma semántica
}
```

**Nota para el planner:** `getStreakMilestoneConfig()` (lee `streak.milestone_*_aura` de `system_settings`) se va **con el handler al módulo** — es config de la recompensa, no del núcleo de racha. Verificado que **no tiene otros llamadores** fuera del propio `service.ts`. [VERIFIED: `grep -rn "getStreakMilestoneConfig" src/`] Y `StreakService` se instancia en **un solo lugar** (`sessions/routes.ts:380`), así que sacarle `auraService` del constructor es un cambio de un call site. [VERIFIED: `grep -rn "new StreakService" src/` → 1]

### `enabledModules` en la sesión (D-08)

`GET /api/auth/me` (`auth/routes.ts:759`) ya llama `attachCountryScope` + `assertTenant(request.scope, "auth.me")` in-handler, o sea que tiene `ctx.tenantId` listo. Agregar `enabledModules: [...await enabledModules(ctx.tenantId, fastify.db)]` al objeto de respuesta es **aditivo**: `useAuthStore.ts:70` del admin y `boot/auth.ts:87` de la app ignoran campos desconocidos. [VERIFIED: rutas y consumidores] Es `tenant-scoped` en el manifiesto, no `templo-module` — no se auto-gatea, correcto.

---

## State of the Art

| Enfoque viejo (doc 04, 2026-07-02)                       | Enfoque correcto para `2a4f5c92`                                                    | Cuándo cambió                                                           | Impacto                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `fastify.addHook("onRequest", requireModule(…))` (§3)    | `onRoute` que appendea al array `onRequest` por-ruta                                | El doc precede al gate ISO-01 (fase 171) y al barrido del pipeline real | Sin esto, el gate de cobertura es imposible y el orden respecto de `authenticate` es incorrecto |
| Cadena de pricing en `service.ts:1045-1112`, 4 métodos   | 6 métodos, 5 ramas, cadena en `1729-1861` (+~700 líneas)                            | Fases 156/157/161/174 + alta prorrateada                                | Los números de línea del doc son inutilizables; usar la tabla de este research                  |
| "4 clientes: override → boarding pass → AURA → referral" | **2** cruzan al módulo (boarding pass, AURA); override/prorrateo/referidos son core | Referidos se clasificó `tenant-scoped` en el checkpoint 171-06          | El refactor es más chico de lo enunciado                                                        |
| `renewSubscription` como sitio de la cadena              | No lo es (hereda el precio, sin AURA ni boarding)                                   | Confirmado también por la VERIFICATION de la 177                        | Meterlo al filter sería un cambio de comportamiento                                             |
| Manifiesto "373 rutas" (CONTEXT) / "374" (header)        | **370** (`ENTRADAS_BASELINE`)                                                       | Bumps de staging vs master narrados en el propio archivo                | Un número mal escrito en un plan = CI rojo                                                      |
| 0205/0206 "reservadas por 177/178"                       | Ya **consumidas y presentes** en la base (back-merge de master)                     | 2026-08-19                                                              | La 176 va a **0207**                                                                            |

**Obsoleto / desactualizado:**

- Header de `tenant-manifest.ts` (374/225/8) — el archivo mismo avisa que el gate manda.
- Doc 04 §4.2 sobre `getPricingPreview` _"hoy usa getBalance, no spend"_ — sigue siendo cierto (`5439`), es la única afirmación de líneas del doc que sobrevivió.

---

## Assumptions Log

| #   | Claim                                                                                                     | Sección        | Riesgo si está mal                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Un `Map` + timestamp alcanza como cache; no hace falta librería                                           | Standard Stack | Bajo. Si el TTL o la invalidación se complican, `lru-cache` está a un `pnpm add` — pero requiere preguntarle a Franco (regla de dependencias).                                                                                                   |
| A2  | El valor serializado del flag es `"true"`/`"false"` (doc 04 §2), no `"on"`/`"off"` como `system_settings` | Code Examples  | Bajo, pero **hay que fijarlo en el plan**: dos convenciones conviviendo en el repo es una trampa futura. Si el planner prefiere `on`/`off` por consistencia con `settings/service.ts`, es igual de válido — lo que no vale es dejarlo implícito. |
| A3  | Los 3 frontends ignoran campos desconocidos en `/auth/me`                                                 | Code Examples  | Muy bajo (es JSON sobre axios), pero CI **no typechequea** app ni admin: si alguien tipó la respuesta con `exactOptionalPropertyTypes` o similar, se ve recién en `vue-tsc` local.                                                               |
| A4  | Filtrar handlers por módulo habilitado dentro de `runFilter`/`emit` es la ubicación correcta del chequeo  | Pattern 3      | Bajo. La alternativa (chequear en el call site del core) rompe la premisa de que el core no conoce módulos.                                                                                                                                      |
| A5  | Los valores neutros con módulo OFF en el preview son `0`/`[]`/`false` (no campos ausentes)                | Pitfall 5      | Medio: es una decisión de contrato observable. Con un solo tenant y el módulo ON nunca se ejercita — pero el primer tenant nuevo lo ejercita el día 1. Vale confirmarlo en el plan.                                                              |

**Nada en este research sobre el estado del código es `[ASSUMED]`:** todos los hallazgos de líneas, conteos, patrones de auth y comportamiento de Fastify se verificaron contra `2a4f5c92` o con scripts ejecutados en esta sesión.

---

## Open Questions (RESOLVED)

> Las 4 quedaron resueltas durante el planning (2026-08-20) e implementadas en los planes: Q1 → 176-03/176-04, Q2 → 176-07 + deuda consciente en 176-11, Q3 → 176-11 Task 2a, Q4 → 176-05.

1. **¿`requireModule` en `onRequest` o en `preHandler`?**
   - Lo que sabemos: en `onRequest` el 404 llega antes de la validación del body (no filtra la forma del schema) — pero en las 35 rutas de marketing (auth por `preHandler`) el guard corre sin `request.user`. En `preHandler` tendría el user en marketing, a costa de que un body inválido devuelva **400 antes** que el 404 en las 106 rutas restantes, revelando que la ruta existe.
   - Lo que no está claro: si a Franco le importa que un módulo apagado sea distinguible por el código de error.
   - **RESOLVED** — Recomendación: **`onRequest`** + fallback a tenant 1 en marketing (Pattern 2). El 404-antes-de-validar es más fiel a "no revela existencia del feature" (doc 04 §3), y el costo (marketing siempre resuelve tenant 1) ya está aceptado por D-06. Que el planner lo deje escrito, no implícito.

2. **¿Los 4 crons que otorgan AURA deben respetar el flag?**
   - Lo que sabemos: no pasan por rutas, así que `requireModule` no los toca. Con `templo-gamification` OFF seguirían otorgando AURA.
   - **RESOLVED** — Recomendación: **fuera de alcance de la 176** (el doc 04 no lo pide y agrandaría la fase), pero **nombrado explícitamente** en el SUMMARY. Candidato natural a una fase de "hardening de módulos".

3. **¿El smoke test del deploy debería cubrir una ruta templo?**
   - Lo que sabemos: hoy pega a `/health` (categoría `global`), que respondería 200 aun con los 4 módulos apagados por un seed que no corrió.
   - **RESOLVED** — Recomendación: agregar `GET /api/blog/posts` (pública, `templo-marketing`) al smoke. Es barato y cubre el único modo de falla catastrófico de la fase.

4. **¿La 176 mueve `ENTRADAS_BASELINE`?**
   - **RESOLVED** — No debería: no agrega ni borra rutas. Si un plan lo mueve, es señal de que registró una ruta sin querer. Vale escribirlo como invariante del plan.

---

## Environment Availability

| Dependencia                                       | Requerida por              | Disponible                                      | Versión                                    | Fallback                                                                                          |
| ------------------------------------------------- | -------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Worktree `feat/173-adopcion-members` @ `2a4f5c92` | D-01 (base de la fase)     | ✓                                               | `2a4f5c92`                                 | —                                                                                                 |
| `fastify`                                         | Guard + registry           | ✓                                               | 5.7.4                                      | —                                                                                                 |
| `fastify-plugin`                                  | 7 wrappers de training     | ✓                                               | 5.1.0                                      | —                                                                                                 |
| MySQL `eltemplo_test`                             | Todos los tests de la fase | ✓ (`test/setup.ts` provisiona por worker, ~96s) | —                                          | Ninguno: el gate ISO-01 **no puede** correr sin DB (`buildApp()` consulta `formats` al registrar) |
| Runner de migraciones (`pnpm db:migrate`)         | Seed 0207                  | ✓                                               | `src/db/run-migrations.ts`                 | Ninguno — `drizzle-kit migrate` está **prohibido**                                                |
| `pnpm exec vitest`                                | Golden + gates             | ✓                                               | —                                          | —                                                                                                 |
| CI (`.github/workflows/ci.yml`)                   | Enforcement del gate       | ✓                                               | step "Run integration tests" = `pnpm test` | —                                                                                                 |

**Faltantes bloqueantes:** ninguno.
**Faltantes con fallback:** ninguno.

---

## Validation Architecture

### Test Framework

| Propiedad   | Valor                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Framework   | Vitest (`el-templo-api/vitest.config.ts`, `isolate: false`, DB por worker vía `test/setup.ts`) |
| Config file | `el-templo-api/vitest.config.ts`                                                               |
| Quick run   | `cd el-templo-api && pnpm exec vitest run <archivo> --hookTimeout=250000`                      |
| Full suite  | `cd el-templo-api && pnpm test` (**en CI**, no local — regla del proyecto)                     |

⚠️ **Regla de ejecución para los `gsd-executor` sonnet (D-03, aprendida en la 173):** tests **solo en foreground** con timeout amplio. Prohibido `run_in_background` y loops de espera con `pgrep`. El `--hookTimeout=250000` es por el provisioning del worker (~96s), no por el archivo.

### Phase Requirements → Test Map

| Req    | Comportamiento                                                    | Tipo                     | Comando automatizado                                                                  | ¿Existe?                                    |
| ------ | ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------- |
| MOD-01 | Las 141 rutas `templo-module` llevan `requireModule` de su módulo | gate estructural         | `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000`    | ⚠️ archivo existe, **el 6º test es Wave 0** |
| MOD-01 | El guard **no se derrama** a rutas no-templo                      | gate estructural         | ídem                                                                                  | ❌ Wave 0                                   |
| MOD-01 | Flag OFF ⇒ 404 (una ruta por módulo, tenant 2)                    | integración              | `pnpm exec vitest run test/tenancy/mod-01-guard.test.ts --hookTimeout=250000`         | ❌ Wave 0                                   |
| MOD-01 | Flag ON (tenant 1) ⇒ comportamiento idéntico                      | integración (regresión)  | los 26 archivos que pegan rutas templo-module, ya verdes                              | ✅ existe                                   |
| MOD-01 | El seed 0207 es idempotente (2ª corrida = 0 filas)                | migración                | `pnpm db:migrate` ×2 en base limpia                                                   | ❌ Wave 0 (verificación manual del plan)    |
| MOD-02 | Precio byte-idéntico post-registry                                | golden / caracterización | `pnpm exec vitest run test/subscriptions/pricing-golden.test.ts --hookTimeout=250000` | ✅ **existe** (897 líneas, 26 casos)        |
| MOD-02 | Precio idéntico también en ES/EUR                                 | golden                   | ídem, casos nuevos                                                                    | ❌ Wave 0 (hueco medido: 0 casos ES)        |
| MOD-02 | Filter propaga: `InsufficientBalanceError` aborta el alta         | integración              | `test/subscriptions/lifecycle.test.ts` + caso nuevo                                   | ⚠️ parcial                                  |
| MOD-02 | Event aísla: handler que tira no rompe el registro de sesión      | integración              | `test/tenancy/mod-02-hooks.test.ts`                                                   | ❌ Wave 0                                   |
| MOD-02 | Módulo OFF ⇒ `auraSpend`/`boardingPass` ignorados, precio base    | integración              | `test/tenancy/mod-02-pricing-module-off.test.ts`                                      | ❌ Wave 0                                   |
| D-08   | `/api/auth/me` devuelve `enabledModules`                          | integración              | `test/auth/*.test.ts` (caso nuevo)                                                    | ❌ Wave 0                                   |

### Sampling Rate

- **Por commit de tarea:** `pnpm exec tsc --noEmit` + el/los archivo(s) de test tocados por esa tarea.
- **Por merge de wave:** `pricing-golden.test.ts` + `iso-01-manifiesto.test.ts` + los tests nuevos de la wave.
- **Phase gate:** suite completa verde en CI antes de `/gsd:verify-work`. **Más el diff-cero del golden contra el baseline sellado en Wave 0.**

### Wave 0 Gaps

- [ ] Baseline sellado: correr `pricing-golden.test.ts` en `2a4f5c92` **antes de tocar nada** y guardar la salida (MOD-02)
- [ ] `test/subscriptions/pricing-golden.test.ts` — casos ES/EUR + los 4 tiers de AURA en `changePlanAfterCurrent`, con literales = cifra de HOY (MOD-02)
- [ ] `test/tenancy/iso-01-manifiesto.test.ts` — 6º y 7º test (cobertura + no-derrame) y el `beforeAll` que guarda referencias (MOD-01)
- [ ] `test/tenancy/mod-01-guard.test.ts` — flag OFF ⇒ 404 con `seedSecondTenant()` (MOD-01)
- [ ] `test/tenancy/mod-02-hooks.test.ts` — filter propaga / event aísla (MOD-02)
- [ ] `test/tenancy/mod-02-pricing-module-off.test.ts` — precio con `templo-gamification` OFF (MOD-02)
- [ ] Framework install: **no aplica**, vitest ya está configurado

---

## Security Domain

Frontera de **activación**, no de seguridad — el doc 04 §7 lo dice explícitamente y este research lo confirma: los módulos corren in-process con acceso total a la DB. Aun así, el guard toca el pipeline de autorización y eso obliga a mirar dos categorías.

### Categorías ASVS aplicables

| Categoría ASVS        | ¿Aplica?       | Control estándar en esta fase                                                                                                                                                                                                                    |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| V2 Authentication     | no (indirecto) | La fase **no** modifica `authenticate`. Sí depende de correr **después** de él — ver Pitfall 1.                                                                                                                                                  |
| V3 Session Management | no             | `enabledModules` es aditivo en `/auth/me`; el JWT **no** cambia (sigue `{userId, email, role}`, decisión fase 166 de no meter tenant en el token).                                                                                               |
| V4 Access Control     | **sí**         | `requireModule` es una capa de autorización nueva. Default-deny (flag ausente ⇒ OFF) alineado con `scope.tenantId = null ⇒ deny` de `attachScope`. **404 y no 403** a propósito: no revela la existencia del feature.                            |
| V5 Input Validation   | **sí**         | `moduleInput` es `Record<string, unknown>` opaco: el **módulo** valida sus campos (`auraSpend` contra `AURA_DISCOUNT_TIERS`, `boardingPass` contra `users.boardingPassUsed`). El core no debe hacer `as` sobre ese sobre. Sin `any` (CLAUDE.md). |
| V6 Cryptography       | no             | La fase no toca criptografía.                                                                                                                                                                                                                    |

### Amenazas conocidas para este stack

| Patrón                                                                                   | STRIDE                 | Mitigación estándar                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Forzar un módulo prendido desde el cliente (header/body/query con `tenantId` o `module`) | Spoofing / Elevation   | El tenant **jamás** viene del cliente: sale de `scope.tenantId` o de `users.tenant_id` server-side (Pattern 2). Mismo invariante que la fase 166 y que `tenantWhere`.                            |
| Guard mal encapsulado ⇒ 404 en toda la API                                               | DoS (self-inflicted)   | El test recíproco "el guard no se derrama" (Pitfall 3). Es el modo de falla más caro de la fase.                                                                                                 |
| Guard mal encapsulado ⇒ rutas templo **sin** guard                                       | Elevation              | El 6º test (cobertura 141/141), fail-closed, corriendo en CI.                                                                                                                                    |
| Flag apagado que sigue propagando ≤60s por el cache                                      | Elevation (ventana)    | Aceptado por diseño (doc 04 §2: "palanca administrativa"). `invalidateModuleFlags()` disponible para cortarlo en el acto si aparece un setter.                                                   |
| Enumeración de features por diferencia de códigos de error                               | Information Disclosure | 404 uniforme. **Matiz honesto:** con auth en `preHandler` (marketing), un request no autenticado a una ruta admin de blog con módulo OFF devuelve 404 antes que 401 — más restrictivo, no menos. |

---

## Sources

### Primarias (HIGH — código y ejecución verificados en esta sesión)

- `/home/franco/projects/et-173` @ `2a4f5c92` — `src/app.ts`, `src/modules/subscriptions/service.ts` (6.946 líneas), `src/modules/subscriptions/types.ts`, `src/modules/streaks/service.ts`, `src/modules/settings/service.ts`, `src/modules/shared/country-scope.ts`, `src/modules/shared/permissions.ts`, `src/modules/admin/routes.ts`, `src/modules/bar-challenge/routes.ts`, `src/modules/auth/routes.ts`, `src/plugins/{spom,sessions,progression,tree-progress,tree-editor,exercise-adjustments,exercise-adjustments-coach}.ts`, `src/db/schema/tenants.ts`, `src/db/migrations/{0168,0190}*.sql`
- `test/tenant-manifest.ts` (1.570 líneas), `test/tenancy/iso-01-manifiesto.test.ts` (556), `test/subscriptions/pricing-golden.test.ts` (897), `test/helpers.ts`, `test/setup.ts`, `test/fixtures/second-tenant.ts`
- **Scripts de verificación empírica ejecutados contra `fastify@5.7.4` del propio `node_modules`** — 4 experimentos: visibilidad de hooks en `onRoute`, orden de hooks `onRoute` raíz vs hijo, orden de ejecución `onRequest` instancia vs por-ruta, y la técnica `onRoute`-append (resultados citados inline)
- `.github/workflows/ci.yml`, `CLAUDE.md`, `.claude/skills/el-templo-db-migrations/SKILL.md`

### Secundarias (MEDIUM — documentos del proyecto, contrastados contra el código)

- `.docs/saas-multitenancy/04-mecanismo-modulos.md` — la spec. **Sus números de línea y su §3 están desactualizados**; sus decisiones (§8) siguen vigentes y no se re-litigan.
- `.docs/saas-multitenancy/02-inventario-modulos.md` (vía el manifiesto, que la implementa)
- `.planning/REQUIREMENTS.md` (MOD-01/MOD-02, líneas 68-71), `176-CONTEXT.md`
- `.planning/phases/177-*/177-VERIFICATION.md` — corroboración independiente de los 3 sitios de boarding pass y del rol de `renewSubscription`

### Terciarias (LOW)

- Ninguna. Esta fase no requirió una sola búsqueda web: todo el conocimiento necesario está en el código del repo y en el comportamiento observable de Fastify, que se puede ejecutar.

---

## Metadata

**Desglose de confianza:**

- **Stack:** HIGH — versiones leídas del `node_modules` real; la fase no agrega dependencias.
- **Arquitectura (guard/registry):** HIGH — las tres restricciones y la técnica elegida se probaron ejecutando código contra la versión de Fastify que corre en producción, no se dedujeron de la doc.
- **Mapeo de rutas:** HIGH — 141/141 cierran exacto contra el manifiesto por dos caminos independientes (parseo del `Record` y agrupación por prefijo de registro).
- **Cadena de pricing:** HIGH — leída método por método; corroborada de forma independiente por el docblock de `pricing-golden.test.ts` y por la VERIFICATION de la fase 177.
- **Pitfalls:** HIGH para 1/2/3/5/6/8 (verificados o basados en incidentes documentados del repo); MEDIUM para 4 (el riesgo del cache es inferencia sobre `isolate: false`, no un incidente observado — no hay precedente de cache en `src/`).
- **Riesgo de colisión con la 177:** HIGH en la existencia del conflicto, MEDIUM en su tamaño exacto (los números de línea de la 177 son de SU base, no de `2a4f5c92`).

**Research date:** 2026-08-20
**Valid until:** ~2026-09-05 para lo estructural. **Se invalida antes si:** la 177 se mergea al tren, el tren avanza más allá de `2a4f5c92`, o entra otra migración (revalidar la numeración siempre al escribir el `.sql`).
