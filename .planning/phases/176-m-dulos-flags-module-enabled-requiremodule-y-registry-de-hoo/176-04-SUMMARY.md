---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 04
subsystem: api
tags: [fastify, feature-flags, multi-tenancy, vitest, composition-root]

# Dependency graph
requires:
  - "requireModule/moduleScope/moduleGuardOf (176-03, src/modules/shared/module-registry.ts)"
  - "modules.ts / module-flags.ts (176-01)"
provides:
  - "src/modules-boot.ts — composition root único: interfaz ModuleDef, temploMarketingModule (5 registros), temploOnboardingModule (1), registerModule/registerModules(app)"
  - "src/modules/aura/module.ts — temploGamificationModule (barChallengeRoutes)"
  - "app.ts delega los 7 registros de marketing/onboarding/gamification a registerModules(app)"
affects:
  [
    "176-05 (gate de cobertura ISO-01)",
    "176-06 (registry de hooks: agrega el 2do parámetro hooks y los campos filters/events al ModuleDef)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition root único (src/modules-boot.ts): el ÚNICO archivo de src/ fuera de las carpetas de módulo que importa carpetas de módulo"
    - "ModuleDef con import type circular (aura/module.ts importa `type ModuleDef` de modules-boot.ts, modules-boot.ts importa el value `temploGamificationModule` de aura/module.ts) — seguro porque `import type` se elimina en compilación, sin ciclo en runtime"
    - "D-04 híbrido: SOLO marketing/onboarding/gamification migran a ModuleDef; los 12 registros de templo-training quedan in-place con moduleScope directo (176-03), sin tocar en este plan"

key-files:
  created:
    - el-templo-api/src/modules-boot.ts
    - el-templo-api/src/modules/aura/module.ts
  modified:
    - el-templo-api/src/app.ts
    - el-templo-api/test/tenancy/mod-01-guard.test.ts

key-decisions:
  - "temploGamificationModule vive en modules/aura/module.ts (carpeta propia, porque 176-07/08 le van a agregar filters/events); temploMarketingModule y temploOnboardingModule se declaran DENTRO de modules-boot.ts (sin carpeta de módulo única / sin hooks que la justifiquen)"
  - "Firma de esta fase: registerModules(app: FastifyInstance): Promise<void> — sin el 2do parámetro hooks, deliberadamente no adelantado (eso es 176-06)"
  - "Punto de inserción: después de campaignRoutes (última ruta core) y ANTES de app.get('/health', ...) y del hook de Sentry — ningún seam existente se tocó"
  - "D-07 respetado: las rutas de marketing siguen clasificadas templo-module en el manifiesto, NO se reclasifican como global, aunque el guard resuelva tenant 1 por D-06"
  - "Corrección de la instrucción de verificación del plan: el-templo-api no tiene eslint.config.js propio (confirmado también en 176-01) — el gate de código de este plan fue únicamente tsc --noEmit"

requirements-completed: [MOD-01]

# Metrics
duration: ~55min
completed: 2026-08-21
---

# Phase 176 Plan 04: Composition root `src/modules-boot.ts` Summary

**Composition root único (`src/modules-boot.ts`) que registra en formato `ModuleDef` los 7 registros baratos de marketing (5), onboarding (1) y gamification (1) — `app.ts` pierde esos 7 `app.register(...)` y gana una única llamada a `registerModules(app)`, con el inventario de rutas (370 entradas) intacto.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-08-21 (continuación de 176-01/02/03, HEAD `7ca09c06`)
- **Completed:** 2026-08-21
- **Tasks:** 3/3
- **Files modified:** 4 (2 nuevos, 2 modificados)

## Accomplishments

- `src/modules-boot.ts`: interfaz `ModuleDef` (`name` + `routes?`), `temploMarketingModule` (franchise/gladius/blog/academy/app-landing, prefijos idénticos a los que tenía `app.ts`), `temploOnboardingModule`, `registerModule` privada (aplica `moduleScope` a cada ruta del `ModuleDef`) y `registerModules(app)` — orden explícito gamification → marketing → onboarding.
- `src/modules/aura/module.ts`: `temploGamificationModule` con la única ruta HTTP del módulo (`POST /api/bar-challenge/result`, vía `barChallengeRoutes`). Docblock aclara que AURA es un service interno sin `routes.ts` propio.
- `src/app.ts`: borrados los 7 `await app.register(...)` (con sus imports huérfanos) y sus comentarios (viajaron al `ModuleDef` correspondiente); agregado `await registerModules(app)` después de `campaignRoutes` y antes de `/health`. `opts.onRoute`, el hook de Sentry y `/health` sin tocar. Los 12 `moduleScope(app, "templo-training", ...)` del plan 03 sin tocar.
- `test/tenancy/mod-01-guard.test.ts`: extendido con 3 `describe` nuevos (onboarding, gamification, marketing) — 6 tests nuevos sobre los 5 existentes de training, 11/11 verde contra MySQL real.

## Task Commits

Cada task se commiteó atómicamente en `et-176` (branch `feat/176-modulos`), sobre `7ca09c06`:

1. **Task 1: `modules-boot.ts` + `aura/module.ts`** — `863911a9` (feat)
2. **Task 2: sacar los 7 registros de `app.ts` + llamar `registerModules`** — `eabc5e4b` (feat)
3. **Task 3: extender `mod-01-guard.test.ts`** — `e93a8de7` (test)

## Verificación final (las 6 del prompt)

1. `pnpm exec tsc --noEmit` → exit 0, sin imports huérfanos en `app.ts` (verificado también con grep manual de los 7 nombres removidos: 0 matches).
2. `pnpm exec vitest run test/tenancy/iso-01-manifiesto.test.ts --hookTimeout=250000` → **11/11 verde**, `ENTRADAS_BASELINE = 370` sin moverse (línea 171 del test, valor no tocado por este plan).
3. `pnpm exec vitest run --no-file-parallelism test/tenancy/mod-01-guard.test.ts --hookTimeout=250000` → **11/11 verde**, cubre los 4 módulos (5 casos de training preexistentes + 6 nuevos de onboarding/gamification/marketing).
4. `pnpm exec vitest run test/blog/blog.test.ts test/blog/blog-tags.test.ts test/tenancy/mod-01-flags.test.ts --hookTimeout=250000` → **51/51 verde** (el glob `test/blog*.test.ts` del prompt no matchea porque los tests de blog viven en `test/blog/*.test.ts`, no en la raíz de `test/` — se corrieron los dos archivos reales explícitos; el caso de marketing restauró los flags sin contaminar la suite).
5. Acceptance grep-ables:
   - `grep -cE "app\.register\((franchiseRoutes|gladiusRoutes|blogRoutes|academyRoutes|appLandingRoutes|onboardingRoutes|barChallengeRoutes)" src/app.ts` → **0**
   - `grep -c "registerModules(app)" src/app.ts` → **1**, línea 354, ANTES de `app.get("/health"` (línea 357)
   - `grep -c "moduleScope(" src/modules-boot.ts` → **1** (la llamada dentro de `registerModule`, que cubre las 7 rutas vía el loop `for (const { plugin, prefix } of def.routes ?? [])`)
6. `git status --porcelain` limpio tras cada commit. `git diff --stat 7ca09c06..HEAD` suma exactamente los 4 archivos del plan: `app.ts` (33 líneas, -28/+5), `modules-boot.ts` (nuevo, 127 líneas), `modules/aura/module.ts` (nuevo, 37 líneas), `mod-01-guard.test.ts` (+96 líneas).

## Conteo de llamadas a `moduleScope` (pedido explícito del prompt)

- **12 in-place** en `app.ts` (plan 176-03, `moduleScope(app, "templo-training", ...)`) — sin tocar en este plan.
- **7 vía `ModuleDef`** en `modules-boot.ts`/`aura/module.ts`, resueltas por el loop de `registerModule` (no son 7 llamadas literales en el texto — es una sola llamada `moduleScope(app, def.name, plugin, { prefix })` dentro de un `for`, ejecutada 7 veces en runtime: 5 de marketing, 1 de onboarding, 1 de gamification).
- **Total: 19 llamadas a `moduleScope` en runtime**, cubriendo las 141 rutas `templo-module` del manifiesto (370 entradas totales, `ENTRADAS_BASELINE` intacto).

## Files Created/Modified

- `el-templo-api/src/modules-boot.ts` — composition root, `ModuleDef`, `temploMarketingModule`, `temploOnboardingModule`, `registerModule`/`registerModules`.
- `el-templo-api/src/modules/aura/module.ts` — `temploGamificationModule`.
- `el-templo-api/src/app.ts` — 7 registros menos, 1 import nuevo (`registerModules`), 1 llamada nueva.
- `el-templo-api/test/tenancy/mod-01-guard.test.ts` — 3 `describe` nuevos, 6 tests nuevos.

## Decisions Made

Todas las `decisions_locked` del plan se aplicaron tal cual, sin desviación:

- D-04 híbrido respetado: los 12 registros de `templo-training` NO se tocaron.
- `temploGamificationModule` en `modules/aura/module.ts`; `temploMarketingModule`/`temploOnboardingModule` dentro de `modules-boot.ts`.
- Firma `registerModules(app: FastifyInstance): Promise<void>` sin el segundo parámetro `hooks` (eso es 176-06).
- Punto de inserción en `app.ts` exacto: después de los registros core, antes de `/health` y del hook de Sentry.
- D-07: marketing sigue clasificado `templo-module`, no `global`, en el manifiesto (no se tocó `tenant-manifest.ts` en este plan — el guard ya resuelve tenant 1 desde 176-03).

**Decisión de implementación no anticipada explícitamente por el plan (sin desviación de comportamiento):** `aura/module.ts` importa `type ModuleDef` de `modules-boot.ts` (`import type`, no un import de valor) para tipar `temploGamificationModule`. Esto crea una dependencia bidireccional aparente entre los dos archivos (`modules-boot.ts` importa el VALOR `temploGamificationModule` de `aura/module.ts`, y `aura/module.ts` importa el TIPO `ModuleDef` de `modules-boot.ts`) — pero `import type` se borra por completo en la emisión de JS (verificado: `tsconfig.json` no tiene `verbatimModuleSyntax` ni `isolatedModules` que lo bloqueen), así que no hay ciclo de `require`/`import` en runtime, solo en el grafo de tipos de TypeScript. `tsc --noEmit` no marcó ningún problema. Es el patrón estándar para "el core declara la interfaz, la hoja la implementa" sin duplicar el tipo.

## Deviations from Plan

### Documentadas, sin fix necesario

**1. Ruta de verificación de blog en el prompt no coincide con la estructura real del repo**

- **Found during:** paso 4 de la verificación final.
- **Issue:** el prompt (y el `<acceptance_criteria>` de Task 3 del plan) piden `pnpm exec vitest run test/blog*.test.ts test/tenancy/mod-01-flags.test.ts`. Ese glob no matchea nada: los tests de blog viven en `test/blog/blog.test.ts` y `test/blog/blog-tags.test.ts` (subcarpeta), no en archivos `test/blog*.test.ts` en la raíz de `test/`.
- **Fix:** corrida la verificación con las rutas reales (`test/blog/blog.test.ts test/blog/blog-tags.test.ts test/tenancy/mod-01-flags.test.ts`) — 51/51 verde, cubre exactamente el mismo propósito (confirmar que el caso de marketing restauró los flags sin contaminar la suite).
- **Files modified:** ninguno — es un ajuste de comando de verificación, no de código.
- **Committed in:** N/A (no aplica).

**2. `eslint` no aplica a `el-templo-api` (ya anticipado en el prompt y confirmado en 176-01)**

- El prompt de este plan ya corrigió este punto de antemano ("`el-templo-api` NO tiene `eslint.config.js` propio"). Confirmado de nuevo: el gate de código de este plan fue únicamente `tsc --noEmit`.

---

**Total deviations:** 2, ninguna de código (una de ruta de comando de verificación, una ya anticipada por el prompt). Cero Rule 1/2/3/4 — el plan no encontró bugs, funcionalidad faltante, ni bloqueos que requirieran fix.

**Impact on plan:** Ninguno. Las 6 verificaciones del prompt pasan con las rutas corregidas.

## Issues Encountered

Ninguno. El typecheck salió limpio en la primera corrida de cada task — el contrato de `moduleScope`/`requireModule`/`moduleGuardOf` de 176-03 encajó sin ajustes.

## User Setup Required

None — sin variables de entorno nuevas, sin dependencias nuevas, sin migraciones nuevas en este plan.

## Next Phase Readiness

- `src/modules-boot.ts` listo para que 176-06 le agregue el segundo parámetro `hooks: HookRegistry` y los campos `filters`/`events` al `ModuleDef` (el docblock de ambos archivos nuevos ya anuncia explícitamente dónde va cada uno).
- El gate de cobertura de 176-05 (`iso-01-manifiesto.test.ts`, sexto test que lee `moduleGuardOf`) puede apoyarse en que las 141 rutas `templo-module` del manifiesto ya están cubiertas por las 19 llamadas a `moduleScope` (12 in-place + 7 vía `ModuleDef`).
- Worktree `et-176` limpio (`git status --porcelain` vacío), rama `feat/176-modulos`, 3 commits nuevos sobre `7ca09c06` (`863911a9`, `eabc5e4b`, `e93a8de7`).
- Sin bloqueadores para 176-05/176-06.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

Verificado en disco:

- `el-templo-api/src/modules-boot.ts` existe.
- `el-templo-api/src/modules/aura/module.ts` existe.
- `el-templo-api/src/app.ts` y `el-templo-api/test/tenancy/mod-01-guard.test.ts` modificados (confirmado con `git diff --stat`).
- Los 3 commits (`863911a9`, `eabc5e4b`, `e93a8de7`) existen en `git log --oneline 7ca09c06..HEAD` del worktree `et-176`.
- `git -C /home/franco/projects/et-176 status --porcelain` vacío.
  Sin items faltantes.
