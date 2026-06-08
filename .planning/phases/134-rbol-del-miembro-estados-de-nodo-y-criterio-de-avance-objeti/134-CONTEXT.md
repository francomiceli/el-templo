# Phase 134: Árbol del miembro — estados de nodo y criterio de avance objetivo (member app) - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Llevar la calidad del árbol (fase 133, backend + admin) a la experiencia del **miembro** en la app. Dos entregables:

- **R6 — Estados de nodo + bandas en Mi Árbol:** derivar 4 estados tipo videojuego (Bloqueado / Disponible / En progreso / Dominado) por nodo a partir de prerequisitos + las señales de progreso existentes, y mostrar las bandas de dificultad (mapeo kairos→spartan de la fase 133, color por nivel + dl numérico) en cada nodo.
- **R5 — Criterio de avance objetivo en el player:** mostrar la definición falsable de "dominado" (3×8 dinámico / 3×30s isométrico) en el player, como complemento del tap manual de fase 131 (NO lo reemplaza).

**Fuera de scope (ver Deferred):** mostrar variantes colgando del hito (cambia el contrato del member tree — fase aparte), rediseño a layout de grafo tipo skill-tree con Vue Flow, y un campo de criterio curado por hito.
</domain>

<decisions>
## Implementation Decisions

### R6 — Definición de los 4 estados (núcleo)

- **D-01:** **Dominado = evidencia real.** Un nodo está Dominado sii hay evidencia falsable: el último registro de `exercise_adjustments` del miembro para ese ejercicio es `dominado` (fase 131) **O** el ejercicio aparece en una sesión completada. `dl ≤ techo` NO alcanza para dominar — coherente con la intención de R5 (dominar tiene criterio objetivo, no se regala por nivel).
- **D-02:** **En progreso = frontera de la ruta.** El primer hito NO-dominado de cada ruta cuyos prereqs están satisfechos = "el siguiente que toca". Como máximo uno por ruta (la "antorcha" del next-up). Derivación pura del orden de la ruta + el set de dominados — sin joins nuevos.
- **D-03:** **Disponible:** prereqs satisfechos, no dominado, no es la frontera. (Ver D-05 para "prereqs satisfechos".)
- **D-04:** **Bloqueado:** prereqs NO satisfechos. (Ver D-05.)
- **D-05:** **El `%` del anillo NO cambia de fórmula — se re-etiqueta.** Sigue contando `reached` actual (`dl ≤ techo` O evidencia) pero se presenta como **"X% de tu nivel a tu alcance"** (alcance, no dominio). Los 4 estados de nodo son una **capa aparte** del anillo. Evita la regresión de percepción (que todos abran la app y su % se desplome). Hay que comunicar que anillo (alcance) y conteo de dominados (verde) miden cosas distintas.

### R6 — Prerequisitos para Bloqueado/Disponible (gating)

- **D-06:** **Híbrido nivel + grafo.** Un nodo es **Disponible** si `dl ≤ techo` **O** todos sus prereqs del grafo están dominados. Es **Bloqueado** si `dl > techo` **Y** le falta algún prereq del grafo. `prereqs del grafo` = predecesor dentro de la ruta + aristas cross-ruta grises de R4 (fase 128/133). Degrada bien: un nodo sin aristas curadas queda gateado solo por el techo, sin romperse. Esto hace que las rutas de élite (FLR dl5 start) se vean bloqueadas en la vista miembro hasta dominar su prereq de otra ruta — R4 en la app.

### R5 — Criterio de avance en el player

- **D-07:** **Derivado de la contracción en runtime, sin migración ni curación.** Regla determinística sobre el `effort` del nodo (que el player de fase 131 ya conserva): `ISO → "3×30s isométrico"`; `CON`/`EXC → "3×8 dinámico (reinicia en 3×5)"`. Se muestra como texto en el player, junto al tap "dominado". Sin campo nuevo ni columna; imposible que quede desincronizado o sin cargar.

### R6 — Tratamiento visual de Mi Árbol

- **D-08:** **Refresh de la lista actual (no rediseño).** Mantener la lista vertical por ruta de fase 127, pero cada nodo gana: **color de banda** (por nivel: kairos/alfa/delta/sigma/omega/spartan), **dl numérico** visible, e **ícono + color por estado** (los 4 de D-01..D-04). Sigue mostrando **solo hitos** (el backbone ya excluye variantes vía `milestone_exercise_id IS NULL`). Bajo riesgo, alto impacto visual, entra completo en la fase. Mockup de referencia (acordado):
  ```
  [● Pull Vertical ————————— 60% a tu alcance]
    ✅ Aussie Pull-up        dl3 · alfa    DOMINADO
    🔥 Pull-up               dl5 · delta   EN PROGRESO
    ⚪ One-Arm Negative      dl7 · sigma   DISPONIBLE
    🔒 One-Arm Pull-up       dl10· omega   BLOQUEADO
  ```

### Claude's Discretion

- Elección exacta de íconos/colores por estado y por banda (reusar la paleta de niveles existente + tokens de marca; sin azul). Layout fino del player para el texto de criterio. Forma de exponer los estados en el contrato `GET /tree-progress/me` (campo `state` por nodo vs derivar en frontend — preferible server-side para mantener "el cliente no computa", patrón D-05 de fase 127).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño y decisiones del milestone

- `.planning/research/tree-quality-research.md` §3 (R5/R6) y §4 (decisiones con el usuario, incl. bandas kairos→spartan) — fuente de la visión del árbol.
- `.planning/ROADMAP.md` (sección "Phase 134") — goal y dependencia de 133.
- `.planning/phases/131-ajuste-de-dificultad-in-session-registro-de-dominado-bajado/131-CONTEXT.md` — registro dominado/bajado que alimenta D-01.

### Backend — donde se derivan estados/criterio

- `el-templo-api/src/modules/tree-progress/service.ts` — `buildMemberTree`: ya calcula `reached`, `completedExerciseIds`, `dominatedExerciseIds`, `levelCeiling`. Acá se parten los 4 estados (D-01..D-06) y se mantiene el `%` (D-05).
- `el-templo-api/src/modules/exercises/backbone-scope.ts` — `backboneNodeConditions()` (incluye `milestone_exercise_id IS NULL`): por qué el member tree muestra solo hitos.
- `el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts` — `LEVEL_LINEAR_MIN`, `toContentLevel`: bandas y techo por nivel.
- Aristas de progresión/prerequisito: `exercise_progressions` (backbone) + aristas manuales cross-ruta (fases 128/133) — fuente de los prereqs del grafo en D-06. Mirror raw-SQL en `el-templo-api/rebuild-progression-graph.ts`.

### Frontend — member app

- `el-templo-app/src/modules/progression/pages/MiArbol.vue`, `components/TreeCategorySection.vue`, `components/SubfamilyProgressRow.vue` — vista a refrescar (D-08).
- `el-templo-app/src/modules/progression/stores/treeProgressStore.ts`, `composables/useTreeProgressApi.ts`, `types.ts` — store/tipos del contrato.
- `el-templo-app/src/modules/training/pages/DayPlayer.vue`, `composables/useExerciseAdjustment.ts` — player donde va el texto de criterio R5 (D-07), junto al tap dominado de fase 131.
  </canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `buildMemberTree` (tree-progress/service.ts): ya hace los 3 reads que necesitamos (graph nodes, completed, dominated) y el `levelCeiling`. Los 4 estados se computan acá reutilizando esas señales — el `state` debe salir server-side (patrón "el cliente no computa", D-05 de fase 127).
- `loadDominatedExerciseIds` (latest-per-node wins) → señal de Dominado (D-01).
- `loadCompletedExerciseIds` (prescripción→ejercicio) → segunda señal de Dominado (D-01).
- Mapeo nivel→banda + colores de nivel ya existen para reusar en la UI (paleta de marca, sin azul).
- `exercises.effort` (CON/EXC/ISO) → derivación del criterio R5 (D-07).

### Established Patterns

- Member tree es 100% server-computed (D-05 fase 127): agregar `state` (y opcionalmente el texto de banda) al contrato, no derivar en el cliente.
- Composables exponen `cleanup()`, sin `onUnmounted` adentro (convención del repo).
- Tests de API nuevos contra MySQL real en `el-templo-api/test/tree-progress/`.

### Integration Points

- Nuevo: lectura de aristas (backbone + cross-ruta) en `buildMemberTree` para el gating del grafo (D-06) — hoy `loadGraphNodes` trae nodos pero no aristas.
- Nuevo: campo `state` por nodo en `TreeNode` + posible `band`/`levelLabel`; el frontend renderiza verbatim.
- Player: insertar texto de criterio derivado (D-07) sin tocar la mecánica de ajuste de fase 131.
  </code_context>

<specifics>
## Specific Ideas

- Mockup de Mi Árbol acordado (ver D-08): lista por ruta, fila por hito con dl + banda + estado, anillo "X% a tu alcance".
- Estados con metáfora clara: Dominado ✅, En progreso 🔥 (antorcha/next-up, uno por ruta), Disponible ⚪, Bloqueado 🔒 (íconos finales a discreción).
- Criterio R5 como texto corto en el player: "Objetivo: 3×8 (reinicia en 3×5)" / "Objetivo: 3×30s".
  </specifics>

<deferred>
## Deferred Ideas

- **Hitos expandibles + variantes en la vista miembro** (R1 en member): expandir un hito para ver sus variantes. Cambia el contrato `GET /tree-progress/me` (incluir variantes agrupadas) y no está en el goal de 134 → fase aparte.
- **Mapa skill-tree (layout de grafo con Vue Flow en member app):** la experiencia "videojuego" más literal (Calitree). Rediseño grande con gestos táctiles/performance → fase aparte.
- **Criterio R5 curado/override por hito:** columna `advance_criterion` + UI admin, si aparece un caso que la regla derivada (D-07) no cubra.
- **Split de TTB** (research §4.4: TTB / Windshield / ATW mezclan movimientos distintos): se decide con los profes en la revisión del mapa — no es de esta fase.

### Reviewed Todos (not folded)

None — no hubo todos cruzados para esta fase.
</deferred>

---

_Phase: 134-rbol-del-miembro-estados-de-nodo-y-criterio-de-avance-objeti_
_Context gathered: 2026-06-08_
