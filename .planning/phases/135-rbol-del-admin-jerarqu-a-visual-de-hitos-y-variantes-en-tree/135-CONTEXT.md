# Phase 135: Árbol del admin — jerarquía visual de hitos y variantes en /tree-map - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Hacer que el árbol del admin (`/tree-map`, canvas Vue Flow) muestre rutas largas como una **jerarquía de hitos canónicos con sus variantes colgando/colapsables**, en vez de ~70 ejercicios en fila. Dos bloques:

- **(A) Poblar datos** — auto-aplicar la heurística movimiento×escalón de fase 133 a `exercises.milestone_exercise_id`. Hoy `bootstrap-milestones.ts` solo escribe `exercise_milestone_proposals` (status `pending`) y **nunca** toca la columna de verdad; la verdad solo la escribe el accept transaccional del profe. Esta fase la puebla en bloque.
- **(B) Render jerárquico** — el endpoint `GET /admin/tree-editor/tree` hoy excluye variantes vía `backboneNodeConditions()` (`milestone_exercise_id IS NULL`, backbone-scope.ts:49). Devolver variantes agrupadas bajo su hito (query aparte) + nodo hito **colapsable** en el canvas, reusando bandas (color/dl) y el sub-grupo `category`.

**Diagnóstico raíz (ajustado en discuss):** el canvas del admin YA es Vue Flow con bandas apiladas y rutas colapsables (chevron en `RouteFlowNode.vue`) — NO es una lista plana. La "fila de ~70 nodos" es un **síntoma del dato**: con `milestone_exercise_id` NULL en todos los ejercicios, `backboneNodeConditions()` los trata a todos como hitos. Poblar la columna colapsa la fila sola. El render (B) agrega el nivel hito→variante que el canvas nunca dibujó (las variantes solo existían como propuestas en el drawer C5/MilestoneReviewList).

**Fuera de scope (ver Deferred):** rediseño a layout de grafo skill-tree con aristas hito→variante (el "diferido" de 133/134); cualquier cambio al predicado `backboneNodeConditions()` compartido (member-tree / getNeighbor / rebuild deben seguir viendo solo hitos).
</domain>

<decisions>
## Implementation Decisions

### A — Validación previa al poblado

- **D-01:** **Dry-run obligatorio antes de escribir nada.** Agregar un modo `--dry-run` (a `bootstrap-milestones.ts` o un script de apply nuevo) que imprime el plan completo hito→variantes (qué ejercicio queda hito, cuáles variantes, con su `confidence` y `movementToken`). El usuario revisa el **caso testigo Front Lever** + otras rutas largas y aprueba. Recién ahí corre el apply real. Una vuelta extra a cambio de no poblar masivamente mal.

### A — Estrategia de poblado

- **D-02:** **Auto-aplicar TODAS las propuestas** de la heurística (hito → `milestone_exercise_id` NULL; variante → id del hito), sin filtrar por confianza. El drawer de revisión (fase 133) queda como **herramienta de corrección, no de carga inicial** — coherente con el goal del roadmap. Cobertura total de una.
- **D-03:** **Apply = aceptar propuestas pending transaccionalmente, reusando el accept del proposal-service.** El "apply" recorre las propuestas `pending` y, dentro de una transacción: setea `exercise_milestone_proposals.status='accepted'` Y escribe `exercises.milestone_exercise_id`. La tabla de propuestas es el **libro mayor** (audit trail con `status` + `engine`). NO escritura directa a la columna; NO columna `milestone_source` nueva (se evita una migración de schema).
- **D-04:** **Idempotencia: el re-run solo toca propuestas `pending`.** Las propuestas `accepted`/`rejected` (que el profe ya revisó/corrigió en el drawer) quedan **intactas** — el re-poblado nunca pisa trabajo manual. En la primera corrida todo está `pending` → puebla todo; en corridas siguientes solo cierra lo que quedó sin clasificar.
- **D-05:** **Rollback vía SQL documentado.** Revertir el poblado = SQL que pone `milestone_exercise_id = NULL` (y opcionalmente `status` de vuelta a `pending`) donde haya propuesta heurística aceptada **no corregida manualmente**. Documentar el comando junto a la migración. Sin mecanismo de rollback automático.

### B — Camino a producción

- **D-06:** **Migración de datos determinística keyeada por `exercise_id`.** Correr dry-run + apply en local, capturar los asignamientos resultantes (`exercise_id → milestone_exercise_id`) como `UPDATE`s en un `.sql` commiteado, y aplicarlos en prod **vía el pipeline** (no CLI sobre prod, no seed re-run). Cumple la regla "datos de prod vía migración"; auditable (diff de UPDATEs) y reversible (D-05). Staging-first STRICT.
- **D-07:** **⚠️ RIESGO A VERIFICAR EN RESEARCH/PLAN:** la migración por `exercise_id` solo es segura si el **catálogo de ejercicios es idéntico local↔prod (mismos IDs autoincrement)**. Research debe confirmar paridad del catálogo antes de confiar en los IDs capturados. **Si divergen → fallback a clave natural** (emitir los UPDATEs keyeados por nombre de ejercicio en vez de id), que sobrevive drift de IDs a costa de más SQL generado. Decisión condicionada al hallazgo.
- **D-08:** **SQL de migración con disciplina del runner del proyecto:** hand-written, un statement por terminador, **NUNCA un `;` dentro de un comentario** (el runner splittea por `;` antes de strippear `--`). Header de comment-safety como 0143/0145.

### B — Render jerárquico

- **D-09:** **Colapsable sobre el layout actual (NO rediseño skill-tree).** Reusar el canvas Vue Flow de bandas. El nodo hito (`ExerciseFlowNode.vue`) gana un toggle expand/collapse que muestra/oculta sus variantes colgando debajo, reusando el patrón chevron de `RouteFlowNode.vue`. El layout de grafo skill-tree queda **diferido** (mismo diferido que 133/134).
- **D-10:** **Hitos con variantes arrancan COLAPSADOS por defecto, con contador** (ej. "+5 variantes"); se expanden al click. Mantiene el canvas limpio en rutas largas — el problema que veníamos a resolver. Estado de expansión por hito en el estado del canvas (análogo a `expandedRoutes` de `TreeMapPage.vue`).
- **D-11:** **El endpoint trae variantes en una query APARTE, sin tocar `backboneNodeConditions()`.** `GET /admin/tree-editor/tree` sigue armando el backbone con el predicado compartido (solo hitos) y agrega un segundo read de variantes (`milestone_exercise_id = <hito.id>`) agrupadas bajo cada hito en el payload (`variants[]` por nodo hito). El predicado compartido NO se modifica → **sin regresión** en member-tree / getNeighbor / rebuild.

### Claude's Discretion

- Visuales finos del nodo variante: reusar las bandas de fase 133 (color por nivel kairos→spartan + `dl` numérico) y el nombre; orden de las variantes dentro del hito (sugerido: por `dl` ascendente). Forma exacta del contador/chip de "+N variantes" y del toggle. Ubicación del helper de apply (reusar/extender `proposal-service` accept vs script CLI nuevo). Forma exacta del payload `variants[]` (campos por variante en `EditableNode`/`EditableRoute`).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño y decisiones del milestone (Nuevo Sistema de Entrenamiento)

- `.planning/research/new-training-system-design.md` — visión global del sistema de entrenamiento (hitos/variantes/bandas).
- `.planning/research/tree-quality-research.md` — research de calidad del árbol (R1 hitos/variantes, bandas kairos→spartan).
- `.planning/ROADMAP.md` (sección "Phase 135") — goal, dependencias (133/134) y las 4 decisiones abiertas resueltas acá.
- `.planning/phases/134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti/134-CONTEXT.md` — bandas/estados en la member app; precedente del diferido skill-tree.
- `.planning/phases/133-calidad-del-rbol-hitos-can-nicos-variantes-bandas-de-dificul/133-PATTERNS.md` y `133-RESEARCH.md` — infra de hitos/variantes, heurística, drawer, bandas. La fase 135 es composición sobre 133.

### A — Backend del poblado (heurística + apply)

- `el-templo-api/src/modules/exercises/milestone-heuristic.ts` — `proposeMilestones()`: módulo PURO, sin DB. Devuelve una propuesta por ejercicio (`proposedMilestoneExerciseId` NULL=hito / NOT NULL=variante, `movementToken`, `stepRank`, `confidence` 80/60/40). Eje movimiento (vocab most-specific-first) × escalón (`acceptedStep` o `classify()` live).
- `el-templo-api/bootstrap-milestones.ts` — CLI actual: escribe `exercise_milestone_proposals` (pending, `engine='milestone-heuristic-v1'`), idempotente vía `WHERE NOT EXISTS` (UNIQUE exercise_id), sin dry-run. Punto de extensión para D-01/D-03.
- `el-templo-api/src/modules/admin/proposal-service.ts` (accept transaccional) — patrón a reusar para D-03 (aceptar propuesta = escribir verdad + status).
- `el-templo-api/src/db/schema/exercises.ts` — columnas `milestone_exercise_id` (self-FK, ON DELETE SET NULL, índice `exercises_milestone_idx`), `canonical_exercise_id`, `dificultad_lineal`, `category`, `effort`, `progression_step`.
- `el-templo-api/src/db/migrations/0145_milestone_exercise_id.sql` — DDL de la columna + tabla `exercise_milestone_proposals` (status enum, engine, confidence). Modelo de header/disciplina para la migración de datos nueva (D-08).

### B — Backend del render (endpoint jerárquico)

- `el-templo-api/src/modules/tree-editor/service.ts` — `buildEditableTree()` / `loadGraphNodes()` (usa `backboneNodeConditions()` en :249), `loadAllEdges()`, armado de particiones (category→route→effort) y orden auto (progressionStep→dificultadLineal→id). Acá se agrega el read de variantes (D-11).
- `el-templo-api/src/modules/tree-editor/routes.ts` (`GET /admin/tree-editor/tree`) y `schemas.ts` (`EditableTree`/`EditableRoute`/`EditableNode`) — contrato a extender con `variants[]`.
- `el-templo-api/src/modules/exercises/backbone-scope.ts` — `backboneNodeConditions()` (`milestone_exercise_id IS NULL` en :49). **NO modificar** — lo consumen tree-progress (member), getNeighbor y rebuild. Mirror raw-SQL en `el-templo-api/rebuild-progression-graph.ts` (test de consistencia de node-set lo guarda).

### B — Frontend admin (canvas)

- `el-templo-admin/src/pages/TreeMapPage.vue` — orquestador del canvas Vue Flow (layout bandas, `expandedRoutes`, filtro sub-grupo `category`, drawer de revisión). Análogo para el estado de expansión de hitos (D-10).
- `el-templo-admin/src/components/treemap/ExerciseFlowNode.vue` — nodo hito a extender con toggle + contador de variantes (D-09/D-10).
- `el-templo-admin/src/components/treemap/RouteFlowNode.vue` — patrón chevron expand/collapse a reusar.
- `el-templo-admin/src/composables/useTreeEditorApi.ts`, `el-templo-admin/src/types/tree-editor.ts` — composable/tipos del contrato a extender con `variants[]`.
- `el-templo-admin/src/constants/levels.ts` — colores/bandas por nivel (kairos→spartan) a reusar en el nodo variante.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `proposeMilestones()` (milestone-heuristic.ts): heurística pura ya escrita; el poblado solo necesita persistir su salida (D-02/D-03).
- Accept transaccional de `proposal-service.ts`: patrón de "aceptar propuesta = escribir verdad + flip status" reusable para el apply masivo (D-03).
- `bootstrap-milestones.ts`: ya corre la heurística sobre el catálogo backbone y es idempotente; punto natural para `--dry-run` (D-01) y `--apply` (D-03).
- Canvas Vue Flow con bandas + colapsables de ruta (`TreeMapPage.vue` / `RouteFlowNode.vue`): el toggle de hito (D-09/D-10) es el mismo patrón un nivel abajo.
- `constants/levels.ts` + bandas de fase 133: color/dl ya disponibles para el nodo variante (Claude's discretion).

### Established Patterns

- El predicado backbone vive en un solo módulo (`backboneNodeConditions()`) con un mirror raw-SQL en `rebuild-progression-graph.ts` guardado por test — cualquier necesidad de "ver variantes" se resuelve con una query APARTE, nunca tocando el predicado (D-11).
- Migraciones hand-written, un statement por terminador, sin `;` en comentarios; `_migrations` table es la fuente de verdad (D-08).
- Datos de prod vía migración + pipeline + staging-first STRICT (D-06).
- Tests de API nuevos contra MySQL real en `el-templo-api/test/` (cubrir apply idempotente + payload con variants).

### Integration Points

- A: nuevo modo de poblado (dry-run + apply) sobre `bootstrap-milestones.ts`/`proposal-service`, escribiendo `exercises.milestone_exercise_id` y flippeando `exercise_milestone_proposals.status`.
- A→prod: migración `.sql` de datos generada desde el plan local (UPDATEs por exercise_id, pendiente verificación de paridad de catálogo — D-07).
- B: read de variantes en `buildEditableTree()` + campo `variants[]` en el payload; frontend renderiza el nodo hito colapsable con contador.

</code_context>

<specifics>
## Specific Ideas

- Caso testigo de validación: **Front Lever** — la ruta que hoy se ve como ~70 nodos en fila. El dry-run debe mostrar que colapsa a sus hitos canónicos con las variantes correctas colgando.
- Render esperado: nodo hito colapsado con chip "+N variantes"; al expandir, variantes debajo con su banda (color por nivel) y `dl` numérico, ordenadas por `dl`.

</specifics>

<deferred>
## Deferred Ideas

- **Rediseño skill-tree (layout de grafo Vue Flow con aristas hito→variante):** la experiencia "videojuego" más literal. Rediseño grande, mismo diferido de 133/134 → fase aparte.
- **Auto-aplicar por umbral de confianza:** se descartó para esta fase (auto-aplicamos todo, D-02). Si en el futuro se quiere un poblado más conservador (solo ≥80), revivir como opción del apply.
- **Columna `milestone_source` en `exercises`:** se evitó (libro mayor en la tabla de propuestas, D-03). Reconsiderar solo si el audit trail vía propuestas resulta insuficiente.

### Reviewed Todos (not folded)

None — no hubo todos cruzados para esta fase.

</deferred>

---

_Phase: 135-rbol-del-admin-jerarqu-a-visual-de-hitos-y-variantes-en-tree_
_Context gathered: 2026-06-08_
