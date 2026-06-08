---
phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree
plan: 04
subsystem: admin-ui
tags: [tree-map, vue-flow, milestone-variants, render, treemap, quasar]

# Dependency graph
requires:
  - phase: 135-03
    provides: "GET /admin/tree-editor/tree embeds variants[] ({id,name,dl}, dl asc) per hito node"
provides:
  - "TreeNode.variants: MilestoneVariant[] (frontend 1:1 mirror of the backend contract)"
  - "ExerciseFlowNode chevron + '+N variantes' counter (emits toggleVariants)"
  - "VariantFlowNode component — banded variante sub-node (dlBand color + dl number)"
  - "TreeMapPage expandedMilestones state + toggleMilestone + variant sub-node/edge render with band-extent layout"
affects: [tree-map admin canvas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page-owned expansion state (expandedMilestones: Set<number>) mirroring expandedRoutes — node component is stateless, only emits (D-10)"
    - "Band height measured as a pixel EXTENT (chainBottomY) instead of a node count, so expanded variant rows are accounted for and bands never overlap"
    - "Variant sub-nodes use a dedicated 'variant' node type (non-draggable/non-selectable) so onNodeDragStop/onNodeClick — which filter 'exercise' — never touch them"

key-files:
  created:
    - el-templo-admin/src/components/treemap/VariantFlowNode.vue
  modified:
    - el-templo-admin/src/types/tree-editor.ts
    - el-templo-admin/src/components/treemap/ExerciseFlowNode.vue
    - el-templo-admin/src/pages/TreeMapPage.vue

key-decisions:
  - "variants rendered as a dedicated 'variant' Vue Flow node type (own component) rather than reusing the exercise node — keeps drag-reorder (exercise-only) and selection untouched, and gives variants a distinct read-only visual (dashed border, grey-1 fill)"
  - "band-height accounting switched from maxChainLen (count) to maxChainExtent (px) so the longest chain + its expanded variant rows define the band height; the original count-based formula could not express variable variant-row heights"
  - "hito→variante edges use the existing XRUTA_EDGE_STYLE (grey-8 dashed '8 4') — visually distinct from the terracotta/auto backbone chain, signalling 'not a chain step'"
  - "expandedMilestones also cleared in collapseAll and filtered post-refetch to surviving variant-bearing exerciseIds (mirrors the expandedRoutes cleanup)"

patterns-established:
  - "Collapsible per-node child collections on a Vue Flow band canvas: page-owned Set state + stateless node emit + extent-based band height"

requirements-completed: [B-RENDER]

# Metrics
duration: ~12min
completed: 2026-06-08
---

# Phase 135 Plan 04: Render jerárquico hito→variante en el árbol del admin Summary

**El canvas /tree-map ahora dibuja el nivel hito→variante: cada hito con variantes muestra un chevron + chip "+N variantes" y arranca colapsado (D-10); al expandir, sus variantes cuelgan abajo con su banda de dificultad (dlBand kairos→spartan) y su dl, ordenadas por dl ascendente, sin solaparse con bandas vecinas — colapsando la fila plana de Front Lever en hitos canónicos con variantes guardadas debajo.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-08
- **Completed:** 2026-06-08
- **Tasks:** 2 implementación + 1 checkpoint de verificación humana
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments

- `TreeNode` gana `variants: MilestoneVariant[]` (espejo 1:1 del contrato del Plan 03; `MilestoneVariant` ya existía en types).
- `ExerciseFlowNode`: `ExerciseNodeData` gana `variants[]` + `variantsExpanded`; `defineEmits<{ toggleVariants: [exerciseId: number] }>()`. Chevron (`unfold_more`/`unfold_less`, patrón de `RouteFlowNode`) y chip "+N variantes" renderizan **solo** cuando `variants.length > 0`; el chip se oculta al expandir. El toggle va por `@click.stop` (chevron y chip) → la selección del nodo para el panel lateral sigue intacta. El componente NO guarda estado de expansión (D-10).
- `VariantFlowNode.vue` (nuevo): sub-nodo read-only de variante con stripe + badge de banda vía `dlBand`/`bandTextClass`, no arrastrable / no seleccionable.
- `TreeMapPage`: `expandedMilestones` (`Set<number>`, arranca vacío = colapsado por defecto) + `toggleMilestone` (espejo de `toggleRoute`, clona el Set, togglea, `rebuildGraph`). El loop de la cadena setea `variants`/`variantsExpanded` en la data del hito; los hitos expandidos empujan sub-nodos de variante (posición debajo del hito, banda por `dlBand`, dl) y aristas hito→variante con `XRUTA_EDGE_STYLE` (gris discontinuo, distinto del backbone).
- **Layout de altura de banda** migrado de conteo (`maxChainLen`) a extensión en px (`maxChainExtent`/`chainBottomY`): la banda crece para cubrir la cadena más larga **más** sus filas de variante expandidas, evitando solapamiento.
- `collapseAll` y la limpieza post-refetch ahora también gestionan `expandedMilestones` (filtrado a exerciseIds que aún tienen variantes).
- Slot `#node-exercise` cableado con `@toggle-variants="toggleMilestone"`; nuevo slot `#node-variant`; `minimapColor` cubre el tipo `variant`.

## Task Commits

1. **Task 1: Mirror variants[] in TreeNode + chevron/counter on ExerciseFlowNode (B4/B5)** - `8a589345` (feat)
2. **Task 2: Page expansion state + variant sub-node/edge render + band-extent layout (B6)** - `64d999fa` (feat)

## Files Created/Modified

- `el-templo-admin/src/types/tree-editor.ts` - `TreeNode.variants: MilestoneVariant[]` (forward-ref a la interfaz declarada más abajo; OK por hoisting).
- `el-templo-admin/src/components/treemap/ExerciseFlowNode.vue` - `variants`/`variantsExpanded` en data, `toggleVariants` emit, chevron + chip "+N variantes" (solo con variantes; chip oculto al expandir), `@click.stop`.
- `el-templo-admin/src/components/treemap/VariantFlowNode.vue` - nuevo sub-nodo de variante banda+dl, read-only.
- `el-templo-admin/src/pages/TreeMapPage.vue` - `expandedMilestones` + `toggleMilestone`, render de sub-nodos/aristas de variante en el loop, altura de banda por extensión, limpieza en `collapseAll`/post-refetch, slots + minimap.

## Decisions Made

- **Tipo de nodo dedicado `variant`** (componente propio) en vez de reusar el nodo exercise: mantiene el drag-reorder (solo 'exercise') y la selección sin tocar, y da a la variante un visual read-only distinto (borde discontinuo, fondo grey-1). `onNodeDragStop`/`onNodeClick` filtran por `'exercise'`, así que los sub-nodos de variante quedan inertes por construcción.
- **Altura de banda por extensión en px** (`maxChainExtent`) en lugar de conteo de nodos: el formato original por conteo no podía expresar las alturas variables de las filas de variante.
- **Aristas hito→variante con `XRUTA_EDGE_STYLE`** (gris-8 discontinuo) para distinguirlas del backbone terracota/auto.
- **Default colapsado (D-10)**: `expandedMilestones` arranca vacío; estado en la página, no en el componente.

## Deviations from Plan

**1. [Rule 3 - Blocking] El comando de verificación del plan usaba `vue-tsc`, que no está instalado en el proyecto.**

- **Found during:** Task 1 verify.
- **Issue:** `pnpm exec vue-tsc --noEmit` → `Command "vue-tsc" not found`. El proyecto no tiene `vue-tsc`; CI del admin (`ci.yml` job `admin-check`) valida con `lint` + `build` (no hay `tsc --noEmit` para el admin). `tsc` plano no parsea bloques de `.vue`.
- **Fix:** Verificación equivalente y más fuerte: `eslint` sobre los 4 archivos (limpio) + **`pnpm run build` completo (Build succeeded)**, que es el gate real de compilación Vue del admin en CI. `tsc --noEmit` sobre el `.ts` puro también corrió: los únicos errores son pre-existentes y fuera de scope (`session-pdf-builder.ts` margins, `axios-refresh-lock.test.ts`), no tocados por este plan.
- **Files modified:** ninguno extra.
- **Commit:** verificación, sin cambios de código.

## Issues Encountered

- 7 errores pre-existentes de `tsc --noEmit` en `src/utils/pdf/session-pdf-builder.ts` y `src/boot/__tests__/axios-refresh-lock.test.ts` — fuera de scope (no causados por este plan, archivos intactos). Registrados aquí, no corregidos.

## Threat Surface

Ninguna superficie nueva. El render consume solo datos que el endpoint `/tree` ya devolvía al mismo rol admin autorizado; estado de expansión puramente cliente. Coincide con el threat register del plan (T-135-10/11 accept, T-135-SC mitigate: sin paquetes nuevos).

## Known Stubs

Ninguno. El render maneja el caso vacío correctamente: cuando `variants` es `[]` no se muestra chevron ni chip "+N variantes" (gobernado por `hasVariants = variants.length > 0`). Nota de contexto: hoy en la DB `milestone_exercise_id` es NULL en todo el catálogo (rollout v5.1 diferido), así que en runtime cada hito tiene `variants: []` y no muestra toggle — esto es correcto y esperado, NO un stub. La jerarquía con variantes presentes se valida con el test del Plan 03 y con la verificación visual del checkpoint (datos sembrados manualmente si se quiere ver en vivo).

## User Setup Required

Ninguno.

## Next Phase Readiness

- Cierra el Bloque B (render). Con el checkpoint de verificación visual aprobado, la fase 135 queda completa a nivel código.
- Sin migraciones en este plan; sin cambios de dependencias (honra regla CLAUDE.md no-auto-install).

## Self-Check: PASSED

Todos los archivos creados/modificados existen; ambos commits de tarea (`8a589345`, `64d999fa`) presentes en git history; `pnpm run build` del admin: Build succeeded; lint limpio en los 4 archivos.

---

_Phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree_
_Completed: 2026-06-08_
