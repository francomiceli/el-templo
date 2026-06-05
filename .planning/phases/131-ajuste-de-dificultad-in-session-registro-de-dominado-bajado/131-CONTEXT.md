# Phase 131: Ajuste de dificultad in-session + registro de "dominado / bajado" - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous synthesis (overnight run) from ROADMAP §Phase 131 + scout. Open decisions resolved by Claude. CAPSTONE of milestone v5.1.

<domain>
## Phase Boundary

Durante la sesión, el miembro puede **subir/bajar la dificultad de un ejercicio puntual** desde el player; el árbol (126) le sirve el **vecino correcto** (conservando ruta/contracción/formato/dosis del bloque — sólo cambia el ejercicio); el cambio **persiste en un registro nuevo de "dominado / bajado"** (distinto del "completado" local + RPE), que **alimenta el % del árbol (127)** y **ve el coach**. Cubre **ADJUST-01, ADJUST-02, ADJUST-03, ADJUST-04**. Depende de 126 (primitiva vecino) y 127 (% del árbol).

**NO incluye:** cambiar el nivel del miembro ni la planificación del SPOM (sigue siendo criterio del coach); upsell por estancamiento (futuro).
</domain>

<decisions>
## Implementation Decisions

### Registro nuevo (ADJUST-03)
- **D-01:** Tabla nueva `exercise_adjustments` (member_id FK users, exercise_id FK exercises = nodo del grafo, status enum `dominado|bajado`, plus referencia de sesión (dayId/date) y created_at; índices por member_id y exercise_id). Append-style log. Migración hand-written (~0142; confirmar; 0141 fue 130). Distinto del "completado" local + RPE de la sesión entera (`completed_sessions.rpe`). **Lección drift enum:** el 1er arg de `mysqlEnum("status", [...])` debe coincidir con la columna del `CREATE TABLE`.

### Captura del evento (ADJUST-01 + cómo se "captura" dominar)
- **D-02:** La captura es el **tap explícito** del miembro en el player: **"más difícil ↑"** registra el ejercicio actual como **`dominado`** (lo dominó, sube un escalón); **"más fácil ↓"** lo registra como **`bajado`** (le costó, baja un escalón). El criterio binario contra la prescripción del bloque ya está decidido; el evento que lo persiste es el tap (no inferencia automática). Botones por ejercicio en el player (`training/components/player/*`, `BlockProgressionView.vue` — hoy NO tienen estos botones). Anti-salto: **manual + un escalón por toque** (no saltos múltiples automáticos).

### Resolución del vecino (ADJUST-02)
- **D-03:** Al pedir el ajuste, el backend resuelve el vecino con la primitiva **`getNeighbor(exerciseId, direction)` de 126** (`up` para más difícil, `down` para más fácil) y **reemplaza SÓLO el ejercicio** en el bloque, **conservando ruta, contracción, formato y dosis** del bloque del día (la primitiva ya fija contracción por effort). NO cambia nivel ni SPOM. Si no hay vecino (fin de cadena → getNeighbor devuelve `null`, D-05 de 126): manejar gracefully (sin cambio + mensaje "ya estás en el extremo de la cadena"), NO cruzar effort automáticamente.

### Endpoint + persistencia
- **D-04:** Endpoint nuevo (scope miembro, autenticado por `request.user.userId`): recibe (exerciseId, direction, contexto de sesión), resuelve el vecino, **persiste el registro** (`dominado|bajado` del ejercicio de origen) y devuelve el ejercicio nuevo (o "sin vecino"). El swap visual lo aplica el player con la respuesta. Idempotencia razonable (un registro por tap; re-taps generan nuevos registros del log — el % usa el estado más reciente por nodo).

### Alimentar el % (ADJUST-04) + vista del coach
- **D-05:** El registro **enriquece el "reached" del % de 127**: reemplazar/aumentar el **seam ya documentado** en `tree-progress/service.ts` (líneas ~16-27) para que un nodo con un registro `dominado` del miembro cuente como alcanzado (además de los proxies existentes nivel+sesiones). El **coach** ve el registro dominado/bajado de un alumno (endpoint/vista de coach scope admin/coach — reusar patrón de 128/admin).

### Out of scope confirmado
- **D-06:** El ajuste **NO cambia el nivel** ni la planificación del SPOM (criterio del coach). Sólo intercambia el ejercicio del bloque y registra el evento.

### Claude's Discretion
- Nombres/índices exactos de `exercise_adjustments`; si guarda también el `to_exercise_id` resultante (útil para el coach) además del `status`.
- Cómo el player aplica el swap (estado local de la sesión vs refetch) y dónde van los botones (ExerciseCard.vue).
- Si el coach view es un endpoint nuevo o extiende uno de alumno existente.
- Forma exacta del "estado más reciente por nodo" para el % (último registro gana).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primitiva vecino (126 — ADJUST-02)
- `el-templo-api/src/modules/sessions/progressions/exercise-progression-service.ts` — `getNeighbor(exerciseId, direction): Promise<ExerciseCandidate|null>` (up=más difícil, down=más fácil; fija contracción; null al final de cadena).
- `el-templo-api/src/modules/sessions/fallback/exercise-fallback.ts` — `ExerciseCandidate` shape.

### % del árbol (127 — ADJUST-04 seam)
- `el-templo-api/src/modules/tree-progress/service.ts` — el seam "reached" documentado (líneas ~16-27, ~96) que 131 reemplaza/aumenta con el registro dominado.

### Player (ADJUST-01)
- `el-templo-app/src/modules/training/components/player/` — `ExerciseCard.vue`, `ExerciseList.vue`, `CompactExerciseList.vue`, `RpeSlider.vue`, etc. (hoy sin botones más fácil/difícil).
- `el-templo-app/src/modules/training/components/BlockProgressionView.vue` — vista de bloque.

### Registro + sesión (ADJUST-03)
- `el-templo-api/src/db/schema/completed-sessions.ts` — `rpe` (el "completado" del que el registro nuevo es DISTINTO).
- `el-templo-api/src/db/schema/exercises.ts` — nodo canónico.
- `el-templo-api/src/db/migrations/` — última 0141; próxima ~0142 (hand-written, sin `;` en comentarios, commitear junto al schema).

### Coach view
- Patrón admin/coach scope de 128 (`tree-editor` routes) o el módulo admin de alumnos.

### Convenciones
- `CLAUDE.md` §Database (runner custom, `pnpm db:migrate`, sin `;` en comentarios), §API tests (CI), §Frontend Quasar/Vue/Pinia (composables cleanup(), no console.log, no `any`), §Logging.
- **Lección drift enum (125/126/129/130):** `mysqlEnum("status",[...])` 1er arg = columna; el `CREATE TABLE` debe coincidir; correr el test nuevo en CI.
</canonical_refs>

<specifics>
## Specific Ideas
- Hoy sólo existe "completado" local + RPE de la sesión entera; este registro por-nodo es nuevo y es el modelo sobre el que se apoya el ajuste in-session (por eso se construyen juntos).
- Manual + un escalón por toque (anti-salto natural). Conservar la prescripción del bloque (sólo cambia el ejercicio).
</specifics>

<deferred>
## Deferred Ideas
- Upsell por estancamiento (futuro, fuera del milestone).
- Cambiar nivel/SPOM automáticamente (criterio del coach).
- Cruzar contracción/effort en el ajuste (126 D-05: no se cruza automáticamente).
</deferred>

---

_Phase: 131-Ajuste de dificultad in-session + registro de dominado/bajado_
_Context gathered: 2026-06-05 (autonomous)_
