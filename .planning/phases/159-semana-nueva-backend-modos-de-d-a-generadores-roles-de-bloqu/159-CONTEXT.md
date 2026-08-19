# Phase 159: Semana nueva backend — modos de día, generadores, roles de bloque y horarios - Context

**Gathered:** 2026-08-13
**Status:** Ready for planning

<domain>
## Phase Boundary

El generador de sesiones produce **días de combos y de técnica** como modos de primera clase (`session_mode` = `combos` / `tecnica`, análogos a `rom`), **elegidos por el profe día a día en `/generate`** (no atados a un día fijo de la semana), con estructura de bloques fija y roles nuevos, sin edición manual masiva del coach. Incluye: los roles de bloque nuevos (COMBOS I/II, TECNICA I/II, STRETCHING), el rename de las opciones de DEUTEROS I/II → A/B en días regulares, el ancla histórica semana→fecha/régimen, y que las clases de mié/jue en horarios muestren su nombre derivado de la sesión generada. Backend-only; la superficie visible (admin `/generate` UI, PDF, app, TV) es la fase 160.

**Base de rama: `master` actual** (decisión del usuario — el tren de tenancy v6.0 NO va a master todavía).

</domain>

<evidencia_prod>

## Evidencia de producción (SSH read-only 2026-08-13, DB `eltemplo`)

**El régimen combos/técnica ALTERNA por decisión del profe — NO es fijo ni por paridad.** Formato del bloque NUCLEUS (sigma) por semana:

| Semana | Miércoles             | Jueves                |
| ------ | --------------------- | --------------------- |
| 21     | Combos                | For Quality (técnica) |
| 22     | For Quality (técnica) | Complex               |
| 23     | Combos                | For Quality (técnica) |
| 24     | For Quality (técnica) | Combos                |
| 25     | For Quality (técnica) | Combos                |
| 26     | For Quality (técnica) | Combos                |

- Las últimas 3 semanas (24-26) fueron **mié=técnica / jue=combos**; antes iba variando. Por eso combos/técnica deben ser **modos elegibles por día en `/generate`**, no un mapeo fijo por día de la semana.
- **"Planis del 17-23"** = **semana 26** (creada 2026-08-11). La semana 27 (17-23 real) aún solo tiene el sábado ROM generado.
- **Combos hoy:** `format_params = {"type":"combos","rounds":""}` (rounds vacío, ajustado en vivo) + reps por ejercicio variables (12, 1, 1…). Confirma "mantener la forma actual".
- **Estructura actual (semana 26, hackeada sobre `regular`):**
  - Combos (jueves): INITIUM → NUCLEUS (SU, Combos) → DEUTEROS_1 (TTB, Combos) → DEUTEROS_2 (OAR, Combos) → EPIKOS (FB, Circuito cooperativo). 3 bloques combo con rutas distintas.
  - Técnica (miércoles): INITIUM → NUCLEUS (OAP, For Quality) → DEUTEROS_1 (OAP, Accumulate X) → DEUTEROS_2 (SS, Accumulate X) → EPIKOS (HSPU, Flow Guiado). NUCLEUS+DEUTEROS_1 comparten ruta OAP → confirma "misma ruta para afianzar".
- **6 niveles reales** en 3 `level_group`: `alfa_delta`→(alfa, delta, kairos), `omega`→(omega, spartan), `sigma`→(sigma).
- El bloque final hoy es **EPIKOS** (Flow Guiado en técnica / Circuito cooperativo en combos) → es el que reemplaza STRETCHING.

</evidencia_prod>

<decisions>
## Implementation Decisions

### Modos de día (combos / tecnica) — selección por el profe

- **D-01:** `session_mode` acepta `combos` y `tecnica` además de `regular`/`rom`. Migración aditiva; histórico intacto (corpus IA — cambios SIEMPRE aditivos).
- **D-02:** **El profe elige el tipo de sesión por día en `/generate`** (regular/rom/combos/tecnica). Combos/técnica NO están atados a un día fijo — se mueven semana a semana según decisión del coach (probado por los datos de prod). `day_modes` se mantiene solo como default de ROM (sábado); deja de ser la fuente fija para combos/técnica.
- **D-03:** El generador enruta por el modo elegido: `combos`→combos-generator, `tecnica`→tecnica-generator (análogo a como ROM tiene su generador). El backend debe aceptar el modo por día en el request de generación (hoy `/generate` ya elige tipo — sumar combos/tecnica a las opciones).

### Estructura de bloques (día de combos)

- **D-04:** INITIUM → **COMBOS I** → **COMBOS II** → **STRETCHING**. Sin bloque a elección (el DEUTEROS de los días regulares es un slot de elección I/II; en combos se colapsa a un único COMBOS II, sin elección).
- **D-05:** **COMBOS I = tren superior, COMBOS II = tren inferior** (spec del usuario). ⚠️ Discrepancia con prod: el coach hoy usa 3 bloques con rutas variadas de skill (SU/TTB/OAR), no superior/inferior estricto. Se implementa la spec del usuario (2 bloques, superior/inferior); si en plan-phase surge fricción con la práctica real, reconfirmar.
- **D-06:** Los bloques de combo usan el **formato "Combos" ya en prod** (migración 0172 — clon de Complex). **Se mantiene la forma actual de reps del profe** (rounds + reps por ejercicio, `{"type":"combos","rounds":""}`): NO se introduce un parámetro único de "reps" nuevo. SEM-02 original queda superado.

### Estructura de bloques (día de técnica)

- **D-07:** INITIUM → **TECNICA I** → **TECNICA II** → **STRETCHING**. Sin bloque a elección.
- **D-08:** **TECNICA I y TECNICA II van sobre la MISMA ruta** — el día de técnica trabaja dos bloques de una misma ruta para afianzar el aprendizaje (ej. ambos planche). El generador elige una sola ruta para ambos; el profe la edita. (Confirmado en prod: NUCLEUS+DEUTEROS_1 comparten ruta.)
- **D-09:** Formato por default de técnica: formato de calidad/skill (prod usa For Quality / Accumulate X / Cluster). El coach lo edita.

### Niveles

- **D-10:** El generador produce los **6 niveles** (alfa, delta, kairos, omega, spartan, sigma) agrupados en los 3 `level_group` existentes (`alfa_delta`, `omega`, `sigma`), igual que los días regulares. NO el modelo de 2 niveles de ROM.

### Bloque STRETCHING (final de ambos días)

- **D-11:** Rol de bloque **STRETCHING** propio (no hereda comportamientos de NUCLEUS/DEUTEROS/EPIKOS), **nivel único**. Reemplaza el slot final (hoy EPIKOS con Flow Guiado / Circuito cooperativo).
- **D-12:** **Reutiliza el pool y la lógica de selección de movilidad de ROM** (`mobility_related`, ~126 ejercicios). Reusar la maquinaria de ROM, no reinventarla.
- **D-13:** El **generador elige** ~4 ejercicios de movilidad (estilo INITIUM de 4 fijos que pidió el coach) y el **coach edita**. No es bloque fijo curado.

### Rename DEUTEROS I/II → A/B

- **D-14:** En los días **regulares**, las opciones del bloque a elección DEUTEROS pasan de "I"/"II" a **"A"/"B"** (libera "I/II" para COMBOS/TECNICA). En prod los roles son `DEUTEROS_1`/`DEUTEROS_2`. **Presunción: rename de labels de presentación, NO de datos** — histórico intacto. Confirmar en plan-phase si algún dato/label persiste "I/II" literal.

### Clases en horarios (etiqueta derivada de la sesión generada)

- **D-15:** El nombre de la clase en horarios/app **se deriva de la sesión generada de ese día**: si el modo es `combos`→**"Combos"**, `tecnica`→**"Técnica"**, si no→**"General"**. Como el modo lo elige el profe en /generate, la etiqueta se actualiza sola. **No** un mapeo fijo por día de la semana.
- **D-16:** **Renombrar la etiqueta genérica "Calistenia" → "General"** (el nombre por default cuando el día es regular).
- **D-17:** Sin crear actividades nuevas en `activities`, **sin tocar reservas, cupos ni gating** — solo la etiqueta visible. Global (todas las sedes ven lo mismo, deriva de la sesión del día).

### Ancla histórica (corpus IA)

- **D-18:** Ancla semana→fecha/régimen + retro-etiquetado de días combos/técnica desde W12 usando las firmas de detección (formato Combos vs For Quality/Flow Guiado por día), como **metadata sin tocar filas históricas** (SEM-05).

### Claude's Discretion

- Convención de nombres de roles nuevos (seguir estilo ROM: `ROM_LOWER` etc.).
- Degradación cuando el pool de una ruta es fino para 6 niveles × 2 bloques.
- Cantidad exacta de ejercicios por combo (arrancar de la práctica de prod: ≥3, editable).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Fuentes de negocio y discovery (LEER PRIMERO)

- `.docs/product/evoluicion-producto.md` — visión de negocio (abril 2026): estructura semanal, combos=Frank, técnica=Ignacio, votación de alumnos. NOTA: el doc dice "mié combos / jue técnica" pero los datos de prod prueban que ALTERNA por decisión del coach — la spec vigente es selección por día (D-02).
- `.docs/coach-improvements/DISCOVERY-SEMANA-NUEVA-2026-07-07.md` — cómo funciona HOY (hackeado sobre `regular`; firmas de detección). Su conclusión de "fijo desde W19" quedó DESMENTIDA por los datos de esta sesión (alterna).
- `COACH_IMPROVEMENTS_HANDOFF_2026-06-21.md` (raíz) — pedidos del coach: formato Combos, Stretching de 4 ejercicios fijos estilo INITIUM.
- `.planning/ROADMAP.md` §"v5.6 (Semana nueva combos + técnica)" — requirements SEM-01..15.

### Precedente ROM (patrón a replicar — modo de día análogo)

- `.planning/phases/97-rom-mode-saturday-mobility/97-CONTEXT.md` — el modo ROM es el precedente directo: `session_mode`, roles de bloque propios, generador alternativo, pool de movilidad, PDF/app variantes. **Replicar este patrón.**

### Session system (API)

- `el-templo-api/src/db/schema/sessions.ts` — columna `session_mode` (agregar `combos`/`tecnica`).
- `el-templo-api/src/db/schema/session-blocks.ts` — `role` varchar(20) sin enum, `route`, `format_name`, `format_params`, `sort_order`.
- `el-templo-api/src/db/schema/session-prescriptions.ts` — reps/seconds/contraction por ejercicio.
- `el-templo-api/src/db/schema/day-modes.ts` — `day_modes` (queda solo default ROM).
- `el-templo-api/src/modules/sessions/service.ts` + `el-templo-api/src/modules/sessions/pipeline/` — generador; ver la rama ROM y `goal-plan-pipeline.ts` como precedentes de path alternativo.
- `el-templo-api/src/modules/sessions/pipeline/utils/mobility-selection.ts` — selección de movilidad de ROM (reusar para STRETCHING).
- Formato **Combos**/**Stretching** ya en prod (migración `0172_formats_combos_stretching_ruta_fullbody.sql`): `el-templo-api/src/modules/admin/format-params.ts`, `format-prescribers.ts` (`prescribeCombos`).
- Endpoint de generación batch: `POST /admin/sessions/generate` — sumar combos/tecnica al modo por día.

### Horarios / clases (para el rename de etiquetas — investigar en research)

- Grep `Calistenia` en `el-templo-app/` y `el-templo-admin/` — ahí va el mapeo (modo de sesión del día)→nombre y el rename a "General".

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **Modo ROM entero** (`session_mode='rom'`, roles ROM\_\*, generador, pool de movilidad, PDF/app variantes) es el molde directo para combos/tecnica.
- **Formato "Combos"** ya en prod (rounds+reps por ejercicio) — el combos-generator lo consume tal cual.
- **Pool de movilidad de ROM** (`mobility_related`) + formato "Stretching" (sin params) para el bloque STRETCHING.
- **`session_blocks.role`** varchar(20) sin enum → roles nuevos no requieren cambio de schema.
- **`/generate` ya permite elegir tipo de sesión** — sumar combos/tecnica a las opciones (confirmado por el usuario).

### Established Patterns

- Pipeline con path alternativo: ROM y goal-plans ya bypassean stages del pipeline SPOM; combos/tecnica siguen ese patrón.
- Workflow de aprobación (pending_review → approved) sirve sin cambios.
- Tenancy: `sessions`/`session_blocks`/`session_prescriptions`/`day_modes` ya tienen `tenant_id`. **Base=master**: verificar el estado de las helpers de tenancy en master (el tren v6.0 no está en master); respetar el patrón vigente en master.

### Integration Points

- Entry point del generador: rama por modo elegido en `SessionGeneratorService`.
- `/generate`: selector de tipo por día (fase 160) → el backend acepta el modo en el request.
- Etiqueta de clase en horarios: mapeo (modo de la sesión del día)→nombre visible.

</code_context>

<specifics>
## Specific Ideas

- **Combos/técnica los elige el profe día a día** — probado por prod (alterna, últimas 3 semanas mié=técnica/jue=combos, antes variaba). El sistema NO debe hardcodear ninguna dirección.
- **Día de técnica = misma ruta en ambos bloques** para afianzar (ej. ambos planche). Distinto de combos (superior/inferior).
- STRETCHING = 4 ejercicios de movilidad estilo INITIUM, reemplaza el EPIKOS final (Flow Guiado / Circuito cooperativo).
- "Calistenia" → "General"; combos/técnica reemplazan el nombre según la sesión generada del día.

## Decisión pendiente para plan-phase

- **Numeración de migraciones:** base=master; el tope aplicado en prod es **0201**. Verificar el máximo en master antes de generar SQL (las migraciones nuevas de esta fase nacen en 0202+, salvo colisión con features en vuelo hacia master — verificar). La rama vieja `feat/dias-combos-tecnica` NO se rebasea. **Research 2026-08-13: master en `0201` (hueco en `0200`), staging y tren v6.0 ocupan `0200`; ninguna rama llega a 0202 → las nuevas nacen en `0202`.** ⚠️ El checkout local está en `0196`; un `ls | tail` da la respuesta equivocada — verificar contra `origin/master`.

## Decisiones cerradas en plan-phase (2026-08-13, sobre el RESEARCH)

- **D-P1 (A1 — rutas superior/inferior de combos):** COMBOS I reusa `GOAL_PLAN_ROUTE_MAP.tren_superior`, COMBOS II reusa `.tren_inferior` (`goal-plans/constants.ts`, ya en prod). Sin código nuevo de clasificación. Confirmado por el usuario.
- **D-P2 (A2 — rename retroactivo):** El rename "Calistenia"→"General" toca la fila de `activities` con efecto retroactivo aceptado; reports históricos muestran "General". Migración + código en el MISMO commit (get-or-create por literal en `scheduling/service.ts` + `seed-production.ts`, si no se actualiza el literal la próxima sede duplica la actividad). Confirmado por el usuario.
- **D-P3 (Q3 — TV backend):** `tv/class-day.ts` SE CORRIGE en la 159 (leer `sessions.session_mode` con fallback a `day_modes`). Es backend. ⚠️ El trabajo de TV vive en staging Y master como historias separadas → este cambio es DOBLE PUSH. Confirmado por el usuario.
- **D-P4 (Q2 — format_compatibility, recomendación research):** COMBOS I/II y TECNICA I/II mapean a `'nucleus'`; STRETCHING sin mapeo (lista vacía — formato fijo). Evita ALTER del `mysqlEnum`.
- **D-P5 (Q4 — DEUTEROS A/B, recomendación research):** El rename DEUTEROS I/II → A/B incluye solo el badge del API en la 159 (backend); PDF y centralización se difieren a SEM-11. El plan debe decirlo explícitamente.
- **D-P6 (Q1 — pipeline reusado, recomendación research):** Los generadores nuevos reusan el pipeline (stages 2-7) al estilo `goal-plan-pipeline.ts` (reemplazan solo Stage 1 / resolución de ruta), NO pasan por `runBlockPipeline`/`resolveRotator` (`default: throw`). Degradar a autocontenido solo si un bloque pelea con el formato Combos.
- **D-P7 (Q5 — ejercicios por combo, discreción):** 3 ejercicios por combo (coincide con práctica del coach y default de 3 rondas), editable.
- **Pitfall STRETCHING:** el bloque STRETCHING se genera 6 veces (1 por nivel) y debe ser función PURA de `(week, day)` — NO `Math.random()` (que usan `rom-generator`/`mobility-selection.ts`), o los niveles divergen. Test obligatorio de determinismo.

</specifics>

<deferred>
## Deferred Ideas

- **Actividades reales "Combos"/"Técnica" en `activities`** (con reservas/cupos/gating propios) — descartado; solo etiqueta visible.
- **`day_modes` por sede (`branch_id`)** — no se necesita.
- **Viernes como modo "open"** — sigue `regular`; nunca confirmado con el coach.
- **Semántica del `reps` del combo como parámetro único** — el usuario mantiene la forma actual; reabrir solo si el coach lo pide.

### Reviewed Todos (not folded)

- **"Rollout de datos v5.1 — poblar milestone_exercise_id"** — revisado, NO incorporado (data rollout de milestones de ejercicios v5.1, sin relación).

</deferred>

---

_Phase: 159-semana-nueva-backend-modos-de-d-a-generadores-roles-de-bloqu_
_Context gathered: 2026-08-13_
</content>
