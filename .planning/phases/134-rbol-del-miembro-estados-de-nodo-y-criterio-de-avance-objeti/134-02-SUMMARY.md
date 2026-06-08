---
phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti
plan: 02
subsystem: progression (member-app Mi Árbol render)
tags: [member-tree, node-states, difficulty-band, alcance-relabel, D-05, D-08]
requires:
  - "134-01 backend contract: TreeNode.state ∈ {dominado,en_progreso,disponible,bloqueado} + TreeNode.band ∈ {kairos,alfa,delta,sigma,omega,spartan}"
  - el-templo-app/src/modules/progression (Phase 127 Mi Árbol view)
provides:
  - "Member-app TreeNode mirror carries state + band (in sync with 134-01)"
  - "Mi Árbol renders 4 node states (icon+color) + dl + band per node (D-08 mockup)"
  - "Route % re-labelled 'X% a tu alcance' (reach, not completion — D-05); formula unchanged"
  - "Disclaimer: ring (alcance) ≠ green Dominado (mastery)"
affects:
  - "end-of-phase manual UAT (member app visual)"
tech-stack:
  added: []
  patterns:
    - "render-verbatim (D-05 fase 127): client renders server state/band; presentation-only lookup maps, no state derivation"
    - "inline :style band/state color from resolved brand hex tokens (warm palette, no blue)"
key-files:
  created: []
  modified:
    - el-templo-app/src/modules/progression/types.ts
    - el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue
    - el-templo-app/src/modules/progression/components/TreeCategorySection.vue
    - el-templo-app/src/modules/progression/pages/MiArbol.vue
decisions:
  - "D-05: % header copy changed to 'a tu alcance'; progressValue/percent math byte-for-byte unchanged"
  - "D-08: refresh of the existing vertical milestone list, not a redesign — still milestones-only"
  - "Band colors defined locally in SubfamilyProgressRow (no existing FE level palette); warm tiered tokens, no blue"
  - "State→icon mapping: dominado=check_circle($positive), en_progreso=local_fire_department($primary), disponible=radio_button_unchecked(charcoal 0.5), bloqueado=lock(charcoal 0.4)"
metrics:
  duration: ~3min
  completed: 2026-06-08
---

# Phase 134 Plan 02: Refresh de Mi Árbol — estados de nodo + bandas (member app) — Summary

El miembro ahora ve, por cada hito de Mi Árbol, su estado computado en el server (✅ dominado / 🔥 en progreso / ⚪ disponible / 🔒 bloqueado) con ícono y color, su `dl` numérico y su banda de dificultad (color por nivel), y el anillo se re-etiquetó como "X% a tu alcance" — todo render-verbatim, el cliente no computa nada de estado (D-05).

## What was built

- **Mirror del contrato (Task 1):** `TreeNode` en `types.ts` ganó `state` (unión de 4 estados) y `band` (unión kairos→spartan), idénticas a lo que emite el backend de 134-01. Sin lógica nueva en el store ni en el composable — los campos fluyen transparentes (D-05).
- **Render de nodos + re-etiquetado (Task 2):** `SubfamilyProgressRow.vue` reemplazó el ícono binario `reached` por dos mapas de presentación (`STATE_META`, `BAND_COLOR`) que sólo eligen ícono/color/label a partir del estado/banda ya decididos por el server. Cada fila muestra ahora `nombre · dl{n} · banda · ESTADO` siguiendo el mockup acordado (D-08). El header de la ruta pasó de `{{ percent }}%` a `{{ percent }}% a tu alcance` (D-05) sin tocar `progressValue`/`percent`.
- **Anillo de categoría + disclaimer:** `TreeCategorySection.vue` agrega el caption "a tu alcance" bajo el anillo (fórmula intacta). `MiArbol.vue` agrega un disclaimer de una línea que comunica que el anillo (alcance) y el verde Dominado (maestría con evidencia) miden cosas distintas (D-05 "hay que comunicar que miden cosas distintas").

## Key implementation details

- **El cliente computa NADA de estado (D-05):** `STATE_META` y `BAND_COLOR` son tablas de presentación (ícono/color/label), análogas a `progressValue` — no derivan estado ni gating. Todo `state`/`band` viene del server.
- **Banda → color sin paleta FE previa:** no existía un mapa de colores por nivel en el frontend, así que se definió local en el componente con tokens de marca graduados por tier (gold/clay/terracotta/charcoal). Cero azul (verificado por grep: los únicos matches "blue" son los comentarios "NO blue").
- **Milestones-only intacto:** no se tocó el set de nodos ni el contrato; sigue mostrando sólo hitos (D-08, refresh no rediseño).
- **`progressValue`/`percent` byte-for-byte sin cambios** — sólo cambió copy alrededor del número.

## Deviations from Plan

None — plan executed exactly as written. El plan dejaba a discreción íconos/colores; se eligieron dentro de la paleta de marca sin azul.

## Tests

Cambio puramente visual de frontend (render-verbatim). Sin tests nuevos — no hay lógica nueva que testear (los estados se validan en la suite de 134-01 contra MySQL). Per project policy, el suite no se corre local. Verificación local: `vue-tsc --noEmit` (0 errores en los 4 archivos tocados) + eslint limpio.

## Verification status

- `cd el-templo-app && pnpm exec vue-tsc --noEmit` → 0 errores en types.ts, SubfamilyProgressRow.vue, TreeCategorySection.vue, MiArbol.vue.
- `pnpm exec eslint` sobre los 4 archivos → limpio (exit 0).
- grep de "blue" / hex azules en los archivos tocados → ninguno (sólo los comentarios "NO blue").
- `node.state` / `node.band` renderizados verbatim; ninguna derivación añadida a store/composable.

## Follow-ups for the human

- **UAT visual del member app** (diferido al flujo de UAT de fin de fase): abrir Mi Árbol y confirmar los 4 tratamientos de estado + dl + banda por nodo, el anillo "a tu alcance" y el disclaimer. SFC typecheck real corre en CI al pushear staging.
- Este plan consume el contrato de 134-01 (ya en staging); ambos viajan juntos al push.

## Self-Check: PASSED

- types.ts, SubfamilyProgressRow.vue, TreeCategorySection.vue, MiArbol.vue todos presentes y modificados (FOUND).
- Commits da8f9318 (Task 1), d05ac9b1 (Task 2) presentes en git log (FOUND).
