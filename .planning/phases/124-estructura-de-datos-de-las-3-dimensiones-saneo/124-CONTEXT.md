# Phase 124: Estructura de datos de las 3 dimensiones + saneo - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Convertir las 3 dimensiones de dificultad (gesto/sub-familia, palanca/posición, contracción) en **datos estructurados y limpios** sobre el catálogo de ~1.493 ejercicios, separándolas del campo `position` sucio, y sanear el catálogo (rutas faltantes, dupes exactos) — de forma que el bootstrap LLM (125), el grafo DAG (126) y el nivel Kairos (129) construyan sobre datos confiables.

Cubre **TREE-01** (3 dimensiones como datos estructurados) y **TREE-05** (saneo). Es el cimiento / fase 0 del milestone v5.1. Backend-first.

**NO incluye:** poblar las dimensiones (eso es el bootstrap LLM de 125), construir el grafo (126), ni el editor de árbol (128). Esta fase deja el **esquema y el saneo estructural** listos; la población y curaduría vienen después.

</domain>

<decisions>
## Implementation Decisions

### Modelado de las 3 dimensiones (forma del esquema)

- **D-01:** **Sub-familia (gesto) = tabla catálogo propia** (nodo del grafo). Campos mínimos: id, ruta (familia/área), nombre, orden. Es entidad de primera clase porque el editor de árbol (128) la reordena/agrupa/separa y el grafo (126) la usa como nodo. `exercises` referencia la sub-familia por FK.
- **D-02:** **Contracción = reusar el campo `effort` existente** (`varchar(10) NOT NULL`, valores CON/EXC/ISO). No se crea campo nuevo. Eje acotado y casi universal.
- **D-03:** **Palanca/posición = atributo OPCIONAL/nullable por nodo**, NO un enum global obligatorio. Su vocabulario depende de la familia (tuck→adv tuck→straddle→full para skills de palanca; banda/ROM/lastre u otros para dinámicos; null donde no aplica). Razón: forzar un enum global dejaría `N/A` en la mayoría del catálogo y no serviría para ordenar.
- **D-04:** **El orden de la cadena lo lleva `dificultadLineal`** (el aplastamiento 1-12 que ya existe), desambiguando empates con contracción y, donde esté poblada, palanca. La palanca es un atributo descriptivo que _explica_ por qué un escalón es más difícil, NO la clave de ordenamiento.
- **D-05:** Interpretación de TREE-01 para palanca: "estructurada" = columna/atributo **nullable y limpio** (no enum global obligatorio). Las 3 dimensiones siguen siendo datos estructurados; palanca es estructurada-pero-opcional.

### Duplicados y rutas faltantes (qué hace el saneo)

- **D-06:** **Duplicado = solo dupes EXACTOS** (mismo nombre de ejercicio + mismo `dificultadLineal` + misma ruta + mismo `effort`). El mismo ejercicio apareciendo en distintos niveles/dl **se preserva** como escalón distinto de la cadena (es la progresión que el grafo y el ajuste in-session de 131 necesitan, no basura).
- **D-07:** **Dupes exactos → soft-merge por puntero, sin deletes.** Columna nueva `canonical_exercise_id` (self-FK nullable). Los dupes apuntan a su canónico; no se borra ninguna fila. Motivo: `exercises.id` está referenciado por `session_prescriptions.exercise_id` y `program_content_blocks.exercise_id` (sesiones/programas históricos) — un DELETE los orfanaría. El grafo (126) y la resolución de vecino colapsan dupes vía el puntero canónico. Reversible (null + drop columna).
- **D-08:** **Rutas faltantes:** `route` es `NOT NULL` en el esquema, así que los "~103 sin ruta" del doc son ruta vacía/placeholder (el researcher confirma el valor real sobre prod). En 124 el saneo **solo detecta y marca** esos ejercicios como "pendiente de ruta"; NO los borra ni inventa ruta. La asignación real la propone el LLM (125) y la confirman los profes en el editor (128); entran al árbol cuando tienen ruta válida.

### Vocabulario de sub-familias (gobernanza del catálogo)

- **D-09:** **Bottom-up: el LLM propone, los profes normalizan.** El bootstrap (125) propone nombres de sub-familia desde el nombre del ejercicio; se persisten al catálogo; los profes fusionan/renombran/separan en el editor (128). No espera curaduría previa (consistente con la decisión de diseño de Franco). Requiere un **paso de normalización** (Planche/Plancha/PL → un nodo) — diseñarlo en 125/128, no en 124.
- **D-10:** En 124 el catálogo de sub-familias puede quedar **vacío o mínimo**: esta fase crea la _estructura_ (tabla + FK + columnas), no la población. La población es 125.

### Estrategia de migración sobre prod (~1.493 filas)

- **D-11:** **Migración ADITIVA.** Columnas/tablas nuevas (tabla sub-familias, FK en exercises, `leverage` nullable, `canonical_exercise_id` self-FK). `position` queda **intacto como legacy** — nunca se reescribe ni se borra. Lo limpio se deriva al lado, sin pérdida.
- **D-12:** Migración **idempotente y reversible**: backfill con guardas `WHERE ... IS NULL`; rollback = drop de lo nuevo + null de punteros. Commitear el SQL de migración junto al cambio de schema (regla del proyecto). **Nunca `;` dentro de comentarios SQL** (el runner splittea por `;` antes de strippear `--`).

### Claude's Discretion

- Nombres concretos de columnas/tablas, tipos exactos (enum vs varchar para `leverage`), e índices: a definir en planificación, respetando los patrones de Drizzle del proyecto (mysqlEnum inline, índices compuestos).
- Si la normalización de `effort` (30% no limpio) entra en el saneo de 124 o se difiere: decisión del planner/researcher; no se discutió como bloqueante.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño del milestone (fuente de verdad)

- `.planning/research/new-training-system-design.md` — doc de diseño completo: marco de 3 ejes ortogonales, jerarquía categoría→ruta→sub-familia→palanca→contracción, decisiones tomadas, hallazgos del estado actual del código.
- `.docs/new-training-system/BRIEF-PROFES.md` — decisiones de dominio para los profes (validación del modelo de 3 ejes, criterio binario de "dominar", sub-familias por ruta).

### Requisitos y roadmap

- `.planning/REQUIREMENTS.md` — TREE-01 y TREE-05 (esta fase); contexto de las 3 categorías (TREE/KAIROS/ADJUST).
- `.planning/ROADMAP.md` §"v5.1 Phase Details" → Phase 124 — goal, success criteria, risks; y el "Dependency axis" del Overview.

### Código a tocar / leer

- `el-templo-api/src/db/schema/exercises.ts` — tabla `exercises` actual: `pattern`, `category`/`categorySecondary`, `position` (sucio), `effort` (contracción), `level` (enum alfa..spartan), `difficulty` (1-3/nivel), `dificultadLineal` (1-12), `route` (NOT NULL), `equipment` (enum implemento ya separado), índices existentes.
- `el-templo-api/src/db/schema/session-prescriptions.ts` — `exercise_id` (FK histórica, NOT NULL) — razón del soft-merge.
- `el-templo-api/src/db/schema/micro-programs.ts` — `program_content_blocks.exercise_id` (`.references(() => exercises.id)`) — segunda FK histórica.
- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` — ya elige "ejercicio equivalente" por `(route, effort, difficulty, level)`; base reutilizable para la primitiva de vecino del grafo (126), no para 124, pero contexto útil.

### Convenciones de migración (proyecto)

- `CLAUDE.md` §"Database Changes" — `pnpm db:generate`/`db:migrate`, runner custom, `_migrations` como fuente de verdad, nunca `drizzle-kit migrate`.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `exercises.effort` ya ES la dimensión contracción (CON/EXC/ISO) — no se crea nada nuevo para el eje 3 del modelo.
- `exercises.equipment` (enum barras/anillas/paralelas/cajón/ninguno) ya separa el "implemento" que el doc dice que vive en `position` — el saneo de `position` se concentra en palanca + orientación, NO en implemento.
- `exercises.dificultadLineal` (1-12, indexado) — clave de orden de la cadena (D-04); ya existe.
- Patrón de migración aditiva con backfill idempotente: precedente en Phase 103 (status enum) y otras — `WHERE ... IS NULL`, SQL hand-written cuando hay backfill.

### Established Patterns

- Drizzle schema: `mysqlEnum` inline, índices compuestos en el array de `(table) => [...]`. Self-FK vía thunk `references(() => exercises.id)`.
- Cambios de prod por migración (no seed re-run); commitear el SQL; sin `;` en comentarios SQL.

### Integration Points

- `exercises.id` referenciado por `session_prescriptions` y `program_content_blocks` → cualquier mutación de filas debe preservar esas FKs (de ahí el soft-merge D-07).
- El enum de nivel (`exerciseLevelEnum` alfa..spartan) vive acá pero **NO se toca en 124** — Kairos lo extiende en 129.

</code_context>

<specifics>
## Specific Ideas

- Realización clave de la discusión (Franco): la palanca tuck→full **no aplica universalmente**; el orden real vive en la cadena de la sub-familia, no en un enum de palanca. Esto reformó el modelado (D-03/D-04) y afila las fases 125/126.

</specifics>

<deferred>
## Deferred Ideas

- **Inconsistencia del doc de diseño a resolver en 126/131:** la jerarquía dice `sub-familia → palanca → contracción` (contracción como sub-orden más fino), pero ADJUST-02 dice que el vecino _preserva contracción_ y se mueve por la cadena. Decidir en el discuss de 126: ¿la cadena de traversal para "vecino" ordena por `dificultadLineal` dentro de (sub-familia) **cruzando** contracción, o dentro de (sub-familia × contracción) **fija**?
- **Agrupación visible `category` (fina, ~22) vs `pattern` (gruesa, ~9):** diferido al discuss de 127 (% de avance miembro). Ambos campos ya existen en `exercises`; el schema de 124 no lo necesita.
- **Eje transversal "estático/dinámico" como atributo/filtro** (no categoría paralela): confirmar con profes en 127.
- **Normalización de `effort`** (≈30% no limpio) y **dosis lineales de Kairos**: fuera del foco de 124; el planner decide si el cleanup de `effort` entra acá o se difiere.
- **Población de las dimensiones + normalización de nombres de sub-familia:** es 125, no 124.

</deferred>

---

_Phase: 124-Estructura de datos de las 3 dimensiones + saneo_
_Context gathered: 2026-06-04_
