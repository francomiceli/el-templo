---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 06
subsystem: api
tags: [hooks, registry, pricing, streaks, feature-flags, multi-tenancy, vitest]

# Dependency graph
requires:
  - "src/modules-boot.ts (176-04) — composition root, ModuleDef, registerModules(app)"
  - "src/modules/shared/module-flags.ts (176-01) — isModuleEnabled(tenantId, module, db)"
provides:
  - "src/modules/shared/hooks.ts — HookRegistry, hookRegistry (singleton), FilterMap, EventMap, HookCallCtx, PricingAdjustCtx, AppliedBenefit, PricingCallSite, PricingSupports, StreakMilestoneEvent"
  - "src/modules-boot.ts extendido — ModuleDef.filters?/events?, registerModules(app, hooks = hookRegistry)"
  - "test/tenancy/mod-02-hooks.test.ts — 6 casos: filter ON/OFF, filter que tira (propaga), event que tira (aísla), event OFF, idempotencia de setFilter"
affects:
  - "176-07 (event streak.milestone — implementa el handler contra este EventMap)"
  - "176-08/09/10 (filter pricing.adjust — un call site por plan, implementan contra este FilterMap/PricingAdjustCtx)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry de hooks cerrado y tipado: Map<hookKey, Map<ModuleName, handler>> — idempotente por diseño (createTestApp() por archivo de test en el mismo proceso no debe acumular handlers)"
    - "Semántica de errores asimétrica por clase de hook: runFilter SIN try/catch (propaga — bug de cobro si se atrapa), emit CON try/catch por handler + log.warn (best-effort, espeja streaks/service.ts:296-302)"
    - "Filtrado por módulo habilitado DENTRO del registry (isModuleEnabled), nunca en el call site del core — el core no sabe a qué módulo pertenece un handler"

key-files:
  created:
    - el-templo-api/src/modules/shared/hooks.ts
    - el-templo-api/test/tenancy/mod-02-hooks.test.ts
  modified:
    - el-templo-api/src/modules-boot.ts

key-decisions:
  - "runFilter/emit hardcodean el segundo parámetro a PricingAdjustCtx/StreakMilestoneEvent (no genérico vía FilterMap[K]/EventMap[K]) — es exactamente lo que pide <interfaces> del plan, y es seguro hoy porque cada mapa tiene una sola key. Si se agrega un 3er hook, estas firmas se editan a mano (contrato cerrado, no automágico)."
  - "modulesFor<K> castea key a keyof FilterMap / keyof EventMap para leer ambos Maps sin any — sin overlap de nombres entre los dos mapas hoy, así que el primer match gana."
  - "Test module 'ON' usa templo-gamification (con setModuleFlag explícito, no el default de la migración 0207) — mismo patrón que mod-01-flags.test.ts; TENANT_DOS (sin flags sembrados) para el caso OFF, sin necesidad de seedSecondTenant (el registry solo hace SELECT sobre tenant_settings, no requiere que la fila de tenants exista)."

requirements-completed: [MOD-02]

# Metrics
duration: ~50min
completed: 2026-08-21
---

# Phase 176 Plan 06: Registry de hooks tipado y cerrado (`hooks.ts`) Summary

**`src/modules/shared/hooks.ts` — la pieza 3 del mecanismo de módulos (doc 04 §4): `HookRegistry` tipado y cerrado con dos clases de hook, `filters` bloqueantes (`pricing.adjust`) que propagan errores y `events` best-effort (`streak.milestone`) que se tragan con `log.warn`, colgado del composition root `modules-boot.ts` — sin conectar todavía ningún cliente real.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-08-21 (continuación de 176-01..05, HEAD `4fed533b`)
- **Completed:** 2026-08-21
- **Tasks:** 3/3
- **Files modified:** 3 (2 nuevos, 1 modificado)

## Accomplishments

- `src/modules/shared/hooks.ts` (nuevo): docblock largo en la convención dura del repo (POR QUÉ EXISTE / EL CONTRATO ES CERRADO / SEMÁNTICA DE ERRORES / ALMACENAMIENTO IDEMPOTENTE / `moduleInput`/`moduleOutput` opacos / transaccionalidad status quo / orden de ejecución / qué no es). Exporta exactamente los símbolos de `<interfaces>`: `HookCallCtx`, `AppliedBenefit`, `PricingCallSite`, `PricingSupports`, `PricingAdjustCtx`, `StreakMilestoneEvent`, `FilterMap`, `EventMap`, la clase `HookRegistry` (`setFilter`/`setEvent`/`runFilter`/`emit`/`clear`/`modulesFor`) y `export const hookRegistry`.
- `src/modules-boot.ts`: `ModuleDef` gana `filters?: Partial<FilterMap>` y `events?: Partial<EventMap>`; `registerModules(app, hooks: HookRegistry = hookRegistry)`; `registerModule` recorre `def.filters`/`def.events` y llama `hooks.setFilter`/`hooks.setEvent`. `src/app.ts` sin tocar. Ningún `ModuleDef` declara filters/events todavía (176-07/08).
- `test/tenancy/mod-02-hooks.test.ts` (nuevo): 6 casos contra `new HookRegistry()` propia (nunca el singleton de proceso) — filter ON corre y muta `ctx.price`; filter OFF (TENANT_DOS) no corre; filter que tira propaga con la clase preservada (`instanceof`); event que tira resuelve y logea `log.warn` con `err`; event OFF no corre; `setFilter` dos veces mismo (módulo, key) reemplaza (corre 1 sola vez, el último registrado).

## Task Commits

Cada task se commiteó atómicamente en `et-176` (branch `feat/176-modulos`), sobre `4fed533b`:

1. **Task 1: `src/modules/shared/hooks.ts` — contrato + HookRegistry** — `8f7894e7` (feat)
2. **Task 2: `registerModules` cuelga filters/events de cada `ModuleDef`** — `b4c9c77b` (feat)
3. **Task 3: `mod-02-hooks.test.ts`** — `c4b2eeac` (test)

## Verificación final (las 6 del prompt)

1. `pnpm exec tsc --noEmit` → exit 0, limpio en cada task, sin ajustes posteriores.
2. `pnpm exec vitest run --no-file-parallelism test/tenancy/mod-02-hooks.test.ts --hookTimeout=250000` → **6/6 verde** (primera corrida verde; solo se ajustó texto de docblock por el grep de la Task 3, ver Deviations).
3. `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts test/tenancy/mod-01-guard.test.ts --hookTimeout=250000` → **13/13 + 11/11 verde**, `ENTRADAS_BASELINE = 370` intacto. (Este comando se auto-backgroundeó por exceder el timeout de tool de 120s — NO fue `run_in_background` deliberado; se esperó el resultado sin polling con `pgrep`, solo un `while ps -p <pid>` acotado bajo el timeout de la propia llamada.)
4. `git diff src/app.ts` → **vacío** (confirmado antes y después de todos los commits).
5. Grep-ables:
   - `any` fuera de comentarios en `hooks.ts` → **0**
   - `catch` en `hooks.ts` → solo 1 match de código, dentro de `emit` (línea 306); `runFilter` (líneas 259-277) sin un solo `catch` en su cuerpo
   - `export const hookRegistry` → presente (línea 340)
   - `setFilter|setEvent` en `modules-boot.ts` → **2**
   - `hooks: HookRegistry = hookRegistry` en `modules-boot.ts` → presente (línea 153)
6. `git status --porcelain` limpio tras cada commit. `git diff --stat 4fed533b..HEAD` → exactamente los 3 archivos del plan: `modules-boot.ts` (+59/-14), `hooks.ts` (nuevo, 340 líneas), `mod-02-hooks.test.ts` (nuevo, 237 líneas).

## Contrato final de `PricingAdjustCtx` (para 176-08/09/10)

Sin cambios respecto de `<interfaces>` del plan — se implementó literal:

```ts
export type PricingCallSite =
  | "assign"
  | "change-now"
  | "change-after-current"
  | "preview";

export interface PricingSupports {
  exclusiveBenefits: boolean;
  discounts: boolean;
}

export interface PricingAdjustCtx {
  callSite: PricingCallSite;
  userId: number;
  planId: number;
  planCategory: string;
  priceType: PriceType; // MUTABLE — el handler puede pisarlo (p.ej. a "zero")
  basePrice: number; // MUTABLE
  price: number; // MUTABLE — cada filter lo ajusta
  priceLocked: "prorate" | "override" | null;
  commit: boolean; // false = preview
  supports: PricingSupports;
  moduleInput: Record<string, unknown>; // opaco
  moduleOutput: Record<string, unknown>;
  applied: AppliedBenefit[];
  exclusive: boolean;
  resolvePriceType: (t: PriceType) => Promise<PriceType>;
  basePriceFor: (t: PriceType) => number;
}
```

`PriceType` se importa con `import type { PriceType } from "../subscriptions/types"` — import de tipo, sin ciclo en runtime (confirmado, `tsc --noEmit` limpio).

`FilterMap`/`EventMap` (una sola key cada uno, hoy):

```ts
export interface FilterMap {
  "pricing.adjust": (ctx: PricingAdjustCtx, hook: HookCallCtx) => Promise<void>;
}
export interface EventMap {
  "streak.milestone": (
    evt: StreakMilestoneEvent,
    hook: HookCallCtx,
  ) => Promise<void>;
}
```

**`HookRegistry.runFilter`/`.emit` hardcodean el 2° parámetro** (`ctx: PricingAdjustCtx` / `evt: StreakMilestoneEvent`) en vez de derivarlo genéricamente de `FilterMap[K]`/`EventMap[K]` — es exactamente la firma que pide `<interfaces>` del plan (`runFilter<K extends keyof FilterMap>(key: K, hook: HookCallCtx, ctx: PricingAdjustCtx): Promise<void>`). Es seguro hoy porque cada mapa tiene una única key; si 176-07/08 no agregan un 3er hook a ninguno de los dos mapas (no está previsto), esto no cambia. Si algún día se agrega un 3er hook al mismo mapa, hay que decidir en ese momento si `runFilter`/`emit` se vuelven genéricos sobre `FilterMap[K]` — no antes (YAGNI, doc 04 §4.4).

## Decisions Made

Todas las `decisions_locked` del plan se aplicaron tal cual, sin desviación:

- Almacenamiento idempotente `Map<hookKey, Map<ModuleName, handler>>` — probado por el caso 6 del test.
- Filtrado por módulo habilitado DENTRO de `runFilter`/`emit` vía `isModuleEnabled(hook.tenantId, module, hook.db)` — el core (todavía no conectado) nunca sabrá a qué módulo pertenece un handler.
- `runFilter` sin try/catch en su cuerpo (propaga); `emit` con try/catch por handler + `log.warn({ err, module, hook: key, ...evt }, "module event handler failed (best-effort)")` — mensaje espejado del patrón de `streaks/service.ts:296-302`.
- Orden de ejecución = orden de inserción del `Map` interno = orden de registro en `registerModules`. Sin `priority` (YAGNI).
- `hookRegistry` exportado como singleton de proceso; `registerModules(app, hooks = hookRegistry)` acepta el registry como 2° parámetro inyectable — el default no cambia el comportamiento de `app.ts` (sigue llamando `registerModules(app)` sin pasar el 2° argumento).

## Deviations from Plan

### Auto-fixed, sin impacto en código de producción

**1. [Rule 3 - Bloqueo del acceptance criteria] Docblock de `mod-02-hooks.test.ts` mencionaba literalmente `hookRegistry` (el singleton)**

- **Found during:** Task 3, verificación de acceptance criteria (`grep -c "hookRegistry" test/tenancy/mod-02-hooks.test.ts` debía ser 0).
- **Issue:** el docblock explicaba por qué el test NO usa el singleton, y para explicarlo nombraba literalmente el identificador `hookRegistry` tres veces en prosa — el grep del acceptance criteria es literal sobre el archivo completo (código + comentarios), así que el match era real aunque no hubiera uso en código.
- **Fix:** reescrito el párrafo para describir la instancia de proceso sin usar el identificador exacto ("la instancia de proceso", "ese símbolo"). El código de test (imports, llamadas) nunca importó ni usó el singleton — el fix es puramente de prosa.
- **Files modified:** `test/tenancy/mod-02-hooks.test.ts` (mismo commit `c4b2eeac`, no hubo commit separado).
- **Verificado:** `grep -c "hookRegistry" test/tenancy/mod-02-hooks.test.ts` → 0 tras el fix; `tsc --noEmit` y los 6 tests siguieron verdes.

### Infra, no de código

**2. Flake transitorio de infra en `iso-01-manifiesto.test.ts` (2 corridas rojas antes de la verde)**

- **Found during:** primer intento de correr la verificación final #3.
- **Issue:** `Unknown database 'eltemplo_test_1'` y luego `Connection lost: The server closed the connection.` — la base `eltemplo_test_1` existía (verificado con `SHOW DATABASES`), consistente con otra sesión corriendo tests en paralelo contra la misma DB por-worker, como anticipa el prompt ("Lecciones acumuladas").
- **Fix:** ninguno — se reintentó la corrida sin tocar `test/setup.ts` ni ningún archivo. La tercera corrida (y la corrida combinada final junto con `mod-01-guard.test.ts`) salió 13/13 y 11/11 verde.
- **Files modified:** ninguno.

**Total deviations:** 2. Una de prosa en un comentario de test (sin impacto de comportamiento), una de infra transitoria (sin impacto de código). Cero Rule 1/2/4 — el plan no encontró bugs, funcionalidad faltante ni decisiones arquitecturales.

## Known Stubs

Ninguno. Este plan define contrato y semántica pura — no hay UI ni endpoints que rendericen datos de esto todavía. `hookRegistry` no tiene consumidores reales aún (eso es 176-07/08/09/10), lo cual es exactamente el alcance declarado del plan ("NO conecta todavía ningún cliente real").

## Threat Flags

Ninguno fuera del `<threat_model>` del plan. Las 5 amenazas registradas (T-176-07/08/14/15/16) están todas mitigadas y cubiertas por los 6 casos del test — no se introdujo superficie nueva no anticipada.

## Files Created/Modified

- `el-templo-api/src/modules/shared/hooks.ts` — contrato cerrado, `HookRegistry`, singleton `hookRegistry`.
- `el-templo-api/src/modules-boot.ts` — `ModuleDef.filters?/events?`, `registerModules(app, hooks = hookRegistry)`.
- `el-templo-api/test/tenancy/mod-02-hooks.test.ts` — 6 casos de semántica.

## Issues Encountered

Ninguno de código. El typecheck salió limpio en la primera corrida de cada task, sin necesidad de castear con `as` en ningún punto de `hooks.ts` ni `modules-boot.ts` (la relación `FilterMap[K]`/`Partial<FilterMap>` typechequeó sin fricción).

## User Setup Required

Ninguno — sin variables de entorno nuevas, sin dependencias nuevas, sin migraciones nuevas en este plan.

## Next Phase Readiness

- `src/modules/shared/hooks.ts` listo para que 176-07 registre el handler `streak.milestone` en `temploGamificationModule.events` y 176-08/09/10 registren `pricing.adjust` en `temploGamificationModule.filters` (un call site de pricing por plan, según el doc 04 §4.2: `assignPlan`, `changePlanNow`/`changePlanAfterCurrent`/`renewSubscription`, `getPricingPreview`).
- El contrato de `PricingAdjustCtx` documentado arriba es la superficie exacta contra la que esos planes implementan — sin cambios respecto de `<interfaces>` del plan 06.
- Worktree `et-176` limpio (`git status --porcelain` vacío), rama `feat/176-modulos`, 3 commits nuevos sobre `4fed533b` (`8f7894e7`, `b4c9c77b`, `c4b2eeac`).
- Sin bloqueadores para 176-07/08/09/10.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

Verificado en disco:

- `el-templo-api/src/modules/shared/hooks.ts` existe.
- `el-templo-api/test/tenancy/mod-02-hooks.test.ts` existe.
- `el-templo-api/src/modules-boot.ts` modificado (confirmado con `git diff --stat`).
- Los 3 commits (`8f7894e7`, `b4c9c77b`, `c4b2eeac`) existen en `git log --oneline 4fed533b..HEAD` del worktree `et-176`.
- `git -C /home/franco/projects/et-176 status --porcelain` vacío.
  Sin items faltantes.
