# Phase 133: Calidad del árbol — hitos canónicos, variantes, bandas de dificultad y sub-grupos (backend + admin) — Research

**Researched:** 2026-06-07
**Domain:** Grafo de progresiones existente (Fastify + Drizzle/MySQL) + mapa del árbol en admin (Quasar/Vue 3 + Vue Flow). Reconocimiento de implementación — las decisiones R1-R6 ya están cerradas.
**Confidence:** HIGH (todo verificado contra el código y la DB local de staging post-0144 con bootstrap corrido)

<user_constraints>

## User Constraints (decisiones cerradas — `.planning/research/tree-quality-research.md` §3-4)

No existe `133-CONTEXT.md`. Las decisiones cerradas con el usuario (2026-06-07) que actúan como locked decisions son:

### Locked Decisions

1. **R1 vínculo:** columna nueva `milestone_exercise_id` (NO reusar `canonical_exercise_id` — semánticas distintas; canonical queda libre para dedup futura). El backbone agrega `AND milestone_exercise_id IS NULL`.
2. **R1 curación:** heurística propone hitos (ejercicio más canónico por movimiento × escalón, token exacto del route-progression-map), profe corrige en el drawer de revisión del mapa. Mismo patrón bootstrap→revisión de fase 125 ("aceptar propuesta podría marcar hito vs variante").
3. **R2 bandas:** niveles de miembro existentes INCLUYENDO kairos: **kairos dl 1-2, alfa 3, delta 4-6, sigma 7-8, omega 9-10, spartan 11-12**. Color por nivel + dl numérico visible en cada nodo.
4. **TTB split:** se decide después CON los profes en la revisión, pero la separación TTB / Windshield / ATW es importante — dejar señalizado en la UI de revisión (no perderlo). NO partir la ruta en esta fase.
5. **R3:** sub-grupos por `category` fina como agrupador visual/filtro — "la riqueza queda en las rutas, no convertirla en eje de navegación principal".
6. **R4:** prerequisitos cross-ruta para rutas de élite (FLR arranca en dl 5, PLPU en dl 4) vía aristas `manual` de fase 128 ya existentes + render distinto (gris/punteado) en el mapa, en vez de rellenar escalones bajos.

### Claude's Discretion (no decidido explícitamente)

- Dónde persisten las _propuestas_ de hito (tabla nueva vs columna en `exercise_dimension_proposals` vs compute-on-read) — la decisión solo fija el workflow proponer→revisar→aceptar.
- Cómo se deriva "movimiento" para la heurística (los datos de `exercise_2` están sucios — ver §R1 abajo).
- Detalles de UI del drawer y del render de bandas/sub-grupos.

### Deferred (OUT OF SCOPE de la fase 133)

- R5 (criterio de avance objetivo por hito) y R6 (estados de nodo en member app) → fase 134.
- Split de TTB en 2-3 rutas → decisión posterior de profes (solo señalizar).
  </user_constraints>

<phase_requirements>

## Phase Requirements

IDs no mapeados en ROADMAP ("TBD") — derivados del goal de la fase:

| ID        | Description                                                                            | Research Support                                                                                                   |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| R1-MIG    | Migración `milestone_exercise_id` en `exercises` (FK self, nullable)                   | §Schema actual; migración 0145; patrón self-FK de `canonical_exercise_id`                                          |
| R1-HEUR   | Heurística que propone hito por (movimiento × escalón) por partición (ruta × esfuerzo) | §R1; patrón `bootstrap-dimensions.ts` + `route-progression-map.ts`                                                 |
| R1-REV    | Revisión hito/variante en el drawer de /tree-map (aceptar escribe truth)               | §Admin; drawer de propuestas existente en `TreeMapPage.vue`; `ProposalService.accept` como patrón transaccional    |
| R1-FILTER | backbone/getNeighbor/rebuild filtran variantes (`milestone_exercise_id IS NULL`)       | §Predicado backbone (4 sitios); pitfall de particiones locked                                                      |
| R2-BANDS  | Bandas de dificultad por nodo (kairos→spartan, color + dl numérico)                    | §R2; `ExerciseFlowNode.vue` ya muestra `dl`; paleta `levelColor()` existente en AlumnosPage                        |
| R3-SUBGRP | Sub-grupos por `category` fina dentro de las 5 categorías                              | §R3; datos de category verificados en DB; `EditableTree` hoy NO trae category                                      |
| R4-XRUTA  | Prerequisitos cross-ruta en gris para FLR/PLPU                                         | §R4; `precedenceEdges` + `setPrecedenceEdge` existen; falta render diferenciado y visibilidad con rutas colapsadas |
| TTB-SIG   | Señalizar split TTB (TTB/Windshield/ATW) en la UI de revisión                          | §TTB; agrupamiento por movimiento de la heurística reutilizable como señal                                         |

</phase_requirements>

## Summary

La fase es 100% reconocimiento interno: no hay librerías nuevas, no hay servicios externos. Todo el mecanismo base ya existe y fue construido en fases 124-128 (rework "Progresión por ruta + Habilidad", migraciones 0143/0144): el grafo persiste en `exercise_progressions` (898 aristas `auto`, 16 `manual` en staging local), el constructor determinístico es `el-templo-api/rebuild-progression-graph.ts`, la primitiva runtime es `ExerciseProgressionService.getNeighbor`, el árbol editable lo sirve `tree-editor/service.ts`, y la página admin es `TreeMapPage.vue` (Vue Flow) que ya absorbe la revisión de propuestas con un drawer.

Los cuatro entregables encajan así: **R1** = migración 0145 (columna nueva + índice) + heurística de agrupamiento (movimiento × escalón) montada sobre `route-progression-map.ts` + extensión del drawer de revisión + agregar `AND milestone_exercise_id IS NULL` al predicado de backbone que hoy está duplicado VERBATIM en 3 servicios (riesgo DRY concreto, ver pitfalls). **R2** = solo lectura/UI: `dl` ya viaja en el payload del árbol editable y ya se muestra en `ExerciseFlowNode.vue`; falta el mapeo banda→color (constante compartida en admin, paleta `levelColor()` ya existe en `AlumnosPage.vue`). **R3** = el API debe exponer la `category` fina (hoy NO está en `EditableTree`) y la UI agrupa rutas dentro de la banda; los datos verifican que cada ruta tiene una category dominante casi 1:1. **R4** = el mecanismo completo ya existe (aristas manual cross-partición + `precedenceEdges` en el payload + render animado); falta el estilo gris/punteado y resolver que hoy las aristas solo se ven con AMBAS rutas expandidas.

**Hallazgo crítico de datos:** las columnas truth `progression_step` y `habilidad` están en CERO filas pobladas — hay 1.176 propuestas `pending` sin revisar. La heurística de hitos necesita el escalón, así que NO puede leer el truth: debe llamar `classify()` en vivo (determinístico) o leer `proposed_step` de las propuestas. Esto también significa que el backbone HOY incluye los 973+ nodos sin filtrar variantes de habilidad — el filtro por `milestone_exercise_id` y el de `habilidad` van a actuar juntos a medida que los profes acepten.

**Primary recommendation:** una migración (0145), un módulo de heurística de hitos junto a `route-progression-map.ts`, endpoints nuevos colgados de `/admin/tree-editor` (o un módulo hermano), extensión del drawer de `TreeMapPage.vue`, y extraer el predicado de backbone a UN helper compartido antes de tocarlo en 3 lugares.

## Architectural Responsibility Map

| Capability                                         | Primary Tier                             | Secondary Tier              | Rationale                                                                                    |
| -------------------------------------------------- | ---------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------- |
| Columna `milestone_exercise_id` + migración 0145   | DB (Drizzle schema + SQL manual)         | —                           | Patrón idéntico a `canonical_exercise_id` (self-FK, SET NULL, índice)                        |
| Heurística hito por (movimiento × escalón)         | API (módulo determinístico, sin LLM)     | CLI opcional                | Igual que `bootstrap-dimensions.ts`/`route-progression-map.ts`: pura, testeable              |
| Persistencia de propuestas de hito + accept/reject | API (servicio transaccional)             | DB                          | Accept escribe truth en transacción — patrón `ProposalService.accept`                        |
| Filtrado de variantes en backbone                  | API (3 servicios + rebuild)              | —                           | Predicado compartido; getNeighbor se filtra solo vía aristas (con excepción — ver pitfall 2) |
| Revisión hito/variante en drawer                   | Admin (Vue)                              | API (endpoints)             | Drawer de revisión ya existe en `TreeMapPage.vue`; se extiende                               |
| Bandas de dificultad (color + dl)                  | Admin (UI pura)                          | —                           | `dl` ya está en el payload; mapeo banda = constante frontend                                 |
| Sub-grupos por category fina                       | API (exponer category) + Admin (agrupar) | —                           | `EditableTree` no trae category hoy; el cómputo de dominante va server-side                  |
| Aristas cross-ruta en gris                         | Admin (render)                           | API (sin cambios probables) | `precedenceEdges` ya viaja; solo estilo + visibilidad                                        |
| Señal split TTB                                    | Admin (UI del drawer)                    | —                           | Solo señalización, ningún dato nuevo                                                         |

## Standard Stack

### Core (todo ya instalado — NO se agrega ningún paquete)

| Library        | Version | Purpose                            | Why Standard                                                            |
| -------------- | ------- | ---------------------------------- | ----------------------------------------------------------------------- |
| drizzle-orm    | ^0.45.1 | ORM / schema / queries             | Ya en uso [VERIFIED: package.json el-templo-api]                        |
| fastify        | ^5.7.4  | API server                         | Ya en uso [VERIFIED: package.json]                                      |
| vitest         | ^4.0.18 | Tests de integración               | Ya en uso [VERIFIED: package.json]                                      |
| @vue-flow/core | ^1.48.2 | Canvas del mapa del árbol          | Ya en uso en `TreeMapPage.vue` [VERIFIED: package.json el-templo-admin] |
| quasar         | ^2.16.0 | UI admin (drawer, badges, selects) | Ya en uso [VERIFIED: package.json]                                      |

### Alternatives Considered

Ninguna — la fase no introduce dependencias. Cualquier plan que proponga instalar un paquete debe justificarlo y pedir aprobación explícita (regla del proyecto: nunca instalar/actualizar dependencias sin preguntar).

## Package Legitimacy Audit

**Esta fase no instala paquetes externos.** No se requiere slopcheck. Cero cambios en `package.json` de los 3 apps.

## Current State (radiografía verificada en DB local, 2026-06-07)

### Tablas relevantes (schema real)

**`exercises`** (`el-templo-api/src/db/schema/exercises.ts`) — columnas clave [VERIFIED: codebase + information_schema]:

| Columna física          | Drizzle             | Tipo                      | Notas                                                                                                                                                                                          |
| ----------------------- | ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | id                  | INT PK AI                 | Referenciado por session_prescriptions / program_content_blocks — NUNCA se borra una fila                                                                                                      |
| `pattern`               | pattern             | varchar(100)              | Eje grueso (~9 valores: PULL/PUSH/LOWER/CORE/MOVILIDAD/FLOW/KL/CARDIO/PLYO) → 5 categorías vía `category-map.ts`                                                                               |
| `category`              | category            | varchar(100) NOT NULL     | **Eje fino para R3** (PULL VERTICAL 291, PUSH HORIZONTAL 263, PULL HORIZONTAL 198, PUSH VERTICAL 152, HIP DOMINANT 147, KNEE DOMINANT 130, CORE ANTERIOR/POSTERIOR/LATERAL, OBLICUOS 28, etc.) |
| `exercise_2`            | exercise2           | varchar(150) NULL         | "Movimiento base" — SUCIO: en TTB es casi único por fila (`TTB 90 BA MID SUPINE`…), en BL es NULL                                                                                              |
| `effort`                | effort              | varchar(10) NOT NULL      | Libre; solo CON/EXC/ISO son contracciones válidas (hay filas con `''`)                                                                                                                         |
| `exercise_level`        | level               | enum(alfa..spartan)       | ⚠️ Columna física = `exercise_level`, NO `level`. Sin kairos (kairos solo en users/completed_sessions, migración 0140)                                                                         |
| `dificultad_lineal`     | dificultadLineal    | INT NOT NULL default 1    | Escala 1-12, fuente de las bandas R2                                                                                                                                                           |
| `route`                 | route               | varchar(20) NOT NULL      | FK lógica a `routes.code` (INNER JOIN)                                                                                                                                                         |
| `progression_step`      | progressionStep     | INT NULL                  | Rank del escalón (0-based) por (ruta×esfuerzo). **HOY: 0 filas pobladas**                                                                                                                      |
| `habilidad`             | habilidad           | varchar(100) NULL         | Variante paralela; NULL = backbone. **HOY: 0 filas pobladas**                                                                                                                                  |
| `canonical_exercise_id` | canonicalExerciseId | INT NULL self-FK SET NULL | Dedup exacto (D-07 de 124). 0 filas en uso. **NO reusar para hitos (locked)**                                                                                                                  |
| `route_pending`         | routePending        | bool default false        | Marcador de saneo                                                                                                                                                                              |

Índices existentes: `(route, effort, level, difficulty)`, `(level)`, `(dificultad_lineal)`, `(route, progression_step)`, `(canonical_exercise_id)`.

**`exercise_progressions`** (`exercise-progressions.ts`) — aristas del DAG: `from_exercise_id` → `to_exercise_id` (to = un escalón MÁS difícil), `source` enum `auto|manual`, FKs CASCADE, UNIQUE(from,to). Estado actual: **898 auto, 16 manual** [VERIFIED: DB local].

**`exercise_dimension_proposals`** (`exercise-dimension-proposals.ts`) — propuestas del bootstrap de 125 (rework 0143): `proposed_step`, `proposed_habilidad`, `proposed_route`, `status` enum pending/accepted/rejected, `engine`, `confidence`. **UNIQUE(exercise_id)** = a lo sumo UNA propuesta viva por ejercicio. Estado actual: **1.176 pending, 0 accepted/rejected** [VERIFIED: DB local].

**`routes`** (`routes.ts`): `code` (unique, varchar 20), `display_name` (0144), `excluded_from_tree` (0143; SPAGAT/BRIDGE/PIKE/HS/AF/HR = 1).

### Migraciones

- Directorio: `el-templo-api/src/db/migrations/` (NO existe `drizzle/`). Última: **0144_route_display_names.sql** → **la nueva es 0145** [VERIFIED: ls].
- SQL escrito a mano (journal de drizzle-kit desincronizado — patrón de 0108/0111/0121/0125/0137-0139/0143). Runner custom: `pnpm db:migrate` → `src/db/run-migrations.ts`, tabla `_migrations` es la fuente de verdad.
- El header de 0143 es la plantilla perfecta de estilo (reversibilidad documentada + "comment safety": el runner splittea por `;` ANTES de strippear `--`).

### El predicado de backbone (duplicado en 3 + 1 sitios) — donde entra `milestone_exercise_id IS NULL`

```sql
canonical_exercise_id IS NULL
AND effort IN ('CON','EXC','ISO')
AND habilidad IS NULL
AND routes.excluded_from_tree = 0
```

| Sitio                 | Forma                                                           | Archivo                                                                                 |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Constructor del grafo | SQL crudo (`db.execute(sql\`...\`)`)                            | `el-templo-api/rebuild-progression-graph.ts` (raíz del paquete, no src/) — líneas 77-89 |
| Árbol del miembro     | Drizzle `.where(and(...))`                                      | `src/modules/tree-progress/service.ts` → `loadGraphNodes()` líneas 252-290              |
| Árbol editable admin  | Drizzle `.where(and(...))` (copiado "EXACTLY (D-06)")           | `src/modules/tree-editor/service.ts` → `loadGraphNodes()` líneas 161-194                |
| getNeighbor           | **NO tiene predicado** — la membresía es por aristas incidentes | `src/modules/sessions/progressions/exercise-progression-service.ts`                     |

`getNeighbor` se "filtra solo" cuando el rebuild deja a las variantes sin aristas — **excepto en particiones locked** (ver Pitfall 2). Además `rebuild-progression-graph.ts` repite el predicado una segunda vez en `readManualEdgePartitions()` (líneas 155-167) — son **5 apariciones textuales** del predicado a extender.

### Endpoints existentes

**`/api/admin/tree-editor`** (`tree-editor/routes.ts`, guard `TRAINING_ROLES` coach/owner, 403 para member):

- `GET /tree` → `EditableTree { categories: [{key,label,routes:[{id,name,route,partitions:[{effort,overridden,nodes:[{exerciseId,name,dificultadLineal,effort,orderSource}]}]}]}], precedenceEdges:[{fromExerciseId,toExerciseId,source}] }` — **no trae `category` fina ni `pattern`** (gap para R3).
- `POST /reorder` — reescribe partición como cadena manual (la LOCKEA contra rebuild).
- `POST /precedence` — add/remove arista manual; **rechaza aristas same-partition** (solo cross-partición) → es exactamente el mecanismo R4.
- `POST /regroup` — reasigna `exercises.route` + poda acotada de aristas incidentes que quedaron inconsistentes (el "orphan policy" D-05 — patrón a imitar para la poda de variantes degradadas).

**`/api/admin/exercises/...`** (proposal-service): `listProposals` (join exercises, filtro route/status), `accept(id, overrides)` (transacción: escribe truth `progression_step`/`habilidad`/`route` + flip status), `reject`, bulk accept. `GET /admin/exercises/route-progression-map` sirve los tokens del mapa (DRY con el front).

### Admin frontend

- Página: `el-templo-admin/src/pages/TreeMapPage.vue` (1.041 líneas — ya grande; los agregados de esta fase deberían extraer componentes). Ruta `/tree-map`, menú "Árbol" en `AdminLayout.vue`, título "Árbol de ejercicios".
- Nodos del canvas: `src/components/treemap/CategoryFlowNode.vue`, `RouteFlowNode.vue` (badge naranja con `pendingCount` → abre drawer de revisión), `ExerciseFlowNode.vue` (**ya muestra `dl {{ data.dl }}`** — el dl numérico de R2 ya está; falta el color de banda).
- Drawer de revisión (`tree-map-review`, 420px, derecha): lista propuestas pendientes de UNA ruta, con selects de escalón (tokens del route-map) y habilidad, accept/reject individual + "Aceptar todas". **Acá se monta la revisión hito/variante de R1 y la señal TTB.**
- Panel lateral del ejercicio seleccionado (`tree-map-panel`): mover en escalera, reasignar ruta — candidato para mostrar/editar hito↔variante del nodo.
- Composables: `src/composables/useTreeEditorApi.ts`, `useProposalsApi.ts` (con `cleanup()`, patrón del proyecto). Tipos: `src/types/tree-editor.ts`, `src/types/proposal.ts`.
- Layout: bandas verticales por categoría, rutas como columnas, cadena expandida hacia abajo. Aristas de precedencia: `animated: true`, color `MANUAL_COLOR = '#96593a'` (terracotta) si manual, `#9e9e9e` si auto, **solo si AMBOS extremos están expandidos** (`visibleExercises.has(...)` — gap para R4).

### Niveles y colores (fuente para R2)

- `LEVEL_LINEAR_MIN` (`src/modules/sessions/pipeline/utils/level-mapping.ts`): alfa 1, delta 4, sigma 7, omega 9, spartan 11. `levelCeiling()` en tree-progress deriva techos: alfa→3, delta→6, sigma→8, omega→10, spartan→12. `toContentLevel('kairos') → 'alfa'`.
- ⚠️ La banda R2 **locked** (kairos 1-2, alfa 3) NO coincide con `LEVEL_LINEAR_MIN` (alfa arranca en dl 1). Es un mapeo de UI deliberado — el planner NO debe "corregirlo" para alinearlo, ni tocar `LEVEL_LINEAR_MIN`.
- Admin ya tiene paleta de niveles: `AlumnosPage.vue` `levelColor()`: kairos `amber-6`, alfa `amber-8`, delta `deep-orange-7`, sigma `brown-8`, omega `red-9`, spartan (continúa) — duplicada en varias páginas (AlumnosPage, AlumnoDetailPage, SessionsPage, EditableBlockCard). DRY: extraer a `src/constants/levels.ts` (que hoy solo tiene `LEVEL_ORDER` con kairos) junto con el mapeo banda dl→nivel.
- Paleta de marca: terracotta/clay/gold — sin azul (regla de marca).

### Datos verificados que dan forma a cada R

**R1 — particiones más largas del backbone** [VERIFIED: DB local]:

| Ruta × esfuerzo | Ejercicios | dl distintos | category distintas |
| --------------- | ---------- | ------------ | ------------------ |
| TTB CON         | 102        | 11           | 2                  |
| FL CON          | 65         | 12           | 3                  |
| TTB ISO         | 42         | 10           | 2                  |
| OAPU CON        | 40         | 9            | 1                  |
| OAP CON         | 39         | 10           | 1                  |

`exercise_2` en TTB CON es casi único por fila (OA TTB 4, TTB 3, TTB BENT ARM TOP 2, TTB WINDSHIELD 2, TTB ATW 2…) → **NO sirve como "movimiento" sin normalización**. La heurística debe derivar el movimiento por tokens del nombre (patrón `normalizeWords()` de `route-progression-map.ts`) — p.ej. familia de tokens {TTB, ATW, WINDSHIELD, BENT ARM, OA, 90} — y cruzarlo con el token de escalón (TUCK/STRADDLE/FULL para TTB).

**R2 — distribución dl global**: dl 1→117, 2→125, 3→142, 4→173, 5→200, 6→150, 7→134, 8→150, 9→119, 10→89, 11→61, 12→33 [VERIFIED: DB local]. Las 6 bandas quedan razonablemente pobladas.

**R3 — category dominante por ruta (backbone)** [VERIFIED: DB local]: casi 1:1 — FL→PULL HORIZONTAL (111 vs 11 CORE ANTERIOR + 4 PULL VERTICAL), TTB→PULL VERTICAL (139 vs 10 CORE ANTERIOR), OAP→PULL VERTICAL, MU→PULL VERTICAL, OAR/FLR/MN-RP→PULL HORIZONTAL, PL/PLPU/OAPU/HD-ID/BL→PUSH HORIZONTAL, HSPU/PHS→PUSH VERTICAL, PS/QC/SS/SU→KNEE DOMINANT, NC/HT/DS→HIP DOMINANT, SIDE PCK→OBLICUOS, REVERSE HYPER→CORE POSTERIOR. Agrupar por **category dominante de la ruta** es viable y estable; agrupar por category de cada ejercicio rompería la columna única por ruta del layout.

**R4 — pisos de élite confirmados**: FLR min dl = 5, PLPU min dl = 4 (FL y PL arrancan en 1) [VERIFIED: DB local]. Las 16 aristas manual existentes ya prueban el mecanismo.

## Architecture Patterns

### System Architecture Diagram (flujo R1 propuesto)

```
                      ┌─────────────────────────────────────────────┐
                      │ exercises (catálogo)                        │
                      │ + milestone_exercise_id (0145, NULL=hito)   │
                      └──────┬──────────────────────────┬───────────┘
                             │ read                     │ truth write (solo accept)
                             ▼                          │
  route-progression-map.ts ──► heurística de hitos      │
  (tokens escalón, normalize)  (movimiento × escalón    │
                               por partición ruta×esf.) │
                             │ propone                  │
                             ▼                          │
                      propuestas de hito ───────────────┤
                      (pendientes de profe)             │
                             │ GET                      │ POST accept (tx)
                             ▼                          │
   admin /tree-map ► drawer revisión hito/variante ─────┘
   (TreeMapPage)     + señal split TTB                  │
                                                        ▼ tras accept
                      rebuild-progression-graph ► exercise_progressions
                      (scope + milestone IS NULL,        (auto edges sin variantes)
                       poda/repara variantes degradadas)        │
                             ┌──────────────────────────────────┤
                             ▼                                  ▼
                  tree-editor GET /tree                getNeighbor (player 131)
                  (+ category fina p/ R3,              (variantes sin aristas → null)
                   + milestone IS NULL)
                             ▼
                  TreeMapPage: bandas R2 (color por dl) · sub-grupos R3 ·
                  aristas cross-ruta gris/punteado R4
```

`tree-progress/service.ts` (árbol del miembro) consume el MISMO scope → también gana el filtro (efecto visible en member app, ver Pitfall 5).

### Recommended Project Structure (archivos a tocar/crear)

```
el-templo-api/
├── src/db/schema/exercises.ts                 # + milestoneExerciseId (self-FK, índice)
├── src/db/migrations/0145_milestone_exercise_id.sql   # nueva (estilo 0143)
├── src/modules/exercises/
│   ├── route-progression-map.ts               # reusar normalizeWords/classify; quizá + vocab de movimiento
│   └── milestone-heuristic.ts                 # NUEVO: agrupamiento (movimiento × escalón) puro y testeable
├── src/modules/tree-editor/                   # endpoints hito/variante (o módulo hermano)
│   ├── service.ts                             # + predicado, + category en EditableTree, + accept hito
│   ├── routes.ts / schemas.ts                 # + rutas nuevas
├── src/modules/tree-progress/service.ts       # + milestone_exercise_id IS NULL
├── rebuild-progression-graph.ts               # + filtro en LOS DOS SELECTs
└── test/tree-editor/, test/exercises/         # tests nuevos (patrones existentes)

el-templo-admin/src/
├── pages/TreeMapPage.vue                      # drawer hito/variante, señal TTB, sub-grupos, edges grises
├── components/treemap/ExerciseFlowNode.vue    # color de banda R2 (+ badge hito/variante)
├── components/treemap/...                     # posible SubgroupFlowNode o agrupación visual
├── constants/levels.ts                        # + DL_BANDS (kairos 1-2…spartan 11-12) + levelColor extraído
├── composables/useTreeEditorApi.ts            # + llamadas nuevas
└── types/tree-editor.ts                       # + tipos (category, milestone)
```

### Pattern 1: Migración aditiva manuscrita (0145)

**What:** `ALTER TABLE exercises ADD COLUMN milestone_exercise_id INT NULL`, FK self con `ON DELETE SET NULL` (espejo exacto de `canonical_exercise_id` — los ejercicios nunca se borran pero el SET NULL es la red defensiva), + `CREATE INDEX exercises_milestone_idx ON exercises(milestone_exercise_id)`.
**When to use:** única migración de la fase.
**Example (schema Drizzle, espejo de canonical):**

```typescript
// Source: el-templo-api/src/db/schema/exercises.ts líneas 55-58 (patrón existente)
milestoneExerciseId: int("milestone_exercise_id").references(
  (): AnyMySqlColumn => exercises.id,
  { onDelete: "set null" },
),
```

Semántica: `NULL` = hito (o aún sin clasificar) → en backbone; `NOT NULL` = variante colgando del hito apuntado → fuera del backbone. Nota: el default NULL hace que **nada cambie hasta que un profe acepte** — despliegue seguro sin backfill.

### Pattern 2: Heurística determinística propone, profe confirma, accept escribe truth en transacción

**What:** El patrón completo de fase 125: motor puro sin LLM (`classify()`-style), propuestas revisables, `accept` transaccional como ÚNICO escritor de truth, `reject` no toca `exercises`.
**When to use:** R1-HEUR + R1-REV.
**Restricción dura de datos:** la heurística necesita el escalón pero `progression_step` tiene 0 filas — debe llamar `classify(name+position, route)` en vivo (mismo motor que generó las 1.176 propuestas, determinístico) o leer `proposed_step` de la propuesta pendiente. Recomendación: `classify()` en vivo + override con `proposed_step` si la propuesta ya fue corregida/aceptada.
**Dónde persisten las propuestas de hito (discreción, 3 opciones):**

- **A. Tabla nueva `exercise_milestone_proposals`** (espejo de 0138): + status/engine/confidence, UNIQUE(exercise_id). Pro: patrón literal de 125, trackea rechazos, los profes revisan async (las 1.176 pendientes prueban que la revisión tarda). Contra: una tabla más + migración más larga.
- **B. Columna `proposed_milestone_exercise_id` en `exercise_dimension_proposals`:** encaja con la frase locked "aceptar propuesta podría marcar hito vs variante" (una sola revisión por ejercicio). Contra: las 1.176 filas ya existen → el bootstrap idempotente (NOT EXISTS) las saltea; requiere un pass de UPDATE sobre pendientes + reglas de re-propuesta confusas; mezcla dos ejes de revisión con un solo status.
- **C. Compute-on-read** (GET sirve la agrupación de la heurística en vivo; accept escribe `milestone_exercise_id` directo): cero tablas nuevas, truth solo en accept. Contra: no distingue "rechazado" de "no revisado" → re-propone siempre lo mismo.
- **Recomendación: A** — es el patrón probado, separa los dos ejes de revisión y soporta revisión asíncrona real. El drawer puede mostrar ambos ejes juntos (la propuesta de dimensión + la de hito) para honrar el espíritu de "una pasada del profe".

### Pattern 3: Poda acotada de aristas al degradar a variante (orphan policy)

**What:** Al aceptar que X es variante de un hito M, X sale del backbone → sus aristas incidentes quedan inconsistentes. Imitar `reassignRoute` (tree-editor/service.ts líneas 676-750): en la MISMA transacción del accept, borrar/reparar solo aristas incidentes al ejercicio degradado (re-encadenar prev→next si estaba en medio de una cadena), nunca un wipe masivo.
**Why:** el rebuild NO toca particiones locked (16 aristas manual ya lockean particiones) — sin poda en el accept, una variante dentro de una cadena manual locked conserva aristas y `getNeighbor` la sigue devolviendo (ver Pitfall 2).

### Pattern 4: Predicado de backbone compartido

**What:** Antes de agregar la 5ª condición en 5 apariciones textuales, extraer: (a) para Drizzle, un helper `backboneNodeConditions()` que devuelva el array de condiciones (usable en tree-progress y tree-editor); (b) para el SQL crudo del rebuild, como mínimo un comentario cruzado + un test de consistencia que verifique que ambos caminos devuelven el mismo node-set sobre un seed.
**Why:** los tres archivos ya declaran "copiado VERBATIM/EXACTLY" — la fase anterior sobrevivió a mano; con 5 condiciones y 5 sitios el drift es cuestión de tiempo.

### Anti-Patterns to Avoid

- **Reusar `canonical_exercise_id` para hitos** — explícitamente prohibido (locked decision 1).
- **Que la heurística escriba `milestone_exercise_id` directo** — rompe la frontera de 125 ("el grafo lee solo truth confirmado"); el backbone cambiaría sin revisión.
- **Aristas manual same-partition vía /precedence** — el servicio ya lo rechaza; no abrir esa puerta para "colgar variantes": las variantes se cuelgan por COLUMNA, no por arista.
- **Cambiar `LEVEL_LINEAR_MIN` para alinear la banda alfa=3** — las bandas R2 son mapeo de UI; tocar level-mapping rompería generación de sesiones/tree-progress.
- **Partir TTB en rutas nuevas** — diferido a profes; solo señalizar.
- **`drizzle-kit migrate` o `db:push`** — runner custom solamente.

## Don't Hand-Roll

| Problem                            | Don't Build                    | Use Instead                                                                           | Why                                                                                                   |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Normalización de tokens de nombres | Regex ad-hoc nuevo             | `normalizeWords()` + `WORD_ALIASES` + `phraseAppears()` de `route-progression-map.ts` | Ya maneja typos reales del catálogo (STR→STRADDLE, ASISSTED→ASSISTED…) y matching most-specific-first |
| Clasificación de escalón           | Recalcular escalones           | `classify(name+position, route)` existente                                            | Motor determinístico ya validado, mismo que generó las 1.176 propuestas                               |
| Escritura transaccional de truth   | Lógica accept nueva desde cero | Patrón `ProposalService.accept` (tx, status flip + truth write atómicos)              | Probado en 125; tests existentes lo cubren                                                            |
| Poda de aristas inconsistentes     | Borrado masivo de edges        | Orphan policy de `reassignRoute` (incidente + acotado + reversible)                   | T-128-05: nunca bulk wipe; preserva precedencias cross-ruta intencionales                             |
| Canvas/edges/minimap               | Render custom                  | Vue Flow ya montado (`@vue-flow/core` 1.48)                                           | Estilos por edge (`style`, `strokeDasharray`) ya usados para el dashed "start of chain"               |
| Guard de roles admin               | Hook nuevo                     | `TRAINING_ROLES` + onRequest hook de `tree-editor/routes.ts`                          | Patrón uniforme, testeado (member→403, sin token→401)                                                 |

**Key insight:** la fase entera es composición de mecanismos ya construidos (mapa de tokens, propuestas→accept, edges manual, drawer) — el único concepto genuinamente nuevo es el agrupador "movimiento" y la columna.

## Common Pitfalls

### Pitfall 1: mysqlEnum / columna física con nombre distinto al esperado

**What goes wrong:** El 1er arg de `mysqlEnum`/columnas Drizzle ES el nombre físico. En `exercises` la columna de nivel se llama **`exercise_level`** (no `level`) y el enum NO incluye kairos — verificado en information_schema. CI de 125/126 ya falló por drift schema↔migración (Unknown column; tsc no lo ve).
**How to avoid:** En 0145 el nombre físico `milestone_exercise_id` debe coincidir exactamente entre el `ALTER TABLE` y el 1er arg de `int()`. Correr el test de migración local en fases que agregan columnas (patrón `test/migrations/*.test.ts`).
**Warning signs:** tests verdes locales con `db:push` pero CI rojo en migraciones.

### Pitfall 2: particiones locked retienen aristas de variantes degradadas → getNeighbor las sigue sirviendo

**What goes wrong:** El rebuild solo regenera particiones SIN aristas manual same-partition (D-02). Hay 16 aristas manual hoy. Si un profe ya reordenó TTB CON (locked) y después acepta que el ejercicio X de esa cadena es variante, el rebuild NO toca esa partición → X conserva aristas → sigue apareciendo en getNeighbor (player) y la cadena editable, contradiciendo el filtro.
**Why it happens:** la membresía de getNeighbor es solo por aristas incidentes; el filtro por columna solo afecta los READ de node-set y el scope del rebuild.
**How to avoid:** el accept de hito/variante debe podar/reparar las aristas incidentes del degradado en la misma transacción (Pattern 3) — para particiones locked Y unlocked (así el resultado no depende de correr o no el rebuild).
**Warning signs:** test: partición con cadena manual + accept variante en el medio → getNeighbor del vecino debe saltear la variante (o terminar la cadena), nunca devolverla.

### Pitfall 3: columnas sin calificar en `sql\`\``dentro de`.select()` con subqueries correlacionadas

**What goes wrong:** Drizzle califica `${table.col}` en `.where()` pero NO dentro de ` sql` ``en`.select()`— colisión de alias → predicado siempre falso o 500 por ambigüedad (caso real fase 121, commit 866f29a7).
**How to avoid:** si la heurística o el read de hitos usa subqueries correlacionadas (p.ej. contar variantes por hito), prefijar literal`exercises.id` dentro del sql crudo. Alternativa más segura: agregaciones en memoria (el catálogo son ~1.5k filas — todos los servicios del árbol ya cargan todo y agrupan en JS).

### Pitfall 4: `;` dentro de comentarios SQL en migraciones

**What goes wrong:** el runner splittea por `;` ANTES de strippear `--` → rompe la migración entera.
**How to avoid:** plantilla de 0143 (que lo documenta en su propio header). Cada statement con un único terminador en su propia línea. Commitear el SQL junto al schema.

### Pitfall 5: el filtro de backbone cambia el árbol del MIEMBRO (Mi Árbol) en una fase "backend + admin"

**What goes wrong:** `tree-progress/service.ts` usa el mismo scope; agregar `milestone_exercise_id IS NULL` reduce nodos/percentages de Mi Árbol apenas los profes acepten variantes. No es un bug — es el objetivo — pero es un efecto member-visible que el plan debe declarar (UAT y notas de release; fase 134 construye encima).
**How to avoid:** mencionarlo en VERIFICATION/UAT; decidir explícitamente si tree-progress entra en esta fase (recomendado: sí, el scope debe mantenerse espejado — dejarlo desincronizado crea un node-set fantasma).
**Nota relacionada:** el % de "reached" del miembro hoy cuenta variantes; al filtrarlas, ejercicios `dominado` (fase 131) que sean variantes dejan de contar como nodos — si se quiere que un dominado de variante "ilumine" su hito, eso es fase 134 (no resolverlo acá, pero dejar la pregunta asentada).

### Pitfall 6: depender de `progression_step`/`habilidad` truth que está VACÍO

**What goes wrong:** planear la heurística leyendo `exercises.progression_step` (0 filas) produce 0 grupos. El orden real del backbone hoy cae al fallback `dificultad_lineal, id`.
**How to avoid:** heurística sobre `classify()` en vivo (+ override con propuestas corregidas). Tests que NO asuman steps poblados.

### Pitfall 7: aristas de precedencia invisibles con rutas colapsadas (R4 inservible si no se resuelve)

**What goes wrong:** `TreeMapPage.rebuildGraph()` solo dibuja `precedenceEdges` cuando ambos extremos están expandidos. Un prerequisito FLR→FL en gris jamás se ve si FL está colapsada — exactamente el caso de uso de R4.
**How to avoid:** decidir el render: (a) arista ruta-nivel agregada (route node → route node) cuando hay endpoints colapsados, (b) badge "tiene prerequisitos" en el RouteFlowNode de la ruta élite, o (c) auto-expandir el extremo remoto al expandir la élite. Discreción del planner; (a)+(b) combinadas es lo más fiel al patrón OG "PRE-REQs in Gray".

### Pitfall 8: workflow del repo

- Staging-first estricto: todo en branch local / staging, nunca a master; **preguntar antes de cualquier push**. Hay 72+ commits locales sin pushear de v5.1 — coordinar con ese estado.
- **No correr el suite completo local** — typecheck local sí; tests corren en CI al pushear a staging. Tests de analytics flakean después de ~21:00 (skew TZ — no es regresión).
- Nunca `git add -A` — stagear por ruta explícita.
- Datos de prod via migraciones, nunca seeds re-corridos. La asignación de hitos en PROD ocurrirá vía revisión de profes en la UI, no via script en prod (el bootstrap heurístico solo inserta PROPUESTAS — eso sí puede correrse como CLI, patrón `bootstrap-dimensions.ts`).

## Code Examples

### Predicado backbone extendido (Drizzle — tree-editor / tree-progress)

```typescript
// Source: src/modules/tree-editor/service.ts loadGraphNodes() (patrón existente) + R1
.where(
  and(
    isNull(schema.exercises.canonicalExerciseId),
    inArray(schema.exercises.effort, [...VALID_EFFORTS]),
    isNull(schema.exercises.habilidad),
    isNull(schema.exercises.milestoneExerciseId),   // ← R1: variantes fuera del backbone
    eq(schema.routes.excludedFromTree, false),
  ),
)
```

### Predicado en el SQL crudo del rebuild (DOS sitios en rebuild-progression-graph.ts)

```sql
-- Source: rebuild-progression-graph.ts líneas 77-89 y 155-167 (existente) + R1
WHERE e.canonical_exercise_id IS NULL
  AND e.effort IN ('CON', 'EXC', 'ISO')
  AND e.habilidad IS NULL
  AND e.milestone_exercise_id IS NULL
  AND r.excluded_from_tree = 0
```

### Estilo de arista gris/punteada (R4 — Vue Flow, patrón ya usado en la página)

```typescript
// Source: TreeMapPage.vue línea 224 (la arista dashed "start of chain" ya usa strokeDasharray)
es.push({
  id: `prereq-${pe.fromExerciseId}-${pe.toExerciseId}`,
  source, target,
  style: { stroke: '#9e9e9e', strokeDasharray: '6 4', strokeWidth: 2 },
  markerEnd: MarkerType.ArrowClosed,
  data: { precedence: true, ... },
});
```

### Banda R2 (constante compartida admin — locked mapping)

```typescript
// Mapeo LOCKED (tree-quality-research.md §4.3). NO derivar de LEVEL_LINEAR_MIN.
export const DL_BANDS: {
  level: string;
  min: number;
  max: number;
  color: string;
}[] = [
  { level: "kairos", min: 1, max: 2, color: "amber-6" },
  { level: "alfa", min: 3, max: 3, color: "amber-8" },
  { level: "delta", min: 4, max: 6, color: "deep-orange-7" },
  { level: "sigma", min: 7, max: 8, color: "brown-8" },
  { level: "omega", min: 9, max: 10, color: "red-9" },
  {
    level: "spartan",
    min: 11,
    max: 12,
    color: /* spartan de levelColor() existente */ "",
  },
];
// Colores: reusar/extraer la paleta levelColor() de AlumnosPage.vue (hoy duplicada en 4 archivos)
```

### Seed de tests (patrón existente para los tests nuevos)

```typescript
// Source: test/tree-editor/tree-editor.test.ts (helpers createRoute/createExercise/linkEdge)
// + test/exercises/rebuild-progression-graph.test.ts (importa runRebuildProgressionGraph
//   y lo corre contra la DB per-worker sin spawnear proceso)
const exId = await createExercise({ name, pattern, effort: "CON", dl, route });
// nuevo: variante → values({ ..., milestoneExerciseId: hitoId })
```

## State of the Art (interno al proyecto)

| Old Approach                                            | Current Approach                                                       | When Changed                 | Impact                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Eje sub-familia (`subfamily_id`/`leverage`, 0137)       | Progresión por ruta + Habilidad (`progression_step`/`habilidad`, 0143) | 2026-06 (rework)             | Cualquier doc/plan que mencione "subfamily" está obsoleto; el comment de getNeighbor aún menciona "NULL subfamily_id" (stale, ignorar) |
| TreeEditorPage + ProposalReviewPage (páginas separadas) | TreeMapPage absorbe todo (drawer revisión + edición)                   | commit 2781f625 (2026-06-07) | El drawer del mapa es el ÚNICO lugar de revisión; los composables `useTreeEditorApi`/`useProposalsApi` siguen vivos                    |
| Backbone = todos los canónicos                          | Backbone = canónicos sin habilidad, ruta incluida                      | 0143                         | El filtro de hitos R1 es la TERCERA capa del mismo embudo (canonical → habilidad → milestone)                                          |

## Assumptions Log

| #   | Claim                                                                                                                                         | Section        | Risk if Wrong                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | La heurística de "movimiento" por tokens del nombre será suficiente para agrupar TTB CON (los datos de `exercise_2` no sirven sin normalizar) | R1 / Pattern 2 | Si el vocab de movimientos no se puede derivar limpio, la heurística propone grupos malos → más carga de corrección manual del profe (la revisión la corrige, pero el valor de la propuesta baja). Mitigación: confianza por grupo + "sin movimiento detectado" explícito |
| A2  | Los profes autorán las aristas R4 (FLR/PLPU) vía la UI existente; el plan no necesita seedearlas por migración                                | R4             | Si el usuario espera las aristas YA declaradas al cerrar la fase, falta una task de seed/carga asistida — confirmar en discuss/plan                                                                                                                                       |
| A3  | tree-progress (miembro) entra en el alcance del filtro en esta fase (mantener scope espejado)                                                 | Pitfall 5      | Si se decide diferir a 134, hay node-sets divergentes entre admin y miembro durante una fase                                                                                                                                                                              |
| A4  | El color spartan existe en la paleta `levelColor()` (verificada hasta omega `red-9`; spartan continúa en el switch)                           | R2             | Trivial — leer las 2 líneas siguientes de AlumnosPage.vue al implementar                                                                                                                                                                                                  |

## Open Questions (RESOLVED)

1. RESOLVED: opción A — tabla nueva `exercise_milestone_proposals` espejo de 0138 (plan 133-01). **¿Dónde persisten las propuestas de hito?** (opciones A/B/C en Pattern 2) — Recomendación: tabla nueva espejo de 0138 (opción A). El planner decide; si elige B debe resolver el pass de UPDATE sobre las 1.176 pendientes.
2. RESOLVED: maquinaria + CLI idempotente en la fase (plan 133-03); ejecución en prod queda como paso manual post-deploy. **¿La fase incluye correr el bootstrap de hitos y/o cargar las aristas R4 en prod, o solo dejar la maquinaria lista?** El patrón de 125/126 fue: código + CLI mergeado, ejecución del CLI como paso post-deploy documentado. Recomendación: misma estrategia (CLI idempotente, ejecución manual post-deploy, revisión de profes asíncrona).
3. RESOLVED: badge en ruta élite + arista agregada route-level gris (plan 133-07). **Render R4 con rutas colapsadas** (Pitfall 7): badge en ruta élite + arista agregada route-level vs auto-expand. Recomendación: badge + arista route-level gris.
4. RESOLVED: deferido a fase 134; registrado como deferred-item en plan 133-04. **¿"Dominado" sobre una variante ilumina su hito en el % del miembro?** Fuera de alcance (134), pero el plan de 133 debería dejar la pregunta registrada en deferred-items.

## Environment Availability

| Dependency             | Required By                     | Available | Version                                                  | Fallback                                              |
| ---------------------- | ------------------------------- | --------- | -------------------------------------------------------- | ----------------------------------------------------- |
| MySQL local (eltemplo) | dev + heurística + tests        | ✓         | conectado (root@localhost, post-0144, bootstrap corrido) | —                                                     |
| pnpm + vitest          | tests API                       | ✓         | vitest ^4.0.18                                           | — (tests corren en CI, no local — regla del proyecto) |
| Node/tsx               | CLI scripts (bootstrap/rebuild) | ✓         | `npx tsx <script>.ts` (patrón existente)                 | —                                                     |
| Vue Flow               | canvas admin                    | ✓         | @vue-flow/core ^1.48.2 ya instalado                      | —                                                     |

**Missing dependencies with no fallback:** ninguna.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Framework          | vitest ^4.0.18 (API, integración contra MySQL per-worker `eltemplo_test_N`)                                              |
| Config file        | `el-templo-api/vitest` vía package.json; `test/setup.ts` provisiona DB per-worker, `test/setup-global.ts` limpia         |
| Quick run command  | `cd el-templo-api && pnpm vitest run test/tree-editor/` (⚠️ regla del usuario: typecheck local sí, suite completo en CI) |
| Full suite command | CI en push a origin/staging (`pnpm test`)                                                                                |

### Phase Requirements → Test Map

| Req ID    | Behavior                                                                                                        | Test Type                                  | Automated Command                                                                                                                                                                                              | File Exists?                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| R1-MIG    | 0145 aplica y la columna/FK/índice existen                                                                      | integration                                | nuevo en `test/migrations/0145-*.test.ts` (patrón 0111/0121)                                                                                                                                                   | ❌ Wave 0                                                    |
| R1-HEUR   | Agrupamiento (movimiento × escalón) determinístico; TTB CON produce ≤13 hitos propuestos sobre seed             | unit/integration                           | nuevo `test/exercises/milestone-heuristic.test.ts`                                                                                                                                                             | ❌ Wave 0                                                    |
| R1-REV    | accept escribe `milestone_exercise_id` + poda aristas en tx; reject no toca exercises; member→403               | integration                                | nuevo en `test/tree-editor/` o `test/exercises/` (patrón `proposal-review.test.ts`)                                                                                                                            | ❌ Wave 0                                                    |
| R1-FILTER | rebuild/tree-editor/tree-progress excluyen variantes; getNeighbor no devuelve variante (incl. partición locked) | integration                                | extender `test/exercises/rebuild-progression-graph.test.ts` (caso E existente para habilidad es la plantilla), `test/tree-progress/member-tree.test.ts`, `test/exercises/exercise-progression-service.test.ts` | ✅ extender                                                  |
| R2-BANDS  | banda/color por dl en nodos del mapa                                                                            | manual-only (admin UI sin test runner E2E) | UAT visual                                                                                                                                                                                                     | — justificado: el-templo-admin no tiene suite de componentes |
| R3-SUBGRP | GET /tree expone category fina/sub-grupo                                                                        | integration                                | extender `test/tree-editor/tree-editor.test.ts` (response shape)                                                                                                                                               | ✅ extender                                                  |
| R4-XRUTA  | precedencias cross-ruta siguen funcionando con el nuevo scope                                                   | integration                                | extender `tree-editor.test.ts`                                                                                                                                                                                 | ✅ extender                                                  |
| TTB-SIG   | señal en drawer                                                                                                 | manual-only                                | UAT visual                                                                                                                                                                                                     | —                                                            |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit` (gate post-merge que ya agarró el bug `.$dynamic()` en 123) + test puntual del módulo tocado si es barato.
- **Per wave merge:** typecheck de los 2 apps tocados (`el-templo-api`, `el-templo-admin`).
- **Phase gate:** push a origin/staging (CON confirmación del usuario) → CI corre suite completo + migración 0145.

### Wave 0 Gaps

- [ ] `test/migrations/0145-milestone-exercise-id.test.ts` — cubre R1-MIG
- [ ] `test/exercises/milestone-heuristic.test.ts` — cubre R1-HEUR
- [ ] test de accept/reject de hito (archivo según módulo elegido) — cubre R1-REV
- Framework ya instalado; helpers (`createTestApp`, `createStaffUser`, seeds de rutas/ejercicios/aristas) ya existen en `test/helpers.ts` y `test/tree-editor/tree-editor.test.ts`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category       | Applies | Standard Control                                                                                                                                                             |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication   | yes     | JWT existente (`fastify.authenticate`) — sin cambios                                                                                                                         |
| V4 Access Control   | yes     | Hook `TRAINING_ROLES` (coach/owner) plugin-level en tree-editor; los endpoints nuevos DEBEN colgar del mismo guard (test member→403 obligatorio, patrón T-128-03)            |
| V5 Input Validation | yes     | JSON schemas Fastify (`schemas.ts` del módulo) — body schemas para los endpoints nuevos; ids numéricos validados contra node-set (patrón TreeEditorError 404/400, nunca 500) |
| V6 Cryptography     | no      | —                                                                                                                                                                            |

### Known Threat Patterns

| Pattern                                              | STRIDE    | Standard Mitigation                                                                                        |
| ---------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| SQL injection en heurística/poda                     | Tampering | Drizzle parametrizado; en `sql\`\``crudo SOLO interpolar via`${}` (parametriza) — patrón rebuild existente |
| Escritura de truth sin revisión (heurística directa) | Tampering | Truth solo via accept transaccional con guard de rol                                                       |
| IDOR sobre exerciseIds                               | Elevation | Validar pertenencia al grafo antes de escribir (patrón `setPrecedenceEdge` 404)                            |

## Project Constraints (from CLAUDE.md)

- **Logging:** API → `request.log`/`app.log` (Pino); admin → `createLogger()`; nunca console.log. Excepción documentada: CLIs standalone (bootstrap/rebuild) usan console.log legítimamente.
- **TypeScript:** sin `any`; `catch (err: unknown)` + narrowing; los narrowers `readExerciseNodes`/`readAffectedRows` son el patrón para resultados de `db.execute`.
- **Tests:** rutas API nuevas requieren tests de integración en `el-templo-api/test/` contra MySQL real.
- **Migraciones:** schema Drizzle + `pnpm db:generate`/SQL manual + `pnpm db:migrate` (runner custom, `_migrations` es la verdad); NUNCA `drizzle-kit migrate`; evitar `db:push` en trabajo commiteado; commitear el SQL junto al schema.
- **Patterns:** facade para servicios complejos; Pinia composition API; composables con `cleanup()` (useTreeEditorApi ya lo cumple).
- **Preferencias:** DRY agresivo (→ predicado compartido, levelColor extraído); bien testeado no-negociable; "engineered enough"; edge cases explícitos.
- **Memoria del usuario:** no instalar deps sin preguntar; preguntar antes de pushear; staging-first; no `git add -A`; no correr suite completo local; sin `;` en comentarios SQL.

## Sources

### Primary (HIGH confidence — código y DB verificados en esta sesión)

- `el-templo-api/src/db/schema/{exercises,exercise-progressions,exercise-dimension-proposals,routes}.ts`
- `el-templo-api/rebuild-progression-graph.ts`, `bootstrap-dimensions.ts` (raíz del paquete)
- `el-templo-api/src/modules/{tree-editor,tree-progress}/service.ts`, `tree-editor/routes.ts`, `tree-progress/category-map.ts`
- `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts`
- `el-templo-api/src/modules/exercises/route-progression-map.ts`, `src/modules/admin/proposal-service.ts`
- `el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts`
- `el-templo-api/src/db/migrations/0143_route_progression_model.sql` (+ listado: última = 0144)
- `el-templo-admin/src/pages/TreeMapPage.vue`, `components/treemap/*.vue`, `constants/levels.ts`, `pages/AlumnosPage.vue` (levelColor)
- Queries directas a MySQL local `eltemplo` (categorías, particiones, exercise_2 TTB, propuestas, aristas, enums, dl por ruta)
- `.planning/research/tree-quality-research.md` (decisiones locked §4) y `new-training-system-design.md`
- `test/tree-editor/tree-editor.test.ts`, `test/exercises/rebuild-progression-graph.test.ts` (patrones de test)

### Secondary (MEDIUM)

- SUMMARYs/PATTERNS de fases 125-128 (contexto histórico; el código actual prevalece)

### Tertiary (LOW)

- Ninguna — no se usó web research (dominio 100% interno).

## Metadata

**Confidence breakdown:**

- Schema / predicados / endpoints: HIGH — leído del código y verificado contra information_schema y datos reales.
- Datos del catálogo (categorías, particiones, propuestas): HIGH — queries directas a la DB local post-0144 con bootstrap corrido (misma base que usó el research canónico).
- Recomendaciones de diseño (storage de propuestas de hito, render R4): MEDIUM — opciones fundadas en patrones existentes; decisión final del planner/usuario.

**Research date:** 2026-06-07
**Valid until:** mientras no se mergeen cambios en los módulos tree-\* / exercises (codebase local en movimiento — 72+ commits sin pushear; re-validar si pasa el push+CI de v5.1 con cambios en estos módulos)
