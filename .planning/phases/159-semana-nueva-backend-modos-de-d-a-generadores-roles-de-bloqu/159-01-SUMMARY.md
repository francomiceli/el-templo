---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
plan: 01
subsystem: api
tags: [drizzle, fastify, json-schema, typescript, sessions]

# Dependency graph
requires:
  - phase: 97-rom-mode-saturday-mobility
    provides: "Precedente directo del patrón (session_mode, roles de bloque propios, generador alternativo)"
provides:
  - "BlockRole extendido con COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING"
  - "DaySession.sessionMode acepta 'combos'/'tecnica' además de 'regular'/'rom'"
  - "Los dos Record<BlockRole,...> exhaustivos (FORMAT_COMPATIBILITY, INTENSITY_RANGES) cubren los 5 roles nuevos"
  - "validateSession detecta combos/tecnica como sesión de estructura fija de 4 bloques (sin ERROR espurio)"
  - "Body de POST /admin/sessions/generate acepta dayModes (override per-request) + additionalProperties:false"
  - "edit-service.ts blockMap mapea los 4 roles nuevos a la familia 'nucleus' de format_compatibility"
affects: [159-02, 159-03, 159-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Record<BlockRole, ...> exhaustivo como checklist de compilación al agregar roles de bloque"
    - "Detección de 'sesión de estructura fija' generalizada (rom | combos | tecnica) en vez de un if por modo"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/service.ts
    - el-templo-api/src/modules/sessions/validators/block-validator.ts
    - el-templo-api/src/modules/sessions/validators/session-validator.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/admin/schemas.ts
    - el-templo-api/src/modules/admin/edit-service.ts

key-decisions:
  - "D-01/D-02 aplicados: combos/tecnica son valores de sessionMode elegibles por request en /generate, NUNCA valores fijables de day_modes (PUT /admin/sessions/day-modes queda intacto en ['regular','rom'])"
  - "D-P4 aplicado: blockMap de edit-service.ts mapea los 4 roles nuevos a 'nucleus' (mysqlEnum existente); STRETCHING sin entrada (formato fijo, lista vacía es el comportamiento correcto)"
  - "Rule 3 (auto-fix): stage-5-format.ts roleToBlock() tenía un switch exhaustivo sobre BlockRole sin default — la extensión de la unión rompía tsc fuera de los dos Record ya previstos por el plan; se agregó el mismo bypass fallback que ya usan los roles ROM (combos/tecnica nunca llegan a stage-5, consistente con D-P6 del research)"

requirements-completed: [SEM-01, SEM-12]

# Metrics
duration: 20min
completed: 2026-08-14
---

# Phase 159 Plan 01: Extensión de tipos, validadores y body de /generate para combos/tecnica Summary

**BlockRole y sessionMode extendidos a los 5 roles/2 modos nuevos de "semana nueva", con los dos `Record<BlockRole,…>` exhaustivos actuando de checklist de compilación y el body de `/generate` cerrado con `additionalProperties:false` + enum de 4 modos — sin tocar el PUT day-modes ni agregar rutas HTTP.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-08-14T01:50Z (aprox.)
- **Completed:** 2026-08-14T02:11Z
- **Tasks:** 2/2
- **Files modified:** 7 (5 de Task 1, incluyendo 1 fix de deviation; 2 de Task 2)

## Accomplishments
- `BlockRole` acepta `COMBOS_I`, `COMBOS_II`, `TECNICA_I`, `TECNICA_II`, `STRETCHING`; `DaySession.sessionMode` acepta `"combos"` y `"tecnica"`.
- Los dos `Record<BlockRole, …>` exhaustivos (`FORMAT_COMPATIBILITY` en block-validator.ts, `INTENSITY_RANGES` en session-validator.ts) cubren los 5 roles nuevos con el formato/rango que pide el CONTEXT (Combos fijo, For Quality/Cluster/Accumulate X para técnica, Stretching fijo, intensidad 30-70 igual que ROM).
- `validateSession` generaliza la detección de "sesión de estructura fija de 4 bloques" a `rom | combos | tecnica` (antes solo ROM) — evita tanto el `sessionErrors` espurio del conteo de bloques como el `sessionWarnings` espurio de "último bloque debería ser ATHLOS/EPIKOS" para sesiones combos/tecnica (cuyo último bloque es STRETCHING).
- `generateWeekSchema.body` gana la propiedad opcional `dayModes` (objeto keyed por día, `additionalProperties` con shape `{type:"string", enum:[4 modos]}`) y `additionalProperties: false` a nivel del objeto body — única red de contención real dado que `sessions.session_mode` es `varchar(10)` sin `CHECK`.
- `admin/routes.ts` queda sin diff contra `origin/master`: el enum del PUT `/admin/sessions/day-modes` sigue en `['regular','rom']` (D-02) y no se agregó ninguna ruta HTTP nueva (ISO-01 / `ENTRADAS_BASELINE=370` intacto).
- `edit-service.ts` `blockMap` mapea `COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II` a `'nucleus'` (D-P4); `STRETCHING` queda sin entrada a propósito.
- `pnpm exec tsc --noEmit` verde en `el-templo-api`.

## Task Commits

1. **Task 1: Extender BlockRole y sessionMode; propagar a validadores y casts (módulo sessions)** - `b9521333` (feat)
2. **Task 2: Body de /generate (dayModes + enum + additionalProperties:false) + blockMap de edit-service** - `f36bc9f0` (feat)

**Plan metadata:** (pendiente — este commit de SUMMARY)

## Files Created/Modified
- `el-templo-api/src/modules/sessions/types.ts` - `BlockRole` += 5 roles; `DaySession.sessionMode` += `combos`/`tecnica`; docblocks actualizados
- `el-templo-api/src/modules/sessions/service.ts` - los dos casts `as "regular" | "rom"` (líneas 738/869 en master) ampliados a la unión de 4 valores
- `el-templo-api/src/modules/sessions/validators/block-validator.ts` - `FORMAT_COMPATIBILITY` exhaustivo con los 5 roles nuevos
- `el-templo-api/src/modules/sessions/validators/session-validator.ts` - `INTENSITY_RANGES` exhaustivo + `isRomSession` renombrado/generalizado a `isFixedStructureSession` (checks 1 y 7)
- `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts` - (deviation Rule 3) `roleToBlock()` — switch exhaustivo sobre `BlockRole` sin `default`, se agregó el bypass fallback de los 5 roles nuevos (mismo patrón que ROM)
- `el-templo-api/src/modules/admin/schemas.ts` - `generateWeekSchema.body` += `dayModes` + `additionalProperties: false`
- `el-templo-api/src/modules/admin/edit-service.ts` - `blockMap` += 4 roles → `'nucleus'`

## Decisions Made
- D-01/D-02 (CONTEXT): combos/tecnica son exclusivamente un override per-request del body de `/generate`, nunca un valor fijable de `day_modes`. No se tocó `admin/routes.ts`.
- D-P4 (CONTEXT, decisión de plan-phase): `blockMap` no exhaustivo (no falla tsc) — los 4 roles nuevos con contenido variable mapean a `'nucleus'`; `STRETCHING` (formato fijo) queda sin mapeo intencionalmente.
- Convención de nombres: estilo `ROM_*` (UPPER_SNAKE) para los 5 roles nuevos, tal como pedía el plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking build error] `stage-5-format.ts` no compilaba tras extender `BlockRole`**
- **Found during:** Task 1 (verificación `tsc --noEmit`)
- **Issue:** `roleToBlock()` en `pipeline/stage-5-format.ts` es un `switch` exhaustivo sobre `BlockRole` sin `default`, distinto de los dos `Record<BlockRole,…>` que el plan anticipaba explícitamente (`FORMAT_COMPATIBILITY`, `INTENSITY_RANGES`). Al agregar los 5 roles nuevos a la unión, TypeScript reportó `TS2366: Function lacks ending return statement` porque el switch dejó de ser exhaustivo — bloqueaba el gate duro de verificación del plan.
- **Fix:** se agregaron los 5 `case` nuevos (`COMBOS_I`, `COMBOS_II`, `TECNICA_I`, `TECNICA_II`, `STRETCHING`) con el mismo fallback (`return "initium"`) y el mismo comentario de "nunca debería llegar acá" que ya usan los roles `ROM_*` — consistente con D-P6 del RESEARCH (combos/tecnica bypasean stage-5 vía el pipeline dedicado que construirán los planes 02/03).
- **Files modified:** `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts`
- **Verification:** `pnpm exec tsc --noEmit` verde después del fix.
- **Committed in:** `b9521333` (parte del commit de Task 1)

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Fix mecánico y mínimo, consistente con un patrón ya existente en el mismo archivo (el bypass de ROM). No agrega comportamiento nuevo ni cambia el alcance del plan — es la misma clase de "checklist de compilación" que el plan ya invocaba para los dos `Record<BlockRole,…>`, aplicado a un tercer sitio exhaustivo que el plan no había mapeado.

## Issues Encountered
El worktree `et-159` no tenía `node_modules` instalado (worktree recién creado). Se corrió `pnpm install --frozen-lockfile` dentro de `el-templo-api` para poder ejecutar `tsc` — instala exactamente lo que fija `pnpm-lock.yaml`, no agrega ni actualiza ninguna dependencia.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Los tipos, validadores y el body de `/generate` ya reconocen combos/tecnica y los 5 roles nuevos. Los planes 02/03 (generadores `combos-generator.ts`/`tecnica-generator.ts` + `semana-nueva-pipeline.ts`) pueden construir sobre esta base sin volver a tocar `types.ts`/los dos `Record` exhaustivos. El plan 05 (ruteo en `admin/service.ts` `generateWeek`) puede consumir `dayModes` del body ya validado.

Sin blockers. `admin/routes.ts` queda sin diff contra `origin/master`, así que el trabajo de TV (D-P3, doble push staging/master) sigue siendo responsabilidad de un plan posterior de esta misma fase, no de este plan.

---
*Phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu*
*Completed: 2026-08-14*

## Self-Check: PASSED

Todos los archivos listados en Files Created/Modified existen en disco; los dos commits de tarea (`b9521333`, `f36bc9f0`) existen en el historial de git.
