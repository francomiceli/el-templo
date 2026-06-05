# Phase 126: Auto-construcción del grafo (DAG) de progresiones - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Construir automáticamente el grafo de progresiones de ejercicios a partir del orden del SPOM/`dificultadLineal` + las 3 dimensiones **confirmadas** (fase 125), persistirlo de forma editable+regenerable, y exponer la **primitiva "vecino un escalón arriba/abajo"** que consumirá el ajuste in-session (fase 131). Cubre **TREE-04**. Backend-first.

**NO incluye:** el editor de árbol para profes (128 — reordenar/agrupar/cross-edges); el % de avance del miembro (127); el ajuste in-session / botones (131); tocar el catálogo o las dimensiones (eso es 124/125).

</domain>

<decisions>
## Implementation Decisions

### Identidad del nodo

- **D-01:** Un **nodo = un ejercicio canónico** (fila de `exercises`, la canónica post soft-merge por `canonical_exercise_id`). La **sub-familia es el contenedor/agrupación**, NO el nodo. Razón: el swap del ajuste in-session (131) intercambia ejercicios, y `exercise-fallback.ts` ya opera a nivel ejercicio; el % de 127 cuenta ejercicios dominados por familia.

### Aristas (cuánto auto-deriva 126)

- **D-02:** 126 auto-deriva **solo cadenas LINEALES**, una por **(sub-familia × effort)** (ver D-04), ordenadas por `dificultadLineal`. El resultado son cadenas paralelas agrupadas por ruta/categoría. La **convergencia/ramificación cross-cadena** (el DAG real: dominar tuck planche + pseudo-pushups → adv tuck) la agregan los profes en **128**. 126 es determinista, sin inferencia especulativa de cross-edges.

### Persistencia del grafo

- **D-03:** Tabla nueva `exercise_progressions` (`from_exercise_id`, `to_exercise_id`, `source` enum `auto|manual`, + lo que el planner necesite). 126 popula el backbone (consecutivos por dl dentro de cada (sub-familia × effort), `source=auto`); el editor de 128 muta (cross-edges/reorder, `source=manual`). **Re-correr 126 regenera solo las aristas `auto` sin tocar las `manual`** (distingue derivado-del-SPOM de overrides — cierra el risk de 128). La primitiva vecino = lookup de adyacencia sobre esta tabla.

### Primitiva "vecino arriba/abajo" (resuelve la inconsistencia del doc)

- **D-04:** El vecino **FIJA la contracción**: "más fácil/difícil" busca el ejercicio adyacente del **mismo `effort`** (EXC/ISO/CON) dentro de la sub-familia, ordenado por dl. Preserva la prescripción del bloque (si el SPOM pidió una CON, el ajuste da otra CON más fácil/difícil, NO cambia a EXC). → el backbone (D-02/D-03) se encadena por **(sub-familia × effort)**. **Resuelve la inconsistencia del doc a favor de ADJUST-02** (jerarquía subfamily→palanca→contracción queda subordinada a "preservar contracción" del bloque).
- **D-05:** Detalles finos (planner / consumidos por 131): (a) **desempate de dl** dentro de (subfamily × effort) → orden estable usando leverage y/o un tiebreak determinista; (b) **fallback cuando no hay vecino** del mismo effort (fin de cadena) → no hay vecino disponible; 131 lo maneja gracefully y **NO cruza effort automáticamente**.
- **D-06:** La primitiva **reusa/extiende la lógica de `exercise-fallback.ts`** (selección por route + effort + difficulty + level, escala dl 1-12) como base, en vez de reimplementar desde cero.

### Claude's Discretion

- Nombres/tipos/índices exactos de `exercise_progressions`; si el backbone se materializa como aristas consecutivas o como posición-en-cadena + derivación; firma exacta de la primitiva vecino (`getNeighbor(exerciseId, direction)`), y dónde vive (módulo sessions/training).
- Nº de migración (próximo libre ~0139 — confirmar al planificar; 0137=124, 0138=125).
- El grafo sólo considera ejercicios con dimensiones **confirmadas** (125 accepted); cómo tratar los aún-pendientes (excluir del grafo hasta confirmar).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño + decisiones previas

- `.planning/research/new-training-system-design.md` — marco de 3 ejes, jerarquía, `dificultadLineal` como aplastamiento con empates, ejemplos de ramificación/convergencia del DAG.
- `.planning/phases/124-estructura-de-datos-de-las-3-dimensiones-saneo/124-CONTEXT.md` — D-04 (orden por `dificultadLineal`), nodo/columnas, soft-merge `canonical_exercise_id`.
- `.planning/phases/125-bootstrap-llm-revisi-n-de-profes-de-la-descomposici-n/125-CONTEXT.md` — dimensiones confirmadas (subfamily_id, leverage, route) que este grafo consume; estado accepted.

### Requisitos y roadmap

- `.planning/REQUIREMENTS.md` — TREE-04 (auto-construir el grafo ramificado).
- `.planning/ROADMAP.md` §"v5.1 Phase Details" → Phase 126 + el "Dependency axis" del Overview (resolver inconsistencia traversal en 126).

### Código a reusar

- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` — fallback por niveles (route + contraction + difficulty + level, dl 1-12, orden de sustitución de contracción): **base de la primitiva vecino** (D-06).
- `el-templo-api/src/db/schema/exercises.ts` — `subfamily_id`, `leverage`, `effort`, `dificultadLineal`, `route`, `canonical_exercise_id` (de 124).
- `el-templo-api/src/db/schema/exercise-subfamilies.ts` — catálogo de sub-familias (124).

### Convenciones

- `CLAUDE.md` §"Database Changes" (Drizzle + runner custom, sin `;` en comentarios SQL, no drizzle-kit migrate) + §API tests (integration en CI).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `exercise-fallback.ts` — la primitiva de "ejercicio equivalente" ya existe (tiered fallback por route/effort/difficulty/level); extenderla para "vecino un escalón" (mismo subfamily × effort, dl±1).
- `exercises.dificultadLineal` (indexado) — clave de orden de cadena. `exercises.subfamily_id` (125) + `effort` → particionan las cadenas.
- `canonical_exercise_id` (124) — el grafo opera sobre canónicos (dupes colapsados).

### Established Patterns

- Drizzle: tabla nueva con FKs (from/to → exercises.id), mysqlEnum inline para `source`, índices. Migración hand-written (~0139).
- Servicio backend con DI por constructor (patrón del proyecto) para la primitiva vecino + el constructor del grafo.

### Integration Points

- Lee: `exercises` (canónicos confirmados, subfamily_id, effort, dl) + `exercise_subfamilies`. Escribe: `exercise_progressions` (aristas auto).
- Consumidores: 127 (% avance lee el grafo), 128 (editor muta aristas manual), 131 (primitiva vecino).

</code_context>

<specifics>
## Specific Ideas

- Resolución explícita de la inconsistencia del doc: el vecino preserva contracción (ADJUST-02 manda), así que las cadenas de traversal son por (sub-familia × effort), no por sub-familia entera. La sub-familia sigue siendo la agrupación visible (127).

</specifics>

<deferred>
## Deferred Ideas

- **Cross-edges / ramificación-convergencia del DAG** (un nodo con múltiples padres/hijos): los agregan los profes en 128; 126 solo deja el backbone lineal.
- **Cruzar contracción en el vecino** (EXC→CON como progresión natural): descartado para el ajuste in-session (rompería la prescripción del bloque); podría reconsiderarse como una arista `manual` que un profe agregue en 128 si lo ve necesario.
- **Inferencia heurística de cross-edges**: descartada (especulativa/ruidosa).
- **% de avance UI** (127), **editor** (128), **botones in-session** (131): otras fases.

</deferred>

---

_Phase: 126-Auto-construcción del grafo (DAG) de progresiones_
_Context gathered: 2026-06-04_
