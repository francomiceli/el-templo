---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 07
subsystem: ui
tags: [quasar, vue-flow, tree-map, sub-grupos, cross-route-prereqs]

# Dependency graph
requires:
  - phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
    provides: "133-04: subGroup required en GET /admin/tree-editor/tree; 133-06: TreeMapPage con drawer/panel de revisión"
provides:
  - "SubgroupFlowNode.vue: nodo-label de sub-grupo (caption 12px/600/uppercase/grey-7, sin caja)"
  - "TreeMapPage: rutas ordenadas por sub-grupo dentro de su banda + filtro q-select clearable + empty state LOCKED"
  - "Aristas R4 cross-ruta gris punteado (#757575, dash 8 4, ArrowClosed, sin animación) node→node"
  - "Arista agregada prereq-agg-{fromRoute}-{toRoute} ruta→ruta con extremos colapsados (deduplicada por par)"
  - "RouteFlowNode: hasPrereq + badge 'prereq' (outline grey-8) a la izquierda del pendingCount, tooltip LOCKED"
  - "SUB_GROUP_DISPLAY_NAMES + subGroupDisplayName() en types/tree-editor.ts (lista LOCKED es-AR + fallback title-case)"
affects: [member-tree-134, tree-map]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clasificación de aristas por mapa exerciseId→routes.code computado del payload (cross-ruta = R4)"
    - "Agregación de aristas a nivel ruta cuando el gate de visibilidad omitiría el render (Pitfall 7 — nunca invisible)"
    - "Handle target oculto en nodo contenedor para anclar aristas agregadas (Vue Flow exige handle del tipo)"

key-files:
  created:
    - el-templo-admin/src/components/treemap/SubgroupFlowNode.vue
  modified:
    - el-templo-admin/src/types/tree-editor.ts
    - el-templo-admin/src/components/treemap/RouteFlowNode.vue
    - el-templo-admin/src/pages/TreeMapPage.vue

key-decisions:
  - "Id de arista agregada usa routes.code (clave de los nodos del canvas `route-{code}`), no el id numérico"
  - "'{ruta}' del copy LOCKED se renderiza con routes.code (compacto, visible en el nodo de ruta)"
  - "Click en R4 manual node→node conserva la baja existente con el copy LOCKED prependeado al diálogo de eliminación"
  - "Búsqueda de ejercicios scopeada a rutas visibles cuando el filtro de sub-grupo está activo"
  - "Badge prereq se muestra siempre que la ruta tenga prereqs entrantes (plan literal), no solo colapsada"

patterns-established:
  - "Nodo label-only de agrupador: copiar CategoryFlowNode (draggable/selectable/focusable false, pointer-events none)"

requirements-completed: [R3-SUBGRP, R4-XRUTA]

# Metrics
duration: ~8min
completed: 2026-06-07
---

# Phase 133 Plan 07: Sub-grupos R3 + aristas cross-ruta R4 Summary

**Las rutas de /tree-map se agrupan y filtran por sub-grupo de category fina (labels caption uppercase + q-select clearable, locked decision 5) y los prerequisitos cross-ruta se ven SIEMPRE: gris punteado 8 4 node→node con rutas expandidas, arista agregada ruta→ruta + badge 'prereq' con extremos colapsados (Pitfall 7, opción a+b)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-07T23:15:43Z
- **Completed:** 2026-06-07T23:23:58Z
- **Tasks:** 2
- **Files modified:** 4 (1 created)

## Accomplishments

- `types/tree-editor.ts`: `TreeRoute.subGroup` required (espejo 1:1 del payload del plan 04 — vue-tsc falla si el payload no lo trae) + `SUB_GROUP_DISPLAY_NAMES` con la lista LOCKED es-AR del UI-SPEC C3 y `subGroupDisplayName()` con fallback title-case genérico para valores fuera de la lista
- `SubgroupFlowNode.vue`: nodo label-only copiado de CategoryFlowNode con el estilo C3/Typography (caption 12px, peso 600, uppercase, grey-7, letter-spacing 0.5px, sin caja ni borde — agrupador visual, NO eje de navegación)
- `rebuildGraph`: las columnas de ruta se ordenan por sub-grupo (alfabético por code-points, sort estable) dentro de su banda de categoría; un SubgroupFlowNode aparece encima de la primera columna de cada grupo (sub-grupo '' no rotula); bandas sin rutas visibles se omiten enteras
- Filtro `q-select` denso "Sub-grupo" clearable en la toolbar junto a la búsqueda — opciones derivadas del payload (display name como label, UPPERCASE como value, nunca hardcodeadas); empty state LOCKED "No hay rutas en este sub-grupo." centrado en el canvas; la búsqueda de ejercicios queda scopeada a rutas visibles
- Aristas R4: clasificación por `exerciseRouteMap` (exerciseId → routes.code); cross-ruta con ambos extremos expandidos → node→node `#757575` dash `8 4` width 2 ArrowClosed `animated: false`; same-route manual conserva su terracotta animado intacto (mismo bloque, ternario por `crossRoute`)
- Pitfall 7 resuelto: con algún extremo colapsado, en lugar del gate `visibleExercises` que omitía la arista, se emite UNA arista agregada `prereq-agg-{fromRoute}-{toRoute}` por par de rutas (deduplicada vía Map) con el mismo estilo R4 — el prerequisito nunca queda invisible
- Click en arista R4: copy LOCKED `Prerequisito: {origen} ({ruta}) → {destino} ({ruta})` — la manual node→node lo muestra en el diálogo de eliminación existente (baja intacta), la auto lo muestra como Notify info, la agregada abre un diálogo que lista todos los pares que resume
- `RouteFlowNode`: `hasPrereq` (true si la ruta tiene aristas cross-ruta ENTRANTES — es la ruta élite) + badge `outline grey-8 "prereq"` con la plantilla del badge pendingCount, posicionado a su IZQUIERDA cuando coexisten (pending mantiene prioridad visual), tooltip LOCKED "Esta ruta tiene prerequisitos en otra ruta. Expandí ambas para ver las aristas."; Handle target oculto agregado para anclar la arista agregada

## Task Commits

Each task was committed atomically:

1. **Task 1: Sub-grupos R3 — orden, labels y filtro** - `16188d9b` (feat)
2. **Task 2: Aristas R4 + arista agregada + badge prereq** - `3bd3666e` (feat)

## Files Created/Modified

- `el-templo-admin/src/components/treemap/SubgroupFlowNode.vue` - nodo-label de sub-grupo (R3)
- `el-templo-admin/src/types/tree-editor.ts` - subGroup en TreeRoute + display names LOCKED + helper
- `el-templo-admin/src/components/treemap/RouteFlowNode.vue` - hasPrereq, badge prereq, target handle
- `el-templo-admin/src/pages/TreeMapPage.vue` - orden/labels/filtro de sub-grupos, jerarquía de 4 clases de arista, arista agregada, click R4

## Decisions Made

- **Id de la arista agregada con routes.code:** el plan dice `prereq-agg-{fromRouteId}-{toRouteId}`; los nodos del canvas se keyean por code (`route-{code}`), así que la arista agregada usa codes — el grep `prereq-agg-` del acceptance criteria igual aplica
- **`{ruta}` del copy LOCKED = routes.code:** compacto y visible en el meta del nodo de ruta (mismo criterio que las opciones de búsqueda `nombre · CODE`)
- **Click en R4 manual conserva la baja:** el plan pide "click → tooltip" Y "alta/baja: mecanismo existente — no tocar"; reemplazar el click por tooltip-only rompería la eliminación de precedencias manuales cross-ruta. Resolución: el diálogo de eliminación existente muestra el copy LOCKED como mensaje; la R4 auto muestra el copy como Notify; la agregada lista sus pares en un diálogo informativo
- **Búsqueda scopeada al filtro:** seleccionar un ejercicio de una ruta oculta por el filtro no podría expandir/centrar nada (nodo fuera del canvas) — las opciones excluyen rutas filtradas
- **Badge prereq sin condición de colapso:** el plan computa `hasPrereq` por aristas entrantes a secas; el badge se ve también con la ruta expandida (el tooltip sigue siendo útil como señal)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Handle target oculto en RouteFlowNode**

- **Found during:** Task 2
- **Issue:** Vue Flow no renderiza una arista hacia un nodo custom sin Handle de tipo `target`; RouteFlowNode solo tenía el source Bottom del "inicio de cadena" — la arista agregada ruta→ruta no tendría ancla
- **Fix:** Handle `target` Position.Top, `connectable: false`, mismo estilo oculto del handle existente
- **Files modified:** el-templo-admin/src/components/treemap/RouteFlowNode.vue
- **Commit:** 3bd3666e

**2. [Rule 2 - Edge case] Búsqueda de ejercicios scopeada a rutas visibles**

- **Found during:** Task 1
- **Issue:** con el filtro de sub-grupo activo, seleccionar en la búsqueda un ejercicio de una ruta oculta fallaba silenciosamente (el nodo no existe en el canvas — no expande ni centra)
- **Fix:** `allSearchOptions` excluye rutas que no matchean el filtro activo
- **Files modified:** el-templo-admin/src/pages/TreeMapPage.vue
- **Commit:** 16188d9b

## Verification

- `vue-tsc --noEmit -p tsconfig.json` (binario de `el-templo-web` — el admin no tiene vue-tsc y la regla del proyecto prohíbe instalar): set de errores idéntico al baseline tras cada task (18 pre-existentes, cero nuevos, ninguno en archivos tocados)
- ESLint limpio en los 4 archivos tocados
- Greps de acceptance: `subGroup` en types (4) y TreeMapPage (18); `"8 4"` en TreeMapPage (2: node→node vía XRUTA_EDGE_STYLE + comentario de jerarquía); `prereq` en RouteFlowNode (9); `prereq-agg-` (1); copys LOCKED presentes exactos ("No hay rutas en este sub-grupo." = 1, tooltip del badge = 1, "Prerequisito:" = 2); `console.log` = 0
- Must-haves: SubgroupFlowNode.vue existe y está registrado como nodeType `subgroup`; RouteFlowNode contiene "prereq"; key links verificados (subGroup en rebuildGraph/orden/labels/filtro; estilo `8 4` + arista agregada en precedenceEdges)
- R3-SUBGRP UI y R4-XRUTA render son manual-only (sin suite de componentes): UAT visual al cierre de fase (rutas agrupadas con labels, filtro reduce/restaura el canvas; con aristas FLR→FL: expandidas → gris punteada con flecha; FL colapsada → arista agregada + badge prereq en FLR; distinguible del dashed 6 4 de inicio de cadena)

## Known Stubs

None — sub-grupos y aristas operan sobre el payload real de GET /admin/tree-editor/tree; sin placeholders ni datos mockeados.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan: T-133-60 aceptado (render puro de datos ya autorizados detrás del guard coach/owner; la baja de aristas sigue usando el endpoint /precedence existente ya testeado). T-133-SC aceptado (cero instalaciones de paquetes).

## Requirements Note

El frontmatter del plan declara `requirements: [R3-SUBGRP, R4-XRUTA]` (labels de fase derivados del goal). Igual que en los planes 05/06, no existen como IDs en `.planning/REQUIREMENTS.md`, así que la trazabilidad queda en el ROADMAP de la fase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Fase 133 completa a nivel código (7/7 planes): la capa visual cierra con dificultad (02), revisión (06), estructura (07-R3) y dependencias entre rutas (07-R4)
- Pendiente de fase: UAT visual (pasos en los human-check) + CI al pushear a staging

## Self-Check: PASSED
