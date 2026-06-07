---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 02
subsystem: ui
tags: [quasar, vue-flow, tree-map, difficulty-bands, dry-refactor]

# Dependency graph
requires:
  - phase: 128-editor-de-rbol-admin
    provides: TreeMapPage + ExerciseFlowNode (canvas Vue Flow con dl en el payload)
provides:
  - "constants/levels.ts: levelColor() única + DL_BANDS locked + dlBand() + bandTextClass()"
  - "ExerciseFlowNode: stripe 4px del color de banda + q-badge dl coloreado con tooltip"
  - "TreeMapPage: leyenda de 6 bandas en la toolbar con colapso responsive (<1100px → botón palette)"
affects: [133-06, 133-07, tree-map, member-tree-134]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "colors.getPaletteColor() de Quasar para usar tokens de paleta en style bindings (stripe)"
    - "DL_BANDS as const + tipo derivado DlBand para iterar bandas en templates"

key-files:
  created: []
  modified:
    - el-templo-admin/src/constants/levels.ts
    - el-templo-admin/src/pages/AlumnosPage.vue
    - el-templo-admin/src/pages/AlumnoDetailPage.vue
    - el-templo-admin/src/pages/SessionsPage.vue
    - el-templo-admin/src/components/sessions/EditableBlockCard.vue
    - el-templo-admin/src/components/treemap/ExerciseFlowNode.vue
    - el-templo-admin/src/pages/TreeMapPage.vue

key-decisions:
  - "Tooltip y leyenda colapsan el rango cuando min === max: 'alfa (dl 3)' / 'alfa 3' en vez de 'alfa (dl 3–3)'"
  - "Stripe via colors.getPaletteColor() (token Quasar → hex en runtime) en vez de hardcodear hexes"
  - "EditableBlockCard gana el caso kairos que su copia local no tenía (Rule 1 — bug post fase 129)"
  - "vue-tsc no está instalado en el admin: typecheck verificado con el vue-tsc de el-templo-web (sin instalar nada); errores pre-existentes documentados en deferred-items.md"

patterns-established:
  - "Banda de dificultad: dlBand(dl) → {level,min,max,color} | null; null/fuera de 1-12 → badge 'dl —' grey-6 sin stripe"
  - "Contraste sobre banda: bandTextClass() — charcoal (text-grey-10) sobre amber, blanco en el resto"

requirements-completed: [R2-BANDS]

# Metrics
duration: 6min
completed: 2026-06-07
---

# Phase 133 Plan 02: Bandas de dificultad + refactor DRY de levelColor Summary

**Bandas de dificultad visibles en el árbol (stripe 4px + badge dl con tooltip + leyenda responsive) con el mapeo LOCKED kairos 1-2 / alfa 3 / delta 4-6 / sigma 7-8 / omega 9-10 / spartan 11-12, y levelColor() consolidada en constants/levels.ts (antes duplicada verbatim en 4 archivos)**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-07T21:23:49Z
- **Completed:** 2026-06-07T21:30:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `constants/levels.ts` es la única fuente de `levelColor()` + nuevo `DL_BANDS` (as const, locked), `dlBand()` y `bandTextClass()` — disponibles para los planes 06/07
- AlumnosPage, AlumnoDetailPage, SessionsPage y EditableBlockCard refactorizadas para importar (definiciones locales eliminadas)
- ExerciseFlowNode: stripe `border-left: 4px solid` del color de banda (convive con `--manual`/`--selected` intactos) + `q-badge` dl coloreado con tooltip `{banda} (dl {min}–{max})`; dl null/fuera de rango → sin stripe, badge `dl —` grey-6
- TreeMapPage: leyenda de 6 chips iterando `DL_BANDS` alineada a la derecha de la toolbar; en viewport <1100px colapsa a `q-btn flat icon="palette"` con `q-menu`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extraer levelColor a constants/levels.ts + DL_BANDS + refactor DRY** - `5a404884` (refactor)
2. **Task 2: ExerciseFlowNode con stripe + badge dl, leyenda en toolbar** - `e42e58ac` (feat)

## Files Created/Modified

- `el-templo-admin/src/constants/levels.ts` - levelColor() única + DL_BANDS locked + dlBand() + bandTextClass()
- `el-templo-admin/src/pages/AlumnosPage.vue` - import desde constants/levels (definición local eliminada)
- `el-templo-admin/src/pages/AlumnoDetailPage.vue` - ídem
- `el-templo-admin/src/pages/SessionsPage.vue` - ídem
- `el-templo-admin/src/components/sessions/EditableBlockCard.vue` - ídem (+ gana el caso kairos)
- `el-templo-admin/src/components/treemap/ExerciseFlowNode.vue` - stripe de banda + q-badge dl con tooltip
- `el-templo-admin/src/pages/TreeMapPage.vue` - leyenda de bandas con colapso responsive

## Decisions Made

- Tooltip/leyenda colapsan rango con min === max (`alfa (dl 3)` en vez de `alfa (dl 3–3)`) — legibilidad, consistente con el label `alfa 3` del contrato C2
- Stripe usa `colors.getPaletteColor()` de Quasar para resolver el token a hex en runtime (el token sigue siendo la fuente de verdad, sin hexes hardcodeados)
- Typecheck local: el admin no tiene `vue-tsc` instalado y la regla del proyecto prohíbe instalar dependencias sin aprobación — se usó el binario de `el-templo-web/node_modules` (mismo monorepo, cero instalaciones)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] EditableBlockCard.levelColor no contemplaba kairos**

- **Found during:** Task 1 (extracción DRY)
- **Issue:** La copia local de `levelColor` en EditableBlockCard.vue no tenía el caso `kairos` (quedó desactualizada tras la fase 129) y no era case-insensitive; devolvía 'grey' para miembros kairos
- **Fix:** Al importar la versión canónica (extraída verbatim de AlumnosPage) la superficie gana kairos→amber-6 y case-insensitivity
- **Files modified:** el-templo-admin/src/components/sessions/EditableBlockCard.vue
- **Verification:** lint OK, typecheck sin errores nuevos
- **Committed in:** 5a404884 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Corrección inherente a la consolidación DRY; sin scope creep.

## Issues Encountered

- El comando de verificación del plan (`pnpm exec vue-tsc`) falla porque el admin no tiene `vue-tsc` como devDep (CI solo corre lint+build para el admin). Se verificó con el `vue-tsc` de `el-templo-web` comparando el set de errores antes/después de cada task: idéntico (cero errores nuevos). Los errores pre-existentes (p.ej. `extractError(err)` con 1 arg en AlumnoDetailPage, mismatch del emit `swap-exercise`) quedaron documentados fuera de scope en `deferred-items.md` de la fase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `DL_BANDS`/`dlBand`/`bandTextClass` listos para los planes 06 (drawer de revisión) y 07 (panel lateral) que muestran badges dl de banda
- UAT visual de R2-BANDS diferido al cierre de fase: abrir /tree-map, expandir una ruta, validar stripe + badge + leyenda + colapso responsive

## Self-Check: PASSED

- Archivos modificados verificados en disco (constants/levels.ts, ExerciseFlowNode.vue, TreeMapPage.vue)
- Commits `5a404884` y `e42e58ac` verificados en git log

---

_Phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul_
_Completed: 2026-06-07_
