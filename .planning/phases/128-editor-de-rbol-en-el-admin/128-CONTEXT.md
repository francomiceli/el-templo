# Phase 128: Editor de árbol en el admin - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous synthesis (overnight run) from ROADMAP §Phase 128 + 126 design (exercise_progressions auto/manual). Open decisions resolved below by Claude per milestone intent.

<domain>
## Phase Boundary

Dar a los profes una sección nueva en el **admin** para ajustar el árbol auto-construido: **reordenar ejercicios dentro de una sub-familia, agrupar/separar sub-familias y ajustar precedencias** sobre el grafo de la fase 126, sin tocar la DB a mano. Los cambios **persisten y prevalecen sobre el orden auto del SPOM**, y **sobreviven a una reconstrucción del grafo**. Cubre **TREE-07**.

**NO incluye:** el % del miembro (127); el ajuste in-session / registro dominado (131); Kairos (129/130); re-curar el catálogo o las dimensiones (124/125). El editor opera sobre el grafo ya construido.
</domain>

<decisions>
## Implementation Decisions

### Modelo de persistencia (clave del milestone)

- **D-01:** Los overrides del profe persisten en la tabla **`exercise_progressions`** existente con `source='manual'` (el modelo que 126 dejó preparado, D-03). El grafo/primitiva ya leen la tabla, así que los cambios manuales se reflejan sin tocar consumidores.
- **D-02 (partición bloqueada — garantiza "no pisar overrides"):** una partición `(subfamily_id × effort)` que tenga **cualquier** arista `manual` queda **bloqueada**: el constructor `rebuild-progression-graph.ts` (126) debe **SALTAR la regeneración de aristas `auto` para esa partición** (hoy borra todas las `auto` y re-inserta el backbone completo — esto las pisaría). Éste es el **único cambio al código de 126** y es lo que cumple el risk del roadmap ("una re-construcción no pisa los ajustes manuales"). El editor, al sobrescribir una partición por primera vez, **borra las aristas `auto` de esa partición** y escribe la cadena `manual`.

### Acciones del editor

- **D-03 (reordenar dentro de sub-familia):** reordenar es reescribir la cadena `manual` de esa `(subfamily × effort)` en el nuevo orden (aristas consecutivas `from→to`, `source='manual'`). Conserva contracción (sigue siendo por effort, D-04 de 126). El nuevo orden prevalece sobre el dl auto.
- **D-04 (precedencias / cross-edges):** agregar/quitar una arista `manual` entre dos nodos cualesquiera (incluso de distintas particiones) — éstas son la ramificación/convergencia del DAG que 126 difirió explícitamente a los profes. El editor las crea/borra como `source='manual'`.
- **D-05 (agrupar/separar sub-familias):** la sub-familia es el contenedor (D-01 de 126). Agrupar/separar = **reasignar `exercises.subfamily_id`** desde el editor (write directo, auditado), re-bucketeando los nodos en el árbol. Si la reasignación deja una partición vieja/ nueva inconsistente con sus aristas, el editor las recalcula (o invita a re-construir esa partición). Mantener esto acotado y reversible.

### Forma de la entrega

- **D-06:** Backend-first: endpoints admin (scope admin/coach, NO miembro) para leer el árbol editable y aplicar reorder / precedencia / reasignación, con tests de integración (CI). Frontend: sección nueva en el **admin** (`el-templo-admin`) con la vista de edición. El planner descubre la estructura real del admin (router/pages/components — no usa `src/modules/`).

### Claude's Discretion

- UX exacto del editor (drag-and-drop vs botones subir/bajar; árbol expandible). Preferir lo más simple y robusto (botones de orden + acciones explícitas) sobre drag-and-drop frágil.
- DTO/rutas exactas; si el read reusa el endpoint de 127 o uno admin nuevo (probablemente admin nuevo, sin el filtro "reached" del miembro).
- Auditoría/registro de quién editó (mínimo viable; no inventar tabla de audit si no existe patrón).
- Manejo de huérfanos al separar sub-familias (recalcular partición vs dejar al profe re-construir).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Grafo (fase 126 — sobre lo que se edita)

- `el-templo-api/src/db/schema/exercise-progressions.ts` — tabla de aristas (`source` enum `auto|manual`, columna real `source`).
- `el-templo-api/rebuild-progression-graph.ts` — constructor a modificar (agregar el guard de partición bloqueada, D-02). Ver `partitionAndBuildEdges` / la sección WRITE (`DELETE ... WHERE source='auto'`).
- `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts` — primitiva vecino (lee la tabla; los cambios manual ya la afectan).
- `el-templo-api/src/db/schema/exercises.ts` — `subfamily_id`, `effort`, `dificultad_lineal`, `canonical_exercise_id`.
- `el-templo-api/src/db/schema/exercise-subfamilies.ts` — sub-familias.

### Tree read (fase 127 — analogía de lectura del árbol)

- `el-templo-api/src/modules/tree-progress/` — módulo nuevo de 127 (cómo se lee/anida el árbol; el admin read puede inspirarse, SIN el filtro reached del miembro).

### Admin app (dónde vive el editor)

- `el-templo-admin/src/` — el planner localiza router/pages/components y un módulo/sección de coach existente como analogía. Auth scope admin/coach.

### Convenciones

- `CLAUDE.md` §API tests (CI), §Database (si se reasigna subfamily_id NO hace falta migración nueva — es UPDATE de datos; cuidado con FKs), §Logging, §sin `any`, §Frontend Quasar/Vue/Pinia.
- **Drizzle enum gotcha:** `exercise_progressions.source` ya existe — no crear columnas; cualquier query referencia `source`. (ver lección de drift enum 125/126).
  </canonical_refs>

<specifics>
## Specific Ideas
- El árbol arranca auto-construido (126) y los profes lo refinan acá — esta es la pieza que "desbloquea el milestone sin curaduría manual previa".
- Distinguir SIEMPRE derivado-del-SPOM (`auto`, default) de override-del-profe (`manual`) en la UI (un badge/indicador) para que el profe sepa qué está pisando.
</specifics>

<deferred>
## Deferred Ideas
- Historial/undo de ediciones del profe más allá de un audit mínimo.
- Edición masiva / bulk reordering.
- Drag-and-drop sofisticado si complica (preferir botones de orden).
- Tocar dimensiones/catálogo (124/125).
</deferred>

---

_Phase: 128-Editor de árbol en el admin_
_Context gathered: 2026-06-05 (autonomous)_
