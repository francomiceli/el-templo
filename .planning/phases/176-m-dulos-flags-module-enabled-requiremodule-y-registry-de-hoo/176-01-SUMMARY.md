---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 01
subsystem: api
tags: [drizzle, mysql, feature-flags, multi-tenancy, vitest]

# Dependency graph
requires: []
provides:
  - "MODULE_NAMES/ModuleName/moduleFlagKey/parseModuleFlagKey (src/modules/shared/modules.ts) — fuente única de los 4 módulos Templo"
  - "enabledModulesFor/isModuleEnabled/invalidateModuleFlags (src/modules/shared/module-flags.ts) — resolver fail-closed contra tenant_settings con cache TTL"
  - "Migración 0207 (seed idempotente de los 4 flags ON para tenant 1)"
  - "test/fixtures/module-flags.ts (setModuleFlag/clearModuleFlags/restoreTemploFlags)"
affects:
  [
    176-02,
    176-03,
    "resto de la fase 176 (guard requireModule, registry de hooks)",
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver de flags funcional (no clase) con `db` por parámetro, para consumidores sin instancia de service (hooks onRequest, registry)"
    - "Cache en memoria con TTL 0 en NODE_ENV=test (Pitfall 4: vitest.config.ts isolate:false comparte el Map entre archivos del worker) + invalidación explícita"
    - "Valor serializado 'true'/'false' para tenant_settings (diverge deliberadamente de 'on'/'off' de system_settings)"

key-files:
  created:
    - el-templo-api/src/modules/shared/modules.ts
    - el-templo-api/src/modules/shared/module-flags.ts
    - el-templo-api/src/db/migrations/0207_seed_module_flags.sql
    - el-templo-api/test/fixtures/module-flags.ts
    - el-templo-api/test/tenancy/mod-01-flags.test.ts
  modified: []

key-decisions:
  - "Valor serializado del flag: 'true'/'false' (no 'on'/'off' como system_settings), fijado en modules.ts con comentario de la divergencia"
  - "TTL 60_000ms en runtime, 0 en test; invalidateModuleFlags() exportada explícitamente"
  - "Firma funcional (enabledModulesFor(tenantId, db), no clase) — divergencia deliberada de SettingsService"
  - "Sin barrel: modules.ts y module-flags.ts NO se agregan a shared/index.ts, se importan por ruta directa"
  - "DEFAULT_PUBLIC_TENANT_ID = 1 documentado como deuda consciente D-06"

patterns-established:
  - "Migración manual (db:generate roto por drift) copiando literal la forma de 0168_seed_pricing_zero_price.sql: INSERT...SELECT...WHERE NOT EXISTS, sin ';' dentro de comentarios --"
  - "Fixture de test que invalida cache después de cada mutación de flags + restoreTemploFlags en afterEach"

requirements-completed: [MOD-01]

# Metrics
duration: ~50min
completed: 2026-08-21
---

# Phase 176 Plan 01: Módulos — flags `module.*.enabled` Summary

**Fuente única de los 4 nombres de módulo Templo, resolver fail-closed con cache TTL contra `tenant_settings`, y migración 0207 que siembra los 4 flags ON para El Templo — probado contra MySQL real (fail-closed en tenant sin filas, invalidación de cache en el acto, idempotencia del seed).**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-08-20T21:20:00Z (aprox, worktree ya existía de una ejecución previa)
- **Completed:** 2026-08-21T00:44:49Z
- **Tasks:** 3/3
- **Files modified:** 5 (todos nuevos)

## Accomplishments

- `modules.ts`: `MODULE_NAMES` (`as const`, 4 nombres), `ModuleName`, `moduleFlagKey`/`parseModuleFlagKey`, `MODULE_FLAG_ON`/`MODULE_FLAG_OFF`, `DEFAULT_PUBLIC_TENANT_ID`.
- `module-flags.ts`: `enabledModulesFor`/`isModuleEnabled`/`invalidateModuleFlags`, fail-closed, cache `Map<tenantId, {flags, expiresAt}>` con TTL 60s (0 en test).
- Migración `0207_seed_module_flags.sql`: 4 bloques `INSERT...WHERE NOT EXISTS`, aplicada y re-aplicada contra la DB local (`eltemplo`) — segunda corrida "No new migrations to apply", 0 filas nuevas.
- `test/tenancy/mod-01-flags.test.ts`: 5/5 tests verdes contra MySQL real (fila sembrada, resolver ON para tenant 1, set vacío para tenant 2 sin flags, invalidación de cache, idempotencia de los statements crudos vía `splitSqlStatements`).

## Task 1 — worktree y numeración de migración

El worktree `/home/franco/projects/et-176` (rama `feat/176-modulos`) YA EXISTÍA al arrancar esta ejecución, en `2a4f5c92` (verificado con `git rev-parse HEAD`). No hizo falta crearlo. `node_modules` faltaba — se materializó con `pnpm install --frozen-lockfile` (no agrega dependencias, solo instala el lockfile existente).

Máximo real de migración observado: **`0206_tv_show_alternative.sql`** (coincide con lo que anticipaba el RESEARCH). Sin prefijos duplicados (`ls src/db/migrations/ | cut -c1-4 | sort | uniq -d` → vacío). La migración de este plan usa **0207**, como estaba previsto.

## Task Commits

Cada task se commiteó atómicamente en `et-176` (branch `feat/176-modulos`):

1. **Task 2: modules.ts + module-flags.ts** — `90b8fd86` (feat)
2. **Task 3: migración 0207 + fixture + test** — `b1c5d735` (feat)

(Task 1 no genera commit versionado — solo crea/verifica el worktree, ya existía.)

## Files Created/Modified

- `el-templo-api/src/modules/shared/modules.ts` — fuente única de `MODULE_NAMES`/`ModuleName`, key builder/parser, constantes de valor serializado.
- `el-templo-api/src/modules/shared/module-flags.ts` — resolver fail-closed con cache TTL contra `tenant_settings`.
- `el-templo-api/src/db/migrations/0207_seed_module_flags.sql` — seed idempotente de los 4 flags ON, tenant 1.
- `el-templo-api/test/fixtures/module-flags.ts` — `setModuleFlag`/`clearModuleFlags`/`restoreTemploFlags`.
- `el-templo-api/test/tenancy/mod-01-flags.test.ts` — 5 casos de integración.

## Decisions Made

- Valor serializado `"true"`/`"false"` para `tenant_settings.setting_value`, documentado como divergencia deliberada de `system_settings` (`'on'`/`'off'`) en el docblock de `modules.ts` (decisión ya fijada por el plan, no re-litigada).
- El resto de decisiones (`decisions_locked` del plan) se aplicaron tal cual: firma funcional con `db` por parámetro, sin barrel, `DEFAULT_PUBLIC_TENANT_ID = 1` con comentario de deuda D-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Faltaban `.env`/`.env.development` en el worktree**

- **Found during:** Task 3 (correr `pnpm exec vitest run test/tenancy/mod-01-flags.test.ts`)
- **Issue:** El worktree `et-176` no tenía `.env`/`.env.development` (gitignorados, no se materializan con `git worktree add`). Vitest fallaba con `ER_ACCESS_DENIED_ERROR` al conectar a MySQL.
- **Fix:** Copiados desde `/home/franco/projects/et-173/el-templo-api/.env` y `.env.development` (mismo host/credenciales de MySQL local que usan todos los worktrees de la máquina). No se tocó ningún archivo versionado; ambos siguen gitignorados (`grep .env* .gitignore` confirma que no aparecen en `git status`).
- **Files modified:** ninguno versionado (`.env`, `.env.development` fuera de git).
- **Verification:** `git status --short` en `et-176` no los muestra; los 5 tests corrieron verdes después.
- **Committed in:** N/A (no versionado).

**2. Baseline `pnpm typecheck:tests` desactualizado (documentado, NO tocado — scope boundary)**

- **Found during:** verificación final de Task 3
- **Issue:** `pnpm typecheck:tests` reporta 9 errores nuevos + 1 empeorado + 1 entrada obsoleta, todos en archivos que este plan NUNCA tocó (`test/unit/{combos,full-body,stretching,tecnica}-generator*.test.ts`, `test/check-ins/check-ins-roster.test.ts`, `test/analytics/analytics.test.ts`, `test/attendance/attendance.test.ts`). Drift preexistente del baseline vs. el estado real de `2a4f5c92`.
- **Fix:** Ninguno — fuera del scope boundary del plan (regla del executor: "Only auto-fix issues DIRECTLY caused by the current task's changes"). Registrado en `deferred-items.md` de la fase.
- **Files modified:** `.planning/phases/176-.../deferred-items.md` (creado, no commiteado — vive en el checkout principal junto con el resto de docs).
- **Verification:** confirmado que ninguno de los 5 archivos de este plan aparece en la lista de errores nuevos/empeorados.

---

**Total deviations:** 2 (1 Rule 3 — blocking config faltante, 1 documentado sin fix por scope boundary).
**Impact on plan:** El fix de `.env` era imprescindible para poder correr el gate de Task 3 (BLOCKING). El typecheck:tests desactualizado es deuda preexistente ajena a este plan, no bloquea la fase 176.

## Issues Encountered

Ninguno más allá de lo documentado en Deviations. `eslint` (paso de `<verification>` del plan) no aplica: `el-templo-api` no tiene `eslint.config.js` propio (solo `el-templo-app` y `el-templo-admin` lo tienen) — verificado, no es una omisión de este plan.

## User Setup Required

None - no external service configuration required. La migración 0207 ya se aplicó a la DB local de desarrollo (`eltemplo`) durante esta ejecución; el pipeline de CI/CD la aplicará a staging/prod en su momento vía `pnpm db:migrate` (mismo runner).

## Next Phase Readiness

- `modules.ts` y `module-flags.ts` listos para que 176-02 (guard `requireModule`) y el registry de hooks los consuman por ruta directa.
- La migración 0207 y el fixture de test quedan disponibles para toda la batería `test/tenancy/mod-0*` de la fase.
- Sin bloqueadores. El worktree `et-176` queda limpio (`git status --short` vacío) y en `feat/176-modulos` con 2 commits nuevos sobre `2a4f5c92`.

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_

## Self-Check: PASSED

Todos los archivos declarados como creados existen en disco y ambos commits
(`90b8fd86`, `b1c5d735`) existen en `git log --oneline --all` del worktree
`et-176`. Sin items faltantes.
