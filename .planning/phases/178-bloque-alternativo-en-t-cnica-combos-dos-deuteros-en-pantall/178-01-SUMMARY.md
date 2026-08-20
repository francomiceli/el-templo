---
phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall
plan: 01
subsystem: api
tags: [typescript, drizzle, sessions, validators, closed-union-refactor]

# Dependency graph
requires: []
provides:
  - "BlockRole union con COMBOS_II_ALT y TECNICA_II_ALT"
  - "FORMAT_COMPATIBILITY, INTENSITY_RANGES, roleToBlock y blockMap del editor exhaustivos para los roles alt"
  - "isFixedStructureSession: conteo dinámico (ROM=4, combos/técnica=5)"
affects: [178-02, 178-03, 178-04, 178-05, 178-06, 178-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cierre de unión BlockRole obliga a completar los 4 diccionarios exhaustivos/semiexhaustivos (FORMAT_COMPATIBILITY, INTENSITY_RANGES, roleToBlock switch, blockMap del editor) cada vez que se agrega un rol"

key-files:
  created: []
  modified:
    - el-templo-api/src/modules/sessions/types.ts
    - el-templo-api/src/modules/sessions/validators/block-validator.ts
    - el-templo-api/src/modules/sessions/validators/session-validator.ts
    - el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts
    - el-templo-api/src/modules/admin/edit-service.ts

key-decisions:
  - "isFixedStructureSession deriva expectedFixedBlocks (4 para ROM, 5 para combos/técnica) en vez de comparar contra una constante fija, siguiendo la letra del plan"
  - "roleToBlock mantiene el fallback muerto 'initium' para los roles alt, igual que el resto de combos/técnica — bypassean stage 5 vía forcedFormat"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~4min
completed: 2026-08-19
---

# Phase 178 Plan 01: Fundación de tipos y validadores del bloque alternativo Summary

**BlockRole gana COMBOS_II_ALT/TECNICA_II_ALT y los cuatro diccionarios exhaustivos que TypeScript obliga a completar (compatibilidad de formato, rangos de intensidad, roleToBlock, blockMap del editor), más el conteo fijo de bloques de combos/técnica pasa de 4 a 5.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-08-19T18:23:24Z
- **Completed:** 2026-08-19T18:27:25Z
- **Tasks:** 2 completadas
- **Files modified:** 5

## Accomplishments
- `BlockRole` (unión cerrada) incluye ahora `COMBOS_II_ALT` y `TECNICA_II_ALT`
- Los cuatro diccionarios que TypeScript exige completar quedaron exhaustivos: `FORMAT_COMPATIBILITY`, `INTENSITY_RANGES`, `roleToBlock` (switch de `stage-5-format.ts`) y `blockMap` de `getCompatibleFormats` en el editor
- `isFixedStructureSession`/Check 1 de `session-validator.ts` ahora deriva `expectedFixedBlocks` (4 para ROM, 5 para combos/técnica) en vez de una constante fija de 4
- `el-templo-api` typecheckea limpio: `pnpm exec tsc --noEmit` → 0 errores

## Task Commits

Each task was committed atomically:

1. **Task 1: Agregar los dos roles a BlockRole y completar compatibilidad/intensidad** - `06e35e8a` (feat)
2. **Task 2: Completar roleToBlock (stage 5) y blockMap del editor** - `acadc5b3` (feat)

**Plan metadata:** (pendiente, se agrega en el commit final de este plan)

## Files Created/Modified
- `el-templo-api/src/modules/sessions/types.ts` - `BlockRole` union +2 entradas, docblock actualizado
- `el-templo-api/src/modules/sessions/validators/block-validator.ts` - `FORMAT_COMPATIBILITY` +2 entradas (mismo array que `*_II`)
- `el-templo-api/src/modules/sessions/validators/session-validator.ts` - `INTENSITY_RANGES` +2 entradas, `isFixedStructureSession`/Check 1 con `expectedFixedBlocks` dinámico
- `el-templo-api/src/modules/sessions/pipeline/stage-5-format.ts` - `roleToBlock` switch exhaustivo +2 casos (fallback muerto, documentado)
- `el-templo-api/src/modules/admin/edit-service.ts` - `getCompatibleFormats` `blockMap` +2 entradas (`"nucleus"`, igual que II)

## Decisions Made
- `isFixedStructureSession` deriva `isRomSession` por separado (`sessionMode === "rom"` o algún bloque `ROM_*`) y usa esa condición para decidir `expectedFixedBlocks` (4 vs 5), en lugar de hardcodear 5 y hacer una excepción para ROM — sigue exactamente la letra del `<action>` del plan.
- Se mantuvo el patrón existente de "fallback muerto" en `roleToBlock` para los roles alt (retornan `"initium"`, nunca se ejecuta porque combos/técnica bypassean stage 5 vía `forcedFormat`), consistente con `COMBOS_I/II`, `TECNICA_I/II` y `STRETCHING`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- El worktree no tenía `node_modules` provisionado (deps del `pnpm-lock.yaml` existente, no un cambio de dependencias) — se corrió `pnpm install --frozen-lockfile` en `el-templo-api` para poder ejecutar `tsc`. Cero dependencias nuevas, lockfile intacto.
- El worktree no tiene `.env`/`.env.development` con credenciales de MySQL, así que la suite de tests (`vitest`) no pudo conectar localmente (`ER_ACCESS_DENIED_ERROR`). Consistente con la convención del repo de no correr la suite completa local (CI la corre); se verificó exclusivamente por `tsc --noEmit` + inspección de código, como piden los `phase_lessons`.
- **Nota para el plan 178-03 (generador):** los tests existentes `test/unit/combos-generator.test.ts` y `test/unit/tecnica-generator.test.ts` llaman a `validateSession()` sobre sesiones combos/técnica de **4 bloques** que el generador actual todavía emite (el generador no fue tocado en este plan — es responsabilidad de 178-03). Con el cambio de conteo de este plan (4→5 para combos/técnica), esos dos archivos de test van a fallar en CI **hasta que 178-03 actualice el generador para emitir el 5º bloque (`*_II_ALT`)**. Esto es una consecuencia esperada del orden de wave documentado en `178-CONTEXT.md` ("api-tipos → generador → TV → migración → tests") y no una regresión de este plan — se deja documentado para que no se lea como un bug al verificar la fase.

## Next Phase Readiness

- Los tipos y validadores del api están listos para que el generador (178-02/178-03) emita y edite el bloque alternativo como un rol real.
- Bloqueante conocido y esperado: 178-03 debe actualizar `combos-generator.ts`/`tecnica-generator.ts` para emitir 5 bloques (ver "Issues Encountered" arriba) antes de que la suite de tests de esos generadores vuelva a estar verde.

---
*Phase: 178-bloque-alternativo-en-t-cnica-combos-dos-deuteros-en-pantall*
*Completed: 2026-08-19*

## Self-Check: PASSED
