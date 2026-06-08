# Phase 135: Árbol del admin — jerarquía visual de hitos y variantes en /tree-map — Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 11 (Block A: 3 / Block B: 8)
**Analogs found:** 11 / 11 — every file is a modification or near-literal extension of code already in the tree; the milestone infra of phase 133 is fully built.

Todos los analogs fueron leídos contra el working tree local (staging) en esta sesión. La fase es composición sobre 133: el accept transaccional, la columna truth, la heurística pura, el endpoint `/tree` y el canvas de bandas colapsables YA EXISTEN. Block A persiste lo que la heurística ya propone; Block B agrega el nivel hito→variante al payload `/tree` y un toggle un nivel abajo del de ruta.

**Hallazgo clave (validar en plan):** `TreeEditorService.getVariants(exerciseId)` (service.ts:1198-1211) y el endpoint `GET /milestone/:exerciseId/variants` (routes.ts:215-243) YA devuelven las variantes de un hito vía la columna truth. Pero son por-ejercicio y on-demand. Block B / D-11 necesita las variantes EMBEBIDAS en el payload de `buildEditableTree()` (`variants[]` por nodo hito) para que el canvas dibuje contador + colapso sin N round-trips. La query de variantes nueva es la MISMA forma que `getVariants`, batcheada sobre todo el node-set.

## File Classification

| File                                                          | New/Mod           | Role                      | Data Flow                 | Closest Analog                                                                                     | Match Quality |
| ------------------------------------------------------------- | ----------------- | ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------- | ------------- |
| **Block A — Poblado**                                         |                   |                           |                           |                                                                                                    |               |
| `el-templo-api/bootstrap-milestones.ts`                       | MOD               | CLI script                | batch / transform         | sí mismo (`runBootstrapMilestones`) + `acceptInTransaction` (proposal-service.ts:82)               | exact         |
| `el-templo-api/src/db/migrations/0146_*.sql` (DATA migration) | NEW               | migration                 | DML (UPDATE)              | `0089_tren_inferior_replicate_weeks_11_12.sql` (keyed-by-natural-key) + `0145` (header discipline) | role-match    |
| `el-templo-api/test/...` (apply idempotente)                  | NEW/MOD           | test                      | —                         | `test/exercises/proposal-review.test.ts` + `test/exercises/bootstrap-dimensions.test.ts`           | exact         |
| **Block B — Render jerárquico**                               |                   |                           |                           |                                                                                                    |               |
| `el-templo-api/src/modules/tree-editor/service.ts`            | MOD               | service                   | read (CRUD)               | `getVariants()` (:1198) batcheado + `buildEditableTree()` (:289)                                   | exact         |
| `el-templo-api/src/modules/tree-editor/schemas.ts`            | MOD               | config (JSON schema)      | —                         | `editableNodeSchema` (:19) / `editableRouteSchema` (:55)                                           | exact         |
| `el-templo-api/src/modules/tree-editor/routes.ts`             | (NO-MOD esperado) | route                     | request-response          | `GET /tree` (:53) — solo cambia el response schema, no el handler                                  | exact         |
| `el-templo-admin/src/components/treemap/ExerciseFlowNode.vue` | MOD               | component (Vue Flow node) | render                    | sí mismo + chevron de `RouteFlowNode.vue` (:35)                                                    | exact         |
| `el-templo-admin/src/components/treemap/RouteFlowNode.vue`    | (referencia)      | component                 | render                    | patrón chevron (:35-39) + badge contador (:61-69) — a COPIAR, no modificar                         | exact         |
| `el-templo-admin/src/pages/TreeMapPage.vue`                   | MOD               | page                      | request-response + render | `expandedRoutes` (:93) + `rebuildGraph` chain loop (:315-353) + `toggleRoute` (:449)               | exact         |
| `el-templo-admin/src/composables/useTreeEditorApi.ts`         | (NO-MOD esperado) | composable                | request-response          | `fetchTree` (:32) — el payload crece, la llamada no cambia                                         | exact         |
| `el-templo-admin/src/types/tree-editor.ts`                    | MOD               | types                     | —                         | `TreeNode` (:12) / `MilestoneVariant` (:141)                                                       | exact         |
| `el-templo-admin/src/constants/levels.ts`                     | (reuso)           | config                    | —                         | `dlBand()` (:57) / `bandTextClass()` (:66) — reusar tal cual                                       | exact         |

---

## Pattern Assignments

### Block A

### A1. `bootstrap-milestones.ts` — agregar `--dry-run` (D-01) + `--apply` (D-03)

**Analog A (estructura del CLI):** sí mismo. El archivo ya tiene `runBootstrapMilestones(db)` exportada genérica (línea 51), READ→TRANSFORM puro→INSERT idempotente (líneas 66-133), narrowers sin `any` (`readCatalogRows` :145, `readExerciseIdSet` :183), guard de entrypoint (:209), header con "console.log is acceptable here" (:27). El modo nuevo se cuelga del mismo `main()`/guard parseando `process.argv`.

**Analog B (apply transaccional — el corazón de D-03):** `acceptInTransaction(tx, id, overrides)` exportada en `proposal-service.ts:82-172`. NO copiar el cuerpo: IMPORTARLO. Pero ojo — `acceptInTransaction` es para el eje DIMENSIÓN, NO escribe `milestone_exercise_id`. El apply de hitos debe usar el método de árbol que SÍ escribe truth de milestone:

**Analog B′ (el verdadero apply de milestone, REUSAR):** `TreeEditorService.acceptMilestoneReview(input)` en `service.ts:982-1151` es EXACTAMENTE "aceptar una propuesta pending = escribir `milestone_exercise_id` + flip status + podar aristas" en una transacción. El apply masivo recorre las propuestas `pending` de `exercise_milestone_proposals` y llama `acceptMilestoneReview({ exerciseId, role, milestoneExerciseId })` por cada una. Patrón de bulk con aislamiento por-fila: `ProposalService.bulkAccept` (proposal-service.ts:275-298) — cada accept en su propia tx, una mala no rollbackea las otras, log + continue:

```typescript
// proposal-service.ts:280-296 — patrón bulk a imitar para el --apply
for (const id of ids) {
  try {
    await this.accept(id, overridesById?.[id]);
    acceptedCount += 1;
  } catch (err: unknown) {
    this.log?.warn(
      {
        proposalId: id,
        error: err instanceof Error ? err.message : String(err),
      },
      "bulkAccept: skipped a proposal that failed to accept",
    );
  }
}
```

**Mapeo propuesta→input de acceptMilestoneReview** (la propuesta lleva `proposedMilestoneExerciseId`: NULL=hito, NOT NULL=variante):

- `proposed_milestone_exercise_id IS NULL` → `{ exerciseId, role: 'hito' }`
- `proposed_milestone_exercise_id = H` → `{ exerciseId, role: 'variante', milestoneExerciseId: H }`

⚠️ **Idempotencia (D-04):** `acceptMilestoneReview` ya flippea SOLO la propuesta `pending` (service.ts:1139-1147 — `WHERE status = 'pending'`). El apply debe ITERAR solo sobre filas `pending` (las `accepted`/`rejected` que el profe corrigió quedan intactas). Query: `SELECT exercise_id, proposed_milestone_exercise_id FROM exercise_milestone_proposals WHERE status = 'pending'`.

⚠️ **Orden de aplicación (CRÍTICO — validar en plan):** `acceptMilestoneReview` con `role='variante'` valida que el hito destino NO sea él mismo una variante (service.ts:1073-1077) y que el ejercicio NO tenga variantes colgando (service.ts:1078-1087). En un apply masivo, si una variante se procesa ANTES de que su hito quede como hito, las validaciones de partición (misma `route × effort`, service.ts:1065-1072) igual pasan (los hitos arrancan con `milestone_exercise_id NULL` = ya son hito por default). El apply debe procesar TODOS los `role='hito'` primero, luego los `role='variante'`, para que la validación "el hito destino no es variante" nunca falle por orden.

**Dry-run (D-01):** modo READ-ONLY que corre `proposeMilestones(catalog)` (ya invocado en :103) y agrupa la salida por ruta → imprime el plan hito→variantes con `confidence`/`movementToken`/`stepRank` por fila, SIN tocar la DB. Caso testigo: filtrar/destacar la ruta `TTB`/Front Lever. Reusar el `console.log` legítimo del CLI (header :27). El dry-run NO necesita la DB-write path — solo lee el catálogo (`exerciseRows`, :66) y formatea `proposals`.

**Narrowers sin `any`:** reusar `readCatalogRows` (:145) tal cual. Cualquier `db.execute(sql\`SELECT ...pending proposals\`)`nuevo necesita su propio narrower al estilo`readExerciseIdSet` (:183).

---

### A2. `0146_*.sql` — DATA migration (UPDATEs de `milestone_exercise_id`)

**⚠️ Esta es una DATA migration (DML), NO un schema DDL.** El analog estructural es `0089_tren_inferior_replicate_weeks_11_12.sql` (UPDATEs/INSERTs de datos, keyeados, comentarios paso-a-paso); la disciplina de header viene de `0145` (la migración DDL de la misma columna).

**Número:** la última migración es `0145`. La nueva es `0146` (verificar que ninguna otra rama la haya tomado antes de generar).

**Header obligatorio (copiar de 0145:38-43 — comment safety + hand-written):**

```sql
-- Comment safety (Phase 103-01 invariant): el runner splittea por punto y coma
-- ANTES de strippear los comentarios de línea, así que ningún comentario lleva
-- ese caracter. Cada statement termina con un único terminador en su propia línea.
--
-- Hand-written SQL (drizzle-kit meta journal desincronizado).
```

⚠️ **NUNCA un `;` dentro de un comentario** — regla dura del runner del proyecto (memoria del usuario [[feedback_no_semicolon_in_sql_comments]]); rompe la migración entera porque el runner splittea por `;` antes de strippear `--`.

**Forma del statement — D-06/D-07 condiciona la clave:**

- **Si catálogo idéntico local↔prod (D-07 verificado):** UPDATE keyeado por `id`:
  ```sql
  UPDATE exercises SET milestone_exercise_id = <hito_id> WHERE id = <variante_id>;
  ```
- **Si los IDs divergen (fallback D-07):** keyear por nombre natural (analog: `0089` usa `REPLACE`/JOIN por clave natural en vez de id; otras data-migrations como `0064_rename_nuevo_guerrero.sql`, `0067_goal_plan_rename.sql` keyean por `WHERE name = '...'`). Para milestone: resolver `milestone_exercise_id` vía sub-SELECT por nombre de hito dentro de la misma ruta:
  ```sql
  UPDATE exercises v
    JOIN exercises h ON h.exercise = '<NOMBRE HITO>' AND h.route = '<RUTA>'
    SET v.milestone_exercise_id = h.id
    WHERE v.exercise = '<NOMBRE VARIANTE>' AND v.route = '<RUTA>';
  ```
  ⚠️ El JOIN por nombre asume unicidad `(exercise, route)`; el plan debe verificarla o el UPDATE pega de más.

**Generación:** los UPDATEs se EMITEN desde el dry-run/apply local (capturar `exercise_id → milestone_exercise_id` resultante). NO escribir a mano una por una; el CLI de A1 debería poder emitir el `.sql` (o un script que lea el estado post-apply local).

**Rollback documentado (D-05):** junto al `.sql`, en un comentario o doc, el comando inverso:

```sql
UPDATE exercises SET milestone_exercise_id = NULL WHERE milestone_exercise_id IS NOT NULL;
```

(o acotado a las propuestas heurísticas aceptadas no corregidas — D-05 deja la versión acotada como "opcional"). Sin rollback automático.

**`_migrations` table es la fuente de verdad** — el runner del proyecto (`run-migrations.ts`) la trackea; aplicar en prod vía pipeline (`pnpm db:migrate`), nunca `drizzle-kit migrate` ni CLI manual sobre prod (D-06, CLAUDE.md, [[feedback_prod_data_via_migrations]]).

---

### A3. Test del apply (idempotente + truth correcto)

**Analog A (accept/idempotencia):** `test/exercises/proposal-review.test.ts` — patrón "accept escribe truth en tx, re-run no duplica, member→403". Para milestone: tras `--apply`, `exercises.milestone_exercise_id` queda poblado para variantes y NULL para hitos; el re-run no toca propuestas `accepted` (D-04).

**Analog B (driver del CLI sin spawnear proceso):** `test/exercises/bootstrap-dimensions.test.ts` importa `runBootstrap` y lo corre contra la DB per-worker. Igual acá: importar `runBootstrapMilestones` (ya exportada) + la función de apply nueva, correrlas contra la DB de test. Seeds: helpers `createRoute`/`createExercise` de `test/tree-editor/tree-editor.test.ts:36-155` (extender `createExercise` con `milestoneExerciseId` ya está hecho en 133).

⚠️ Regla del usuario [[feedback_tests_run_in_ci_not_local]]: NO correr la suite completa local — typecheck local sí, suite en CI al pushear a staging (con confirmación).

---

### Block B

### B1. `tree-editor/service.ts` — query de variantes APARTE + `variants[]` en el payload (D-11)

**Analog (forma de la query):** `getVariants(exerciseId)` ya existente (service.ts:1198-1211):

```typescript
// service.ts:1198-1211 — la forma EXACTA de la query de variantes (a batchear)
return this.db
  .select({
    id: schema.exercises.id,
    name: schema.exercises.exercise,
    dl: schema.exercises.dificultadLineal,
  })
  .from(schema.exercises)
  .where(eq(schema.exercises.milestoneExerciseId, exerciseId))
  .orderBy(asc(schema.exercises.dificultadLineal), asc(schema.exercises.id));
```

**Extensión para `buildEditableTree()` (service.ts:289-582):** agregar un método privado `loadVariantsByMilestone(): Promise<Map<number, MilestoneVariant[]>>` que hace UN SELECT de TODAS las variantes (`WHERE milestone_exercise_id IS NOT NULL`) y las agrupa en memoria por `milestoneExerciseId` (mismo patrón "cargar todo y agrupar en JS" que `loadGraphNodes`/`loadAllEdges`, evita subqueries correlacionadas — Pitfall 3 del milestone). Forma:

```typescript
const rows = await this.db
  .select({
    id: schema.exercises.id,
    name: schema.exercises.exercise,
    dl: schema.exercises.dificultadLineal,
    milestoneExerciseId: schema.exercises.milestoneExerciseId,
  })
  .from(schema.exercises)
  .where(isNotNull(schema.exercises.milestoneExerciseId)) // ← isNotNull, importar de drizzle-orm
  .orderBy(asc(schema.exercises.dificultadLineal), asc(schema.exercises.id));
// agrupar: Map<milestoneExerciseId, MilestoneVariant[]>
```

⚠️ **`backboneNodeConditions()` NO se toca.** Esta query es SEPARADA y trae justo lo que el predicado backbone EXCLUYE (`milestone_exercise_id IS NOT NULL`). El docblock de `backbone-scope.ts:1-32` declara el predicado como source-of-truth compartido con member-tree/getNeighbor/rebuild — la fase NO debe modificarlo (D-11, scope boundary del CONTEXT). El test de consistencia de node-set en `rebuild-progression-graph.test.ts` (T-133-30) protege el mirror.

**Embeber en el DTO:** `loadGraphNodes` ya hace el `Promise.all` con `loadAllEdges` en `buildEditableTree` (service.ts:290-293). Agregar `loadVariantsByMilestone()` al `Promise.all`. En el armado de `EditableNode` (la función `toEditable` dentro de `orderNodes`, service.ts:478-484), adjuntar `variants: variantsByMilestone.get(n.exerciseId) ?? []`. La interfaz `EditableNode` (service.ts:76-83) gana `variants: MilestoneVariant[]` (el tipo `MilestoneVariant` ya existe en service.ts:163-167).

**`MilestoneVariant` ya definido** (service.ts:162-167): `{ id, name, dl }`. Decisión de discreción (CONTEXT): orden de variantes por `dl` ascendente — el `orderBy` de arriba ya lo da.

---

### B2. `tree-editor/schemas.ts` — agregar `variants` a `editableNodeSchema`

**Analog:** sí mismo. `editableNodeSchema` (schemas.ts:19-29) gana una propiedad `variants`:

```typescript
// schemas.ts:19-29 — extender con variants (forma de milestoneVariantsResponseSchema:194-210)
const editableNodeSchema = {
  type: "object",
  properties: {
    exerciseId: { type: "number" },
    name: { type: "string" },
    dificultadLineal: { type: "number" },
    effort: { type: "string" },
    orderSource: { type: "string", enum: ["auto", "manual"] },
    // ← NUEVO: variantes colgando del hito (truth column)
    variants: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "dl"],
        properties: {
          id: { type: "number" },
          name: { type: "string" },
          dl: { type: "number" },
        },
      },
    },
  },
} as const;
```

El item-shape es VERBATIM el de `milestoneVariantsResponseSchema` (schemas.ts:194-210) — copiar de ahí. `editableTreeResponseSchema` (schemas.ts:83-89) no cambia (hereda el node schema vía partition→route→category).

---

### B3. `tree-editor/routes.ts` — sin cambios de handler (solo el response schema crece)

`GET /tree` (routes.ts:53-76) llama `service.buildEditableTree()` y responde `editableTreeResponseSchema`. Como B2 extiende el schema in-place, el handler NO cambia. El guard de roles plugin-level (routes.ts:44-51, `TRAINING_ROLES`→403) ya cubre la ruta. Confirmar en plan que no hace falta endpoint nuevo (las variantes viajan en `/tree`, NO en `/milestone/:id/variants` que queda para el side-panel on-demand existente).

---

### B4. `types/tree-editor.ts` — espejar `variants[]` en `TreeNode`

**Analog:** sí mismo. `TreeNode` (types:12-18) gana `variants: MilestoneVariant[]` (el tipo `MilestoneVariant` ya existe en types:141-145, idéntico al backend):

```typescript
// types/tree-editor.ts:12-18 — extender (espejo 1:1 del backend, líneas 3 del docblock)
export interface TreeNode {
  exerciseId: number;
  name: string;
  dificultadLineal: number | null;
  effort: string;
  orderSource: OrderSource;
  variants: MilestoneVariant[]; // ← NUEVO (puede arrancar [] si el backbone no tiene variantes)
}
```

`MilestoneVariant` (types:141-145) ya está: `{ id, name, dl }`. La llamada `fetchTree` (useTreeEditorApi.ts:32-47) NO cambia — el payload crece, el axios call es el mismo.

---

### B5. `ExerciseFlowNode.vue` — toggle expand/collapse + contador "+N variantes" (D-09/D-10)

**Analog A (el chevron a reusar — patrón de RouteFlowNode):** `RouteFlowNode.vue:35-39`:

```vue
<!-- RouteFlowNode.vue:35-39 — chevron unfold_more/unfold_less a replicar en el nodo hito -->
<q-icon
  :name="data.expanded ? 'unfold_less' : 'unfold_more'"
  size="18px"
  class="route-flow-node__chevron"
/>
```

El chevron se muestra SOLO cuando el hito tiene variantes (`data.variants.length > 0`).

**Analog B (el contador/badge — patrón del badge `pendingCount`):** `RouteFlowNode.vue:61-69`:

```vue
<!-- RouteFlowNode.vue:61-69 — badge clickeable con tooltip, plantilla del "+N variantes" -->
<q-badge
  v-if="data.pendingCount > 0"
  color="orange-8"
  class="route-flow-node__pending"
  @click.stop="$emit('review')"
>
  {{ data.pendingCount }}
  <q-tooltip>{{ data.pendingCount }} propuestas por revisar — click para abrir</q-tooltip>
</q-badge>
```

El nuevo: chip "+N variantes" (color neutro, ej. `grey-7`), visible cuando colapsado y `variants.length > 0`. El toggle emite un evento al page (`@toggle-variants` con el `exerciseId`) — NO maneja estado interno (el estado de expansión vive en el page, D-10, análogo a `expandedRoutes`).

**Extender `ExerciseNodeData`** (ExerciseFlowNode.vue:9-21): agregar `variants: MilestoneVariant[]` y `variantsExpanded: boolean` (el page setea este último al construir el nodo, igual que setea `expanded` en RouteNodeData). `defineEmits<{ toggleVariants: [exerciseId: number] }>()`.

**Bandas de las variantes (Claude's discretion):** reusar `dlBand()`/`bandTextClass()` de `constants/levels.ts` (ya importados en este archivo, ExerciseFlowNode.vue:7) para el color por `dl` de cada variante — el mismo patrón `stripeStyle`/`badgeColor` (ExerciseFlowNode.vue:30-42) que el nodo hito ya usa. Las variantes se dibujan como sub-nodos debajo del hito (el page las posiciona; ver B6).

---

### B6. `TreeMapPage.vue` — estado de expansión por hito + render de variantes colgando

**Analog A (estado de expansión — espejo de `expandedRoutes`):** TreeMapPage.vue:93 + 449-455:

```typescript
// TreeMapPage.vue:93 — analog para el estado de hitos expandidos
const expandedRoutes = ref<Set<string>>(new Set());
// :449-455 — toggle a replicar para milestones (keyear por exerciseId)
function toggleRoute(code: string): void {
  const next = new Set(expandedRoutes.value);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  expandedRoutes.value = next;
  rebuildGraph();
}
```

Nuevo: `const expandedMilestones = ref<Set<number>>(new Set())` + `toggleMilestone(exerciseId)` idéntico. **D-10: los hitos con variantes arrancan COLAPSADOS** — el Set arranca vacío, igual que `expandedRoutes`. Limpieza tras refetch: espejar TreeMapPage.vue:153-155 (`expandedRoutes` se filtra a las rutas que aún existen) — filtrar `expandedMilestones` a los exerciseIds que aún tengan variantes.

**Analog B (construcción del nodo + edge en el chain loop):** TreeMapPage.vue:315-353. Dentro del `chain.forEach`, cada nodo `ex` ya se construye con su `data` (TreeMapPage.vue:321-334). Agregar al `data`: `variants: ex.variants ?? []`, `variantsExpanded: expandedMilestones.value.has(ex.exerciseId)`. Si está expandido, empujar sub-nodos variante debajo (mismo patrón de posicionamiento `position: { x, y: chainY0 + i*stepY }` con un offset extra) y aristas hito→variante (estilo a discreción — sugerido punteado tenue para distinguir de la cadena backbone, ver los estilos de edge ya definidos en TreeMapPage como `XRUTA_EDGE_STYLE`/`AUTO_COLOR`/`MANUAL_COLOR`).

⚠️ **Impacto en el layout de banda (`maxChainLen`/`bandY`):** TreeMapPage.vue:281, 356-360 calculan la altura de la banda con `maxChainLen`. Si las variantes expandidas agregan filas, ese cálculo debe contemplarlas o las bandas se solapan. Validar en plan (es el mismo mecanismo que ya adapta la altura a la cadena más larga expandida).

**Analog C (wiring del toggle desde el nodo):** el template VueFlow registra el slot del nodo exercise en TreeMapPage.vue:1337-1339:

```vue
<!-- TreeMapPage.vue:1337-1339 — agregar el handler @toggle-variants como @review en route -->
<template #node-exercise="props">
  <ExerciseFlowNode :data="props.data" :selected="props.selected" />
</template>
```

Patrón del wiring de evento: el slot `#node-route` (TreeMapPage.vue:1334-1336) ya hace `@review="openReview(props.data.code)"`. Replicar: `@toggle-variants="toggleMilestone"`.

**Analog D (click handler):** `onNodeClick` (TreeMapPage.vue:437-447) ya distingue `route` (toggle) vs `exercise` (select para el panel). El toggle de variantes va por el botón/chevron del nodo (emit dedicado), NO por el click del nodo entero — para no romper la selección del panel lateral existente. Decidir en plan: chevron click `@click.stop` → emit `toggleVariants`.

---

### B7. `constants/levels.ts` — reuso directo (sin cambios)

`dlBand()` (levels.ts:57-60), `bandTextClass()` (levels.ts:66-68) y `DL_BANDS` (levels.ts:42-49) ya existen y se usan en `ExerciseFlowNode.vue`. Las variantes reusan la misma banda por `dl`. **NO modificar** — la fase 133 ya hizo la extracción DRY.

---

## Shared Patterns

### Truth de `milestone_exercise_id` SOLO vía accept transaccional

**Source:** `TreeEditorService.acceptMilestoneReview` (service.ts:982-1151) — única ruta que escribe la columna, en `db.transaction`, con poda de aristas (`pruneDegradedVariantEdges` :1405) y flip de la propuesta. **Apply to:** Block A — el `--apply` NO escribe la columna directo; llama este método (o reusa su cuerpo). Anti-patrón explícito (CONTEXT D-03): el bootstrap/heurística escribiendo truth directo.

### Predicado backbone intocable (query de variantes APARTE)

**Source:** `backboneNodeConditions()` (backbone-scope.ts:44-52, `milestone_exercise_id IS NULL` en :49). **Apply to:** Block B — la query de variantes (B1) es SEPARADA (`isNotNull(milestoneExerciseId)`), nunca toca el predicado compartido. Mirror raw-SQL en `rebuild-progression-graph.ts` guardado por test (T-133-30).

### Bulk con aislamiento por-fila

**Source:** `ProposalService.bulkAccept` (proposal-service.ts:275-298) — try/catch por item, `log.warn` + continue, retorna el count aplicado. **Apply to:** el `--apply` masivo de Block A.

### Guard de roles + errores tipados

**Source:** hook plugin-level `TRAINING_ROLES`→403 (routes.ts:44-51) + `handleServiceError` + `TreeEditorError extends AppError` (service.ts:65-69, status 400/404 nunca 500). **Apply to:** ningún endpoint nuevo en esta fase (Block B solo crece el response schema de `/tree`); si el plan agrega uno, hereda el guard del plugin gratis.

### Idiom frontend de fetch/mutación

**Source:** `useTreeEditorApi.ts` (`fetchTree` :32, extractError + Notify + log.error + rethrow; `cleanup()` no-op-safe :210, sin `onUnmounted` interno). **Apply to:** `fetchTree` NO cambia (el payload crece solo). Estado de expansión de hitos en el page, no en el composable.

### Migraciones hand-written + `_migrations` como fuente de verdad

**Source:** disciplina de header de `0145` (:38-43); `0089` como analog de DATA migration keyeada. **Apply to:** A2. Sin `;` en comentarios; un statement por terminador; aplicar en prod vía pipeline (`pnpm db:migrate`), nunca `drizzle-kit migrate`.

### Logging

- **API:** `request.log`/`app.log` (Pino). CLI standalone `bootstrap-milestones.ts`: `console.log` legítimo, documentado en el header (:27).
- **Admin:** `createLogger()` de `src/utils/logger.ts` (useTreeEditorApi.ts:17). Nunca `console.log`.

---

## No Analog Found

Ninguno. Los dos conceptos "nuevos" de la fase ya tienen mecánica construida:

- **Apply masivo de propuestas** → `acceptMilestoneReview` (truth + tx + poda) + `bulkAccept` (aislamiento por-fila).
- **Render hito→variante colapsable** → `getVariants` (forma de query) + el toggle/contador de `RouteFlowNode` un nivel arriba + `dlBand` para las bandas.

El único riesgo SIN analog directo es la **paridad de catálogo local↔prod (D-07)** — no es código sino una verificación de datos que el RESEARCH/PLAN debe resolver antes de elegir la clave (`id` vs nombre) de la DATA migration A2.

## Metadata

**Analog search scope:** `el-templo-api/{bootstrap-milestones.ts}`, `el-templo-api/src/modules/{tree-editor,admin,exercises}`, `el-templo-api/src/db/{migrations,schema}`, `el-templo-admin/src/{pages/TreeMapPage.vue,components/treemap,composables,types,constants}`
**Files scanned:** 13 candidatos, 11 leídos completos + rangos dirigidos de TreeMapPage.vue (1.3k líneas)
**Pattern extraction date:** 2026-06-08
**Validez:** offsets verificados contra el working tree local (branch `staging`, milestone v5.1 sin pushear). Si CI introduce cambios en los módulos tree-\*, re-verificar números de línea antes de ejecutar.
