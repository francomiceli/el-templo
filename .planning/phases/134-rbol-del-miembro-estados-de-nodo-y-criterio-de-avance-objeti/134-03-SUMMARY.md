---
phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti
plan: 03
subsystem: ui
tags: [vue, quasar, training, player, progression]

# Dependency graph
requires:
  - phase: 131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado
    provides: "adjust row (más fácil / más difícil) + dominado/bajado tap in BlockProgressionView"
provides:
  - "Objective advance criterion (R5, D-07) rendered in the player next to the fase-131 adjust row"
  - "advanceCriterion computed derived from currentSlideExercise.contraction (ISO vs CON/EXC)"
affects: [member-app-player, tree-quality, dominado-criterion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Runtime-derived label from data already on the slide — no migration, no new column, impossible to desync (D-07)"

key-files:
  created: []
  modified:
    - el-templo-app/src/modules/training/components/BlockProgressionView.vue

key-decisions:
  - "Criterion derived in runtime from contraction; ISO → 'Objetivo: 3×30s', CON/EXC/null → 'Objetivo: 3×8 (reinicia en 3×5)'"
  - "Additive text only — fase-131 adjust mechanic (onAdjust/canAdjustCurrentSlide) untouched"
  - "Muted caption styled with $secondary brand token (no blue)"

patterns-established:
  - "Player labels can be derived deterministically from existing prescription fields instead of new backend contract fields"

requirements-completed: [R5]

# Metrics
duration: ~10min
completed: 2026-06-08
---

# Phase 134 Plan 03: Criterio de avance objetivo en el player Summary

**El player muestra el criterio falsable de "dominado" (3×30s isométrico / 3×8 dinámico) derivado en runtime de la contracción del ejercicio, junto al adjust row de fase 131, sin migración ni columna nueva.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-08
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Computed `advanceCriterion` en `BlockProgressionView.vue` que lee `currentSlideExercise.value?.contraction`: `ISO` → `'Objetivo: 3×30s'`; `CON`/`EXC`/null → `'Objetivo: 3×8 (reinicia en 3×5)'`.
- Línea de criterio renderizada dentro de la región `v-if="canAdjustCurrentSlide"`, encima de los dos botones de ajuste, de modo que aparece solo en slides reales, activos y no-mobility.
- La mecánica de ajuste de fase 131 (`onAdjust`, `canAdjustCurrentSlide`, tap dominado/bajado) queda intacta — el texto es complementario, no la reemplaza (D-07).
- Estilo de caption muted con `rgba($secondary, 0.65)` (paleta de marca, sin azul).

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive and render the advance criterion next to the adjust row** - `79840720` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified

- `el-templo-app/src/modules/training/components/BlockProgressionView.vue` - Nuevo computed `advanceCriterion` + línea de criterio en el detalle del player, envuelta junto al adjust row en un wrapper `__detail-adjust`; estilos `__detail-criterion` / `__detail-adjust`.

## Decisions Made

- **Wrapper de layout:** se envolvió el `__detail-adjust-row` existente en un contenedor `__detail-adjust` (flex column) para apilar el criterio sobre los botones, sin alterar el flex-row de los botones ni su comportamiento. Cambio puramente presentacional.
- **Fallback de contracción:** valores no-ISO (incluido `null`/desconocido) caen al criterio dinámico, según el plan (CON/EXC y null → "3×8").

## Deviations from Plan

None - plan executed exactly as written. (El wrapper `__detail-adjust` es el layout fino a discreción que el plan delega: "directamente arriba o abajo de los dos botones".)

## Issues Encountered

- **Typecheck via vue-tsc no disponible:** el comando del plan (`pnpm exec vue-tsc --noEmit`) no resuelve porque `vue-tsc` no está instalado como binario en este monorepo (no figura en `package.json`; el typecheck de SFCs corre en el build de Quasar / CI). La primera ejecución filtrada devolvió 0 errores justamente porque el binario no produjo salida. Se verificó en su lugar con `pnpm exec eslint` sobre el archivo (parser typescript-eslint sobre el SFC), exit 0. El cambio es aditivo, sin `any`, sin `console`, leyendo un campo existente (`contraction: string`).

## Threat Surface Scan

No new surface. T-134-06 (criterion text) es presentación pura sobre datos ya cargados de la sesión del propio miembro; T-134-07 (adjust mechanic) mitigado: `onAdjust`/`canAdjustCurrentSlide` no se tocaron. Sin endpoints, auth paths ni cambios de schema.

## Known Stubs

None.

## Next Phase Readiness

- R5 (criterio de avance objetivo en el player) entregado a nivel código. Empareja con el estado "dominado" por-evidencia de los otros planes de la fase 134.
- Cambio visual → pendiente UAT manual en el player (member app) al final de la fase, junto al resto del refresh de Mi Árbol.
- Sin push (workflow staging-first local). Sin migraciones en este plan.

## Self-Check: PASSED

- `134-03-SUMMARY.md` exists
- `el-templo-app/src/modules/training/components/BlockProgressionView.vue` exists
- Commit `79840720` present in git history

---

_Phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti_
_Completed: 2026-06-08_
