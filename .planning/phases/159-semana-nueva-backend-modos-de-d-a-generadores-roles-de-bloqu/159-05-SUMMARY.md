---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
plan: 05
subsystem: api
tags: [sessions, admin, routing, combos, tecnica, integration-test]

# Dependency graph
requires:
  - phase: 159-01
    provides: "BlockRole += COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING; sessionMode += combos/tecnica; generateWeekSchema.body.dayModes (enum + additionalProperties:false)"
  - phase: 159-03
    provides: "generateCombosSession(db, week, day, levelGroup, memberLevel) / generateTecnicaSession(db, week, day, levelGroup, memberLevel), both sessionMode-tagged, 6-level-ready"
provides:
  - "AdminSessionService.generateWeek routes per-day dayModes override (combos/tecnica) to the two new generators, 6 levels x 3 level groups, never writing to day_modes"
  - "POST /admin/generate wired end-to-end: request.body.dayModes -> generateWeek options -> generator dispatch"
  - "Badge DEUTEROS_1/DEUTEROS_2 in the admin session list: D1/D2 -> DA/DB"
  - "test/sessions/generate-modes.test.ts: 6-case integration coverage of the whole request->persistence path"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-day mode override precedence: requestModes[day] ?? dayModeMap.get(dayNumber) ?? 'regular' — request body always wins over the day_modes table default, in-memory only"
    - "New fixed-structure branch (combos/tecnica) mirrors the existing ROM branch shape: same dayId scheme, same skip/regenerate/error-accumulation semantics, same early continue"

key-files:
  created:
    - el-templo-api/test/sessions/generate-modes.test.ts
  modified:
    - el-templo-api/src/modules/admin/service.ts
    - el-templo-api/src/modules/admin/routes.ts

key-decisions:
  - "D-02 enforced literally: generateWeek reads options.dayModes but NEVER writes schema.dayModes; day_modes stays exclusively the ROM-Saturday default (verified by grep — no insert/update touches dayModes in this function)."
  - "Precedent honored per 159-03's explicit handoff note: neither the combos/tecnica branch nor the pre-existing ROM branch calls validateSession before saveSession. Kept consistent — no validateSession added in this plan's routing."
  - "Rule 2 auto-fix: routes.ts wiring (request.body.dayModes -> generateWeek options.dayModes) was NOT in the plan's files_modified list (only admin/service.ts + the test file were listed), but without it the JSON-schema-validated dayModes field never reaches the service — the whole feature would be unreachable via HTTP. Added as critical missing wiring, not an architectural change (single field passthrough, existing types)."
  - "canAccessTraining in tests satisfied via role='owner' (createStaffUser) rather than the single hardcoded TRAINING_EXCLUSIVE_COACH_EMAIL fixture — simpler, no email-matching coupling, and owner access is unconditional in permissions.ts."

requirements-completed: [SEM-01, SEM-12, SEM-13]

# Metrics
duration: ~55min
completed: 2026-08-14
---

# Phase 159 Plan 05: Ruteo por modo en /admin/generate + badge DEUTEROS DA/DB Summary

**`generateWeek` ahora enruta combos/tecnica por `dayModes` del request (6 niveles, 3 level groups, sin tocar `day_modes`), con el wiring HTTP completo (`routes.ts`) y el badge DEUTEROS renombrado a DA/DB; tsc verde, test de integración de 6 casos escrito y estructuralmente completo pero no verificado en verde local por colisión confirmada de MySQL de test con un proceso vitest concurrente de otro worktree — gate diferido a CI.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-08-14
- **Tasks:** 2/2 completed
- **Files modified:** 3 (2 de Task 1 — incluyendo 1 archivo fuera del scope original por Rule 2 — + 1 de Task 2)

## Accomplishments

- `AdminSessionService.generateWeek` acepta `options.dayModes?: Record<string, string>` y resuelve el modo por día como `requestModes[day] ?? dayModeMap.get(dayNumber) ?? "regular"` — el request SIEMPRE gana sobre el default de `day_modes`, y solo en memoria para esa generación (D-02).
- Nueva rama `if (dayMode === "combos" || dayMode === "tecnica")`: expande `levelGroups` a los 6 `memberLevels` (mismo patrón `alfa_delta -> [alfa,delta,kairos]` / `sigma -> [sigma]` / `omega -> [omega,spartan]` que la rama regular y la de ROM), construye `dayId = W${week}-${day}-${memberLevel}` (idéntico al esquema regular/ROM), respeta skip/regenerate, invoca `generateCombosSession`/`generateTecnicaSession` con import dinámico (`.js`, mismo patrón que `rom-generator.js`), y acumula errores por dayId en `warnings` (`catch (err: unknown)` + `instanceof Error`) sin abortar la semana — igual que la rama ROM preexistente.
- `generateWeek` NO escribe en `schema.dayModes` en ningún punto de la función (verificado por grep) — la tabla queda exclusivamente como default del ROM del sábado.
- Badge del listado (`getSessions`): `DEUTEROS_1`/`DEUTEROS_2` pasan de `"D1"`/`"D2"` a `"DA"`/`"DB"` (SEM-12, D-P5, rename de presentación). Los literales `'DEUTEROS I'`/`'DEUTEROS II'` del PDF quedan intactos (SEM-11, fase 160).
- `routes.ts`: `POST /admin/generate` ahora extrae `request.body.dayModes` (ya validado por `generateWeekSchema` desde el plan 01) y lo pasa a `generateWeek` — sin este passthrough el campo nunca llegaba al service (ver Deviations).
- `test/sessions/generate-modes.test.ts`: 6 casos de integración contra `createTestApp`/MySQL real, cubriendo persistencia de `session_mode`/roles para combos y tecnica, no-truncamiento de roles nuevos en `varchar(20)`, 400 en modo inválido, D-10 (6 niveles en combos), y regresión de `regular` sin `dayModes`.
- `pnpm exec tsc --noEmit` verde (0 errores) en las 3 versiones del código (tras Task 1, tras el wiring de `routes.ts`, y tras Task 2).

## Task Commits

1. **Task 1: ruteo por modo en generateWeek + badge DEUTEROS + wiring de routes.ts (deviation)** - `248cd90a` (feat)
2. **Task 2: test de integración generate-modes.test.ts** - `1a55c664` (test)

## Files Created/Modified

- `el-templo-api/src/modules/admin/service.ts` - `generateWeek`: firma con `dayModes`, resolución de modo por día, rama combos/tecnica (6 niveles), badge DA/DB.
- `el-templo-api/src/modules/admin/routes.ts` - (deviation, Rule 2) `Body` type de `POST /admin/generate` += `dayModes?: Record<string, string>`; passthrough a `adminService.generateWeek`.
- `el-templo-api/test/sessions/generate-modes.test.ts` - 6 tests de integración (ver Behaviors abajo).

## Decisions Made

Ver `key-decisions` en el frontmatter. Resumen: D-02 aplicado literalmente (nunca se escribe `day_modes`); precedente de no-`validateSession` de ROM/159-03 respetado sin agregar validación nueva; wiring de `routes.ts` agregado como Rule 2 (crítico, sin él la feature es inalcanzable vía HTTP aunque el body ya estuviera validado desde el plan 01); usuarios de test resueltos por rol `owner` en vez del email hardcodeado de `TRAINING_EXCLUSIVE_COACH_EMAIL`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `routes.ts` no pasaba `dayModes` del body a `generateWeek`**
- **Found during:** Task 1 (al revisar cómo `POST /admin/generate` invoca `adminService.generateWeek`, antes de escribir el test de integración de Task 2)
- **Issue:** El plan listaba `files_modified: [admin/service.ts, test/.../generate-modes.test.ts]` únicamente. Pero `admin/routes.ts` — no tocado por el plan 01 ni por este plan según su alcance declarado — tenía el tipo `Body` del handler sin `dayModes` y el handler no lo extraía de `request.body` al armar las `options` para `generateWeek`. El body ya estaba validado por el JSON Schema de `generateWeekSchema` (plan 01), pero el valor simplemente se perdía entre la validación HTTP y el service: la feature completa de "elegir el modo por día en /generate" habría quedado sin efecto alguno vía HTTP, a pesar de que `generateWeek` internamente ya sabía enrutar por `dayModes`.
- **Fix:** se agregó `dayModes?: Record<string, string>` al tipo `Body` del `fastify.post<{...}>` genérico y se agregó `dayModes: request.body.dayModes` al objeto `options` pasado a `adminService.generateWeek`. Cambio mínimo (2 líneas), sin nueva ruta HTTP (ISO-01 intacto), sin cambio de forma del body (ya validado desde el plan 01).
- **Files modified:** `el-templo-api/src/modules/admin/routes.ts`
- **Verification:** `pnpm exec tsc --noEmit` verde; el test 1/2/4/5/6 de `generate-modes.test.ts` ejercitan este passthrough end-to-end (aunque no se pudieron correr en verde localmente — ver Issues Encountered).
- **Committed in:** `248cd90a` (parte del commit de Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Sin el fix la feature completa del plan (D-03, "el backend de /generate acepta el modo por día en el request") sería un no-op silencioso desde el cliente HTTP — `generateWeek` nunca vería `dayModes` aunque el JSON Schema lo aceptara. Cambio mínimo, mecánico, sin ampliar el alcance arquitectónico del plan.

## Issues Encountered

**Test de integración escrito y estructuralmente completo, pero NO verificado en verde localmente — colisión de MySQL de test confirmada, gate diferido a CI (autorizado explícitamente por el plan).**

- `pnpm exec tsc --noEmit` = 0 errores en las 3 iteraciones del código.
- Se intentó correr `test/sessions/generate-modes.test.ts` en foreground 3 veces (con `VITEST_POOL_ID=et159`, `VITEST_POOL_ID=et159x2`, y sin la variable), todas fallando en el MISMO punto (`beforeAll` de `createTestApp()`, ANTES de que corriera ninguno de los 6 casos — los 6 aparecen como "skipped" en el reporte, no "failed"): `Unknown column 'description' in field list` al consultar `formats` desde `src/modules/sessions/routes.ts:376`.
- Diagnóstico confirmado (no es un bug de este plan): había un proceso `vitest` de OTRO worktree (`et-173`, PID visible via `pgrep -af vitest`, corriendo `campaigns-*.test.ts` con `--no-file-parallelism`) activo en simultáneo, apuntando a la MISMA base compartida `eltemplo_test_1`. `test/setup.ts`'s `provisionWorkerDB()`/`test/setup-global.ts` recrean y remigran esa DB desde cero al arrancar cada corrida — mi conexión golpeó la tabla `formats` en un instante intermedio de esa remigración (antes de que la migración 0023, que agrega `description`, se hubiera aplicado).
- Se verificó además que `VITEST_POOL_ID` seteado por shell NO tiene efecto en Vitest 4 con `pool: "forks"`: el propio código de Vitest (`node_modules/.../vitest/dist/chunks/init.*.js:176`, `process.env.VITEST_POOL_ID = String(message.poolId)`) lo pisa incondicionalmente con un id 1..maxWorkers asignado por el pool. Con una sola corrida de un archivo, ese id es siempre `"1"` — igual que CUALQUIER otro worktree corriendo un solo archivo, así que la colisión sobre `eltemplo_test_1` es sistémica entre worktrees, no específica de esta sesión. (Esto contradice/actualiza la nota de la 159-03-SUMMARY sobre "VITEST_POOL_ID=et159" — con esta versión de Vitest la variable de entorno pre-seteada por shell no sobrevive al fork.)
- Se detectó también, vía `pgrep`, un proceso de OTRA sesión de agente corriendo un `while kill -0 <pid>; do sleep 5; done` — confirma que hay múltiples sesiones concurrentes activas sobre el mismo host de MySQL compartido en este momento, fuera del control de esta ejecución.
- Siguiendo la regla explícita del plan ("si tu MySQL de test no está disponible, dejá el gate a CI, pero DECLARALO explícitamente") y la prohibición de loops de espera/`pgrep`, se detuvo el reintento tras el 3er intento fallido con la misma causa raíz. **No se modificó `test/setup.ts` ni `vitest.config.ts`** (infraestructura compartida, fuera del alcance de este plan; cualquier fix de fondo — namespacing más robusto que `VITEST_POOL_ID`, o serializar el globalSetup entre worktrees — es una decisión de infraestructura para Franco, no un fix de plan).
- **Gate:** `pnpm exec vitest run test/sessions/generate-modes.test.ts` queda pendiente de verificación en verde por CI (ambiente aislado, sin colisión entre worktrees).
- Verificado al cierre: `pgrep -af vitest` no muestra ningún proceso vitest huérfano originado por esta sesión (solo el propio comando de `pgrep` y el proceso preexistente de `et-173`, ajeno a esta ejecución).

## Deferred Items

Ninguno agregado a `deferred-items.md` en este plan — no se encontraron issues fuera de alcance durante la ejecución (el único hallazgo, el wiring de `routes.ts`, se auto-arregló por Rule 2, no se difirió).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Este es el último plan de la fase 159 (wave 4, sin dependientes). Con este plan, el backend de "semana nueva" (modos combos/tecnica) queda completo end-to-end: tipos/validadores (159-01), pipeline compartido + selección de stretching (159-02), generadores (159-03), tabla de régimen semanal + migraciones (159-04), ruteo HTTP + badge (159-05), etiqueta derivada + rename Calistenia→General (159-06).

**Pendiente antes de dar la fase por cerrada:**
1. **Verificar en CI** el test `test/sessions/generate-modes.test.ts` (no confirmado en verde local — ver Issues Encountered). Si CI lo marca rojo por una razón DISTINTA a la colisión de DB documentada acá, investigar como bug real, no como el mismo falso rojo de infraestructura.
2. Los dos avisos para Franco que dejó 159-06 (doble push del fix de TV; efecto retroactivo del rename Calistenia→General) siguen pendientes, sin relación con este plan.
3. Verificación de fase completa (gsd-verifier → VERIFICATION.md) queda para después de este plan, per el handoff de ejecución.

Sin blockers de código para el cierre de la fase — el único pendiente es la confirmación en CI del test de integración.

---
*Phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu*
*Completed: 2026-08-14*

## Self-Check: PASSED

Verificados en disco: `el-templo-api/src/modules/admin/service.ts`, `el-templo-api/src/modules/admin/routes.ts`, `el-templo-api/test/sessions/generate-modes.test.ts`. Verificados en `git log --oneline --all`: `248cd90a` (Task 1 + deviation), `1a55c664` (Task 2). `pnpm exec tsc --noEmit` = 0 errores (última corrida, tras ambos commits). `pgrep -af vitest` sin procesos huérfanos originados por esta sesión.
