---
phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
plan: 06
subsystem: ui
tags: [quasar, vue-flow, tree-map, milestone-review, ttb-signal]

# Dependency graph
requires:
  - phase: 133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul
    provides: "133-02: DL_BANDS/dlBand/bandTextClass en constants/levels.ts; 133-05: 5 endpoints milestone-* bajo guard coach/owner"
provides:
  - "MilestoneReviewList.vue: lista del drawer extraída (filas mergeadas dimensión + hito, agrupadas por movementToken, banner TTB)"
  - "useTreeEditorApi: getMilestoneReview/getVariants/acceptMilestoneReview/rejectMilestoneReview/promoteMilestone"
  - "types/tree-editor: MilestoneReviewRow/MilestoneVariant/AcceptMilestoneBody (espejo 1:1 del plan 05)"
  - "TreeMapPage: drawer de dos ejes en una pasada + panel con rol/variantes/promoción"
affects: [133-07, member-tree-134, tree-map]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Componente presentacional puro: la lista solo emite (accept/reject/update-*) y la página conserva estado, fetching y mutaciones — evita vue/no-mutating-props en el extracto"
    - "Merge de dos ejes de propuestas por exerciseId con wrappers recomputados sobre objetos subyacentes estables (los edits in-place sobreviven al recompute)"

key-files:
  created:
    - el-templo-admin/src/components/treemap/MilestoneReviewList.vue
  modified:
    - el-templo-admin/src/types/tree-editor.ts
    - el-templo-admin/src/composables/useTreeEditorApi.ts
    - el-templo-admin/src/pages/TreeMapPage.vue

key-decisions:
  - "Reject 'análogo' = dispatch análogo: fila con propuesta de hito → rejectMilestoneReview (la propuesta de dimensión queda pendiente y revisable después); fila solo-dimensión → rejectOne existente"
  - "proposalBusyId pasa a guardar exerciseId (clave uniforme de las filas mergeadas) en vez de proposal id"
  - "'Aceptar todas' saltea filas variante sin hito elegido (quedan pendientes) en vez de fallar con 400 a mitad del bulk"
  - "Botón Aceptar disabled cuando role=variante sin hito seleccionado (previene el 400 del backend)"
  - "q-expansion-item de variantes con :key del exerciseId — remonta colapsado por ejercicio, garantizando el fetch lazy por hito"

patterns-established:
  - "Candidatos del select de hito: filas del mismo grupo (movementToken × stepRank) + fallback del propuesto vía lookup del árbol si salió de la lista pending"

requirements-completed: [R1-REV, TTB-SIG]

# Metrics
duration: ~22min
completed: 2026-06-07
---

# Phase 133 Plan 06: Drawer hito/variante + señal TTB + panel de variantes Summary

**El drawer de /tree-map revisa dimensión Y hito/variante en una sola pasada (toggle Hito|Variante por fila con select dependiente, accept transaccional de ambos ejes), muestra el banner persistente de split en TTB, y el panel lateral gana rol del nodo, lista lazy de variantes y promoción con confirmación — todo con los copys LOCKED del UI-SPEC**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-06-07T22:50:40Z
- **Completed:** 2026-06-07T23:12:23Z
- **Tasks:** 3
- **Files modified:** 4 (1 created)

## Accomplishments

- `types/tree-editor.ts` + `useTreeEditorApi.ts`: espejo 1:1 de los 5 contratos del plan 05 (`MilestoneReviewRow`/`MilestoneVariant`/`AcceptMilestoneBody`; GET milestone-review, GET variants, POST accept/reject/promote) con el idiom setPrecedence (extractError + Notify + log.error + rethrow) y el copy de error genérico de mutaciones del Copywriting Contract
- `MilestoneReviewList.vue` (260 líneas): lista del drawer extraída como componente presentacional — filas mergeadas (propuesta de dimensión + propuesta de hito por exerciseId), agrupación por movementToken con headers caption/600/uppercase, grupo null al final bajo "Sin movimiento detectado", toggle `Hito|Variante` con `q-select` dependiente (candidatos del mismo grupo movimiento × escalón, formato `nombre — dl N`), badges de rol primary/grey-7 outline, badge "sin escalón" conservado
- Accept de UN click escribe ambos ejes: filas con propuesta de hito van por `acceptMilestoneReview` (dimensión + truth + poda en una tx backend) con `dimensionOverrides` tomados de los selects; filas solo-dimensión conservan `acceptOne` intacto; notif éxito con copy LOCKED `Propuesta aceptada: {nombre} → {Hito|Variante de {hito}}.`
- Confirmación de cadena locked (copy LOCKED "La cadena se va a editar") ANTES del POST cuando la variante a aceptar vive en una partición `overridden=true`; accept/reject individual normal sigue sin diálogo
- Banner TTB persistente (TTB-SIG, locked decision 4): `q-banner dense bg-warning text-white icon=call_split` con copy LOCKED "Posible split de ruta" — no accionable ni descartable, solo en `reviewRoute === 'TTB'`
- Panel lateral: badge "Hito" (primary outline) en la línea de metadatos; vista variante con badge "Variante de: {hito}" linkeable (vuelve al hito); sección "Variantes (N)" como expansión colapsada con fetch lazy al expandir, badge dl de banda por variante (dlBand del plan 02), empty state LOCKED "Este hito no tiene variantes asignadas."; "Marcar como hito"/"Promover a hito" con diálogo LOCKED → `promoteMilestone` → notif de swap → refetch del árbol completo

## Task Commits

Each task was committed atomically:

1. **Task 1: Tipos + composable (espejo 1:1 del plan 05)** - `7da01fdd` (feat)
2. **Task 2: Drawer — agrupación, toggle, accept combinado y banner TTB** - `95c9eb4b` (feat)
3. **Task 3: Panel lateral — rol, variantes y promoción** - `677b6e55` (feat)

## Files Created/Modified

- `el-templo-admin/src/components/treemap/MilestoneReviewList.vue` - lista del drawer extraída (presentacional, solo emite; exporta MergedReviewRow/EditableMilestoneRow/HitoCandidate)
- `el-templo-admin/src/types/tree-editor.ts` - MilestoneReviewRow/MilestoneVariant/AcceptMilestoneBody
- `el-templo-admin/src/composables/useTreeEditorApi.ts` - 5 métodos milestone-\* con el idiom estándar
- `el-templo-admin/src/pages/TreeMapPage.vue` - merge de filas, dispatch accept/reject de dos ejes, confirmación cadena locked, bulk de ambos ejes, panel con rol/variantes/promote

## Decisions Made

- **Reject "análogo" como dispatch:** fila con propuesta de hito → `rejectMilestoneReview` (solo flipea esa propuesta; la de dimensión queda pendiente y la fila sigue revisable por el flujo existente); fila solo-dimensión → `rejectOne`. El backend no tiene reject combinado y el accept sí es el camino transaccional de una pasada.
- **Componente presentacional con emits granulares** (`update-role/target/step/habilidad`): mutar objetos anidados de props dispararía `vue/no-mutating-props`; la página conserva estado y mutaciones como pide el plan.
- **`proposalBusyId` guarda exerciseId** (clave uniforme de filas mergeadas) — antes guardaba proposal id.
- **"Aceptar todas" saltea variantes sin hito elegido** (quedan pendientes) y acepta secuencialmente las filas con propuesta de hito (una tx por fila) + `bulkAccept` para las solo-dimensión; ante error a mitad, refetch para mostrar el progreso parcial (sin optimistic updates).
- **Candidatos del select:** filas pending del mismo (movementToken × stepRank); si el hito propuesto por la heurística salió de la lista, se agrega vía lookup del árbol (las variantes aceptadas salen del node-set, los hitos quedan).
- **Expansión de variantes con `:key` del exerciseId** — remonta colapsada al cambiar de ejercicio, garantizando fetch lazy por hito (getVariants al expandir, nunca al seleccionar).

## Deviations from Plan

None - plan executed exactly as written. (El único punto interpretado fue el alcance de "Reject análogo", documentado arriba como decisión, sin cambio de scope.)

## Verification

- `vue-tsc --noEmit -p tsconfig.json` (binario de `el-templo-web` — el admin no tiene vue-tsc instalado y la regla del proyecto prohíbe instalar): set de errores idéntico al baseline tras cada task (cero errores nuevos; los 48 pre-existentes ya estaban documentados en deferred-items.md del plan 02)
- ESLint limpio en los archivos nuevos/modificados
- Copys LOCKED por grep: "Posible split de ruta" = 1 (solo en el componente), "La cadena se va a editar" = 1, "Sin movimiento detectado" presente, "Promover a hito" + "Este hito no tiene variantes" presentes, `MilestoneReviewList` en TreeMapPage = 3 (≥2), `console.log` = 0 en archivos nuevos
- Must-haves: MilestoneReviewList.vue 260 líneas (≥80); composable contiene "milestone-review"; key links verificados (api.get/post a /admin/tree-editor/milestone-review; import + render del componente en el drawer)
- R1-REV UI y TTB-SIG son manual-only (el admin no tiene suite de componentes — justificado en RESEARCH): UAT visual al cierre de fase con los pasos de los human-check (banner TTB, agrupación, toggle+select, confirmación de cadena locked, expansión de variantes y swap)

## Known Stubs

None — el drawer y el panel operan contra los 5 endpoints reales del plan 05; sin placeholders ni datos mockeados.

## Threat Flags

Ninguna superficie nueva fuera del threat model del plan: T-133-50 mitigado (sin optimistic updates — refetch tras cada mutación, estado previo intacto ante error; confirmaciones en las 3 acciones destructivas: aceptar todas, promover, variante en cadena locked), T-133-51 mitigado ("Aceptar todas" conserva su diálogo; accept individual reversible vía promote/re-clasificación). Cero cambios en package.json.

## Requirements Note

El frontmatter del plan declara `requirements: [R1-REV, TTB-SIG]` (labels de fase derivados del goal). Igual que en el plan 05, no existen como IDs en `.planning/REQUIREMENTS.md`, así que la trazabilidad queda en el ROADMAP de la fase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- El plan 07 (wave 5) puede renderizar el árbol sabiendo que el drawer/panel ya escriben el truth — variantes aceptadas desaparecen del backbone vía el filtro del plan 04
- UAT visual de R1-REV/TTB-SIG diferido al cierre de fase (pasos en los human-check del plan)

## Self-Check: PASSED

- Archivos creados/modificados verificados en disco — FOUND (4/4 + SUMMARY)
- Commits verificados en git log: 7da01fdd, 95c9eb4b, 677b6e55 — FOUND (3/3)
- Sin archivos untracked nuevos generados por este plan; sin deletions en los 3 commits
