---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 03
subsystem: api
tags: [sessions, generators, combos, tecnica, vitest]

# Dependency graph
requires:
  - phase: 178-01
    provides: "BlockRole con COMBOS_II_ALT/TECNICA_II_ALT, expectedFixedBlocks dinamico (4 ROM / 5 combos-tecnica) en isFixedStructureSession, diccionarios exhaustivos (FORMAT_COMPATIBILITY, INTENSITY_RANGES, roleToBlock, blockMap)"
provides:
  - "generateCombosSession/generateTecnicaSession emiten SIEMPRE 5 bloques fisicos: INITIUM -> *_I -> *_II -> *_II_ALT -> cierre"
  - "resolveDistinctRoutePool (semana-nueva-pipeline.ts): variante de resolveRoutePool que garantiza ruta distinta a una a evitar, shift al siguiente indice del pool en colision"
  - "17 tests unitarios verdes (combos/tecnica) cubriendo la nueva estructura de 5 bloques; generate-modes.test.ts actualizado para la integracion real"
affects: [178-05, 178-06, 178-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El bloque alt reusa el pool/forcedFormat del *_II pero su hashInput SIEMPRE incluye el rol (a diferencia de tecnica I/II que lo excluye a proposito) para caer en una ruta distinta -> exercises distintos via stage-6"
    - "secondRoleBlock se captura ANTES de generar el bloque alt para que el cierre FB de combos siga espejando intensity/repsBudget del II real, no del alt que pasa a ser el ultimo elemento de blocks[]"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/sessions/combos-generator.ts
    - el-templo-api/src/modules/sessions/tecnica-generator.ts
    - el-templo-api/src/modules/sessions/pipeline/semana-nueva-pipeline.ts
    - el-templo-api/test/unit/combos-generator.test.ts
    - el-templo-api/test/unit/tecnica-generator.test.ts
    - el-templo-api/test/sessions/generate-modes.test.ts

key-decisions:
  - "resolveDistinctRoutePool vive en semana-nueva-pipeline.ts (junto a resolveRoutePool, su base) en vez de duplicar la logica de shift en cada generador — compartida por combos y tecnica"
  - "El shift en colision es al SIGUIENTE indice del pool (no un segundo hash), determinista y trivial de razonar/testear"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~12min
completed: 2026-08-19
---

# Phase 178 Plan 03: Generadores combos/técnica emiten el 5º bloque alternativo Summary

**`generateCombosSession`/`generateTecnicaSession` emiten siempre un 5º bloque físico `COMBOS_II_ALT`/`TECNICA_II_ALT` — mismo pool y formato forzado que el `*_II`, ruta distinta vía hash que incluye el rol (con shift determinista al siguiente índice del pool si colisiona) — y los tres archivos de test de generadores/modos quedaron alineados a la nueva realidad de 5 bloques (17/17 verdes local).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-19T18:44:00Z
- **Completed:** 2026-08-19T18:56:00Z
- **Tasks:** 2 completadas
- **Files modified:** 6

## Accomplishments
- `assembleFixedStructureSession` gana el parámetro `altSpec`: genera el bloque alt vía `runSemanaNuevaBlockPipeline` entre el 2º role block y el cierre, con su propia traza `${prefix}_ALT_GENERATED`
- El cierre FB de combos sigue espejando `intensity`/`repsBudget` del `COMBOS_II` real (`secondRoleBlock`, capturado antes de pushear el alt) — el alt NUNCA contamina esos números
- `resolveDistinctRoutePool` (nueva función en `semana-nueva-pipeline.ts`): garantiza que la ruta del alt difiera de la del II, shifteando al siguiente índice del pool en colisión (T-178-03)
- `generateCombosSession`/`generateTecnicaSession` resuelven la ruta del alt con hash `${week}-${day}-{ROLE}_ALT` (combos ya incluía el rol para I/II; técnica lo excluye a propósito para I/II — el alt es la única excepción documentada en comentario)
- 17/17 tests unitarios verdes con `vitest.config.unit.ts` (sin DB), incluidos 6 tests nuevos que cubren estructura de 5 bloques, pool compartido, ruta/ejercicios distintos y posición del alt
- `el-templo-api` typecheckea con exactamente los 2 errores preexistentes de `tv/service.ts` (fuera de alcance, plan 178-06) — cero errores nuevos

## Task Commits

Each task was committed atomically:

1. **Task 1: assembleFixedStructureSession emite el bloque alt** - `fbd82ca3` (feat)
2. **Task 2: Tests de generadores (unit + integración de modos)** - `669f4a8a` (test)

**Plan metadata:** (pendiente, se agrega en el commit final de este plan)

## Files Created/Modified
- `el-templo-api/src/modules/sessions/combos-generator.ts` - `assembleFixedStructureSession` gana `altSpec`, genera y pushea el bloque alt, `secondRoleBlock` preserva los números del cierre FB, `generateCombosSession` resuelve `routeComboIIAlt` vía `resolveDistinctRoutePool`, docblocks 4→5 bloques
- `el-templo-api/src/modules/sessions/tecnica-generator.ts` - `generateTecnicaSession` resuelve `sharedRouteAlt` (única excepción que SÍ incluye el rol en el hash) y pasa `altSpec`, docblock 4→5 bloques
- `el-templo-api/src/modules/sessions/pipeline/semana-nueva-pipeline.ts` - nueva función exportada `resolveDistinctRoutePool`
- `el-templo-api/test/unit/combos-generator.test.ts` - `ROLE_ID_OFFSET` +`COMBOS_II_ALT`, `blocks.length` 4→5 en todos los asserts afectados, 2 tests nuevos (pool compartido/ruta distinta, posición del alt)
- `el-templo-api/test/unit/tecnica-generator.test.ts` - `ROLE_ID_OFFSET` +`TECNICA_II_ALT`, `blocks.length` 4→5, filtro de "misma ruta" (D-08) ahora excluye explícitamente el alt, 2 tests nuevos
- `el-templo-api/test/sessions/generate-modes.test.ts` - roles esperados +`COMBOS_II_ALT`/`TECNICA_II_ALT`, assert de ruta alt != ruta II, roundtrip varchar(20) cubre `COMBOS_II_ALT` (13 chars, el rol más largo hasta ahora)

## Decisions Made
- `resolveDistinctRoutePool` centralizada en `semana-nueva-pipeline.ts` junto a `resolveRoutePool` en vez de duplicar la lógica de shift en cada generador — un solo lugar para razonar sobre la garantía de "ruta distinta".
- El shift en colisión es determinista (siguiente índice del pool), no un segundo hash — más simple de testear y de explicar.
- En `tecnica-generator.test.ts`, el test de "TECNICA_I y TECNICA_II resuelven la MISMA ruta (D-08)" ahora filtra explícitamente por rol (`TECNICA_I`/`TECNICA_II`) en vez de "todo lo que no sea INITIUM" — con el alt sumándose a las llamadas del pipeline mockeado, el filtro viejo hubiera contado 3 en vez de 2.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- El worktree no tiene `.env`/`.env.development` con credenciales de MySQL (mismo hallazgo que 178-01), así que `test/sessions/generate-modes.test.ts` (integración, real DB + pipeline SPOM) no pudo correrse local — el global setup de vitest (`test/setup-global.ts`) intenta conectar a MySQL antes de que arranque cualquier test, independientemente de qué archivo se filtre. Se usó `vitest.config.unit.ts` (config dedicada sin DB) para correr los 17 tests unitarios de `combos-generator.test.ts`/`tecnica-generator.test.ts` en foreground — 17/17 verdes. Para `generate-modes.test.ts` se verificó por lectura cuidadosa + `esbuild` parse-check (sintaxis válida, sin transformar tipos). CI corre la suite completa con el catálogo SPOM sembrado.

## Next Phase Readiness

- Los generadores de combos/técnica están listos para que la TV (178-05/178-06) trate el bloque alt como sibling visual del II vía `displayRole`/`show_alternative`.
- El editor y el PDF (ya preparados por 178-01/178-02) reciben automáticamente el 5º bloque como una card/página propia — sin cambios adicionales necesarios en esos módulos por este plan.
- Bloqueante conocido y NO de este plan: los 2 errores de tsc en `tv/service.ts` (`deuterosAutoRotate`/`deuterosPinnedAt`) siguen pendientes de 178-06 (baja de la rotación + migración de esas columnas).

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED
