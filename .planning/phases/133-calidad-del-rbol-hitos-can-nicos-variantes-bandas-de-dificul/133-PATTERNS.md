# Phase 133: Calidad del árbol — hitos canónicos, variantes, bandas y sub-grupos — Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 19 archivos nuevos/modificados (11 API + 8 admin)
**Analogs found:** 18 / 19 (solo el "SubgroupFlowNode" opcional tiene analog parcial)

Todos los analogs fueron leídos y verificados en esta sesión contra el código real (staging local). La fase es 100% composición de mecanismos existentes de fases 124–128 — cada archivo nuevo tiene un analog casi literal.

## File Classification

| New/Modified File                                                                         | New?           | Role                           | Data Flow                 | Closest Analog                                                                                                    | Match Quality |
| ----------------------------------------------------------------------------------------- | -------------- | ------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| `el-templo-api/src/db/migrations/0145_milestone_exercise_id.sql`                          | NEW            | migration                      | DDL                       | `0143_route_progression_model.sql` (ALTER+header) + `0138_create_exercise_dimension_proposals.sql` (CREATE TABLE) | exact         |
| `el-templo-api/src/db/schema/exercises.ts`                                                | MOD            | model                          | —                         | `canonicalExerciseId` en el MISMO archivo (líneas 55-58)                                                          | exact         |
| `el-templo-api/src/db/schema/exercise-milestone-proposals.ts` (opción A)                  | NEW            | model                          | —                         | `exercise-dimension-proposals.ts`                                                                                 | exact         |
| `el-templo-api/src/modules/exercises/milestone-heuristic.ts`                              | NEW            | utility (pura, determinística) | transform                 | `route-progression-map.ts`                                                                                        | exact         |
| `el-templo-api/bootstrap-milestones.ts` (CLI, raíz del paquete)                           | NEW            | CLI script                     | batch                     | `bootstrap-dimensions.ts`                                                                                         | exact         |
| `el-templo-api/src/modules/tree-editor/service.ts`                                        | MOD            | service                        | CRUD transaccional        | sí mismo (`loadGraphNodes`, `reassignRoute`) + `admin/proposal-service.ts` (accept tx)                            | exact         |
| `el-templo-api/src/modules/tree-editor/routes.ts`                                         | MOD            | route                          | request-response          | sí mismo (guard + handler shape)                                                                                  | exact         |
| `el-templo-api/src/modules/tree-editor/schemas.ts`                                        | MOD            | config (JSON schemas)          | —                         | sí mismo                                                                                                          | exact         |
| `el-templo-api/src/modules/tree-progress/service.ts`                                      | MOD            | service                        | read                      | sí mismo (`loadGraphNodes` líneas 252-290)                                                                        | exact         |
| `el-templo-api/rebuild-progression-graph.ts`                                              | MOD            | CLI script                     | batch                     | sí mismo (2 SELECTs: líneas 77-89 y 156-167)                                                                      | exact         |
| Helper predicado backbone compartido (nuevo, ubicación a decidir por planner)             | NEW            | utility                        | —                         | predicado duplicado en 3 servicios (ver Shared Patterns)                                                          | exact         |
| `el-templo-api/test/migrations/0145-milestone-exercise-id.test.ts`                        | NEW            | test                           | —                         | `test/migrations/0121-users-lead-fields.test.ts`                                                                  | exact         |
| `el-templo-api/test/exercises/milestone-heuristic.test.ts`                                | NEW            | test                           | —                         | `test/exercises/bootstrap-dimensions.test.ts` + `proposal-review.test.ts`                                         | role-match    |
| `el-templo-api/test/tree-editor/tree-editor.test.ts`                                      | MOD (extender) | test                           | —                         | sí mismo (helpers createRoute/createExercise/linkEdge)                                                            | exact         |
| `el-templo-admin/src/constants/levels.ts`                                                 | MOD            | config/constant                | —                         | `levelColor()` de `AlumnosPage.vue` líneas 591-608 (a extraer)                                                    | exact         |
| `el-templo-admin/src/components/treemap/ExerciseFlowNode.vue`                             | MOD            | component (Vue Flow node)      | render                    | sí mismo                                                                                                          | exact         |
| `el-templo-admin/src/components/treemap/RouteFlowNode.vue`                                | MOD            | component                      | render                    | sí mismo (badge `pendingCount`)                                                                                   | exact         |
| `el-templo-admin/src/pages/TreeMapPage.vue`                                               | MOD            | page                           | request-response + render | sí mismo (drawer, rebuildGraph, diálogos)                                                                         | exact         |
| `el-templo-admin/src/composables/useTreeEditorApi.ts`                                     | MOD            | composable                     | request-response          | sí mismo + `useProposalsApi.ts`                                                                                   | exact         |
| `el-templo-admin/src/types/tree-editor.ts`                                                | MOD            | types                          | —                         | sí mismo                                                                                                          | exact         |
| Label/nodo de sub-grupo R3 (posible componente nuevo)                                     | NEW?           | component                      | render                    | `CategoryFlowNode.vue` (24 líneas, nodo label-only)                                                               | role-match    |
| `AlumnosPage.vue` / `AlumnoDetailPage.vue` / `SessionsPage.vue` / `EditableBlockCard.vue` | MOD            | pages/component                | —                         | extracción DRY (importan `levelColor` desde constants)                                                            | exact         |

## Pattern Assignments

### 1. `0145_milestone_exercise_id.sql` (migration, DDL)

**Analogs:** `el-templo-api/src/db/migrations/0143_route_progression_model.sql` (header + ALTER style) y `0138_create_exercise_dimension_proposals.sql` (CREATE TABLE para la tabla de propuestas opción A, naming de FK).

**Header obligatorio** (copiar la disciplina de 0143/0138 — comment safety, reversibilidad, hand-written):

```sql
-- Comment safety (Phase 103-01 invariant): el runner splittea por punto y coma
-- ANTES de strippear los comentarios de línea, así que ningún comentario lleva
-- ese caracter. Cada statement termina con un único terminador en su propia línea.
--
-- Hand-written SQL (drizzle-kit meta journal desincronizado, mismo patrón que
-- 0108, 0111, 0121, 0125, 0137, 0138, 0139, 0143).
```

⚠️ NUNCA un `;` dentro de un comentario (regla dura del runner — memoria del usuario).

**ALTER style** (0143 líneas 39-45 — un statement por terminador, AFTER posicional):

```sql
ALTER TABLE exercises
  ADD COLUMN milestone_exercise_id INT NULL DEFAULT NULL AFTER canonical_exercise_id;

CREATE INDEX exercises_milestone_idx ON exercises(milestone_exercise_id);
```

**Self-FK con naming Drizzle-convergente** (0138 líneas 62-63 muestra la convención `<tabla>_<col>_<reftabla>_<refcol>_fk`):

```sql
ALTER TABLE exercises
  ADD CONSTRAINT exercises_milestone_exercise_id_exercises_id_fk
    FOREIGN KEY (milestone_exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
```

**Si el planner elige opción A (tabla de propuestas de hito):** espejo literal de 0138 líneas 48-64 — `CREATE TABLE` con `id INT AI PK`, `exercise_id INT NOT NULL` + `UNIQUE KEY` sobre exercise_id, `status ENUM('pending','accepted','rejected') DEFAULT 'pending'`, `engine VARCHAR(30)`, `confidence INT`, `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, FK `ON DELETE CASCADE` (las propuestas no tienen peso histórico, contraste con SET NULL del truth).

⚠️ Pitfall 1 del RESEARCH: el nombre físico en el `ALTER` debe coincidir EXACTO con el 1er arg de `int()` en el schema Drizzle ([[reference_drizzle_enum_column_name]] — CI de 125/126 falló por este drift).

---

### 2. `src/db/schema/exercises.ts` (model — columna nueva)

**Analog:** el mismo archivo, `canonicalExerciseId` líneas 55-58 + índice línea 82.

**Patrón a copiar (espejo exacto):**

```typescript
// exercises.ts líneas 55-58 (existente — copiar cambiando el nombre)
canonicalExerciseId: int("canonical_exercise_id").references(
  (): AnyMySqlColumn => exercises.id,
  { onDelete: "set null" },
),
```

Nuevo: `milestoneExerciseId: int("milestone_exercise_id").references((): AnyMySqlColumn => exercises.id, { onDelete: "set null" })` con docblock que documente la semántica (NULL = hito o sin clasificar → backbone; NOT NULL = variante colgando del hito). Índice en el array de la tabla, espejo de línea 82: `index("exercises_milestone_idx").on(table.milestoneExerciseId)`.

`AnyMySqlColumn` ya está importado en el archivo (línea 8).

---

### 3. `src/db/schema/exercise-milestone-proposals.ts` (model — opción A)

**Analog:** `el-templo-api/src/db/schema/exercise-dimension-proposals.ts` (77 líneas, espejo completo).

**Copiar la estructura entera** — enum de status (líneas 22-26), tabla con FK CASCADE + UNIQUE(exercise_id) + índices de status/route (líneas 52-76):

```typescript
// exercise-dimension-proposals.ts líneas 52-76 (patrón completo)
export const exerciseDimensionProposals = mysqlTable(
  "exercise_dimension_proposals",
  {
    id: int("id").primaryKey().autoincrement(),
    exerciseId: int("exercise_id")
      .references(() => exercises.id, { onDelete: "cascade" })
      .notNull(),
    proposedStep: int("proposed_step"),
    // ...
    status: exerciseProposalStatus.default("pending").notNull(),
    engine: varchar("engine", { length: 30 }),
    confidence: int("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("exercise_dimension_proposals_exercise_uq").on(
      table.exerciseId,
    ),
    index("exercise_dimension_proposals_status_idx").on(table.status),
  ],
);
```

La versión de hitos reemplaza `proposedStep/proposedHabilidad/proposedRoute` por `proposedMilestoneExerciseId INT NULL` (NULL = propuesto como hito) + lo que el planner decida (p.ej. `movementToken VARCHAR` para la agrupación/señal TTB). El docblock del analog (líneas 28-51) documenta la frontera "propuestas nunca en `exercises`, truth solo en accept" — replicarla.

⚠️ Registrar el export en `src/db/schema/index.ts` (verificar cómo exporta los demás).

---

### 4. `src/modules/exercises/milestone-heuristic.ts` (utility pura)

**Analog:** `el-templo-api/src/modules/exercises/route-progression-map.ts` (472 líneas) — REUSAR sus exports, no duplicarlos.

**Funciones existentes a importar (Don't Hand-Roll):**

- `normalizeWords(raw)` (líneas 310-320): uppercase, strip puntos, guiones→espacios, aplica `WORD_ALIASES` (STR→STRADDLE, ASISSTED→ASSISTED…).
- `classify(rawInput, rawRoute)` (líneas 416-437): devuelve `{kind, step, habilidad}` — el escalón EN VIVO (el truth `progression_step` tiene 0 filas pobladas, Pitfall 6).
- `phraseAppears(words, tokenWords)` (líneas 369-382, NO exportada hoy — exportarla o replicar el matching most-specific-first de `firstMatch`/`bySpecificity` líneas 346-393).
- `ROUTE_PROGRESSION_MAP` para el vocabulario de tokens por ruta.

**Patrón estructural a imitar** (del mismo archivo): vocabulario declarativo `Readonly<Record<...>>` + índice compilado a module-load (`COMPILED`, líneas 356-366) + función pura de clasificación. El módulo nuevo agrega el eje "movimiento" (familias de tokens por ruta, p.ej. TTB: {TTB, ATW, WINDSHIELD, BENT ARM, OA, 90}) y agrupa (movimiento × escalón) por partición.

**Bootstrap CLI (`bootstrap-milestones.ts`, raíz del paquete):** copiar la estructura COMPLETA de `bootstrap-dimensions.ts`:

- Header con "console.log is acceptable here: standalone CLI" (líneas 27-28).
- `export async function runBootstrap<TSchema extends Record<string, unknown>>(db: MySql2Database<TSchema>)` (línea 98) — exportada genérica para que el test la corra contra la DB per-worker sin spawnear proceso.
- READ → TRANSFORM puro → INSERT idempotente con `WHERE NOT EXISTS` (líneas 185-192):

```typescript
// bootstrap-dimensions.ts líneas 185-192 — INSERT idempotente/resumable
await db.execute(
  sql`INSERT INTO exercise_dimension_proposals
        (exercise_id, proposed_step, ..., status, engine, confidence)
      SELECT ${p.exerciseId}, ${p.proposedStep}, ..., 'pending', ${ENGINE}, ${p.confidence}
      WHERE NOT EXISTS (
        SELECT 1 FROM exercise_dimension_proposals WHERE exercise_id = ${p.exerciseId}
      )`,
);
```

- Narrowers sin `any` para `db.execute` (`readCatalogRows` líneas 205-229 — patrón obligatorio del proyecto).
- Guard de entrypoint CLI (líneas 261-267): `if (process.argv[1] && process.argv[1].endsWith("bootstrap-milestones.ts"))`.
- Constantes `ENGINE = "milestone-heuristic-v1"` y `CONFIDENCE` por kind (líneas 40-43 del analog).

---

### 5. `src/modules/tree-editor/service.ts` (service — accept hito + filtro + poda)

**Analog A — escritura transaccional de truth:** `src/modules/admin/proposal-service.ts` → `accept()` líneas 130-207. El esqueleto exacto:

```typescript
// proposal-service.ts líneas 131-206 (estructura del accept transaccional)
async accept(id: number, overrides?: AcceptOverrides): Promise<boolean> {
  return this.db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(schema.X).where(eq(schema.X.id, id));
    if (!proposal) throw new Error(`Propuesta ${id} no encontrada`);
    // ... resolver overrides con `!== undefined` (permite clear explícito, líneas 157-164)
    await tx.update(schema.exercises).set(exerciseUpdate).where(eq(schema.exercises.id, exercise.id));
    await tx.update(schema.X).set({ status: "accepted" }).where(eq(schema.X.id, id));
    return true;
  });
}
```

`reject()` (líneas 213-220) es status-only — NUNCA toca `exercises`. `bulkAccept()` (líneas 227-237): cada accept en su propia tx (una mala no rollbackea las otras).

**Analog B — poda acotada de aristas (orphan policy):** `tree-editor/service.ts` → `reassignRoute()` líneas 636-753. El accept de variante debe imitar este bloque dentro de SU MISMA transacción: cargar aristas incidentes al degradado (líneas 685-700, dos SELECTs from/to), decidir por endpoint coords (líneas 728-743), borrar por id con `inArray` (líneas 744-749). Nunca bulk wipe (T-128-05). Para una variante en MEDIO de una cadena, re-encadenar prev→next (extensión nueva — Pitfall 2: cubre particiones locked donde el rebuild no entra).

**Analog C — validación de pertenencia + errores tipados:** `setPrecedenceEdge()` líneas 542-567: ids validados contra el node-set con `TreeEditorError(..., 404)` — nunca 500. `TreeEditorError extends AppError` (líneas 54-58).

**Filtro R1 en `loadGraphNodes()` (líneas 161-194)** — agregar la 5ª condición:

```typescript
// tree-editor/service.ts líneas 175-182 (predicado actual) + R1
.where(
  and(
    isNull(schema.exercises.canonicalExerciseId),
    inArray(schema.exercises.effort, [...VALID_EFFORTS]),
    isNull(schema.exercises.habilidad),
    isNull(schema.exercises.milestoneExerciseId),   // ← NUEVO (R1-FILTER)
    eq(schema.routes.excludedFromTree, false),
  ),
)
```

**R3 — exponer category:** el SELECT de `loadGraphNodes` (líneas 163-173) ya trae `pattern`; agregar `category: schema.exercises.category` y computar la category dominante por ruta server-side (agregación en memoria — todos los servicios del árbol ya cargan todo y agrupan en JS, evita el Pitfall 3 de subqueries correlacionadas). Propagar al DTO `EditableRoute` (líneas 80-89) y al schema.

**Narrower `readAffectedRows`** (líneas 762-783) ya existe en el archivo — reusar para deletes/updates crudos.

---

### 6. `src/modules/tree-editor/routes.ts` + `schemas.ts` (routes nuevas)

**Analog:** los mismos archivos. Cada endpoint nuevo copia el handler shape exacto:

**Guard plugin-level** (routes.ts líneas 31-38 — los endpoints nuevos lo heredan gratis si cuelgan del mismo plugin):

```typescript
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
    return reply
      .status(403)
      .send({ error: "Acceso de administrador requerido" });
  }
});
```

**Handler shape** (routes.ts líneas 100-137, POST /precedence como plantilla): generic tipado en `fastify.post<{Body: ...}>`, `schema: { body, response: {200, 400, 401, 403, 404} }`, try/catch con `handleServiceError(err, reply, request.log, "tree-editor.<método>")`.

**Body schemas** (schemas.ts líneas 100-109 como plantilla): `additionalProperties: false`, `required`, enums para valores cerrados. El `mutationResultSchema` y `errorResponseSchema` existentes (líneas 127-152) se reusan para las respuestas.

Si el drawer integra la revisión de hito en el accept de dimensión existente, el endpoint a extender vive en `src/modules/admin/routes.ts` líneas 1328-1421 (`/admin/exercises/proposals/...` + `/route-progression-map`) — mismo patrón de guard en ese plugin.

---

### 7. `src/modules/tree-progress/service.ts` (filtro espejado — efecto member-visible)

**Analog:** sí mismo, `loadGraphNodes()` líneas 252-290. El predicado es VERBATIM el de tree-editor (líneas 267-278) — agregar `isNull(schema.exercises.milestoneExerciseId)` con el mismo comentario por condición que ya usa el archivo. Pitfall 5: declarar en VERIFICATION/UAT que Mi Árbol del miembro pierde nodos a medida que los profes aceptan variantes (es el objetivo, no un bug).

---

### 8. `rebuild-progression-graph.ts` (filtro en SQL crudo — DOS sitios)

**Analog:** sí mismo. Los dos SELECTs a extender:

**Sitio 1** — nodos backbone (líneas 77-89):

```sql
WHERE e.canonical_exercise_id IS NULL
  AND e.effort IN ('CON', 'EXC', 'ISO')
  AND e.habilidad IS NULL
  AND e.milestone_exercise_id IS NULL   -- ← NUEVO
  AND r.excluded_from_tree = 0
```

**Sitio 2** — `readManualEdgePartitions()` (líneas 156-167): mismo agregado sobre `ef.` y `et.` (ambos endpoints). El docblock del scope (líneas 22-26) también se actualiza.

`getNeighbor` (`src/modules/sessions/progressions/exercise-progression-service.ts`) NO tiene predicado — la membresía es por aristas; se "filtra solo" vía la poda del accept (Pattern B arriba) + rebuild. El test de R1-FILTER debe cubrir la partición locked (Pitfall 2).

---

### 9. Tests nuevos/extendidos

**Migración 0145 → analog `test/migrations/0121-users-lead-fields.test.ts`:** queries a `INFORMATION_SCHEMA` para columna/FK/DELETE_RULE/índices (helper `getColumn` líneas 54-68), round-trip Drizzle, fila única en `_migrations`. La migración ya está aplicada a la DB per-worker por `test/setup.ts` antes de la suite.

**Heurística/bootstrap → analog `test/exercises/bootstrap-dimensions.test.ts`:** importa `runBootstrap` y lo corre contra la DB per-worker sin spawnear proceso (mismo patrón que `rebuild-progression-graph.test.ts` con `runRebuildProgressionGraph`).

**Accept/reject de hito → analog `test/exercises/proposal-review.test.ts`** (accept escribe truth en tx, reject no toca exercises, member→403).

**Seeds → analog `test/tree-editor/tree-editor.test.ts` líneas 36-155:** helpers `createRoute(code, displayName, excludedFromTree)`, `createExercise({name, pattern, effort, dl, route, habilidad})` (extender con `milestoneExerciseId`), `linkEdge(from, to, source)`, `getEdges()`, `seedGraph()` con dos particiones PULLR/PUSHR. `createTestApp`/`createStaffUser`/`getAuthToken`/`cleanAllTestData` de `test/helpers.ts`.

⚠️ Regla del usuario: NO correr la suite completa local — typecheck local sí, tests puntuales del módulo si son baratos, suite en CI al pushear a staging (con confirmación).

---

### 10. `el-templo-admin/src/constants/levels.ts` (DL_BANDS + levelColor extraído)

**Analog:** `AlumnosPage.vue` líneas 591-608 — la paleta verificada (incluye spartan, que el RESEARCH marcaba como assumption A4):

```typescript
// AlumnosPage.vue líneas 591-608 (función a EXTRAER a constants/levels.ts)
function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "kairos":
      return "amber-6";
    case "alfa":
      return "amber-8";
    case "delta":
      return "deep-orange-7";
    case "sigma":
      return "brown-8";
    case "omega":
      return "red-9";
    case "spartan":
      return "grey-9";
    default:
      return "grey";
  }
}
```

Duplicada VERBATIM en 4 archivos (verificado por grep): `AlumnosPage.vue:591`, `AlumnoDetailPage.vue:1084`, `SessionsPage.vue:751`, `EditableBlockCard.vue:616`. La fase la extrae a `constants/levels.ts` (que hoy solo tiene `LEVEL_ORDER`, 7 líneas) y los 4 archivos pasan a importarla (DRY lock del UI-SPEC).

**`DL_BANDS` nuevo (mapeo LOCKED — NO derivar de `LEVEL_LINEAR_MIN`):**

```typescript
export const DL_BANDS = [
  { level: "kairos", min: 1, max: 2, color: "amber-6" },
  { level: "alfa", min: 3, max: 3, color: "amber-8" },
  { level: "delta", min: 4, max: 6, color: "deep-orange-7" },
  { level: "sigma", min: 7, max: 8, color: "brown-8" },
  { level: "omega", min: 9, max: 10, color: "red-9" },
  { level: "spartan", min: 11, max: 12, color: "grey-9" },
] as const;
```

Texto sobre amber (kairos/alfa) = charcoal `$accent`; resto blanco (UI-SPEC, contraste WCAG). dl null/fuera de rango → sin stripe, badge `dl —` en `grey-6`.

---

### 11. `ExerciseFlowNode.vue` (stripe de banda + badge dl)

**Analog:** sí mismo. La interfaz `ExerciseNodeData` (líneas 6-17) ya lleva `dl: number | null`. Cambios del UI-SPEC C1:

- El texto plano `dl {{ data.dl ?? '—' }}` (línea 37) → `q-badge` con color de banda + tooltip `{banda} (dl {min}–{max})`.
- Stripe: `border-left: 4px solid <color>` sobre el borde `$grey-5` existente (línea 57); los estados `--manual` (border $primary, línea 64) y `--selected` (outline, líneas 67-69) NO cambian.
- El badge `Manual` existente (líneas 38-43) es la plantilla del badge nuevo (`q-badge color="primary" label="..." class="q-ml-xs"`).

---

### 12. `RouteFlowNode.vue` (badge prereq R4)

**Analog:** sí mismo — el badge `pendingCount` (líneas 46-54 + estilo `__pending` líneas 120-126) es la plantilla exacta del badge `prereq`:

```vue
<!-- RouteFlowNode.vue líneas 46-54 (patrón existente a replicar) -->
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

El nuevo: `q-badge outline color="grey-8" label="prereq"`, posicionado a la IZQUIERDA del pending (UI-SPEC C6), data nueva en `RouteNodeData` (líneas 5-18).

---

### 13. `TreeMapPage.vue` (drawer hito/variante, sub-grupos, edges R4, leyenda)

**Analog:** sí mismo (1.041 líneas — el UI-SPEC y el RESEARCH recomiendan extraer componentes para los agregados).

**Aristas R4 gris/punteadas** — `rebuildGraph()` líneas 247-268 es donde se dibujan las precedencias hoy; el estilo a usar es el del UI-SPEC (dash `8 4` + `grey-8 #757575` + `ArrowClosed`, `animated: false` — distinto del dashed `6 4 #bdbdbd` "start of chain" de línea 224 y de la precedencia manual animada terracotta de líneas 253-266). El gate `visibleExercises.has(...)` (líneas 248-252) es el gap del Pitfall 7: agregar arista agregada route→route + badge cuando un extremo está colapsado.

**Drawer de revisión** — la sección `tree-map-review` (template líneas 781-892) es donde se monta el eje hito/variante (UI-SPEC C4): filas con selects ya editables in-place (`row.proposedStep`/`row.proposedHabilidad`, líneas 857-888), `acceptOne/rejectOne/bulkAcceptRoute` (líneas 508-556) con `proposalBusyId`/`bulkBusy` como patrón de loading. La señal TTB es un `q-banner dense bg-warning text-white icon="call_split"` arriba de la lista, solo cuando `reviewRoute === 'TTB'`.

**Panel lateral** — `tree-map-panel` (líneas 895-960): el badge Manual/Auto de líneas 903-907 es la plantilla del badge Hito/Variante; las acciones nuevas ("Promover a hito") copian el `q-btn dense outline size="sm"` de "Reasignar ruta" (líneas 944-954).

**Diálogos de confirmación** — patrón exacto en `onConnect` (líneas 399-418): `$q.dialog({title, message, cancel: {label:'Cancelar', flat:true}, ok: {label, color:'primary'}}).onOk(() => { void (async () => {...})(); })`.

**Sub-grupos R3** — el layout por bandas vive en `rebuildGraph()` (líneas 150-272, constantes `LAYOUT` líneas 48-56): ordenar rutas por sub-grupo dentro de la banda + label caption sobre el primer grupo. Si se hace nodo Vue Flow, copiar `CategoryFlowNode.vue` (24 líneas, nodo label-only `draggable:false selectable:false`). Filtro `q-select` denso en la toolbar junto a la búsqueda existente (líneas 703-725).

**Leyenda de bandas** — en la toolbar, junto a los badges Auto/Manual existentes (líneas 729-738).

---

### 14. `useTreeEditorApi.ts` + `types/tree-editor.ts` (llamadas y tipos nuevos)

**Analog:** sí mismos. Cada método nuevo copia el idiom exacto (líneas 63-79, `setPrecedence` como plantilla):

```typescript
async function setPrecedence(body: PrecedenceBody): Promise<MutationResult> {
  try {
    const { data } = await api.post<MutationResult>(
      "/admin/tree-editor/precedence",
      body,
    );
    return data;
  } catch (err: unknown) {
    const message = extractError(err, "Error actualizando la precedencia");
    error.value = message;
    log.error("Failed to set precedence edge", { ...body, error: message });
    Notify.create({ type: "negative", message });
    throw err;
  }
}
```

Contrato de composable (líneas 98-105): `cleanup()` no-op-safe, sin `onUnmounted` interno. `createLogger`, nunca console.log. Tipos: `types/tree-editor.ts` espeja el DTO del backend 1:1 (agregar `category`/sub-grupo a `TreeRoute`, campos de hito a `TreeNode` si aplica); `types/proposal.ts` es el espejo para los tipos de propuesta.

## Shared Patterns

### Predicado de backbone (extraer ANTES de tocar — Pattern 4 del RESEARCH)

**Apariciones verificadas (5):**

1. `tree-editor/service.ts` `loadGraphNodes()` líneas 175-182 (Drizzle)
2. `tree-progress/service.ts` `loadGraphNodes()` líneas 267-278 (Drizzle, VERBATIM)
3. `rebuild-progression-graph.ts` líneas 85-88 (SQL crudo)
4. `rebuild-progression-graph.ts` `readManualEdgePartitions()` líneas 161-167 (SQL crudo, por endpoint)
5. (docblocks que lo declaran "copiado EXACTLY/verbatim" en los 3 archivos)

**Aplicar:** helper Drizzle `backboneNodeConditions()` que devuelva el array de condiciones para los sitios 1-2 (ubicación natural: módulo compartido importable por ambos — el planner decide); para el SQL crudo del rebuild, comentario cruzado + test de consistencia de node-set. DRY agresivo es preferencia explícita del proyecto.

### Guard de roles + manejo de errores API

**Source:** `tree-editor/routes.ts` líneas 31-38 (hook `TRAINING_ROLES`) + `handleServiceError` de `modules/shared/error-handler` + `TreeEditorError extends AppError` (service.ts líneas 54-58).
**Apply to:** todos los endpoints nuevos. Test obligatorio member→403 / sin token→401 (patrón T-128-03, cubierto en tree-editor.test.ts).

### Narrowers sin `any` para `db.execute`

**Source:** `rebuild-progression-graph.ts` `readExerciseNodes` (líneas 266-291) / `readManualEdgePartitionRows` (177-194); `tree-editor/service.ts` `readAffectedRows` (762-783); `bootstrap-dimensions.ts` `readCatalogRows` (205-229).
**Apply to:** cualquier `db.execute(sql\`...\`)`nuevo (heurística, poda, CLI). Regla CLAUDE.md: sin`any`, `catch (err: unknown)` + narrowing.

### Truth solo via accept transaccional

**Source:** `proposal-service.ts` `accept()` — la heurística/bootstrap inserta SOLO `pending`; `exercises.milestone_exercise_id` se escribe únicamente en el accept del profe, en transacción, junto con la poda de aristas. Anti-patrón explícito: la heurística escribiendo truth directo.

### Idiom frontend de mutación

**Source:** `useTreeEditorApi.ts` (extractError + Notify + log.error + rethrow; la página decide refetch) y `TreeMapPage.vue` (`proposalBusyId`/`bulkBusy` para loading por fila; sin optimistic updates en accept/reject — UI-SPEC).
**Apply to:** todas las llamadas nuevas del admin.

### Logging

- API: `request.log`/`app.log` (Pino). CLIs standalone (`bootstrap-*.ts`, `rebuild-*.ts`): console.log legítimo, documentado en el header.
- Admin: `createLogger()` de `src/utils/logger.ts`.

## No Analog Found

| File                                               | Role      | Data Flow | Reason                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Label/nodo de sub-grupo R3 (si se hace componente) | component | render    | No existe un nodo "agrupador intermedio" entre category y route; `CategoryFlowNode.vue` (label-only, 24 líneas) es el analog PARCIAL más cercano — alcanza como plantilla si el planner opta por nodo; la alternativa (label posicional en `rebuildGraph`) no necesita componente |

Sin otros huecos: el "movimiento" de la heurística es el único concepto genuinamente nuevo, y su mecánica (tokens + matching) reusa `route-progression-map.ts`.

## Metadata

**Analog search scope:** `el-templo-api/src/db/{schema,migrations}`, `el-templo-api/src/modules/{tree-editor,tree-progress,exercises,admin,shared}`, `el-templo-api/{rebuild-progression-graph,bootstrap-dimensions}.ts`, `el-templo-api/test/{tree-editor,exercises,migrations}`, `el-templo-admin/src/{pages,components/treemap,composables,constants,types}`
**Files scanned:** 23 candidatos medidos, 17 leídos (completos o por rango dirigido)
**Pattern extraction date:** 2026-06-07
**Nota de validez:** línea-números verificados contra el working tree local (staging, 72+ commits sin pushear). Si CI de v5.1 introduce cambios en módulos tree-\*, re-verificar offsets antes de ejecutar.
