---
phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu
plan: 02
subsystem: api
tags: [sessions, pipeline, generators, calisthenics, determinism]

# Dependency graph
requires:
  - phase: 159-01
    provides: "BlockRole += COMBOS_I/COMBOS_II/TECNICA_I/TECNICA_II/STRETCHING; sessionMode += combos/tecnica"
provides:
  - "runSemanaNuevaBlockPipeline: orquestador de bloque que reemplaza Stage 1 (ruta inyectada) y reusa stages 2-7 del pipeline principal, con INITIUM delegado y catch con trace PIPELINE_ERROR"
  - "resolveRoutePool(pool, hashInput): helper puro de resolución de ruta por hash, exportado para los generadores de combos/tecnica"
  - "selectStretchingExercises(db, week, day): selección determinística de ~4 ejercicios de movilidad para el bloque STRETCHING, sin memberLevel"
  - "simpleHash compartido en pipeline/utils/deterministic-hash.ts"
affects: [159-03, 159-05, 159-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pipeline con Stage 1 reemplazado por ruta inyectada externamente (variante de D-P6, distinta de goal-plan-pipeline.ts que resuelve la ruta internamente vía GOAL_PLAN_ROUTE_MAP)"
    - "Selección determinística por simpleHash(`${week}-${day}-<sufijo>-${i}`) % pool.length, con dedup por id, para cualquier selección que deba repetirse idéntica entre múltiples generaciones del mismo (week, day)"

key-files:
  created:
    - el-templo-api/src/modules/sessions/pipeline/semana-nueva-pipeline.ts
    - el-templo-api/src/modules/sessions/pipeline/utils/deterministic-hash.ts
    - el-templo-api/src/modules/sessions/pipeline/utils/stretching-selection.ts
    - el-templo-api/test/unit/stretching-selection.test.ts
  modified: []

key-decisions:
  - "simpleHash se extrajo a un util compartido (utils/deterministic-hash.ts) en vez de duplicarse; goal-plan-pipeline.ts y stage-1-rotator.ts quedaron intactos (git diff vacío, confirmado)."
  - "selectStretchingExercises consulta el pool COMPLETO de MOVILIDAD (pattern='MOVILIDAD'), sin filtro por ruta/zona — a diferencia de mobility-selection.ts (que filtra por ROUTE_TO_MOBILITY_ROUTES), porque STRETCHING es un rol propio sin ruta asociada (D-11) y su firma es (db, week, day), sin blockRoute."
  - "runSemanaNuevaBlockPipeline define su propio SemanaNuevaPipelineOptions (extiende BlockPipelineOptions con route: string requerido) en vez de extender el BlockPipelineOptions compartido, para no acoplar el pipeline principal a un campo que solo usa esta variante."

requirements-completed: [SEM-03, SEM-04, SEM-06]

# Metrics
duration: 40min
completed: 2026-08-13
---

# Phase 159 Plan 02: Tronco compartido de los generadores (semana-nueva-pipeline + stretching-selection) Summary

**Pipeline de bloque con Stage 1 reemplazado por ruta inyectada (reusa stages 2-7 del pipeline principal) + selección determinística de ~4 ejercicios de movilidad para STRETCHING, sin `Math.random` y sin `memberLevel`, con test de determinismo verde.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-13
- **Tasks:** 2/2 completadas
- **Files modified:** 4 archivos nuevos, 0 modificados

## Accomplishments

- `runSemanaNuevaBlockPipeline` (molde exacto de `goal-plan-pipeline.ts`, D-P6): INITIUM delegado a `runInitiumPipeline`, Stage 1 reemplazado por la ruta recibida en `options.route`, stages 2-7 (`resolveSpom → deriveBudget → deriveContraction → selectFormat/forcedFormat → selectExercises → generatePrescriptions`) reusados sin modificar ni `goal-plan-pipeline.ts` ni `stage-1-rotator.ts` (verificado por `git diff` vacío y greps sin matches).
- `resolveRoutePool(pool, hashInput)` exportado: helper puro para que el generador de plan 03 resuelva la ruta antes de invocar el pipeline (COMBOS con rol en el hash, TECNICA sin rol para D-08).
- `selectStretchingExercises(db, week, day)`: función pura, sin `memberLevel`, sin `Math.random`, que reusa el pool/prescripción de `mobility-selection.ts` (D-12) pero reemplaza la selección aleatoria por `simpleHash` sobre el pool ordenado por `id` (anti Pitfall 1).
- `simpleHash` extraído a `pipeline/utils/deterministic-hash.ts`, compartido por ambos archivos nuevos, con el mismo cuerpo byte-a-byte que el de `goal-plan-pipeline.ts` (que queda sin tocar).
- Test de determinismo (`test/unit/stretching-selection.test.ts`, TDD RED→GREEN): 7 casos — determinismo entre 2 llamadas, 6 "niveles" simulados con exerciseId idénticos, ~4 ejercicios sin duplicados, degradación con pool < 4, pool vacío, spy de `Math.random` nunca invocado, prescripción correcta por `effort`.

## Task Commits

1. **Task 1: semana-nueva-pipeline.ts** - `9320c713` (feat)
2. **Task 2: stretching-selection.ts + test** - `7f59df95` (test, RED) → `024a62dd` (feat, GREEN)

_TDD: RED confirmado antes del commit `7f59df95` (7 tests fallando por módulo inexistente, corrida `pnpm exec vitest run test/unit/stretching-selection.test.ts` previa al `Write` de la implementación); GREEN confirmado tras `024a62dd` (7/7 verdes)._

## Files Created/Modified

- `el-templo-api/src/modules/sessions/pipeline/semana-nueva-pipeline.ts` - `runSemanaNuevaBlockPipeline` + `resolveRoutePool`, orquestador de bloque con Stage 1 inyectado
- `el-templo-api/src/modules/sessions/pipeline/utils/deterministic-hash.ts` - `simpleHash` compartido (extraído de `goal-plan-pipeline.ts`, cuerpo idéntico)
- `el-templo-api/src/modules/sessions/pipeline/utils/stretching-selection.ts` - `selectStretchingExercises`, selección pura de (week, day) para el bloque STRETCHING
- `el-templo-api/test/unit/stretching-selection.test.ts` - 7 tests de determinismo/estructura/prescripción

## Decisions Made

- **DRY de `simpleHash`:** se extrajo a un util compartido en vez de duplicar el cuerpo, sin tocar `goal-plan-pipeline.ts` (cumple el criterio de aceptación de `git diff` vacío en ese archivo).
- **`selectStretchingExercises` sin filtro por ruta:** a diferencia de `mobility-selection.ts` (que sí filtra por `ROUTE_TO_MOBILITY_ROUTES`), este selector consulta el pool COMPLETO de `MOVILIDAD` porque STRETCHING no tiene ruta asociada (D-11) y su firma explícitamente NO recibe `blockRoute`/`memberLevel`.
- **Opciones propias del pipeline nuevo:** `SemanaNuevaPipelineOptions` extiende `BlockPipelineOptions` (de `index.ts`, sin modificarlo) agregando `route: string` requerido, en vez de tocar la interfaz compartida.

## Deviations from Plan

**Ninguna deviación de código.** Una nota operativa sobre verificación (no es una desviación del plan, documentada por transparencia):

- Al correr `pnpm exec vitest run test/unit/stretching-selection.test.ts` por primera vez, faltaban `.env`/`.env.development` en el worktree (`et-159` es un checkout nuevo, esos archivos están gitignored). Se copiaron desde el checkout principal (`/home/franco/projects/el-templo/el-templo-api/`) sin commitear nada (confirmado con `git status --short` vacío sobre esos paths) — es config local de desarrollo, no un secreto nuevo.
- La primera corrida GREEN chocó dos veces con `Error: Unknown database 'eltemplo_test_1'`: había otro proceso `vitest` corriendo en paralelo en el worktree `et-tv2` (verificado con `ps aux`) usando el mismo nombre de DB de test por default (`eltemplo_test_1`, fallback cuando `VITEST_POOL_ID` no está seteado). Se resolvió pasando `VITEST_POOL_ID=et159` a la corrida (namespacing manual de la DB de test), sin tocar el proceso ajeno ni el código del repo. Tercera corrida: 7/7 verde.

## Self-Check: PASSED

Verificados los 4 archivos creados (existen en disco) y los 3 hashes de commit (`9320c713`, `7f59df95`, `024a62dd`) presentes en `git log --oneline --all`.
