---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 06
subsystem: api
tags: [tv, fastify, drizzle, mysql, vitest]

# Dependency graph
requires:
  - phase: 178-01
    provides: "BlockRole con COMBOS_II_ALT/TECNICA_II_ALT, diccionarios exhaustivos"
  - phase: 178-02
    provides: "ROLE_LABELS/ROLE_BADGE_LABELS con COMBOS_II_ALT/TECNICA_II_ALT"
  - phase: 178-03
    provides: "generateCombosSession/generateTecnicaSession emiten el 5º bloque alt"
  - phase: 178-04
    provides: "Migración 0206 (drop rotación, add show_alternative) + schema Drizzle tv.ts"
provides:
  - "buildColumns 2×2 de deuteros (día regular): hasta 4 columnas (2 deuteros × par de niveles), con guard que omite (rol, nivel) sin bloque resuelto en vez de emitir una columna rota"
  - "buildClassPayload con toggle showAlternative: swap efímero de displayRole al bloque alt (COMBOS_II_ALT/TECNICA_II_ALT) cuando el II está activo, timer siempre sobre el bloque persistido, título resuelto vía blockTitle sin depender del array canónico"
  - "visualGroupOf colapsa *_II_ALT en el grupo visual del II (sibling, no navegable) — COMBOS_ROLES/TECNICA_ROLES SIN el rol alt"
  - "TvControlState/TvStateWrite/schema de write: showAlternative reemplaza deuterosAutoRotate/deuterosPinnedAt; rotación automática erradicada del backend (cálculo, writeState, tipos, schemas, tests)"
affects: [178-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El alt vive fuera de los arrays canónicos del roster (COMBOS_ROLES/TECNICA_ROLES) y se resuelve por helpers directos (resolveBlock + blockTitle) en vez de por índice — separa los dos consumidores de buildRoster (buildClassPayload vs. toControlContext/navegación) sin que el navegable se entere del alt"
    - "summary/blockIndex de buildClassPayload resuelven SIEMPRE contra el bloque PERSISTIDO (state.blockRole), nunca contra displayRole — evita blockIndex=-1/title=\"\" cuando el bloque mostrado no está en el roster real"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/tv/types.ts
    - el-templo-api/src/modules/tv/schemas.ts
    - el-templo-api/src/modules/tv/roster.ts
    - el-templo-api/src/modules/tv/service.ts
    - el-templo-api/test/tv/tv-service.test.ts
    - el-templo-api/test/tv/tv-control.test.ts
    - el-templo-api/test/unit/rotator-cycle.test.ts

key-decisions:
  - "El test que verifica el rechazo del campo viejo deuterosAutoRotate (schema additionalProperties:false, 400) mantiene el literal 'deuterosAutoRotate' en tv-control.test.ts — el <action> del plan lo pide explícitamente, aunque el acceptance_criteria literal del plan pedía grep==0 sobre 'deuterosAutoRotate' en todo test/tv/. Se prioriza el <action> (regresión funcional real) sobre el grep literal del acceptance_criteria: es la única ocurrencia y es intencional, no rastro de rotación viva."
  - "Verificación de los 2 archivos de test vía tsc con include temporal (test/**/*), no vitest run: este worktree no tiene credenciales MySQL locales (mismo hallazgo que 178-01/178-03) — mysql2 devuelve ER_ACCESS_DENIED_ERROR antes de que corra un solo test. tsc con test/ incluido confirma 0 errores nuevos en modules/tv y test/tv (los ~34 preexistentes en otros módulos son la deuda documentada en STATE.md, ajena a este plan). CI corre la suite real."

patterns-established: []

requirements-completed: []

# Metrics
duration: ~35min
completed: 2026-08-19
---

# Phase 178 Plan 06: Refactor del backend TV — 2×2 de deuteros + toggle del bloque alt + baja de la rotación Summary

**`TvService.buildColumns`/`buildClassPayload` reescritos: días regulares muestran los dos deuteros juntos (2×2, con guard contra deutero faltante), días técnica/combos suman el toggle `showAlternative` que swapea al bloque alt (`*_II_ALT`) compartiendo cronómetro y resolviendo el título sin depender del roster canónico, y la rotación automática de deuteros queda erradicada de tipos, schemas, servicio y tests — `tsc --noEmit` en 0 errores, cerrando la deuda que 178-04 dejó documentada.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-19T19:05:00Z (aprox., tras 178-05)
- **Completed:** 2026-08-19T19:18:11Z
- **Tasks:** 3 completadas
- **Files modified:** 7 (4 de servicio, 3 de test)

## Accomplishments
- **Contrato de estado sin rotación:** `TvControlState`/`TvStateWrite` (types.ts), `tvControlStateSchema` (schemas.ts) y el mapeo de `readState`/`writeState`/`persistState` (service.ts) reemplazan `deuterosAutoRotate`/`deuterosPinnedAt` por `showAlternative: boolean` (arranca en `false`); `additionalProperties: false` rechaza el campo viejo con 400 en vez de ignorarlo.
- **`visualGroupOf` (roster.ts)** colapsa `COMBOS_II_ALT`/`TECNICA_II_ALT` al grupo visual del II — sibling visual, comparte índice de bloque y cronómetro, pero `COMBOS_ROLES`/`TECNICA_ROLES` (los arrays que alimentan `buildRoster` → `context.blocks` del control) **no** llevan el rol alt: no es un paso navegable de ANTERIOR/SIGUIENTE (decisión LOCKED del CONTEXT de la fase).
- **`buildColumns` 2×2:** cuando el bloque activo es deuteros, itera `["DEUTEROS_1", "DEUTEROS_2"]` × el par de niveles del control (hasta 4 columnas), con guard por `(rol, nivel)` que omite la columna si `resolveBlock` no encuentra el bloque — un día regular con solo `DEUTEROS_1` emite 2 columnas, nunca una columna rota o vacía. Headers prefijados con `ROLE_LABELS` ("DEUTEROS I"/"DEUTEROS II") para distinguir las 4.
- **`buildClassPayload` con swap del alt:** reemplaza el cálculo de rotación (elapsed/10s, pisada de 30s) por un swap efímero — con `showAlternative` prendido y el bloque persistido `COMBOS_II`/`TECNICA_II`, `displayRole` pasa al alt si `resolveBlock` lo encuentra (defensivo para sesiones viejas sin el 5º bloque). El **timer siempre se calcula sobre `state.blockRole` persistido**, nunca sobre el alt. Fix del blocker de título: `summary`/`blockIndex` resuelven contra el bloque **persistido** (siempre en el roster), y el título se computa vía `blockTitle(displayRole, block)` cuando el toggle está activo, sin depender de `blocks.findIndex` (que daría -1 para el alt).
- **Tests:** borrado `test/unit/rotator-cycle.test.ts`; reemplazados los 2 tests de rotación de `tv-service.test.ts` y `tv-control.test.ts` por: 2×2 completo con headers distinguibles, guard con un solo deutero presente, toggle del alt (blocker: título/timer/visualBlockIndex), persistencia + rechazo del campo viejo, y "el alt no es navegable" (context.blocks del control es el canónico de 4 en un día técnica con 5 bloques físicos).

## Task Commits

Each task was committed atomically:

1. **Task 1: Contrato de estado — sacar rotación, agregar showAlternative** - `3ae54626` (feat)
2. **Task 2: buildColumns 2×2 + buildClassPayload con toggle alt, sin rotación** - `397ec743` (feat)
3. **Task 3: Tests de TV (2×2, guard, toggle) y borrado de tests de rotación** - `1388869b` (test)

**Plan metadata:** (este commit)

## Files Created/Modified
- `el-templo-api/src/modules/tv/types.ts` - `TvControlState`/`TvStateWrite`: `showAlternative` reemplaza los 2 campos de rotación
- `el-templo-api/src/modules/tv/schemas.ts` - write schema acepta `showAlternative`, no `deuterosAutoRotate`
- `el-templo-api/src/modules/tv/roster.ts` - `visualGroupOf` colapsa `*_II_ALT` en el grupo del II; arrays canónicos sin tocar
- `el-templo-api/src/modules/tv/service.ts` - import de `blockTitle`/`ROLE_LABELS`; `readState`/`writeState`/`persistState` mapean `showAlternative`; `buildColumns` 2×2 con guard; `buildClassPayload` con swap del alt y fix de título
- `el-templo-api/test/tv/tv-service.test.ts` - fixtures actualizadas, 3 tests nuevos (2×2, guard, toggle)
- `el-templo-api/test/tv/tv-control.test.ts` - `ControlState` sin rotación, test de persistencia+rechazo, describe nuevo de "alt no navegable"
- `el-templo-api/test/unit/rotator-cycle.test.ts` - borrado (rotación eliminada)

## Decisions Made
- El swap del alt es defensivo: si `resolveBlock(classDay, altRole, state.level)` no encuentra el bloque (sesión vieja sin el 5º bloque generado), el toggle no tiene efecto visual — nunca se cae a un `blockRole` que no existe.
- `blockIndex`/`summary`/`shared` de `buildClassPayload` se resuelven contra `state.blockRole` (persistido) en vez de `effState.blockRole` (mostrado): en día regular no cambia nada (son el mismo valor siempre), y es lo que evita el bug de título vacío al prender el toggle en combos/técnica.
- Ver key-decisions del frontmatter para la justificación de mantener el literal `deuterosAutoRotate` en un test negativo y el método de verificación sin DB local.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical / conflicto de acceptance criteria] Test de rechazo del campo viejo mantiene el literal `deuterosAutoRotate`**
- **Found during:** Task 3
- **Issue:** El `<action>` del Task 3 pide explícitamente probar "el write con el campo viejo `deuterosAutoRotate` es rechazado por el schema", pero el `<acceptance_criteria>` del mismo task pide `grep -rc 'deuterosAutoRotate\|rotator\|rotación automática' el-templo-api/test/tv/ == 0`. Ambos no pueden cumplirse a la vez: probar el rechazo requiere el literal.
- **Fix:** Se priorizó la cobertura funcional explícitamente pedida (el rechazo es la garantía real de que el campo viejo no resucita en silencio) sobre el grep literal. Es la única ocurrencia en los 2 archivos tocados.
- **Files modified:** `el-templo-api/test/tv/tv-control.test.ts`
- **Verification:** `grep -n 'deuterosAutoRotate' test/tv/*.test.ts` → 1 ocurrencia, dentro de un `postState(...)` que se afirma `statusCode === 400`.
- **Committed in:** `1388869b` (Task 3 commit)

---

**Total deviations:** 1 (conflicto interno del plan entre `<action>` y `<acceptance_criteria>` de la misma task)
**Impact on plan:** Ninguno funcional — el código de producción no tiene rastro de rotación (verificado por grep sobre `src/modules/tv/`). El único desvío es un grep literal sobre archivos de test que, de cumplirse al pie de la letra, habría dejado sin cubrir un requisito explícito del propio plan.

## Issues Encountered
- Sin credenciales MySQL en este worktree (`.env`/`.env.development` presentes pero vacíos): `npx vitest run test/tv/tv-service.test.ts` falla en el `beforeAll` global con `ER_ACCESS_DENIED_ERROR` antes de ejercitar un solo test — mismo hallazgo que 178-01/178-03. Se verificó en su lugar con `tsc --noEmit` sobre un tsconfig temporal (`include: ["src/**/*", "test/**/*"]`, `extends` del tsconfig real): 0 errores en `modules/tv` y `test/tv/`; los ~34 errores restantes son deuda preexistente de otros módulos (tests de `analytics`/`admin` con problemas de tipos no relacionados, documentada en STATE.md como "185 errores preexistentes, 0 en `src/`"). CI corre la suite completa contra MySQL real.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- El backend TV expone el contrato completo que 178-07 (frontend) necesita: `TvClassPayload.columns` con hasta 4 columnas en días regulares, `blockRole`/`title` swapeados al alt cuando `showAlternative` está prendido (persistido, no efímero de rotación), y `TvControlState.showAlternative` para el botón "Ver alternativo" del control.
- **Pendiente conocido, dueño de 178-07 (no de este plan):** `el-templo-admin/src/composables/useTvApi.ts` (líneas 84/86/122) y `el-templo-admin/src/pages/TvControlPage.vue` (líneas 218-222, 662-663, 883) siguen referenciando `deuterosAutoRotate`/`deuterosPinnedAt` — funcionalmente esos campos ahora siempre llegan `undefined` del backend (el toggle de rotación del control admin queda roto hasta que 178-07 lo reemplace por el botón "Ver alternativo" + `showAlternative`). El admin no typecheckea en CI (`reference_ci_no_typecheck_frontends`), así que esto no rompe el pipeline, pero es funcionalmente inconsistente hasta que 178-07 cierre.
- `el-templo-api` queda con `tsc --noEmit` en 0 errores — cierra la deuda documentada por 178-04.

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED
