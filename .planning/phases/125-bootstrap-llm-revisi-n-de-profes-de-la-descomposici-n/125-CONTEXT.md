# Phase 125: Bootstrap (heurístico) + revisión de profes de la descomposición - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Poblar las 3 dimensiones de cada ejercicio (sub-familia/gesto, leverage/palanca, y ruta para los `route_pending`) mediante un **primer pase automático heurístico** que deja **propuestas en estado revisable**, y darles a los profes una **pantalla de revisión** para aceptar / corregir / rechazar cada propuesta antes de fijarla como verdad sobre las columnas creadas en la fase 124.

Cubre **TREE-02** (primer pase automático de descomposición, revisable) y **TREE-03** (revisión humana de profes la fija). Backend (script + tabla + endpoints) + frontend (pantalla de revisión en el admin).

**Cambio de motor (decisión de Franco, 2026-06-04):** el primer pase es **heurístico (sin API), NO LLM.** TREE-02 decía "bootstrap asistido por LLM"; se cambia el motor a reglas deterministas. Mismo objetivo (auto-proponer + revisable), distinto motor. Motivo: la `ANTHROPIC_API_KEY` del repo es placeholder y NO se pasa en ningún deploy (la feature de IA de franchise de la Phase 38 nunca corrió en prod), y Franco no usa Claude por API; el heurístico es cero-key/cero-costo/cero-dependencia y los profes revisan igual.

**NO incluye:** construir el grafo/árbol (eso es 126 — a esta altura el árbol NO existe, la revisión es sobre lista plana); el editor de árbol que reordena/agrupa sub-familias sobre el grafo (128); tocar `effort`/`position`/`level`/`dificultadLineal`.

</domain>

<decisions>
## Implementation Decisions

### Estado revisable (modelo de datos)

- **D-01:** Las propuestas viven en una **tabla separada nueva** `exercise_dimension_proposals` (campos mínimos: `exercise_id` FK, `proposed_subfamily` (nombre canónico texto), `proposed_leverage` (nullable), `proposed_route` (solo para route_pending), `status` enum `pending|accepted|rejected`, metadato del motor/confianza si aplica). NO se escribe en las columnas de verdad de `exercises` hasta que un profe acepta. Razón: TREE-02 exige que la propuesta no sea verdad automáticamente; mantiene `exercises` limpio, es auditable y re-ejecutable, y el grafo (126) solo lee dimensiones CONFIRMADAS (nunca propuestas pendientes).
- **D-02:** **Aceptar una propuesta** escribe en las columnas de verdad de la fase 124: resuelve/crea la sub-familia en el catálogo `exercise_subfamilies` y setea `exercises.subfamily_id`; setea `exercises.leverage`; para route_pending, setea `exercises.route` y baja `route_pending=0`. Y marca la propuesta `accepted`. **Rechazar** marca `rejected` sin tocar `exercises`.

### Qué propone el motor (scope del primer pase)

- **D-03:** El motor propone: **sub-familia/gesto** (nombre canónico, para que ejercicios de la misma familia clustericen), **leverage/palanca** (nullable, vocab según familia: tuck/adv tuck/straddle/full donde aplique), y **ruta SOLO para los `route_pending`**. **NO toca `effort`** (la contracción ya está ~70% poblada y limpia — se confía como está).
- **D-04:** El motor emite **nombres de sub-familia canónicos** para que clustericen naturalmente. La **normalización fina** (merge/split de sub-familias, ej. Planche/Plancha/PL → una) NO es trabajo de esta fase: la hacen los profes en la revisión y, sobre el grafo ya armado, en el editor de árbol de la 128.

### Motor + ejecución

- **D-05:** Motor = **HEURÍSTICO determinista, sin API.** Reglas sobre los **códigos de ruta** (PL→Planche, FL→Front Lever, BL→Back Lever, HS→Handstand, MU→Muscle Up, etc. — la ruta ya codifica la familia/área) + **keywords de palanca** en el nombre (tuck/adv tuck/straddle/half/full y análogos). Sin `@anthropic-ai/sdk`, sin `ANTHROPIC_API_KEY`, sin AI-SPEC. (Alternativas LLM/híbrido descartadas por Franco — ver Deferred.)
- **D-06:** Corre como **script one-off re-ejecutable** (analog `saneo-exercises.ts` / `backfill-gender.ts`): vía `tsx`, idempotente (solo genera propuesta donde no existe una aún → resumible si falla a mitad), escribe las propuestas a la tabla `exercise_dimension_proposals`. Lo corren los devs, NO los profes. Los profes no disparan nada — solo revisan (D-07).

### UX de revisión de profes

- **D-07:** Pantalla de revisión = **tabla filtrable/agrupada por ruta**, con la propuesta **editable inline** (sub-familia / leverage / ruta), **aceptar-grupo** (aceptar todas las de un grupo) + **override individual** (editar/rechazar puntual). Permite barrer ~1.493 ejercicios rápido. Vive en una **vista/tab nueva del admin reusando la lista de `ExercisesPage.vue`**. Aceptar escribe en las columnas de verdad (D-02) y marca la propuesta.
- **D-08:** A esta altura **el árbol NO existe** (se construye en 126), así que la revisión es sobre la **lista plana** de propuestas, no sobre el árbol. Es distinta del **editor de árbol (128)** que reordena/agrupa/edita precedencias sobre el grafo ya construido. 125 (confirmar dimensiones por ejercicio) **alimenta** a 126/128.

### Claude's Discretion

- Nombres/tipos exactos de columnas de `exercise_dimension_proposals`, índices, y la forma del endpoint de revisión (list/accept/reject/bulk-accept) — planner, respetando patrones Drizzle + el patrón de aprobación de `sessions` (pending_review→approved) como analog.
- Mapa exacto código-de-ruta → nombre-de-sub-familia base y el set de keywords de palanca del heurístico (con datos reales; documentar el vocabulario en el script).
- Si la migración de la tabla de propuestas es 0138 (confirmar próximo nº libre al planificar — 0137 lo tomó la fase 124).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño + decisiones previas

- `.planning/research/new-training-system-design.md` — marco de 3 ejes, jerarquía categoría→ruta→sub-familia→palanca→contracción, mapeo ruta→familia.
- `.planning/phases/124-estructura-de-datos-de-las-3-dimensiones-saneo/124-CONTEXT.md` — decisiones 124 (D-01..D-12): columnas de verdad (`subfamily_id`, `leverage`, `canonical_exercise_id`, `route_pending`), catálogo `exercise_subfamilies`, palanca nullable, effort = contracción.
- `.planning/phases/124-estructura-de-datos-de-las-3-dimensiones-saneo/124-01-SUMMARY.md` — qué columnas/tabla quedaron tras la fase 124.

### Requisitos y roadmap

- `.planning/REQUIREMENTS.md` — TREE-02 (primer pase, revisable) + TREE-03 (revisión humana). **NOTA: el wording "LLM" se alinea a "heurístico" en esta fase.**
- `.planning/ROADMAP.md` §"v5.1 Phase Details" → Phase 125.

### Código análogo a reusar

- `el-templo-api/saneo-exercises.ts` + `el-templo-api/backfill-gender.ts` — patrón de script one-off idempotente (createSingleConnection, try/finally, main().catch, console.log permitido en CLI).
- `el-templo-api/src/db/schema/exercises.ts` + `el-templo-api/src/db/schema/exercise-subfamilies.ts` — columnas de verdad destino (de la fase 124).
- `el-templo-api/src/modules/sessions/service.ts` + `routes.ts` — patrón de aprobación/revisión (pending_review → approved) como analog del flujo accept/reject de propuestas.
- `el-templo-admin/src/pages/ExercisesPage.vue` — lista de ejercicios del admin a reusar para la pantalla de revisión.

### Convenciones

- `CLAUDE.md` §"Database Changes" — Drizzle + runner custom, nunca drizzle-kit migrate, commitear SQL, sin `;` en comentarios SQL. §API tests (integration en `el-templo-api/test/`, corren en CI).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- Script one-off idempotente: `saneo-exercises.ts` (recién creado en 124) + `backfill-gender.ts` — copiar estructura para el bootstrap heurístico.
- Columnas de verdad ya existen (fase 124): `exercises.subfamily_id` (FK), `exercises.leverage` (nullable), `exercises.route_pending`; catálogo `exercise_subfamilies`.
- Patrón de aprobación de `sessions` (status pending→approved) → analog para `exercise_dimension_proposals.status` + endpoints accept/reject.
- `ExercisesPage.vue` (admin) → base para la tabla de revisión filtrable.
- `exercises.route` ya codifica la familia/área (PL/FL/BL/HS/MU…) — insumo principal del heurístico.

### Established Patterns

- Drizzle: mysqlEnum inline (para `status`), índices compuestos, FK thunk. Migración hand-written (próximo nº ~0138).
- Admin Quasar: tablas con filtros, edición inline, acciones bulk (patrones existentes en páginas de admin).

### Integration Points

- El bootstrap LEE `exercises` (name, route, route_pending) y ESCRIBE `exercise_dimension_proposals`. La revisión LEE proposals y ESCRIBE `exercises` (subfamily_id/leverage/route) + `exercise_subfamilies`.
- NO se usa `@anthropic-ai/sdk` (queda solo para la feature durmiente de franchise). Sin `ANTHROPIC_API_KEY`.

</code_context>

<specifics>
## Specific Ideas

- Franco descubrió que la `ANTHROPIC_API_KEY` es placeholder y nunca se desplegó (la feature de IA de franchise de la Phase 38 es código durmiente) — por eso el motor pasó de LLM a heurístico. El heurístico se apoya en que la ruta ya codifica la familia.

</specifics>

<deferred>
## Deferred Ideas

- **Motor LLM o híbrido** para el primer pase: descartado ahora por la decisión de no usar API. Si en el futuro hay una key válida y se quiere mejorar la calidad de la sub-familia fina, se puede reintroducir como mejora (las propuestas son revisables igual).
- **Auto-aceptación por umbral de confianza** (heurístico auto-acepta alta confianza, profes solo revisan dudosos): opción de UX considerada y diferida; arrancamos con revisión completa filtrable. Reconsiderar si el volumen agota a los profes.
- **Normalización fina de sub-familias** (merge/split): se hace en la revisión + editor de árbol (128), no en el bootstrap.
- **Limpieza de `effort`** (~30% sucio): fuera de alcance de 125; se confía la contracción como está.

</deferred>

---

_Phase: 125-Bootstrap (heurístico) + revisión de profes de la descomposición_
_Context gathered: 2026-06-04_
