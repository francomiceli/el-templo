# Phase 127: % de avance del árbol para el miembro - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous synthesis (overnight run) from ROADMAP §Phase 127 + design doc + 126 outputs. Open discuss-phase decisions resolved below by Claude per the milestone intent.

<domain>
## Phase Boundary

Exponer al miembro un **% de avance por familia/nodo del árbol de habilidades**, agrupado por las **categorías temáticas gruesas existentes**, reflejando el grafo (DAG) construido en la fase 126. Backend calcula el % desde el avance YA conocido (nivel del miembro + sesiones completadas) leyendo la estructura del grafo; la member app lo muestra. Cubre **TREE-06**.

**NO incluye:** el registro de "dominado/bajado" ni el ajuste in-session (eso es 131, que después enriquece este %); el editor de profes (128); tocar el grafo/dimensiones (124/125/126). El % de 127 es un primer corte sobre datos existentes — 131 cierra el lazo.
</domain>

<decisions>
## Implementation Decisions

### Agrupación visible

- **D-01:** El árbol se agrupa por las **5 categorías temáticas gruesas**: **Tracción / Empuje / Piernas / Core / Movilidad** (los success criteria del roadmap las nombran explícitamente). Estas se derivan del campo grueso existente `exercises.pattern` (~9 valores) colapsado a esos 5 buckets — NO de `category` (la fina ~22). El planner define el mapeo `pattern → {Tracción,Empuje,Piernas,Core,Movilidad}` como una tabla determinista en código (no una columna nueva). El "mapeo ruta→categoría es casi 1:1 con pattern" (roadmap).
- **D-02:** El **eje transversal estático/dinámico** es un **atributo/filtro**, NO una categoría de agrupación paralela. En 127 puede quedar como dato disponible para filtrar; no abre una segunda dimensión de árbol.

### Qué cuenta el %

- **D-03:** El % se calcula sobre el **avance ya conocido**: el **nivel del miembro** (`users.level`) + las **sesiones completadas** (`completed-sessions`). NO usa el registro "dominado" de 131 (todavía no existe). Definición operativa de "nodo alcanzado" para 127: un ejercicio/nodo del grafo cuyo `exercise_level`/`difficulty` está dentro del alcance del nivel del miembro y/o aparece en sus sesiones completadas. El planner elige el proxy más fiel disponible y lo documenta; lo importante es que 131 pueda re-definir "alcanzado" sin reescribir la vista.
- **D-04:** **% por familia** = (nodos alcanzados en la sub-familia) / (nodos totales en la sub-familia del grafo de 126). Se agrega hacia arriba: nodo → sub-familia → categoría temática. El backend lee el grafo de 126 (`exercise_progressions` + `exercises` confirmados) como fuente de la estructura (familias/nodos mostrados = DAG real, D-126).

### Forma de la entrega

- **D-05:** **Backend-first con UI fina.** Un endpoint nuevo (autenticado, scope miembro) devuelve el árbol con % anidado (categoría temática → sub-familia → nodos con flag alcanzado/%). La member app consume ese endpoint en el módulo `progression` existente (o uno cercano) y renderiza la vista de árbol con % por grupo. Sin cálculos de % en el cliente (el server es la fuente de verdad).

### Claude's Discretion

- Nombre/ruta exactos del endpoint y su DTO; si vive en un módulo `tree`/`progression` nuevo o extiende uno existente del API.
- Componentes Vue concretos y dónde cuelga la vista en la navegación de la member app (probablemente dentro de `el-templo-app/src/modules/progression`).
- La fórmula exacta de "alcanzado" (proxy) mientras respete D-03/D-04 y sea reemplazable por el registro de 131.
- Caching/perf del cálculo (puede ser on-demand; el catálogo es ~1.5k filas).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Grafo y estructura (fase 126 — fuente de la estructura del árbol)

- `el-templo-api/src/db/schema/exercise-progressions.ts` — aristas del DAG (familias/nodos).
- `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts` — primitiva de adyacencia ya existente (referencia de cómo leer el grafo).
- `el-templo-api/rebuild-progression-graph.ts` — cómo se particiona por (sub-familia × effort).
- `el-templo-api/src/db/schema/exercises.ts` — `pattern`, `category`, `subfamily_id`, `exercise_level`, `difficulty`, `dificultad_lineal`, `route`, `canonical_exercise_id`.
- `el-templo-api/src/db/schema/exercise-subfamilies.ts` — catálogo de sub-familias (agrupación visible nivel medio).

### Avance del miembro

- `el-templo-api/src/db/schema/users.ts` — `level` del miembro.
- Esquema/servicio de `completed-sessions` (sesiones completadas) — el planner localiza el módulo exacto.

### Member app (dónde se muestra)

- `el-templo-app/src/modules/progression/` — módulo existente (components/composables/pages/stores/routes) candidato a alojar la vista.
- `src/utils/logger.ts` — `createLogger()` (no console.log).

### Convenciones

- `CLAUDE.md` §API tests (integration en CI contra MySQL real), §Frontend (Quasar/Vue 3, Pinia setup stores, composables con `cleanup()`), §Logging, §sin `any`.
- Marca: paleta cálida sin azul (terracotta / marble cream / clay / aged gold); `quasar.variables.scss` es la fuente de verdad.
  </canonical_refs>

<specifics>
## Specific Ideas
- La vista debe sentirse como "mi árbol": categorías temáticas como secciones, sub-familias como filas/nodos con su % o estado alcanzado. Reflejo fiel del DAG de 126 (no una lista cableada).
- El % es un primer corte honesto: mejor sub-estimar con datos reales (nivel+sesiones) que inventar. 131 lo sube de calidad.
</specifics>

<deferred>
## Deferred Ideas
- Registro "dominado/bajado" y su aporte al % (fase 131).
- Editor del árbol para profes (128).
- Segunda dimensión de árbol por estático/dinámico (queda como filtro, no como agrupación).
- Gamificación/animaciones del avance (fuera de alcance).
</deferred>

---

_Phase: 127-% de avance del árbol para el miembro_
_Context gathered: 2026-06-05 (autonomous)_
