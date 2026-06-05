# Phase 129: Nivel Kairos — enum, herencia de Alfa y formato lineal - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning
**Source:** Autonomous synthesis (overnight run) from ROADMAP §Phase 129 + codebase scout. Open decisions resolved by Claude per milestone intent (memory: "Kairos = 2 ej/bloque + solo lineal, alcance SOLO estructural").

<domain>
## Phase Boundary

El nivel **Kairos** existe en todo el sistema (enum API + app + admin) y **genera sesiones que heredan de Alfa pero forzadas a formato ultra-simple (solo lineal + exactamente 2 ej/bloque)**, tomando ejercicios Alfa de `difficulty=1`, **sin contenido propio todavía**. Backend-first. Cubre **KAIROS-01, KAIROS-02, KAIROS-03**.

**NO incluye:** cambiar el default de `users.level` a kairos, graduación, override del coach, ni el 6º recuadrito visual del selector (todo eso es **130**). 129 solo agrega el nivel + su capa de generación. NO depende del grafo (126).
</domain>

<decisions>
## Implementation Decisions

### El enum del nivel (KAIROS-01)

- **D-01:** Agregar `kairos` al `levelEnum` de la API (`el-templo-api/src/db/schema/users.ts`, `mysqlEnum("level", [...])`) **como primer valor**, orden final `kairos → alfa → delta → sigma → omega → spartan`. Como `users.level` es un ENUM de MySQL, esto requiere una **migración hand-written** (`ALTER TABLE users MODIFY level ENUM('kairos','alfa','delta','sigma','omega','spartan') ...`) — próximo número libre (~0140; confirmar). **NO** cambiar el `DEFAULT` de la columna en esta fase (sigue `alfa`; 130 lo cambia). El 1er arg `"level"` NO cambia (cuidado drift enum — ver lección 125/126). Replicar `kairos` en los enums/uniones/constantes de la **app** (`el-templo-app`) y el **admin** (`el-templo-admin/src/constants/levels.ts` `LEVEL_ORDER` y demás uniones de tipo de nivel) — sin migración (solo TS).
- **D-02 (mapeo a level-group):** `kairos → levelGroup 'alfa_delta'` en el mapeo `getLevelGroupForLevel` (hoy en `sessions/routes.ts:~42`). No se crea un LevelGroup nuevo; la restricción real de Kairos vive en la capa de generación (D-03/D-04/D-05), no en el grupo.

### Herencia de Alfa (KAIROS-02)

- **D-03:** La generación Kairos **hereda del pipeline de Alfa**. Alfa ya es caso especial (`routes.ts:~429` `effectiveLevel = memberLevel === "alfa" ? "alfa" : "delta"`); Kairos se castea igual a **`effectiveLevel='alfa'`** y además **filtra a ejercicios Alfa de `difficulty = 1`** (mientras no haya contenido propio). El `dayId = W{semana}-{día}-{nivel}` con override de nivel ya existe — Kairos lo reusa.

### Formato forzado (KAIROS-03)

- **D-04 (solo lineal):** Las sesiones Kairos fuerzan **formato solo lineal (sets×reps)** — NADA de EMOM/AMRAP/circuitos/complejos. El formato lineal ya existe en la tabla `formats`. La restricción se inyecta en la etapa de selección de formato del pipeline gateada por `level === 'kairos'` (memory: forzar restricciones Kairos es factible SIN reescribir el pipeline — el planner localiza el punto de inyección, probablemente `pipeline/stage-3-budget.ts` / `rom-generator.ts` / verify-formats).
- **D-05 (2 por bloque, incluido INITIUM):** **Exactamente 2 ejercicios por bloque** en toda sesión Kairos. El INITIUM (hoy fijo en 4) se **baja a 2** para Kairos (resolución de la decisión abierta del roadmap: uniforme "exactamente 2 por bloque", sin excluir el INITIUM). Gateado por `level === 'kairos'`.
- **D-06 (dosis lineales):** Reusar las dosis lineales existentes de Alfa (`LEVEL_LINEAR_BASE.alfa` y afines en `level-mapping.ts`). Las dosis exactas finas que definan los profes quedan **diferidas** (no bloquean esta fase).

### Invariante crítico (brownfield)

- **D-07:** Agregar Kairos **NO debe alterar la generación existente** de alfa/delta/sigma/omega/spartan. Todo el comportamiento Kairos va gateado por `level === 'kairos'`. La migración del enum es **aditiva** (agrega un valor, no toca filas). Tests de regresión: una sesión alfa/delta sigue saliendo igual; una sesión kairos sale lineal + 2/bloque desde Alfa difficulty=1.

### Claude's Discretion

- Punto exacto de inyección de las restricciones de formato/tamaño en el pipeline (sin reescribirlo).
- Si `kairos` necesita su propia entrada en `LEVEL_LINEAR_BASE`/mapas o reusa la de alfa.
- Nombre/comentarios de la migración 0140; confirmar número libre.
- Cómo se castea exactamente "difficulty=1" sobre el set Alfa (filtro en la query de candidatos vs post-filtro).
  </decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Enum del nivel (KAIROS-01)

- `el-templo-api/src/db/schema/users.ts` — `levelEnum = mysqlEnum("level", [...])` (agregar kairos primero; migración ALTER).
- `el-templo-admin/src/constants/levels.ts` — `LEVEL_ORDER` + uniones de nivel.
- `el-templo-app/src/modules/training/level-display.ts`, `utils/levelDisplay.ts`, `types/session.ts`, `src/stores/useUserStore.ts`, `modules/onboarding/types.ts`, `modules/progression/types.ts` — uniones/constantes de nivel en la app (el planner enumera todas las que rompan el typecheck).
- `el-templo-api/src/db/migrations/` — última 0139; próxima ~0140 (hand-written, sin `;` en comentarios).

### Generación / herencia (KAIROS-02/03)

- `el-templo-api/src/modules/sessions/routes.ts` — `getLevelGroupForLevel` (~l.42, mapeo level→levelGroup) + `effectiveLevel` (~l.429, special-case de Alfa) + el dayId override de nivel.
- `el-templo-api/src/modules/sessions/pipeline/utils/level-mapping.ts` — `getAllowedLevels`, `levelGroupToLevel`, `LEVEL_LINEAR_BASE`.
- `el-templo-api/src/modules/sessions/pipeline/stage-3-budget.ts` — tamaño de bloque / presupuesto (punto candidato para "2 por bloque" + INITIUM).
- `el-templo-api/src/modules/sessions/rom-generator.ts`, `validation/verify-formats.ts` — selección/validación de formato (punto candidato para "solo lineal").
- `el-templo-api/src/db/schema/formats.ts`, `format-compatibility.ts` — formatos existentes (lineal ya existe).
- `el-templo-api/src/modules/sessions/types.ts` — `LevelGroup`, tipos de la sesión.

### Convenciones

- `CLAUDE.md` §Database (Drizzle + runner custom, `pnpm db:migrate`, NUNCA `drizzle-kit migrate`, sin `;` en comentarios SQL, commitear la migración junto al schema), §API tests (CI), §Logging, §sin `any`.
- **Lección drift enum (125/126):** el 1er arg de `mysqlEnum` es el nombre de columna (`level`) — NO cambiarlo; el `ALTER` debe listar los MISMOS valores en el MISMO orden que el schema TS. `tsc` no atrapa drift; correr el test nuevo en CI.
  </canonical_refs>

<specifics>
## Specific Ideas
- Alcance SOLO estructural (memory): Kairos arranca heredando Alfa con formato ultra-simple. La "conversión/curaduría" de contenido propio es trabajo de profes/futuro, NO requisito de código acá.
- El nivel ya funciona como override de lectura (`dayId = W{semana}-{día}-{nivel}`); Kairos es un override más, estricto.
</specifics>

<deferred>
## Deferred Ideas
- Default `users.level = kairos`, graduación automática, override del coach, 6º recuadrito del selector → fase 130.
- Contenido propio de Kairos (hoy hereda Alfa).
- Dosis lineales exactas finas (profes).
- Ajuste in-session (131).
</deferred>

---

_Phase: 129-Nivel Kairos — enum, herencia de Alfa y formato lineal_
_Context gathered: 2026-06-05 (autonomous)_
