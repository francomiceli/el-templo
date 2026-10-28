---
phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo
plan: 07
subsystem: api
tags: [drizzle, fastify, vitest, hooks, event-bus, aura, streaks, modules]

# Dependency graph
requires:
  - phase: 176-06
    provides: "HookRegistry tipado y cerrado (EventMap/FilterMap, hookRegistry.emit/runFilter, registerModules cuelga def.events)"
provides:
  - "Primer consumidor real del event streak.milestone: StreakService emite, aura/streak-reward.ts otorga"
  - "Patrón replicable para el filter pricing.adjust (176-08/09/10): core emite/consulta, módulo reacciona"
affects: [176-08, 176-09, 176-10, 176-11]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "core emite un event (hookRegistry.emit) en vez de importar el service del módulo directo"
    - "la config de una recompensa (settings keys + defaults + mapeo) vive junto al handler del módulo, no en el core"

key-files:
  created:
    - el-templo-api/src/modules/aura/streak-reward.ts
  modified:
    - el-templo-api/src/modules/aura/module.ts
    - el-templo-api/src/modules/streaks/service.ts
    - el-templo-api/src/modules/streaks/types.ts
    - el-templo-api/src/modules/sessions/routes.ts
    - el-templo-api/test/streaks/streak-service.test.ts

key-decisions:
  - "tenantId del evento sale de ctx.tenantId (TenantContext, tipo number no-nullable) — ya lo recibe updateStreak() como parámetro, sin default ni `!`"
  - "getStreakMilestoneConfig() se movió entero (no se dejó un shim) — su único llamador era el bloque de recompensa que también se movió"
  - "auraService NO se borró de sessions/routes.ts — sigue usado por el award de sesión completada (10 AURA) y por programsService.recordSessionForProgram; solo StreakService dejó de recibirlo"

requirements-completed: [MOD-02]

duration: ~35min
completed: 2026-08-21
---

# Phase 176 Plan 07: Event streak.milestone — recompensa AURA movida a templo-gamification Summary

**`StreakService` ya no importa `AuraService`: al alcanzar un milestone emite `streak.milestone` vía `hookRegistry.emit`, y `aura/streak-reward.ts` (nuevo, dentro del módulo `templo-gamification`) es quien decide y otorga la recompensa — con las mismas cantidades, el mismo `sourceType: "streak_bonus"` y el mismo texto `"Racha de N dias"` de siempre.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completadas
- **Files modified:** 6 (1 creado, 5 modificados)

## Accomplishments

- El core (`streaks/service.ts`) detecta el milestone (`STREAK_MILESTONES`, que se queda ahí) y solo anuncia el hecho consumado con `hookRegistry.emit("streak.milestone", ...)`, sin conocer AURA ni tener `try/catch` propio (el aislamiento vive en `HookRegistry.emit`, plan 06).
- `aura/streak-reward.ts` (nuevo) tiene la config de la recompensa (`STREAK_SETTINGS_KEYS`, `STREAK_DEFAULTS`, `StreakMilestoneConfig`, `MILESTONE_TO_CONFIG_KEY`, la lectura desde `system_settings`) y `streakMilestoneRewardHandler`, colgado del `ModuleDef` de `templo-gamification` en `aura/module.ts` (`events: { "streak.milestone": ... }`).
- Constructor de `StreakService` pasa a `(db, log)` — el único call site (`sessions/routes.ts:380`) se actualizó; `auraService` se conservó en ese archivo porque lo usan otros dos call sites que no son del alcance de este plan.
- Dos casos nuevos end-to-end en `test/streaks/streak-service.test.ts`, sobre el camino real (`POST /api/sessions/complete`, sin mocks del registry ni del handler): best-effort (handler que explota no rompe el registro de la sesión ni otorga AURA) y módulo apagado (`templo-gamification` OFF ⇒ 0 AURA por racha, la racha se actualiza igual). El `afterEach` restaura el handler real y los flags de El Templo.

## Task Commits

1. **Task 1: Handler del módulo — `aura/streak-reward.ts` + `events` en el `ModuleDef`** - `423d4e0a` (feat)
2. **Task 2: El core emite — `StreakService` pierde `AuraService`** - `e808734d` (feat)
3. **Task 3: Probar las dos semánticas end-to-end sobre el camino real** - `82bb2c49` (test)

_No hay commit de plan-metadata en el worktree — este SUMMARY vive en el checkout principal y NO se commiteó ahí (regla dura del prompt del ejecutor)._

## Files Created/Modified

- `el-templo-api/src/modules/aura/streak-reward.ts` - Config de la recompensa por milestone + `streakMilestoneRewardHandler` (event handler, sin `try/catch` propio)
- `el-templo-api/src/modules/aura/module.ts` - `ModuleDef.events["streak.milestone"]` colgado del handler
- `el-templo-api/src/modules/streaks/service.ts` - Constructor `(db, log)`, bloque de recompensa reemplazado por `hookRegistry.emit(...)`, `getStreakMilestoneConfig()` borrado
- `el-templo-api/src/modules/streaks/types.ts` - Solo queda `STREAK_MILESTONES`; los 4 símbolos de config de recompensa se movieron
- `el-templo-api/src/modules/sessions/routes.ts` - `new StreakService(fastify.db, fastify.log)` (2 args)
- `el-templo-api/test/streaks/streak-service.test.ts` - 2 casos nuevos end-to-end (best-effort, módulo apagado)

## Decisions Made

- **`tenantId` del evento:** sale de `ctx.tenantId` — `updateStreak(ctx: TenantContext, userId)` ya recibe el `TenantContext` resuelto desde el borde (`sessions/routes.ts`, D-09), y `TenantContext.tenantId` es `TenantId = number` (no-nullable), así que no hizo falta ningún default ni `!`. No se disparó el punto de parada del plan.
- **`getStreakMilestoneConfig()`:** verificado con grep antes y después — su único llamador era el bloque de recompensa que también se movió. Se movió entero como función libre `(db) => Promise<StreakMilestoneConfig>` en vez de mantenerlo como método de clase. No se disparó el punto de parada del plan.
- **Formato del `emit(...)`:** el plan pedía que `grep -n 'emit("streak.milestone"'` matcheara literal en una sola línea. La llamada con los 3 argumentos inline no entraba en el ancho de línea de Prettier y se partía en 3 líneas (rompiendo el grep literal). Se extrajeron `hook`/`evt` a variables locales antes del `emit(...)` para que la llamada quede en una sola línea después de `prettier --write`, sin sacrificar legibilidad ni cambiar semántica.

## Deviations from Plan

None (más allá del ajuste cosmético de formato de la línea de `emit(...)`, documentado arriba como decisión, no como fix de bug/blocker) - plan ejecutado tal como estaba escrito. Ningún llamador extra de `getStreakMilestoneConfig` apareció; el `ctx` con `tenantId` estuvo disponible en el método que detecta el milestone.

## Issues Encountered

None.

## Verificación final (las 5 del prompt)

1. `pnpm exec tsc --noEmit` → **exit 0**.
2. `pnpm exec vitest run --no-file-parallelism test/streaks/streak-service.test.ts test/tenancy/mod-02-hooks.test.ts --hookTimeout=250000` → **12/12 verdes** (4 preexistentes de racha SIN modificar + 2 nuevos end-to-end + 6 de `mod-02-hooks.test.ts`).
3. `pnpm exec vitest run test/tenancy/mod-01-flags.test.ts test/tenancy/mod-01-guard.test.ts --hookTimeout=250000` → **5/5 y 11/11 verdes** (sin contaminación del `hookRegistry` de proceso entre archivos del mismo worker).
4. Grep-ables:
   - `AuraService|auraService` en `streaks/service.ts` = **0**
   - `streak.milestone_` recursivo en `src/modules/streaks/` = **0**
   - `emit("streak.milestone"` en `streaks/service.ts` = **1**
   - `new StreakService` en `sessions/routes.ts` con 2 argumentos = **confirmado** (`fastify.db, fastify.log`)
   - `STREAK_MILESTONES` sigue en `streaks/types.ts` = **confirmado**
   - `streak_bonus` en `aura/streak-reward.ts` = **1**, y en `src/modules/streaks/` = **0**
   - `streakMilestoneRewardHandler` en el test = **3** (import + 2 usos: el `setEvent` real dentro del import y el `afterEach` de restauración)
5. `git status --porcelain` en el worktree = **limpio**; `git diff --stat c4b2eeac..HEAD` = **exactamente los 6 archivos del plan** (1 creado, 5 modificados).

## Deuda documentada — T-176-19 (Elevation, disposition: accept)

**"Con `templo-gamification` apagado no se otorga AURA por racha" es cierto SOLO para el camino de sesión completada (`POST /api/sessions/complete` → `StreakService.updateStreak` → `hookRegistry.emit`).** Fuera de alcance de esta fase (176) y **sin resolver**:

- Los **4 jobs de `src/jobs/`** que otorgan AURA (crons) NO pasan por rutas HTTP ni por el event `streak.milestone` — siguen invocando `AuraService`/lógica de recompensa directo, así que van a seguir otorgando AURA incluso con el módulo `templo-gamification` apagado para un tenant.
- Quedan **~21 sitios adicionales de `new AuraService`** en el codebase (fuera de `streaks/` y `aura/streak-reward.ts`) que tampoco pasan por el registry de hooks — no se tocaron ni se auditaron en este plan.

Consecuencia práctica: el guard/flag `module.templo-gamification.enabled` en OFF apaga la recompensa por racha del flujo de sesión (verificado con el caso 2 de la Task 3), pero NO es una garantía general de "sin `templo-gamification`, cero AURA" para el tenant hasta que un plan futuro traiga esos ~25 sitios (4 jobs + 21 call sites) al mismo mecanismo de event/hook. Documentado en el threat register del plan (`T-176-19`, disposition `accept`) — no requiere acción de este plan, pero cualquier fase que dependa de "módulo apagado ⇒ cero AURA" como invariante DEBE revisar esta lista primero.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Patrón validado end-to-end (composition root → registry → handler → efecto real en DB) para el event `streak.milestone`. El plan 176-08 (filter `pricing.adjust`, semántica de error opuesta — propaga en vez de aislar) puede apoyarse en el mismo `HookRegistry` sin cambios adicionales.
- Ningún bloqueo. La deuda T-176-19 queda nombrada y no bloquea el resto de la fase 176 (jobs y otros call sites de `AuraService` son trabajo futuro explícitamente fuera de alcance).

---

_Phase: 176-m-dulos-flags-module-enabled-requiremodule-y-registry-de-hoo_
_Completed: 2026-08-21_
