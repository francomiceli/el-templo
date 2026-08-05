# Phase 134: Árbol del miembro — estados de nodo y criterio de avance objetivo - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 11 (3 backend modified, 1 backend test new, 7 frontend modified)
**Analogs found:** 11 / 11 (all files are MODIFY-in-place; the file IS its own analog — extend the existing pattern, do not invent a new one)

> Esta fase NO crea archivos nuevos de producción. Es un refresh in-place: ampliar el cómputo server-side existente (`buildMemberTree`), ampliar el contrato (`TreeNode` + schema + types), y refrescar la UI de render-verbatim. El único archivo realmente nuevo es el test de integración (que copia el test existente del mismo endpoint). Por eso cada "analog" es el propio archivo o su gemelo directo: el trabajo es seguir el patrón ya establecido, no traer uno de otro lado.

## File Classification

| New/Modified File                                                                            | Role                 | Data Flow                              | Closest Analog                                                  | Match Quality |
| -------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------- | --------------------------------------------------------------- | ------------- |
| `el-templo-api/src/modules/tree-progress/service.ts` (MOD)                                   | service              | request-response (read-only aggregate) | self (`buildMemberTree`) + `tree-editor/service.ts` (edge load) | exact         |
| `el-templo-api/src/modules/tree-progress/schemas.ts` (MOD)                                   | config (JSON-schema) | request-response                       | self (`treeNodeSchema`)                                         | exact         |
| `el-templo-app/src/modules/progression/types.ts` (MOD)                                       | model (DTO mirror)   | request-response                       | self (`TreeNode`)                                               | exact         |
| `el-templo-api/test/tree-progress/member-tree.test.ts` (MOD)                                 | test                 | request-response                       | self (existing seed+assert suite)                               | exact         |
| `el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue` (MOD)            | component            | request-response (render-only)         | self (node `<li>` loop)                                         | exact         |
| `el-templo-app/src/modules/progression/components/TreeCategorySection.vue` (MOD)             | component            | render-only                            | self (ring header)                                              | exact         |
| `el-templo-app/src/modules/progression/pages/MiArbol.vue` (MOD)                              | component (page)     | render-only                            | self                                                            | exact         |
| `el-templo-app/src/modules/progression/stores/treeProgressStore.ts` (maybe MOD)              | store                | render-only                            | self                                                            | exact         |
| `el-templo-app/src/modules/progression/composables/useTreeProgressApi.ts` (likely UNCHANGED) | composable           | request-response                       | self                                                            | exact         |
| `el-templo-app/src/modules/training/components/BlockProgressionView.vue` (MOD)               | component            | render-only (derived text)             | self (adjust row, lines 93-115)                                 | exact         |
| `el-templo-app/src/modules/training/pages/DayPlayer.vue` (likely UNCHANGED)                  | component (page)     | event-driven                           | self (`onAdjustExercise`)                                       | exact         |

## Pattern Assignments

### `el-templo-api/src/modules/tree-progress/service.ts` (service — núcleo R6, D-01..D-06)

**Analog:** self — `buildMemberTree`. Esta función ya hace los 3 reads + ceiling que R6 necesita. Los 4 estados (D-01..D-04) se computan acá, reutilizando las señales existentes. NO derivar en el cliente (patrón D-05 fase 127, "el cliente no computa").

**Reads ya disponibles — reusar tal cual** (`buildMemberTree`, lines 300-306):

```typescript
const [nodes, completedExerciseIds, dominatedExerciseIds] = await Promise.all([
  loadGraphNodes(db),
  loadCompletedExerciseIds(db, userId),
  loadDominatedExerciseIds(db, userId),
]);
```

- `dominatedExerciseIds` (latest-per-node wins, lines 199-243) → señal de **Dominado** (D-01, evidencia de fase 131).
- `completedExerciseIds` (prescription→exercise, lines 151-185) → segunda señal de **Dominado** (D-01).
- `levelCeiling(level)` (lines 117-124) → el techo `dl ≤ ceiling` para el gating híbrido (D-06) y el anillo `reached` (D-05).

**Patrón actual de `reached` — NO cambia la fórmula, se re-etiqueta** (D-05, lines 331-334):

```typescript
const reached =
  node.dificultadLineal <= ceiling ||
  completedExerciseIds.has(node.exerciseId) ||
  dominatedExerciseIds.has(node.exerciseId);
```

El `%` del anillo sigue contando esto (D-05 "X% a tu alcance"). Los 4 estados son una **capa nueva aparte**.

**NUEVO read — aristas del grafo para el gating de Bloqueado/Disponible (D-06).** Hoy `loadGraphNodes` (lines 252-279) trae nodos pero NO aristas. Copiar el patrón de carga de aristas de tree-editor (`loadAllEdges`, `tree-editor/service.ts` lines 265-279):

```typescript
private async loadAllEdges(): Promise<EdgeRow[]> {
  const rows = await this.db
    .select({
      fromExerciseId: schema.exerciseProgressions.fromExerciseId,
      toExerciseId: schema.exerciseProgressions.toExerciseId,
      source: schema.exerciseProgressions.source,
    })
    .from(schema.exerciseProgressions);
  return rows.map((r) => ({ fromExerciseId: r.fromExerciseId, toExerciseId: r.toExerciseId, source: r.source as EdgeSource }));
}
```

Acá `buildMemberTree` es función libre (no clase), así que la versión es una `async function loadEdges(db)` puesta junto a `loadGraphNodes`, añadida al `Promise.all`. Trae backbone (`auto`) + cross-ruta (`manual`) — ambos forman el set de "prereqs del grafo" de D-06. Tabla y columnas en `el-templo-api/src/db/schema/exercise-progressions.ts` (`from_exercise_id`/`to_exercise_id`/`source` enum `auto`|`manual`).

**Derivación de los 4 estados (lógica nueva pura, sin joins extra).** Computar por nodo dentro del loop existente (`for (const node of nodes)`, lines 322-354), después de `reached`. Reglas verbatim de CONTEXT:

- **Dominado** (D-01): `dominatedExerciseIds.has(id) || completedExerciseIds.has(id)`. `dl ≤ ceiling` NO alcanza para dominar.
- **En progreso** (D-02): el primer hito NO-dominado de la ruta (orden por `dificultadLineal` luego `id`, igual que el sort de lines 364-370) cuyos prereqs están satisfechos. Máximo uno por ruta. Derivación pura del orden de la ruta + set de dominados.
- **Disponible** (D-03): prereqs satisfechos (D-06: `dl ≤ ceiling` O todos los prereqs del grafo dominados), no dominado, no es la frontera.
- **Bloqueado** (D-04): `dl > ceiling` Y le falta algún prereq del grafo dominado.

Nota: el orden importa — el estado "En progreso" se asigna recorriendo cada ruta ordenada y marcando el primer no-dominado disponible. Conviene computarlo en una segunda pasada por ruta (después de armar los acumuladores), no en el primer loop, porque "frontera" depende del orden completo de la ruta.

**Extender `TreeNode` (lines 66-72):** agregar `state` (server-computed) y opcionalmente `band`/`levelLabel` (el mapeo kairos→spartan + color). El frontend renderiza verbatim.

```typescript
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number;
  reached: boolean;
  state: "dominado" | "en_progreso" | "disponible" | "bloqueado"; // NUEVO (D-01..D-04)
  band: ContentLevel; // NUEVO — banda kairos→spartan derivada del dl (D-08)
}
```

Banda por dl: derivar del dl contra `LEVEL_LINEAR_MIN` (`level-mapping.ts` lines 86-92, `{alfa:1,delta:4,sigma:7,omega:9,spartan:11}`) — es el inverso del `levelCeiling`. La banda es el nivel de contenido al que pertenece ese dl; el color sale de la paleta de niveles en el frontend.

---

### `el-templo-api/src/modules/tree-progress/schemas.ts` (config — extender contrato)

**Analog:** self — `treeNodeSchema` (lines 10-18). Agregar las props nuevas al schema de respuesta JSON de Fastify (si una prop no está en el schema, Fastify la **strippea** de la respuesta — bug silencioso).

```typescript
const treeNodeSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "number" },
    name: { type: "string" },
    dificultadLineal: { type: "number" },
    reached: { type: "boolean" },
    state: { type: "string" }, // NUEVO
    band: { type: "string" }, // NUEVO
  },
} as const;
```

---

### `el-templo-app/src/modules/progression/types.ts` (model — espejo del DTO)

**Analog:** self — `TreeNode` (lines 66-72). Mantener el espejo en sync con el backend (la convención del archivo: "Mirror the authoritative DTO ... the client renders them verbatim"). Agregar `state` y `band` con los mismos union types. Patrón de union ya usado en el archivo (`level: 'kairos' | 'alfa' | ...`, line 102).

```typescript
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number;
  reached: boolean;
  state: "dominado" | "en_progreso" | "disponible" | "bloqueado"; // NUEVO
  band: "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan"; // NUEVO
}
```

---

### `el-templo-api/test/tree-progress/member-tree.test.ts` (test — extender suite)

**Analog:** self — la suite existente del mismo endpoint. Reusar los seed helpers ya escritos (`createRoute` lines 33-43, `createExercise` lines 45+) y agregar aristas + adjustments. La suite ya siembra un backbone real con `exercise_progressions` edges (ver docblock lines 12-25), así que el gating del grafo (D-06) es testeable con los mismos helpers.

**Patrón de seed/auth/cleanup** (lines 1-6): `createTestApp`, `registerUser`, `cleanAllTestData` de `../helpers`; inserts vía `app.db.insert(schema.X).values(...).$returningId()`.

Casos nuevos a cubrir (CLAUDE.md: "err on the side of too many tests"):

- Dominado por `exercise_adjustments` latest=`dominado`; un `bajado` posterior lo des-domina (latest-per-node).
- Dominado por sesión completada (prescription→exercise).
- `dl ≤ ceiling` NO domina (queda Disponible, no Dominado) — el corazón de D-01/R5.
- En progreso = exactamente un nodo por ruta (la frontera).
- Bloqueado: `dl > ceiling` Y prereq del grafo no dominado.
- Disponible vía D-06: prereqs del grafo dominados aunque `dl > ceiling`.
- `band` correcta por dl (alfa/delta/sigma/omega/spartan).

> Recordatorio de proyecto (MEMORY): NO correr el suite local. Avisar y pedir confirmación para pushear a staging y que CI lo corra. Typecheck local sí.

---

### `el-templo-app/src/modules/progression/components/SubfamilyProgressRow.vue` (component — render de nodos, D-08)

**Analog:** self — el loop de nodos `<li>` (lines 21-35). Hoy renderiza dos estados (reached/no) con un ícono binario:

```vue
<li
  v-for="node in subfamily.nodes"
  :key="node.exerciseId"
  :class="{ 'subfamily-row__node--reached': node.reached }"
>
  <q-icon :name="node.reached ? 'check_circle' : 'radio_button_unchecked'" size="16px" />
  <span class="subfamily-row__node-name">{{ node.name }}</span>
</li>
```

Refresh (D-08) — cada fila gana: ícono+color por `node.state` (4 estados, no binario), `dl{n}` numérico, y color de banda por `node.band`. Mockup acordado (CONTEXT D-08):

```
✅ Aussie Pull-up   dl3 · alfa    DOMINADO
🔥 Pull-up          dl5 · delta   EN PROGRESO
⚪ One-Arm Negative dl7 · sigma   DISPONIBLE
🔒 One-Arm Pull-up  dl10· omega   BLOQUEADO
```

**Renderiza verbatim** (`state`, `band`, `dl` vienen del server). El componente computa NADA salvo presentación (igual que `progressValue` line 61, "presentation, not a progress computation"). Mapear `state`→ícono/color y `band`→color con un objeto/computed local. Paleta de marca, **sin azul** (reusar tokens `$primary/$secondary/$accent/$positive` de `quasar.variables.scss`, ya importados line 65).

**Anillo `%` re-etiquetado (D-05):** el texto del % de la ruta cambia a "X% a tu alcance" (no "completado"). Está en el header de la fila (lines 3-6) — solo cambia copy, no la fórmula.

---

### `el-templo-app/src/modules/progression/components/TreeCategorySection.vue` (component — anillo de categoría)

**Analog:** self — el ring header (lines 5-15). Sin cambios de fórmula; si se re-etiqueta el % a "a tu alcance" (D-05), el copy del ring/subtítulo se ajusta acá. Props-only, computa nada.

---

### `el-templo-app/src/modules/progression/pages/MiArbol.vue` (page — orquestación, sin cambios estructurales)

**Analog:** self. Mantiene mount→fetch→render (lines 57-63). Probable que el copy del `__subtitle` (line 5) o un disclaimer "anillo = alcance / verde = dominado" (D-05 dice "hay que comunicar que miden cosas distintas") entre acá. El patrón de lifecycle (onMounted/onUnmounted con `cleanup()`) NO cambia.

---

### `el-templo-app/src/modules/progression/stores/treeProgressStore.ts` (store — probablemente sin cambios)

**Analog:** self. Render-only, guarda `categories` verbatim (lines 28-31). No computa. Como `state`/`band` viajan dentro de `TreeNode`, el store no necesita cambios salvo que el typing fluya solo. No agregar lógica de derivación acá (rompería D-05).

---

### `el-templo-app/src/modules/progression/composables/useTreeProgressApi.ts` (composable — sin cambios)

**Analog:** self. Fetch + extractError + Notify + `cleanup()` sin lifecycle interno (lines 60-63, convención del repo). El contrato extendido viaja transparente. Sin cambios esperados.

---

### `el-templo-app/src/modules/training/components/BlockProgressionView.vue` (component — texto de criterio R5, D-07)

**Analog:** self — el adjust row de fase 131 (lines 93-115). Es **exactamente** donde va el texto de criterio R5 ("junto al tap dominado", D-07). El slide actual ya expone `contraction`/`effort`:

```vue
<!-- Per-exercise difficulty adjustment (más fácil / más difícil) -->
<div v-if="canAdjustCurrentSlide" class="block-progression__detail-adjust-row">
  <q-btn ... @click="onAdjust('down')" />  <!-- bajado -->
  <q-btn ... @click="onAdjust('up')" />    <!-- dominado -->
</div>
```

El ejercicio actual tiene `contraction` disponible (lines 449, 517). **Derivación R5 en runtime, sin migración** (D-07) — regla determinística sobre el effort/contraction del nodo:

```typescript
// CON/EXC → "Objetivo: 3×8 (reinicia en 3×5)"
// ISO     → "Objetivo: 3×30s"
const advanceCriterion = computed(() => {
  const c = currentExercise.value?.contraction;
  if (c === "ISO") return "Objetivo: 3×30s";
  return "Objetivo: 3×8 (reinicia en 3×5)"; // CON / EXC
});
```

Mostrar como texto corto junto al adjust row. NO toca la mecánica de ajuste de fase 131 (la complementa). `createLogger()` para cualquier log (CLAUDE.md), nunca console.

---

### `el-templo-app/src/modules/training/pages/DayPlayer.vue` (page — sin cambios esperados)

**Analog:** self — `onAdjustExercise` (lines 343-404). La mecánica de swap/dominado/bajado de fase 131 queda intacta (D-07 "NO lo reemplaza"). El texto de criterio R5 vive en `BlockProgressionView` (más cerca del slide), no acá. Sin cambios esperados salvo que se decida pasar `effort` extra como prop (ya viaja en el bloque).

## Shared Patterns

### Server-computes-everything (D-05 fase 127)

**Source:** `tree-progress/service.ts` (docblock lines 5-8), `routes.ts` (lines 26-29)
**Apply to:** todo R6. El `state` y `band` se computan en `buildMemberTree`, viajan en el contrato, y el frontend (`SubfamilyProgressRow`, store, composable) renderiza verbatim. El cliente NO deriva estados ni gating.

```typescript
// routes.ts — handler member-scoped, lee solo request.user.userId, nunca input
async (request) => {
  const { userId } = request.user;
  return buildMemberTree(fastify.db, userId, request.log);
};
```

### Schema-gates-the-response (Fastify)

**Source:** `tree-progress/schemas.ts` + `routes.ts` (response schema, lines 19-23)
**Apply to:** cualquier campo nuevo del DTO. Si `state`/`band` no se agregan a `treeNodeSchema`, Fastify los strippea silenciosamente. Schema y TS interface se actualizan juntos.

### Composable contract (frontend)

**Source:** `useTreeProgressApi.ts` (lines 60-63), `useExerciseAdjustment.ts` (lines 98-100)
**Apply to:** cualquier composable tocado. Exponer `cleanup()`, sin `onUnmounted` adentro (el componente dueño del lifecycle lo llama). `catch (err: unknown)` + `instanceof Error` (CLAUDE.md, ya en uso `useExerciseAdjustment` lines 85-92).

### Marca / sin azul

**Source:** `quasar.variables.scss` (importado en cada `.vue` de progression/training)
**Apply to:** todo color nuevo (estados, bandas). Reusar `$primary/$secondary/$accent/$positive` y la paleta de niveles existente. Cero azul (MEMORY: reference_brand_palette).

### Banda / techo por nivel (single source)

**Source:** `level-mapping.ts` — `LEVEL_LINEAR_MIN` (lines 86-92), `level-mapping`/`levelCeiling` (service.ts 117-124)
**Apply to:** derivación de `band` (dl→nivel) en backend y mapeo de color en frontend. Una sola fuente de los umbrales; no hardcodear `{alfa:1,delta:4,...}` en otro lado (DRY, CLAUDE.md).

### Backbone scope (solo hitos)

**Source:** `exercises/backbone-scope.ts` — `backboneNodeConditions()` (lines 44-52, incluye `milestoneExerciseId IS NULL`)
**Apply to:** el member tree ya muestra solo hitos vía este helper en `loadGraphNodes`. NO tocar — garantiza que D-08 ("sigue mostrando solo hitos") se cumpla gratis. Si se agrega el read de aristas, las aristas pueden referir nodos; filtrar contra el set de nodos backbone ya cargado.

## No Analog Found

Ninguno. Todos los archivos son MODIFY-in-place sobre código existente de las fases 127/131/133; cada uno es su propio patrón a extender, y la carga de aristas (única lógica realmente nueva en backend) tiene analog directo en `tree-editor/service.ts::loadAllEdges`.

## Metadata

**Analog search scope:**

- `el-templo-api/src/modules/tree-progress/` (service, schemas, routes, test)
- `el-templo-api/src/modules/tree-editor/` (edge-loading pattern)
- `el-templo-api/src/modules/exercises/` (backbone-scope)
- `el-templo-api/src/modules/sessions/pipeline/utils/` (level-mapping)
- `el-templo-api/src/db/schema/exercise-progressions.ts`
- `el-templo-app/src/modules/progression/` (page, components, store, composable, types)
- `el-templo-app/src/modules/training/` (DayPlayer, BlockProgressionView, ExerciseCard, useExerciseAdjustment)

**Files scanned:** ~16
**Pattern extraction date:** 2026-06-08
