# Phase 159: Semana nueva backend — modos de día, generadores, roles de bloque y horarios - Research

**Researched:** 2026-08-13
**Domain:** Generador de sesiones (SPOM pipeline) + scheduling/activities, backend `el-templo-api`
**Confidence:** HIGH (todo lo sustantivo se verificó leyendo el código de `origin/master`; lo no verificable sin SSH está marcado `[ASSUMED]`)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copiadas verbatim de `159-CONTEXT.md` (sección `<decisions>`):

**Modos de día (combos / tecnica) — selección por el profe**

- **D-01:** `session_mode` acepta `combos` y `tecnica` además de `regular`/`rom`. Migración aditiva; histórico intacto (corpus IA — cambios SIEMPRE aditivos).
- **D-02:** **El profe elige el tipo de sesión por día en `/generate`** (regular/rom/combos/tecnica). Combos/técnica NO están atados a un día fijo — se mueven semana a semana según decisión del coach (probado por los datos de prod). `day_modes` se mantiene solo como default de ROM (sábado); deja de ser la fuente fija para combos/técnica.
- **D-03:** El generador enruta por el modo elegido: `combos`→combos-generator, `tecnica`→tecnica-generator (análogo a como ROM tiene su generador). El backend debe aceptar el modo por día en el request de generación (hoy `/generate` ya elige tipo — sumar combos/tecnica a las opciones).

**Estructura de bloques (día de combos)**

- **D-04:** INITIUM → **COMBOS I** → **COMBOS II** → **STRETCHING**. Sin bloque a elección (el DEUTEROS de los días regulares es un slot de elección I/II; en combos se colapsa a un único COMBOS II, sin elección).
- **D-05:** **COMBOS I = tren superior, COMBOS II = tren inferior** (spec del usuario). ⚠️ Discrepancia con prod: el coach hoy usa 3 bloques con rutas variadas de skill (SU/TTB/OAR), no superior/inferior estricto. Se implementa la spec del usuario (2 bloques, superior/inferior); si en plan-phase surge fricción con la práctica real, reconfirmar.
- **D-06:** Los bloques de combo usan el **formato "Combos" ya en prod** (migración 0172 — clon de Complex). **Se mantiene la forma actual de reps del profe** (rounds + reps por ejercicio, `{"type":"combos","rounds":""}`): NO se introduce un parámetro único de "reps" nuevo. SEM-02 original queda superado.

**Estructura de bloques (día de técnica)**

- **D-07:** INITIUM → **TECNICA I** → **TECNICA II** → **STRETCHING**. Sin bloque a elección.
- **D-08:** **TECNICA I y TECNICA II van sobre la MISMA ruta** — el día de técnica trabaja dos bloques de una misma ruta para afianzar el aprendizaje (ej. ambos planche). El generador elige una sola ruta para ambos; el profe la edita. (Confirmado en prod: NUCLEUS+DEUTEROS_1 comparten ruta.)
- **D-09:** Formato por default de técnica: formato de calidad/skill (prod usa For Quality / Accumulate X / Cluster). El coach lo edita.

**Niveles**

- **D-10:** El generador produce los **6 niveles** (alfa, delta, kairos, omega, spartan, sigma) agrupados en los 3 `level_group` existentes (`alfa_delta`, `omega`, `sigma`), igual que los días regulares. NO el modelo de 2 niveles de ROM.

**Bloque STRETCHING (final de ambos días)**

- **D-11:** Rol de bloque **STRETCHING** propio (no hereda comportamientos de NUCLEUS/DEUTEROS/EPIKOS), **nivel único**. Reemplaza el slot final (hoy EPIKOS con Flow Guiado / Circuito cooperativo).
- **D-12:** **Reutiliza el pool y la lógica de selección de movilidad de ROM** (`mobility_related`, ~126 ejercicios). Reusar la maquinaria de ROM, no reinventarla.
- **D-13:** El **generador elige** ~4 ejercicios de movilidad (estilo INITIUM de 4 fijos que pidió el coach) y el **coach edita**. No es bloque fijo curado.

**Rename DEUTEROS I/II → A/B**

- **D-14:** En los días **regulares**, las opciones del bloque a elección DEUTEROS pasan de "I"/"II" a **"A"/"B"** (libera "I/II" para COMBOS/TECNICA). En prod los roles son `DEUTEROS_1`/`DEUTEROS_2`. **Presunción: rename de labels de presentación, NO de datos** — histórico intacto. Confirmar en plan-phase si algún dato/label persiste "I/II" literal.

**Clases en horarios (etiqueta derivada de la sesión generada)**

- **D-15:** El nombre de la clase en horarios/app **se deriva de la sesión generada de ese día**: si el modo es `combos`→**"Combos"**, `tecnica`→**"Técnica"**, si no→**"General"**. Como el modo lo elige el profe en /generate, la etiqueta se actualiza sola. **No** un mapeo fijo por día de la semana.
- **D-16:** **Renombrar la etiqueta genérica "Calistenia" → "General"** (el nombre por default cuando el día es regular).
- **D-17:** Sin crear actividades nuevas en `activities`, **sin tocar reservas, cupos ni gating** — solo la etiqueta visible. Global (todas las sedes ven lo mismo, deriva de la sesión del día).

**Ancla histórica (corpus IA)**

- **D-18:** Ancla semana→fecha/régimen + retro-etiquetado de días combos/técnica desde W12 usando las firmas de detección (formato Combos vs For Quality/Flow Guiado por día), como **metadata sin tocar filas históricas** (SEM-05).

### Claude's Discretion

- Convención de nombres de roles nuevos (seguir estilo ROM: `ROM_LOWER` etc.).
- Degradación cuando el pool de una ruta es fino para 6 niveles × 2 bloques.
- Cantidad exacta de ejercicios por combo (arrancar de la práctica de prod: ≥3, editable).

### Deferred Ideas (OUT OF SCOPE)

- **Actividades reales "Combos"/"Técnica" en `activities`** (con reservas/cupos/gating propios) — descartado; solo etiqueta visible.
- **`day_modes` por sede (`branch_id`)** — no se necesita.
- **Viernes como modo "open"** — sigue `regular`; nunca confirmado con el coach.
- **Semántica del `reps` del combo como parámetro único** — el usuario mantiene la forma actual; reabrir solo si el coach lo pide.
- **Reviewed Todos (not folded):** "Rollout de datos v5.1 — poblar milestone_exercise_id" — revisado, NO incorporado.

**Base de rama:** `master` actual (el tren de tenancy v6.0 NO va a master todavía). La rama vieja `feat/dias-combos-tecnica` NO se rebasea (está en 0164, 37 migraciones atrás — solo sirve como referencia de intención).

</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID         | Descripción                                                                                                            | Research Support                                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SEM-01** | `session_mode` acepta `combos`/`tecnica`, migración aditiva, histórico intacto                                         | **NO hace falta migración de columna**: `sessions.session_mode` es `varchar(10)` sin enum ni CHECK (§ Hallazgo 1). Cambio es de tipos TS + validación de payload.                                                                                                                                                                            |
| **SEM-02** | Formato Combos: se mantiene la forma actual de reps (rounds + reps por ejercicio)                                      | El formato "Combos" ya existe end-to-end: fila en `formats` (mig 0172), `FormatParams` `{type:"combos",rounds}`, `prescribeCombos`, editor admin, PDF, TV timer-spec (§ Hallazgo 4). El generador solo tiene que forzarlo.                                                                                                                   |
| **SEM-03** | combos-generator: INITIUM → COMBOS I superior → COMBOS II inferior → STRETCHING                                        | Molde: `rom-generator.ts` (252 líneas, autocontenido). Rutas superior/inferior: reusar `GOAL_PLAN_ROUTE_MAP.tren_superior` / `.tren_inferior` (§ Hallazgo 5).                                                                                                                                                                                |
| **SEM-04** | tecnica-generator: INITIUM → TECNICA I → TECNICA II misma ruta → STRETCHING                                            | Misma base; una sola resolución de ruta compartida por los dos bloques. Formato de calidad forzado (§ Hallazgo 6).                                                                                                                                                                                                                           |
| **SEM-05** | Ancla semana→fecha/régimen + retro-etiquetado W12+, metadata sin tocar filas históricas                                | `WEEK_ONE_MONDAY = 2026-02-23` en `shared/week-dates.ts` hace la mitad "fecha" determinística; falta tabla nueva de régimen (§ Hallazgo 8). Firmas del discovery transcritas en § Firmas de detección.                                                                                                                                       |
| **SEM-06** | Tests de integración de ambos generadores                                                                              | Molde exacto: `test/unit/rom-generator.test.ts` (537 líneas, DB mockeada) + integración real contra MySQL en `test/sessions/` (§ Validation Architecture).                                                                                                                                                                                   |
| **SEM-12** | Roles de bloque nuevos COMBOS I/II, TECNICA I/II, STRETCHING + rename opciones DEUTEROS I/II → A/B, aditivo            | `session_blocks.role` es `varchar(20)` sin enum → cero cambio de schema. La unión TS `BlockRole` sí cambia y arrastra 2 `Record<BlockRole,…>` exhaustivos (§ Hallazgo 3). Labels "I"/"II" viven solo en presentación (§ Hallazgo 7).                                                                                                         |
| **SEM-13** | `/generate` acepta modo combos/tecnica por día; etiqueta de clase derivada de la sesión; rename "Calistenia"→"General" | Punto de entrada: `AdminService.generateWeek()` + `generateWeekSchema` (§ Hallazgo 2). Etiqueta: `SchedulingService.getWeeklySchedule()` es el único lugar donde el nombre se puede derivar sin tocar reservas (§ Hallazgo 9). "Calistenia" es una **fila de `activities`**, no un literal de UI (§ Hallazgo 9 y § Runtime State Inventory). |

</phase_requirements>

---

## Summary

Esta fase es casi enteramente **código, no schema**. Los dos supuestos más caros del roadmap se caen al leer master: (a) `sessions.session_mode` no es un enum de MySQL sino un `varchar(10)` con default `'regular'` — `'combos'` (6) y `'tecnica'` (7) entran sin ALTER; (b) `session_blocks.role` es `varchar(20)` sin enum — los cinco roles nuevos no requieren migración. La única migración obligatoria de la fase es la del **ancla histórica** (SEM-05, tabla nueva) y, si se elige la opción A, el rename de la fila `activities.name='Calistenia'` (SEM-13, `@data-only`).

La infraestructura para combos/técnica ya está construida en un 70%: el formato **"Combos"** y el formato **"Stretching"** existen en prod desde la migración 0172 y ya están cableados de punta a punta (`FormatParams`, `prescribeCombos`, editor del admin, transformador de PDF, `timer-spec` del TV, guía de la app). El **`rom-generator.ts`** es el molde estructural del generador alternativo (bypasea el pipeline SPOM de 7 etapas y devuelve un `DaySession` completo con `sessionMode`), y el **`goal-plan-pipeline.ts`** es el molde para resolver rutas sin el `weekly_rotator` (selección determinística por hash sobre una lista curada de rutas). Ese segundo molde resuelve el problema central de D-05: **no existe hoy ninguna clasificación superior/inferior de rutas**, pero `GOAL_PLAN_ROUTE_MAP.tren_superior` y `.tren_inferior` son exactamente esas dos listas, ya curadas y en uso.

Los tres riesgos reales de la fase no están en los generadores sino en los bordes: (1) el **`weekly_rotator` no tiene columnas** para los roles nuevos y `resolveRotator` tira `Unknown block role` para cualquier rol fuera de los cinco clásicos — los generadores nuevos NO pueden pasar por Stage 1; (2) el **rename "Calistenia"→"General"** toca una fila de `activities` que alimenta analytics, ratings, reports, attendance y bookings, y hay dos lugares de código que hacen get-or-create por el literal `"Calistenia"` (si se renombra el dato sin tocar el código, la próxima sede nueva **crea una actividad duplicada**); (3) el bloque **STRETCHING de "nivel único"** se genera 6 veces (una por nivel) y si copia el `Math.random()` de `rom-generator`/`mobility-selection` los 6 niveles van a salir distintos, rompiendo la promesa de nivel único y el render de una sola fila en el PDF.

**Primary recommendation:** Escribir `combos-generator.ts` y `tecnica-generator.ts` como hermanos autocontenidos de `rom-generator.ts` (sin tocar el pipeline SPOM ni el `weekly_rotator`), resolviendo rutas con el hash determinístico de `goal-plan-pipeline.ts` sobre `GOAL_PLAN_ROUTE_MAP`, y enrutar desde `AdminService.generateWeek()` con un modo **por día venido del request** (`days: [{day, mode}]`), dejando `day_modes` como está para no romper ROM ni las cinco lecturas de miembro/TV que hoy dependen de él.

---

## Architectural Responsibility Map

| Capability                                   | Primary Tier                                              | Secondary Tier                                         | Rationale                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Aceptar el modo por día (`combos`/`tecnica`) | API / Backend (`POST /admin/generate`)                    | —                                                      | El request lo arma el admin (fase 160); la validación y el ruteo son del backend.                                    |
| Generar la sesión de combos/técnica          | API / Backend (módulo `sessions`)                         | Database (lectura de `exercises`, `formats`, `routes`) | Generación pura + persistencia transaccional; ninguna decisión es del cliente.                                       |
| Persistir modo y roles                       | Database (`sessions.session_mode`, `session_blocks.role`) | —                                                      | Columnas ya existentes, sin enum.                                                                                    |
| Ancla semana→fecha/régimen                   | Database (tabla nueva)                                    | API (script/migración de backfill)                     | Corpus para IA: dato, no comportamiento. La parte "fecha" ya es derivable con `dateToWeekNumber`.                    |
| Etiqueta de clase derivada                   | API / Backend (`SchedulingService.getWeeklySchedule`)     | Frontend (fase 160, solo render)                       | D-17 prohíbe tocar `activities`/reservas: la derivación tiene que ser de solo-lectura, en el read model del horario. |
| Rename "Calistenia"→"General"                | Database (fila de `activities`)                           | API (dos get-or-create por literal)                    | Es un dato en prod, no un string de UI.                                                                              |
| Labels DEUTEROS A/B                          | API (badge `D1`/`D2`) + Frontend (PDF)                    | —                                                      | Solo presentación; el backend de la fase 159 cubre su mitad, el resto es SEM-11 (fase 160).                          |

---

## Hallazgos verificados (el mapa del código)

### Hallazgo 1 — `session_mode` NO es un enum: la "migración aditiva" de SEM-01 no existe

```ts
// el-templo-api/src/db/schema/sessions.ts
sessionMode: varchar("session_mode", { length: 10 }).default("regular").notNull(),
```

```sql
-- el-templo-api/src/db/migrations/0080_rom_mode_day_modes.sql
ALTER TABLE `sessions` ADD `session_mode` varchar(10) NOT NULL DEFAULT 'regular';
```

`[VERIFIED: git show origin/master:el-templo-api/src/db/schema/sessions.ts + migrations/0080]`

`'combos'` (6 chars) y `'tecnica'` (7 chars) entran en `varchar(10)`. **No hay CHECK constraint ni enum de MySQL.** Lo que sí cambia es la unión TypeScript, que aparece en **cinco** lugares del backend:

| Archivo                                    | Línea | Qué dice hoy                                                             |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------ |
| `sessions/types.ts`                        | 161   | `readonly sessionMode?: "regular" \| "rom"` (en `DaySession`)            |
| `sessions/service.ts`                      | 738   | `session.sessionMode as "regular" \| "rom"` (cast)                       |
| `sessions/service.ts`                      | 869   | idem                                                                     |
| `sessions/validators/session-validator.ts` | 58    | `session.sessionMode === "rom"` → rama de validación de 4 bloques        |
| `admin/routes.ts`                          | 120   | `enum: ["regular", "rom"]` en el body de `PUT /admin/sessions/day-modes` |

Frontends (fuera de alcance de la 159, son 160): `el-templo-admin/src/types/session.ts:15` y `el-templo-app/src/modules/training/types/session.ts:140`, ambos `'regular' \| 'rom'`.

**Implicación para el plan:** SEM-01 es una tarea de tipos + validación, no de DB. Si el planner arma una tarea "migración para `session_mode`", está de más. Si se quiere endurecer (CHECK constraint), es una decisión nueva, no un requisito — y contradice "aditivo/histórico intacto" porque el histórico tiene `regular` hackeado en días que en realidad eran combos.

### Hallazgo 2 — Punto de entrada exacto del ruteo por modo

`POST /admin/generate` (`admin/routes.ts:265`) → `AdminService.generateWeek(week, { days, levelGroups, regenerate })` (`admin/service.ts:629`).

Hoy adentro de `generateWeek`:

```ts
// admin/service.ts (~line 653)
const dayModeRows = await this.db.select().from(schema.dayModes);
const dayModeMap = new Map(
  dayModeRows.map((r) => [r.dayOfWeek, r.sessionMode]),
);

for (const day of days) {
  const dayNumber = DAY_NAME_TO_NUMBER[day];
  const dayMode = dayNumber
    ? dayModeMap.get(dayNumber) || "regular"
    : "regular";

  if (dayMode === "rom") {
    for (const memberLevel of ["alfa", "delta"] as const) {
      /* generateRomSession */
    }
    continue; // salta el loop de levelGroups
  }
  // ... loop regular de levelGroups × memberLevels con sharedFormats
}
```

`[VERIFIED: git show origin/master:el-templo-api/src/modules/admin/service.ts]`

El schema del body (`admin/schemas.ts:48`) hoy es:

```ts
days: { type: "array", items: { type: "string", enum: ["lunes",…,"sabado"] } }
```

**Forma recomendada del cambio (retrocompatible):** agregar una propiedad opcional `dayModes` en el body, `{ [dayName]: "regular"|"rom"|"combos"|"tecnica" }`, que **pisa** el default de `day_modes` para ese request. Mantener `days: string[]` tal cual. Razón: `days` es consumido también por la UI actual del admin y por los tests; convertirlo en array de objetos es un breaking change innecesario para lo que la fase pide, y `day_modes` sigue siendo la fuente del default de ROM del sábado (D-02 lo exige explícitamente).

El ruteo dentro de `generateWeek` queda:

```ts
const dayMode = requestModes?.[day] ?? dayModeMap.get(dayNumber) ?? "regular";
if (dayMode === "rom") {
  /* existente, 2 niveles */ continue;
}
if (dayMode === "combos") {
  /* combos-generator, 6 niveles */ continue;
}
if (dayMode === "tecnica") {
  /* tecnica-generator, 6 niveles */ continue;
}
// regular: intacto
```

⚠️ **No hay allowlist de `sessionMode` en el body de `/generate` hoy** (no existe el campo). Al agregarlo hay que declarar el `enum` de los 4 valores en el JSON Schema de Fastify (V5 Input Validation, ver § Security Domain).

### Hallazgo 3 — Roles nuevos: cero schema, dos `Record<BlockRole,…>` exhaustivos

```ts
// db/schema/session-blocks.ts
role: varchar("role", { length: 20 }).notNull(), // INITIUM, NUCLEUS, etc
```

`[VERIFIED]` — `COMBOS_I`, `COMBOS_II`, `TECNICA_I`, `TECNICA_II`, `STRETCHING` entran todos en 20 chars.

La unión `BlockRole` (`sessions/types.ts:38`) hoy tiene 9 valores. Extenderla dispara errores de compilación **útiles** (checklist automático) en los dos mapas exhaustivos:

| Archivo                                       | Constante                                                    | Qué hay que agregar                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `sessions/validators/block-validator.ts:20`   | `FORMAT_COMPATIBILITY: Record<BlockRole, readonly string[]>` | `COMBOS_I/II: ["Combos"]`, `TECNICA_I/II: ["For Quality","Cluster","Accumulate X",…]`, `STRETCHING: ["Stretching"]` |
| `sessions/validators/session-validator.ts:25` | `INTENSITY_RANGES: Record<BlockRole, {min,max}>`             | rangos para los 5 roles nuevos (ROM usa `{min:30,max:70}` como referencia)                                          |

`[VERIFIED: git grep "Record<BlockRole"]`

Además, dos mapas **NO exhaustivos** (son `Record<string,string>`, no van a fallar el typecheck — hay que acordarse a mano):

- `admin/edit-service.ts:660` `blockMap` (rol → familia de `format_compatibility`): `INITIUM/NUCLEUS/DEUTEROS_1/DEUTEROS_2/ATHLOS/EPIKOS`. **Los roles nuevos no mapean** → `getCompatibleFormats` devuelve lista vacía para un bloque COMBOS_I en el editor. La columna `format_compatibility.block` es un **`mysqlEnum` real** (`'initium'|'nucleus'|'deuteros'|'athlos'|'epikos'`), así que mapear COMBOS_I→`'nucleus'` es la salida sin migración; agregar valores al enum sí requeriría ALTER. Decisión para plan-phase.
- `sessions/validators/session-validator.ts` — chequeo de "block count": la rama ROM exige exactamente 4 bloques (`session.blocks.length !== 4` → error) y la rama regular exige `MIN_BLOCKS..MAX_BLOCKS`. Combos/técnica también son de 4 bloques → hay que sumarlos a la rama de conteo fijo o generalizar. Si no se toca, `validateSession` va a tirar warnings/errores espurios.

### Hallazgo 4 — El formato "Combos" y el formato "Stretching" ya están cableados end-to-end

Migración `0172_formats_combos_stretching_ruta_fullbody.sql` (`@data-only`, idempotente) insertó ambos formatos y la ruta `FULLBODY`. `[VERIFIED]`

Cableado existente que el generador hereda gratis:

| Capa                  | Archivo                                                         | Evidencia                                                                                                       |
| --------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tipos de params       | `admin/format-params.ts:82,87`                                  | `{type:"combos"; rounds:number}` y `{type:"stretching"}`                                                        |
| Defaults              | `admin/format-params.ts:328,342` + `DEFAULTS.COMBOS_ROUNDS = 3` | `combos: () => ({type:"combos", rounds:3})`                                                                     |
| Resolución por nombre | `admin/format-params.ts:472,475`                                | `normalized.includes("combo")` → params de combos                                                               |
| Prescriptor           | `pipeline/format-prescribers.ts:161,649`                        | `prescribeCombos` = `prescribeBackToBack(ctx, "Combo - sin descanso entre ejercicios")`, 3 rondas, reps iguales |
| Render de subtítulo   | `admin/format-params.ts:659`                                    | `case "combos"` → `"Combos X{rounds}"`                                                                          |
| Editor admin          | `el-templo-admin/.../FormatParamsEditor.vue:219,795,801`        | combos usa el control "rounds only"                                                                             |
| PDF                   | `el-templo-admin/src/utils/pdf/session-data-transformer.ts:115` | `case 'combos'`                                                                                                 |
| TV                    | `el-templo-api/src/modules/tv/timer-spec.ts:171,175`            | combos y stretching ya tienen caso                                                                              |
| Guía de la app        | `el-templo-app/.../GuiaPage.vue:223,228`                        | ambos formatos documentados al alumno                                                                           |

`[VERIFIED: git grep -in "combos\|stretching" origin/master]`

**Implicación:** el generador de combos NO tiene que crear formato, params ni prescriptor. Tiene que **buscar el `formats.id` de 'Combos'** y forzarlo. Ojo: `rom-generator` usa `format: { formatId: 0, name: "ROM" }` (id falso, porque "ROM" no es una fila de `formats`). Para combos/técnica **sí hay filas reales** → usar el id real, si no el editor del admin y el PDF pierden la descripción del formato (`sessions/routes.ts` precarga `formatDescriptions` desde la tabla `formats` por nombre — ahí no molesta, pero `session_blocks.format_id` con 0 es una mentira que otros joins pueden pagar).

Detalle de prod (del CONTEXT): hoy los combos vienen con `{"type":"combos","rounds":""}` — **rounds string vacío**. `prescribeCombos` usa una constante interna de 3 rondas para repartir el budget, así que el vacío no rompe la prescripción, pero cualquier código nuevo que lea `formatParams.rounds` tiene que tolerar `""` (el discovery lo marca como trampa de data-quality). `[CITED: DISCOVERY-SEMANA-NUEVA-2026-07-07.md §Data-quality]`

### Hallazgo 5 — Las rutas superior/inferior YA existen curadas (resuelve D-05)

No hay ninguna clasificación superior/inferior en la tabla `routes` (`code`, `display_name`, `excluded_from_tree`, nada más). `[VERIFIED: db/schema/routes.ts]`

Pero sí existe, curada y en producción:

```ts
// el-templo-api/src/modules/goal-plans/constants.ts:12
export const GOAL_PLAN_ROUTE_MAP: Record<GoalPlanType, string[]> = {
  tren_superior: ["HS","HSPU","PHS","OAPU","PLPU",  // upper push
                  "MU","OAP","OAR","BL",             // upper pull
                  "HD/ID","MN/RP","FL","FLR","TTB"],
  tren_inferior: ["SU","SS","PS","QC","DS","NC","HT"],
  …
};
```

`[VERIFIED: git show origin/master:el-templo-api/src/modules/goal-plans/constants.ts]`

Y el patrón de selección determinística que las consume:

```ts
// pipeline/goal-plan-pipeline.ts:60
function resolveGoalPlanRoute(ctx, goalPlanType): BlockContextWithRoute {
  const allowedRoutes = GOAL_PLAN_ROUTE_MAP[goalPlanType];
  const hashInput = `${ctx.week}-${ctx.day}-${ctx.role}`;
  const routeIndex = simpleHash(hashInput) % allowedRoutes.length;
  const selectedRoute = allowedRoutes[routeIndex];
  …
}
```

**Recomendación prescriptiva:** COMBOS I resuelve ruta sobre `GOAL_PLAN_ROUTE_MAP.tren_superior`, COMBOS II sobre `.tren_inferior`, con `simpleHash(\`${week}-${day}-${role}\`)`. Ventajas: (a) reutiliza listas ya curadas por el coach, (b) determinístico → los 6 niveles del día caen en la misma ruta (requisito implícito para que el PDF/TV muestren un bloque coherente por día), (c) reproducible en tests sin mocks de `Math.random`.

`[ASSUMED]` que `tren_superior`/`tren_inferior` de goal-plans son la partición que el coach considera correcta para combos. Es la mejor fuente que hay en el repo, pero nació para otro propósito (planes de objetivo). **Vale un checkpoint de confirmación con el usuario en plan-phase** — sobre todo porque el CONTEXT ya marca discrepancia con lo que el coach hace hoy en prod (usa SU/TTB/OAR, mezcla).

### Hallazgo 6 — `weekly_rotator` NO sirve para los roles nuevos (bloqueante de diseño)

```ts
// pipeline/stage-1-rotator.ts:40
switch (ctx.role) {
  case "NUCLEUS":
    routeId = rotator.nucleusRouteId;
    break;
  case "DEUTEROS_1":
    routeId = rotator.deuteros1RouteId;
    break;
  case "DEUTEROS_2":
    routeId = rotator.deuteros2RouteId;
    break;
  case "ATHLOS":
  case "EPIKOS":
    routeId = rotator.athlosRouteId;
    break;
  default:
    throw new Error(`Unknown block role: ${ctx.role}`);
}
```

La tabla `weekly_rotator` tiene exactamente 4 columnas de ruta (`nucleus_route_id`, `deuteros1_route_id`, `deuteros2_route_id`, `athlos_route_id`) + unique `(week, day, level_group)`. `[VERIFIED: db/schema/weekly-rotator.ts]`

**Conclusión:** los generadores de combos/técnica **no pueden pasar por `runBlockPipeline` sin modificar Stage 1**. Hay dos caminos:

| Opción                                                                           | Qué implica                                                                                                           | Recomendación                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Generadores autocontenidos** (molde `rom-generator.ts`)                     | Escriben `BlockPlan[]` directamente; usan `runInitiumPipeline` para el INITIUM y hacen selección de ejercicios propia | ⚠️ Duplica la selección de ejercicios (stages 2-7): budget, contracción, dificultad por nivel. Con 6 niveles eso es mucho más que lo que ROM resuelve con 2.                                                                                                                                                    |
| **B. Pipeline con resolución de ruta inyectada** (molde `goal-plan-pipeline.ts`) | Reusa stages 2-7 tal cual, reemplaza solo Stage 1 por una función de resolución propia                                | ✅ **Recomendada.** Es literalmente lo que `goal-plan-pipeline.ts` ya hace: `runGoalPlanBlockPipeline` importa `resolveSpom`, `deriveBudget`, `deriveContraction`, `selectFormat`, `selectExercises`, `generatePrescriptions` del pipeline principal. Los 6 niveles y la coherencia de dificultad salen gratis. |

**El bloque STRETCHING es la excepción**: no pasa por el pipeline (no tiene ruta de fuerza, no tiene budget, es movilidad) → ese sí se construye a mano estilo `rom-generator`.

Estructura recomendada del generador de combos:

```
INITIUM      → runInitiumPipeline (idéntico a regular y a ROM)
COMBOS_I     → runComboBlockPipeline(role=COMBOS_I, routePool=tren_superior, forcedFormat='Combos')
COMBOS_II    → runComboBlockPipeline(role=COMBOS_II, routePool=tren_inferior, forcedFormat='Combos')
STRETCHING   → buildStretchingBlock(db, week, day)   // determinístico, sin pipeline
```

Técnica idem, con **una sola resolución de ruta** compartida por TECNICA_I y TECNICA_II (D-08) y formato de calidad forzado (D-09).

### Hallazgo 7 — Los labels "I"/"II" de DEUTEROS son puro render (confirma la presunción de D-14)

Los roles en DB son `DEUTEROS_1` / `DEUTEROS_2` y nunca cambian. Los literales "I"/"II" aparecen solo acá:

| Superficie                    | Archivo:línea                             | Literal                                |
| ----------------------------- | ----------------------------------------- | -------------------------------------- |
| API (badge de listado)        | `admin/service.ts:176-177`                | `label = "D1"` / `"D2"`                |
| Admin PDF (títulos de página) | `pdf/session-data-transformer.ts:474,477` | `'DEUTEROS I'` / `'DEUTEROS II'`       |
| Admin PDF (matcher tolerante) | `pdf/session-pdf-builder.ts:1080-1081`    | busca `'DEUTEROS_1' \|\| 'DEUTEROS I'` |
| Admin PDF (tipos, comentario) | `pdf/pdf-types.ts:33`                     | comentario                             |

`[VERIFIED: git grep -rn "DEUTEROS" origin/master]`

**Implicación para SEM-12 en fase 159 (backend-only):** el único cambio de la 159 es el badge `D1`/`D2` de `admin/service.ts` (a `DA`/`DB` o lo que se decida). Los literales del PDF son admin frontend → **SEM-11, fase 160**. El plan no debería mezclarlos. **No hay ninguna centralización de labels de rol hoy** — están dispersos; SEM-11 la va a crear.

⚠️ Ojo con `pdf/session-pdf-builder.ts:1080`: el matcher acepta tanto el rol crudo como el label. Si en la 160 se centraliza, ese doble matcher es un cabo suelto a limpiar.

### Hallazgo 8 — El ancla: la mitad "fecha" ya está resuelta, falta la mitad "régimen"

```ts
// el-templo-api/src/modules/shared/week-dates.ts
const WEEK_ONE_MONDAY = new Date("2026-02-23T00:00:00");
export function dateToWeekNumber(date: string): number { … Math.max(1, Math.min(52, week)); }
```

`[VERIFIED]`

Es decir: `semana N → lunes = 2026-02-23 + 7*(N-1) días`, determinístico, sin tabla. Lo que **no** existe y SEM-05 pide es el **régimen por semana/día** (qué día fue combos y cuál técnica). Eso hay que persistirlo porque no es derivable del `session_mode` histórico (todo el histórico dice `regular` — el coach lo hackeaba).

**Firmas de detección para el retro-etiquetado W12–W26** `[CITED: .docs/coach-improvements/DISCOVERY-SEMANA-NUEVA-2026-07-07.md §Firmas de detección, verificadas contra prod]`:

- **Día de combos:** bloques NUCLEUS/DEUTEROS en formato **Complex** con ≥3 ejercicios `main`, reps 1–6 con al menos un 1–3, holds intercalados (patrón `1r 1r 0r/10s`). A nivel día: `lowrep_pct` (% de mains con reps 1–3) ≥ ~12% contra 0–3% en días normales. Detecta W12jue, W13mié, W14jue, W15mié, W16jue, W17mié, W18jue, W19mié, W20mié (W20 más débil, 3%, pero con Complex×3 en NUCLEUS+DEUTEROS).
- **Día de técnica:** bloque final (EPIKOS/ATHLOS) = **Flow Guiado** + `hold_pct` alto (V-SIT, L-SIT, HS…). Complementario perfecto del día de combos desde W12. Anomalía conocida: W17 tuvo Flow Guiado final mié **y** jue.
- **Falsos positivos conocidos:** Ladder / Ladder corta usan reps bajas legítimamente (W6, W8, W19vie) → **excluir por nombre de formato**.
- **Trampa de data-quality:** `W20-viernes-sigma` EPIKOS tiene `format_name='Complex'` pero `format_params={"type":"open_style"}` — un `format_change` dejó params inconsistentes. **No asumir consistencia `format_name`↔`format_params` en histórico.**

Evidencia adicional de esta sesión de discuss (SSH prod 2026-08-13), que **desmiente** la conclusión "fijo desde W19" del discovery y extiende el retro-etiquetado hasta W26:

| Semana | Miércoles             | Jueves                |
| ------ | --------------------- | --------------------- |
| 21     | Combos                | For Quality (técnica) |
| 22     | For Quality (técnica) | Complex               |
| 23     | Combos                | For Quality (técnica) |
| 24     | For Quality (técnica) | Combos                |
| 25     | For Quality (técnica) | Combos                |
| 26     | For Quality (técnica) | Combos                |

`[CITED: 159-CONTEXT.md §evidencia_prod]`

**Forma recomendada de la tabla** (una fila por semana×día etiquetado, no una por sesión — así el histórico de `sessions` queda literalmente intacto):

```
session_week_regime
  id, tenant_id, week, day, inferred_mode ('combos'|'tecnica'|'regular'|'rom'),
  source ('signature'|'generator'|'manual'), confidence, evidence (json), created_at
  UNIQUE (tenant_id, week, day)
```

Notas de implementación:

- **`tenant_id` obligatorio y clasificación en `tenant-tables.ts`.** Master tiene los gates de tenancy de las fases 166-171: `test/db/tenant-tables.test.ts` pone CI en rojo si una tabla del schema no está ni en `GYM_OWNED_TABLES` ni en `TENANT_EXEMPT_TABLES` (`el-templo-api/src/db/tenant-tables.ts:64,171`). `sessions` y `weekly_rotator` son gym-owned → la tabla nueva también. `[VERIFIED]`
- El retro-etiquetado es un **backfill en la migración** (`@data-only`, idempotente con `INSERT … SELECT … WHERE NOT EXISTS`), no un seed. Regla dura del skill: _"Prod data changes ALWAYS go in a migration (never seed re-runs)"_. `[CITED: .claude/skills/el-templo-db-migrations/SKILL.md Hard Rule 4]`
- Detectar las firmas en SQL puro dentro de la migración es frágil (percentiles de reps por día). **Alternativa recomendada:** escribir el detector en TS y que la migración solo inserte las filas ya calculadas (constantes literales, con el mapa de arriba + lo que salga del detector), documentando en el header de qué corrida salieron. Es exactamente el patrón que usa `0089`/`0131` (INSERT…SELECT con listas explícitas).

### Hallazgo 9 — "Calistenia" es una fila de `activities`, no un string de UI

```ts
// scheduling/service.ts:792  (seedDefaultSchedules — corre al crear una sede)
let [regularActivity] = await this.db.select({id: schema.activities.id})
  .from(schema.activities).where(eq(schema.activities.name, "Calistenia")).limit(1);
if (!regularActivity) {
  const result = await this.db.insert(schema.activities).values({
    name: "Calistenia", description: "Clase grupal de entrenamiento funcional" });
  …
}
```

Idéntico get-or-create en `el-templo-api/src/db/seed-production.ts:103-127`. `[VERIFIED]`

Y el nombre viaja desde `activities.name` a **muchísimas** superficies: `analytics/service.ts:963`, `analytics/especial-report-service.ts:155`, `attendance/service.ts:111`, `ratings/service.ts:297,677`, `reports/service.ts:414` (`"Lun 09:00 - Calistenia"`), `scheduling/booking-service.ts:542,589`, y el read del horario `scheduling/service.ts:175` (`activityName: schema.activities.name`). `[VERIFIED: git grep "activities.name"]`

**Dos decisiones que el plan tiene que separar limpiamente:**

**(a) Rename "Calistenia"→"General" (D-16).** Opciones:

| Opción                                                                                                                                                    | Cómo                                         | Consecuencia                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Renombrar el dato** (`UPDATE activities SET name='General' WHERE name='Calistenia'`, `@data-only`, idempotente) **+ actualizar los 2 get-or-create** | 1 fila, 1 migración, 2 archivos              | ✅ Simple y consistente. ⚠️ **Retroactivo**: reports/analytics/ratings históricos pasan a decir "General" para clases pasadas. ⚠️ **Si se renombra el dato sin tocar el código, `seedDefaultSchedules` de la próxima sede nueva CREA una segunda actividad "Calistenia"** → duplicado silencioso. Los dos cambios son atómicos o no van. |
| **B. Override solo en el render del horario**                                                                                                             | 0 migraciones, lógica en `getWeeklySchedule` | Deja el dato "Calistenia" vivo y divergente del label → dos nombres para lo mismo, deuda garantizada.                                                                                                                                                                                                                                    |
| C. No hacer nada                                                                                                                                          | —                                            | Incumple D-16.                                                                                                                                                                                                                                                                                                                           |

**Recomendación: A**, con las dos ediciones de código en el mismo commit que la migración. El efecto retroactivo en reports es aceptable (es un rename cosmético de la misma actividad, no una entidad nueva) pero **debe declararse explícitamente en el plan** para que nadie se sorprenda en UAT. `[ASSUMED]` que a Franco le da igual el efecto retroactivo en analytics — **vale confirmarlo**.

**(b) Etiqueta derivada (D-15).** El único read model donde D-17 ("sin tocar reservas, cupos ni gating") se puede honrar es `SchedulingService.getWeeklySchedule()` (`scheduling/service.ts:169-330`): ya arma `slots[]` con `activityName` **y con `slotDate` calculado por slot** (usa `bookingCountMap` con clave `${row.id}-${slotDate}`). Con la fecha en mano:

```
slotDate → dateToWeekNumber + dateToDayName → sessions(week, day, goal_plan_type IS NULL, status='approved')
        → session_mode → 'combos' ? "Combos" : 'tecnica' ? "Técnica" : activityName
```

Precedente exacto de esta derivación en el backend: `tv/class-day.ts:131-141`, que ya resuelve el modo del día para la TV (aunque hoy lo lee de `day_modes`, no de la sesión — **ese archivo también hay que actualizarlo** o la TV va a decir "regular" en días de combos).

Puntos finos:

- La derivación debe aplicarse **solo si la actividad del slot es la genérica** (General/Calistenia). Un slot de "ROM" o de una actividad especial (`activities.isSpecial`, ya leído en la query) no debe renombrarse.
- Es **una query extra por semana** (no por slot) si se batchea: un `SELECT DISTINCT day, session_mode FROM sessions WHERE week IN (…) AND goal_plan_type IS NULL AND status='approved'`. **No hacer N+1** — el archivo tiene un comentario explícito de que la capacidad se resuelve con "one query per week".
- `getWeeklySchedule` sirve tanto al admin como al app del miembro → el cambio de backend cubre las dos superficies de una (SEM-14, fase 160, queda casi vacío).

### Hallazgo 10 — Numeración de migraciones: **0202** está libre en todas las ramas

| Rama                                                                                                             | Migración más alta                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `origin/master`                                                                                                  | `0201_aura_planes_accesos.sql` (198 archivos; **`0200` NO existe en master**) |
| `origin/staging`                                                                                                 | `0200_anclas_tenant_branch.sql`                                               |
| `feat/173-adopcion-members`, `feat/tv-login-staging`, `tmp-tv-staging`                                           | `0200_anclas_tenant_branch.sql`                                               |
| `feat/aura-planes-accesos`, `feat/registro-dia-profes`, `feat/renovar-prorrateo-fin-de-mes`, `feat/tv-to-master` | `0201_aura_planes_accesos.sql`                                                |
| **Ninguna rama del repo**                                                                                        | **0202+**                                                                     |

`[VERIFIED: git ls-tree sobre todas las refs, 2026-08-13]`

**Las migraciones de la fase 159 nacen en `0202`.** El hueco de `0200` en master lo va a llenar el tren v6.0 cuando llegue — por eso 0202 (y no 0200) es el número correcto aun estando master en 0201 con un hueco. El skill lo dice explícitamente: _"numbered = highest existing + 1 (check BOTH branches if master/staging diverge)"_. `[CITED: .claude/skills/el-templo-db-migrations/SKILL.md §Pre-flight checklist]`

⚠️ **El checkout principal está desactualizado.** La rama actual (`docs/planning-untracked-2026-08`) tiene el árbol de migraciones hasta `0196` — le faltan 0197-0201. Cualquier `ls el-templo-api/src/db/migrations | tail` corrido en el checkout tal como está **da la respuesta equivocada**. Branchear desde `origin/master` (regla del skill `el-templo-change-control` §12) y re-verificar ahí.

---

## Architecture Patterns

### System Architecture Diagram

```
POST /admin/generate  { week, days[], dayModes{day→mode}?, levelGroups[], regenerate }
        │
        │ (Fastify JSON Schema: enum ["regular","rom","combos","tecnica"])
        ▼
AdminService.generateWeek()
        │
        ├─ carga day_modes  ──►  default por día (solo ROM del sábado sobrevive como default)
        │
        └─ para cada día:  mode = request.dayModes[day] ?? day_modes[day] ?? "regular"
                 │
     ┌───────────┼─────────────────┬────────────────────────┬─────────────────────┐
     ▼           ▼                 ▼                        ▼                     │
  "regular"    "rom"            "combos"                "tecnica"                 │
     │           │                 │                        │                     │
     │           │                 │                        │                     │
 6 niveles   2 niveles         6 niveles                6 niveles                 │
 (α δ κ σ ω σp) (α δ)          (α δ κ σ ω σp)          (α δ κ σ ω σp)             │
     │           │                 │                        │                     │
     ▼           ▼                 ▼                        ▼                     │
 generate    generateRom      generateCombos           generateTecnica            │
 DailySession  Session          Session                  Session                  │
     │           │                 │                        │                     │
     │           │      ┌──────────┴──────────┐   ┌─────────┴─────────┐          │
     │           │      │ INITIUM (pipeline)  │   │ INITIUM (pipeline)│          │
     │           │      │ COMBOS_I  ← tren    │   │ TECNICA_I  ┐      │          │
     │           │      │   superior (hash)   │   │            ├ MISMA│          │
     │           │      │ COMBOS_II ← tren    │   │ TECNICA_II ┘ RUTA │          │
     │           │      │   inferior (hash)   │   │   (hash, 1 vez)   │          │
     │           │      │ STRETCHING (4 mov., │   │ STRETCHING        │          │
     │           │      │  determinístico)    │   │                   │          │
     │           │      └──────────┬──────────┘   └─────────┬─────────┘          │
     │           │                 │                        │                     │
     └───────────┴─────────────────┴────────────────────────┴─────────────────────┘
                                   │
                                   ▼
                  SessionGeneratorService.saveSession()   [transacción]
                       sessions(session_mode) → session_blocks(role) → session_prescriptions
                                   │
                    ┌──────────────┴───────────────┬─────────────────────┐
                    ▼                              ▼                     ▼
        SchedulingService                    tv/class-day.ts       sessions/routes.ts
        .getWeeklySchedule()                 resolveClassDay()     /daily, /weekly
        (1 query/semana: modo del día)       (leer modo de la      (sessionToResponse
        combos→"Combos"                       SESIÓN, no de         ya devuelve
        tecnica→"Técnica"                     day_modes)            sessionMode)
        else →activityName ("General")
                    │
                    ▼
        admin Horarios + app del miembro   ← fase 160 solo renderiza
```

### Recommended Project Structure

```
el-templo-api/src/modules/sessions/
├── rom-generator.ts             # existente — molde estructural, NO tocar
├── combos-generator.ts          # NUEVO — INITIUM + COMBOS_I/II + STRETCHING
├── tecnica-generator.ts         # NUEVO — INITIUM + TECNICA_I/II (misma ruta) + STRETCHING
├── pipeline/
│   ├── goal-plan-pipeline.ts    # existente — molde de "Stage 1 reemplazado"
│   ├── semana-nueva-pipeline.ts # NUEVO (o extender goal-plan-pipeline): runBlockPipeline
│   │                            #   con resolución de ruta inyectada + formato forzado
│   └── utils/
│       ├── mobility-selection.ts   # existente — 1 ejercicio, Math.random
│       └── stretching-selection.ts # NUEVO — 4 ejercicios, DETERMINÍSTICO
└── types.ts                     # BlockRole += 5 roles; DaySession.sessionMode += 2 modos

el-templo-api/src/db/schema/
└── session-week-regime.ts       # NUEVO — ancla SEM-05 (+ export en index.ts)

el-templo-api/src/db/migrations/
├── 0202_session_week_regime.sql        # tabla del ancla
├── 0203_backfill_regime_w12_w26.sql    # retro-etiquetado (@data-only, idempotente)
└── 0204_rename_calistenia_general.sql  # @data-only (si se elige opción A)

el-templo-api/test/unit/
├── combos-generator.test.ts     # NUEVO — molde: rom-generator.test.ts
└── tecnica-generator.test.ts    # NUEVO
el-templo-api/test/sessions/
└── generate-modes.test.ts       # NUEVO — integración real vs MySQL: POST /admin/generate
```

### Pattern 1: Generador alternativo autocontenido (molde ROM)

**Qué:** una función `generateXSession(db, week, day, memberLevel): Promise<DaySession>` que bypasea el pipeline y devuelve la sesión completa con `sessionMode` seteado.
**Cuándo:** para bloques sin ruta de fuerza / sin budget (STRETCHING) y para el armado del `DaySession`.

```ts
// Source: el-templo-api/src/modules/sessions/rom-generator.ts (origin/master)
export async function generateRomSession(
  db: MySql2Database<typeof schema>, week: number, day: string,
  memberLevel: "alfa" | "delta",
): Promise<DaySession> {
  const dayId = `W${week}-${day}-${memberLevel}`;
  const sessionTrace: TraceEvent[] = [];

  // INITIUM sale del pipeline compartido (idéntico para todos los niveles)
  const initiumCtx = createInitialContext(week, day, "alfa_delta", memberLevel, "INITIUM");
  const initiumBlock = await runInitiumPipeline(initiumCtx, db);
  blocks.push(initiumBlock);
  …
  return { dayId, week, day, levelGroup, memberLevel, blocks,
           trace: sessionTrace, goalPlanType: null, sessionMode: "rom" };
}
```

Notar: `dayId` = `W{week}-{day}-{memberLevel}` — **el mismo esquema que los días regulares**. Combos/técnica deben usar el mismo (no un prefijo tipo `GP-`), porque `/sessions/daily` y `/weekly` construyen candidatos con `buildDayIdCandidates` y la TV busca por `week+day`. `[VERIFIED: sessions/routes.ts]`

### Pattern 2: Stage 1 reemplazado, stages 2-7 reusados (molde goal-plans)

**Qué:** correr el pipeline de bloque completo pero resolviendo la ruta desde una lista curada en vez del `weekly_rotator`.
**Cuándo:** para COMBOS_I/II y TECNICA_I/II — hereda budget, contracción, dificultad por nivel y selección de ejercicios de los 6 niveles.

```ts
// Source: el-templo-api/src/modules/sessions/pipeline/goal-plan-pipeline.ts (origin/master)
import { resolveSpom } from "./stage-2-spom";
import { deriveBudget } from "./stage-3-budget";
import { deriveContraction } from "./stage-4-contraction";
import { selectFormat } from "./stage-5-format";
import { selectExercises } from "./stage-6-exercises";
import { generatePrescriptions } from "./stage-7-prescription";

function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash + input.charCodeAt(i) * (i + 1)) | 0;
  return Math.abs(hash);
}

function resolveGoalPlanRoute(ctx, goalPlanType): BlockContextWithRoute {
  const allowedRoutes = GOAL_PLAN_ROUTE_MAP[goalPlanType];
  const routeIndex = simpleHash(`${ctx.week}-${ctx.day}-${ctx.role}`) % allowedRoutes.length;
  …
}
```

Para técnica (D-08), el `hashInput` debe **excluir el rol** (`${week}-${day}` solo) para que TECNICA_I y TECNICA_II caigan en la misma ruta.

### Pattern 3: Formato forzado por bloque

`BlockPipelineOptions` ya soporta `{ forcedFormat: { formatId, name }, excludeFormatNames }` y se usa hoy para la consistencia DEUTEROS_1↔DEUTEROS_2 y para `sharedFormats` cross-nivel. `[VERIFIED: sessions/service.ts:190-200]` Los generadores nuevos deben pasar `forcedFormat` con el `formats.id` real de `'Combos'` / del formato de calidad elegido, resuelto con una query única al arrancar la generación del día (igual que `sessions/routes.ts` precarga `formatDescriptions`).

### Anti-Patterns to Avoid

- **Agregar columnas al `weekly_rotator` para los roles nuevos.** El rotator es una tabla curada semana a semana por el coach para los días regulares; agregar `combos1_route_id` obligaría a poblarla para días que el profe elige el mismo día. Resolución determinística por hash, no tabla.
- **Convertir `days: string[]` en `days: {day,mode}[]` en el body de `/generate`.** Breaking change innecesario; usar una propiedad `dayModes` adicional y opcional.
- **Escribir en `day_modes` el modo combos/técnica elegido en el request.** `day_modes` tiene UNIQUE `(tenant_id, day_of_week)` y **seis filas totales** — es configuración semanal fija, no historial. Escribirla desde `/generate` haría que `/sessions/daily`, `/sessions/weekly` y la TV reinterpreten **semanas pasadas y futuras** con el modo de la última generación. D-02 lo prohíbe explícitamente.
- **Usar `Math.random()` en el bloque STRETCHING.** Ver Pitfall 1.
- **`formatId: 0` para los bloques nuevos.** ROM lo hace porque "ROM" no es una fila de `formats`; 'Combos' y 'Stretching' sí lo son.
- **Meter el retro-etiquetado en un seed.** Regla dura del skill de migraciones: prod data va por migración.

---

## Don't Hand-Roll

| Problema                                     | No construyas                                 | Usá                                                                                                                   | Por qué                                                                                                                            |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clasificar rutas en superior/inferior        | Un mapa nuevo `ROUTE_BODY_ZONE`               | `GOAL_PLAN_ROUTE_MAP.tren_superior` / `.tren_inferior` (`goal-plans/constants.ts`)                                    | Ya curado, ya en producción, ya documentado con el origen de cada agrupación                                                       |
| Selección determinística de ruta             | RNG con seed, shuffle propio                  | `simpleHash()` de `goal-plan-pipeline.ts`                                                                             | Reproducible en tests sin mockear `Math.random`; ya probado en goal plans                                                          |
| Formato "Combos"                             | Un `FormatParams` nuevo, un prescriptor nuevo | `prescribeCombos` + `{type:"combos",rounds}` (mig 0172, ya cableado en 8 capas)                                       | SEM-02 lo pide explícitamente: "la forma actual del profe"                                                                         |
| Prescribir el bloque de estiramiento         | Reps/segundos a mano                          | Formato `'Stretching'` (`{type:"stretching"}`, sin params)                                                            | Ya existe fila en `formats`, ya tiene caso en el PDF y en `timer-spec` del TV                                                      |
| Pool de movilidad                            | Query nueva sobre `exercises`                 | `pattern='MOVILIDAD'` + filtro por `mobilityRelated` (patrón de `rom-generator.ts:130-140` y `mobility-selection.ts`) | ~126 ejercicios ya etiquetados; el filtro por zona ya está resuelto en `ROM_ZONE_MOBILITY_MAP`                                     |
| Selección de ejercicios por nivel/dificultad | Filtro propio por `dificultad_lineal`         | Stages 2-7 del pipeline vía el molde de `goal-plan-pipeline.ts`                                                       | Los 6 niveles, el budget y la mezcla de contracciones son ~600 líneas ya escritas y calibradas                                     |
| INITIUM de los días nuevos                   | Selección propia                              | `runInitiumPipeline` (determinístico — **sin `Math.random`**, verificado)                                             | Idéntico para todos los niveles, que es lo que el PDF asume                                                                        |
| Semana → fecha                               | Tabla de fechas, cálculo nuevo                | `dateToWeekNumber` / `dateToDayName` de `shared/week-dates.ts`                                                        | `WEEK_ONE_MONDAY` es el ancla única; una segunda copia se desincroniza (el docblock del archivo explica exactamente ese incidente) |
| Persistir el ancla                           | JSON en `sessions.trace_json`                 | Tabla nueva `session_week_regime`                                                                                     | D-18/SEM-05: "sin tocar filas históricas"                                                                                          |

**Key insight:** casi todo lo que esta fase parece pedir "nuevo" ya está en el repo, escrito para otro caso de uso. El trabajo real es de **composición y ruteo**, no de algoritmos.

---

## Runtime State Inventory

Aplica porque la fase incluye un rename con efectos en datos vivos ("Calistenia"→"General") y roles/modos nuevos que otros sistemas ya leen.

| Categoría                                     | Items encontrados                                                                                                                                                                                                                                                                                                                                | Acción requerida                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Datos almacenados**                         | (1) Fila `activities` con `name='Calistenia'` — referenciada por `schedules.activity_id` en todas las sedes, y por bookings/attendance/ratings/analytics históricos vía join. (2) `sessions` histórico: 1634 sesiones W1–W26 con `session_mode='regular'` en días que en realidad fueron combos/técnica. (3) `day_modes`: 6 filas, sábado='rom'. | (1) **Data migration** `@data-only` (UPDATE por nombre) **+ code edit** simultáneo de los 2 get-or-create. (2) **Ninguna** — D-01/D-18 exigen histórico intacto; el régimen va a la tabla nueva. (3) **Ninguna** — D-02 la deja como default de ROM. |
| **Config de servicio vivo**                   | Ninguna. Esta fase no toca n8n, Datadog, Cloudflare ni Tailscale. Verificado: no hay integraciones externas en `modules/sessions`, `modules/scheduling` ni `modules/admin` que embeban el literal "Calistenia" o los nombres de rol.                                                                                                             | Ninguna.                                                                                                                                                                                                                                             |
| **Estado registrado en el SO**                | Ninguno. No hay cron/pm2/systemd que dependa de `session_mode` o de los roles de bloque. El único job cercano es la auto-aprobación de sesiones (`admin/service.ts`, filtra por `status='pending_review'` + week + day, **agnóstico del modo**) → sigue funcionando sin cambios para combos/técnica. `[VERIFIED: admin/service.ts:600-628]`      | Ninguna.                                                                                                                                                                                                                                             |
| **Secretos / env vars**                       | Ninguno. `PERSIST_TRACES` es la única env var del módulo sessions y no cambia de nombre.                                                                                                                                                                                                                                                         | Ninguna.                                                                                                                                                                                                                                             |
| **Artefactos de build / paquetes instalados** | Ninguno. Sin dependencias nuevas, sin cambios en `package.json`.                                                                                                                                                                                                                                                                                 | Ninguna.                                                                                                                                                                                                                                             |

**La pregunta canónica —** _después de que todo archivo del repo esté actualizado, ¿qué sistema en runtime sigue con el string viejo?_ — tiene **una** respuesta en esta fase: **la fila `activities.name='Calistenia'` en la DB de producción**, y el código que la busca por ese literal exacto en `scheduling/service.ts:796` y `db/seed-production.ts:103,115,123`. Si la migración renombra y el código no se actualiza (o viceversa), la próxima sede creada duplica la actividad. **Los dos cambios van en el mismo commit.**

---

## Common Pitfalls

### Pitfall 1: STRETCHING de "nivel único" que sale distinto en cada nivel

**Qué sale mal:** el bloque STRETCHING se genera 6 veces (una sesión por nivel) y, si la selección de movilidad copia el patrón existente, cada nivel obtiene 4 ejercicios distintos.
**Por qué pasa:** las dos fuentes de selección de movilidad del repo usan `Math.random()`:

- `rom-generator.ts` → `shuffleArray()` (Fisher-Yates con `Math.random`)
- `pipeline/utils/mobility-selection.ts:66` → `pool[Math.floor(Math.random() * pool.length)]`

ROM no sufre esto de forma visible porque genera solo 2 niveles y el PDF de ROM los imprime aparte. Con 6 niveles y un bloque declarado "nivel único" (D-11), el resultado sería incoherente en el PDF, en la TV y en la app.
**Cómo evitarlo:** la selección de STRETCHING debe ser función pura de `(week, day)` — `simpleHash(\`${week}-${day}-STRETCHING-${i}\`)`para elegir el i-ésimo ejercicio del pool ordenado por`id`. Sin `Math.random`.
**Señales tempranas:** un test que genere los 6 niveles del mismo día y compare los `exerciseId` del bloque STRETCHING — deben ser idénticos. **Ese test debería existir sí o sí (SEM-06).**

### Pitfall 2: el `default:` de `resolveRotator` explota con los roles nuevos

**Qué sale mal:** `Error: Unknown block role: COMBOS_I` en tiempo de generación.
**Por qué pasa:** `stage-1-rotator.ts:57` tiene `default: throw`. Cualquier intento de pasar los roles nuevos por `runBlockPipeline` sin reemplazar Stage 1 falla.
**Cómo evitarlo:** los generadores nuevos NO llaman a `runBlockPipeline`; llaman a una variante con resolución de ruta inyectada (Pattern 2).
**Señales tempranas:** el error es ruidoso y sale en el primer test. No es un riesgo silencioso — pero sí es el que decide la arquitectura, así que hay que resolverlo en el plan, no en la ejecución.

### Pitfall 3: `validateSession` rechaza las sesiones nuevas

**Qué sale mal:** warnings o errores espurios en `trace_json` y posiblemente sesiones marcadas como inválidas.
**Por qué pasa:** `session-validator.ts:57` detecta ROM (`sessionMode === "rom" || role.startsWith("ROM_")`) y exige exactamente 4 bloques; el resto cae en la rama regular (`MIN_BLOCKS..MAX_BLOCKS`). Además `INTENSITY_RANGES` y `FORMAT_COMPATIBILITY` son `Record<BlockRole,…>` — el typecheck los va a atrapar, pero **el conteo de bloques no**.
**Cómo evitarlo:** generalizar la detección a "sesión de estructura fija de 4 bloques" (rom | combos | tecnica) en vez de agregar un tercer `if`.
**Señales tempranas:** revisar `session.trace` del test de integración buscando severidad `ERROR`/`WARNING` — no alcanza con que la sesión se guarde.

### Pitfall 4: el rename de la actividad duplica la fila en la próxima sede

Ver § Runtime State Inventory. **Migración + los dos get-or-create en el mismo commit.**

### Pitfall 5: N+1 en la etiqueta derivada del horario

**Qué sale mal:** `getWeeklySchedule` pasa de 4-5 queries a ~40 (una por slot).
**Por qué pasa:** la tentación de resolver el modo del día dentro del loop `for (const date of weekDates)`.
**Cómo evitarlo:** una sola query por semana (`SELECT DISTINCT day, session_mode FROM sessions WHERE week=? AND goal_plan_type IS NULL AND status='approved'`) cargada antes del loop, tal como el archivo ya hace con `bookingCountMap`, `holidayDates` y `resolveEffectiveCapacity`.
**Señales tempranas:** el archivo tiene comentarios explícitos de "one query per week" y "single query instead of N+1" — hay convención establecida.

### Pitfall 6: la TV sigue leyendo `day_modes` en vez de la sesión

`tv/class-day.ts:138-141` resuelve el modo desde `day_modes`. Con combos/técnica elegidos por request, la TV va a decir "regular" en días de combos. SEM-15 es fase 160, pero **el backend que la TV consume es de la 159** — el plan debería incluir la corrección de `resolveClassDay` para leer `sessions.session_mode` (con `day_modes` como fallback) o declarar explícitamente que se difiere.

### Pitfall 7: los tres gates de tenancy de master

Master tiene las fases 166-171 de tenancy. Un cambio en esta fase dispara:

| Gate                       | Archivo                                                              | Cuándo se pone rojo                                                                                           |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| ISO-01 manifiesto de rutas | `test/tenancy/iso-01-manifiesto.test.ts` (`ENTRADAS_BASELINE = 370`) | Si se registra **una ruta HTTP nueva** sin entrada en `test/tenant-manifest.ts` **y** sin bumpear el baseline |
| Clasificación de tablas    | `test/db/tenant-tables.test.ts` + `src/db/tenant-tables.ts`          | Si la tabla del ancla no se agrega a `GYM_OWNED_TABLES`                                                       |
| CON-06 lint de tenancy     | `test/tenancy/con-06-lint.test.ts` + `pnpm lint:tenant`              | Si un acceso nuevo a tabla gym-owned no usa el patrón vigente en master                                       |

`[VERIFIED: ENTRADAS_BASELINE=370 en origin/master]`

**Si el plan no agrega rutas HTTP nuevas** (recomendado: extender el body de `/generate` en vez de crear un endpoint), ISO-01 no se toca. Si se agrega un endpoint de lectura del ancla, hay que tocar manifiesto **y** baseline (370→371).

### Pitfall 8: no asumir consistencia `format_name` ↔ `format_params` en el histórico

Documentado en el discovery con caso concreto (`W20-viernes-sigma`). El detector de firmas de SEM-05 **debe** decidir por una sola señal y no cruzar las dos ciegamente. `[CITED: DISCOVERY-SEMANA-NUEVA-2026-07-07.md]`

---

## Code Examples

### Ruteo por modo en `generateWeek` (forma recomendada)

```ts
// Source: patrón derivado de el-templo-api/src/modules/admin/service.ts (origin/master)
const requestModes = options.dayModes ?? {}; // { miercoles: "tecnica", jueves: "combos" }
const dayModeRows = await this.db.select().from(schema.dayModes);
const dayModeMap = new Map(
  dayModeRows.map((r) => [r.dayOfWeek, r.sessionMode]),
);

for (const day of days) {
  const dayNumber = DAY_NAME_TO_NUMBER[day];
  const dayMode =
    requestModes[day] ??
    (dayNumber ? (dayModeMap.get(dayNumber) ?? "regular") : "regular");

  if (dayMode === "rom") {
    /* … existente, sin tocar … */ continue;
  }

  if (dayMode === "combos" || dayMode === "tecnica") {
    // 6 niveles en 3 level groups, igual que el día regular
    for (const levelGroup of levelGroups) {
      const memberLevels: ExerciseLevel[] =
        levelGroup === "alfa_delta"
          ? ["alfa", "delta", "kairos"]
          : levelGroup === "sigma"
            ? ["sigma"]
            : ["omega", "spartan"];
      for (const memberLevel of memberLevels) {
        const dayId = `W${week}-${day}-${memberLevel}`;
        // … skip/regenerate igual que las otras ramas …
        const session =
          dayMode === "combos"
            ? await generateCombosSession(
                this.db,
                week,
                day,
                levelGroup,
                memberLevel,
              )
            : await generateTecnicaSession(
                this.db,
                week,
                day,
                levelGroup,
                memberLevel,
              );
        await sessionService.saveSession(session);
      }
    }
    continue;
  }
  // … rama regular intacta …
}
```

### Esqueleto del combos-generator

```ts
// Source: estructura de el-templo-api/src/modules/sessions/rom-generator.ts
//         + resolución de ruta de pipeline/goal-plan-pipeline.ts
import { GOAL_PLAN_ROUTE_MAP } from "../goal-plans/constants";

const COMBOS_ROUTE_POOLS = {
  COMBOS_I: GOAL_PLAN_ROUTE_MAP.tren_superior, // D-05
  COMBOS_II: GOAL_PLAN_ROUTE_MAP.tren_inferior,
} as const;

export async function generateCombosSession(
  db,
  week: number,
  day: string,
  levelGroup: LevelGroup,
  memberLevel: ExerciseLevel,
): Promise<DaySession> {
  const dayId = `W${week}-${day}-${memberLevel}`; // MISMO esquema que regular
  const blocks: BlockPlan[] = [];

  // 1. INITIUM — pipeline compartido, determinístico, idéntico en los 6 niveles
  blocks.push(
    await runInitiumPipeline(
      createInitialContext(week, day, levelGroup, memberLevel, "INITIUM"),
      db,
    ),
  );

  // 2. COMBOS_I / COMBOS_II — pipeline con Stage 1 reemplazado, formato 'Combos' forzado
  const combosFormat = await resolveFormatByName(db, "Combos"); // id REAL, no 0
  for (const role of ["COMBOS_I", "COMBOS_II"] as const) {
    const pool = COMBOS_ROUTE_POOLS[role];
    const route = pool[simpleHash(`${week}-${day}-${role}`) % pool.length];
    blocks.push(
      await runSemanaNuevaBlockPipeline(
        createInitialContext(week, day, levelGroup, memberLevel, role),
        { route, forcedFormat: combosFormat },
        spomService,
        db,
      ),
    );
  }

  // 3. STRETCHING — determinístico, sin pipeline, 4 ejercicios de movilidad (D-13)
  blocks.push(await buildStretchingBlock(db, week, day, memberLevel));

  return {
    dayId,
    week,
    day,
    levelGroup,
    memberLevel,
    blocks,
    trace: sessionTrace,
    goalPlanType: null,
    sessionMode: "combos",
  };
}
```

### Etiqueta derivada en el horario (una query por semana)

```ts
// Source: patrón de el-templo-api/src/modules/scheduling/service.ts (getWeeklySchedule)
// ANTES del loop de slots — una sola query, igual que bookingCountMap / holidayDates
const regimeRows = await this.db
  .selectDistinct({ day: schema.sessions.day, mode: schema.sessions.sessionMode })
  .from(schema.sessions)
  .where(and(
    eq(schema.sessions.week, week),
    eq(schema.sessions.status, "approved"),
    isNull(schema.sessions.goalPlanType),   // la plani de la sede, no goal plans (D-14 de la 164)
  ));
const modeByDay = new Map(regimeRows.map((r) => [r.day, r.mode]));

const DERIVED_LABEL: Record<string, string> = { combos: "Combos", tecnica: "Técnica" };

// DENTRO del loop, solo para la actividad genérica (no ROM, no isSpecial)
const derived = isGenericActivity ? DERIVED_LABEL[modeByDay.get(dayName) ?? ""] : undefined;
slots.push({ …, activityName: derived ?? row.activityName });
```

---

## State of the Art

| Enfoque viejo                                                          | Enfoque actual                                            | Cuándo cambió                                    | Impacto                                                                                                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| "mié = combos, jue = técnica" fijo (doc de producto, abril 2026)       | El régimen **alterna** por decisión del coach             | Verificado W21–W26 por SSH read-only, 2026-08-13 | Modelo = selección por día en `/generate`, no mapeo por día de semana. **Este research NO debe recomendar day_modes fijo.** |
| "Régimen fijo desde W19" (conclusión del discovery 2026-07-07)         | Desmentida: W24-W26 tienen mié=técnica/jue=combos         | 2026-08-13                                       | El retro-etiquetado de SEM-05 se extiende a W26, no termina en W20                                                          |
| Combos hackeado con formato **Complex** sobre `session_mode='regular'` | Formato **"Combos"** propio (fila real en `formats`)      | Migración 0172 (v5.6 primera tanda)              | El generador nuevo usa el formato real; el histórico sigue diciendo Complex → es la firma de detección de SEM-05            |
| Bloque final = **EPIKOS** con Flow Guiado / Circuito cooperativo       | Rol **STRETCHING** propio + formato "Stretching"          | Esta fase (formato ya existe desde 0172)         | EPIKOS queda intacto en el histórico; no se renombra nada                                                                   |
| Roles de bloque asumidos como enum                                     | `session_blocks.role` = `varchar(20)` libre desde siempre | —                                                | Roles nuevos = cero migración                                                                                               |

**Deprecado / superado:**

- **SEM-02 en su redacción original** ("parámetro único de reps del combo"): superado por D-06 — el usuario mantiene rounds + reps por ejercicio.
- **La rama `feat/dias-combos-tecnica`**: su migración más alta es `0164`, 37 números atrás de master. Solo sirve como referencia de intención; NO rebasear (decisión del usuario).
- **`DIATASIS`** como nombre candidato del bloque de estiramiento (propuesto en el discovery): reemplazado por **STRETCHING** en la spec cerrada.

---

## Project Constraints (from CLAUDE.md)

Directivas accionables que el planner debe respetar. Tienen la misma autoridad que las decisiones bloqueadas del CONTEXT.

| #   | Directiva                                                                                                                                                                                            | Impacto en esta fase                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | **API: usar el logger Pino de Fastify** (`request.log`, `app.log`). Nunca `console.log`.                                                                                                             | Los generadores nuevos usan `createSessionLogger(week, dayId, levelGroup)` como `service.ts` y `goal-plans/service.ts`.     |
| 2   | **Sin `any`.** `unknown` + narrowing, o interfaces propias. `catch (err: unknown)` con `instanceof Error`.                                                                                           | El manejo de errores por `dayId` en `generateWeek` ya usa ese patrón — replicarlo.                                          |
| 3   | **Toda ruta API nueva lleva test de integración en `el-templo-api/test/`**, contra MySQL real (`eltemplo_test`), usando `test/helpers.ts`.                                                           | SEM-06 + el cambio de body de `/generate`.                                                                                  |
| 4   | **Cambios de schema por Drizzle** (`src/db/schema/`); generar SQL con `pnpm db:generate`; aplicar con `pnpm db:migrate`. **NUNCA `drizzle-kit migrate`.** `db:push` prohibido en trabajo commiteado. | Tabla del ancla (SEM-05).                                                                                                   |
| 5   | **Nueva env var ⇒ actualizar el `.env.example` correspondiente.**                                                                                                                                    | No aplica (esta fase no agrega env vars).                                                                                   |
| 6   | **Husky + lint-staged corren en el commit** (Prettier). Si falla, arreglar y hacer un commit nuevo — **no `--amend`**.                                                                               | Operativo del ejecutor.                                                                                                     |
| 7   | **Facade pattern** para servicios complejos (`edit-service.ts` → servicios de dominio).                                                                                                              | `combos-generator` / `tecnica-generator` como módulos hermanos, no métodos gigantes en `SessionGeneratorService`.           |
| 8   | **DRY agresivo; "engineered enough"; explícito antes que ingenioso; más edge cases, no menos.**                                                                                                      | Los dos generadores comparten ~80% → extraer el tronco común (estructura de 4 bloques + STRETCHING) en vez de copiar-pegar. |

Del skill `el-templo-db-migrations` (autoridad equivalente):

| #   | Regla dura                                                                                                                                       | Impacto                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| M1  | Nunca `drizzle-kit migrate` — `_migrations` es la única fuente de verdad                                                                         | —                                                                                     |
| M2  | **Nunca un `;` dentro de un comentario `--`** — el runner splitea por `;` antes de stripear comentarios (rompió todo CI una vez, migración 0119) | Los headers de las migraciones nuevas tienen prosa larga → riesgo real                |
| M3  | El `.sql` va en el **mismo commit** que el cambio de schema                                                                                      | —                                                                                     |
| M4  | Datos de test/mock jamás en migración; datos de prod **siempre** por migración                                                                   | El retro-etiquetado W12–W26 y el rename de `activities` son datos de prod → migración |
| M5  | `db:push` solo prototipado                                                                                                                       | —                                                                                     |
| M6  | `mysqlEnum("primer_arg", …)`: el primer argumento **es** el nombre físico de la columna                                                          | Aplica si el ancla usa algún enum                                                     |
| M7  | Numeración = el más alto existente + 1, **chequeando master Y staging**                                                                          | **0202** (verificado)                                                                 |
| M8  | Sentencias de datos idempotentes (`WHERE NOT EXISTS`)                                                                                            | Rename y backfill                                                                     |

Del skill `el-templo-change-control`:

- **Branchear desde `origin/master`**, no desde HEAD del checkout compartido (el checkout está en 0196, cinco migraciones atrás).
- **`git add` siempre por ruta explícita** — nunca `git add -A` / `git add .`.
- **Preguntar antes de pushear** y antes de SSH a producción.
- **Los tests corren en CI, no localmente**; el typecheck local sí.

---

## Package Legitimacy Audit

**No aplica.** Esta fase no instala ni actualiza ninguna dependencia externa: todo lo que necesita (Drizzle, Fastify, Vitest, los helpers de test) ya está en `el-templo-api/package.json`. `[VERIFIED: no hay recomendación de paquete nuevo en este research]`

Si en plan-phase apareciera una dependencia nueva, aplica la regla de CLAUDE.md/memoria: **nunca instalar ni actualizar dependencias sin preguntar** (precedente de cadena de suministro de axios) → checkpoint humano obligatorio.

---

## Environment Availability

| Dependencia                            | Requerida por                                    | Disponible                                                     | Versión | Fallback                                                                         |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| MySQL local (`eltemplo_test_<worker>`) | tests de integración de SEM-06                   | `[ASSUMED]` sí (CI la provisiona; local depende de la máquina) | —       | Los tests corren en CI (regla del proyecto: no correr el suite localmente)       |
| Node + pnpm                            | build/typecheck                                  | ✓                                                              | —       | —                                                                                |
| SSH a producción                       | validar las firmas de SEM-05 contra datos reales | ✗ (requiere pedir permiso a Franco)                            | —       | Usar la tabla W21–W26 ya relevada en `159-CONTEXT.md` + las firmas del discovery |
| `gh` CLI                               | ver el estado de CI                              | ✗ (no instalado localmente, per memoria)                       | —       | Fix-forward / que Franco confirme el verde                                       |

**Dependencias faltantes sin fallback:** ninguna.
**Dependencias faltantes con fallback:** SSH a prod (el relevamiento ya está hecho en CONTEXT); `gh` (Franco confirma CI).

---

## Validation Architecture

`workflow.nyquist_validation` no está definido en `.planning/config.json` → se trata como habilitado.

### Test Framework

| Propiedad      | Valor                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Framework      | Vitest 4 (`pool: "forks"`, `fileParallelism: true`, `maxWorkers` = `MAX_TEST_WORKERS` \|\| 4)                   |
| Config         | `el-templo-api/vitest.config.ts`                                                                                |
| DB por worker  | `eltemplo_test_<VITEST_POOL_ID>`, provisionada en `test/setup.ts`; limpieza cross-run en `test/setup-global.ts` |
| Comando rápido | `cd el-templo-api && pnpm vitest run test/unit/combos-generator.test.ts`                                        |
| Suite completa | `cd el-templo-api && pnpm test`                                                                                 |
| Timeouts       | `testTimeout: 30000`, `hookTimeout: 120000`                                                                     |

### Phase Requirements → Test Map

| Req              | Comportamiento                                                                                                | Tipo               | Comando automatizado                                                              | ¿Existe?  |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------- | --------- |
| SEM-01           | `session_mode='combos'`/`'tecnica'` persiste y se lee                                                         | integración        | `pnpm vitest run test/sessions/generate-modes.test.ts`                            | ❌ Wave 0 |
| SEM-03           | combos-generator: 4 bloques en orden INITIUM→COMBOS_I→COMBOS_II→STRETCHING, I=ruta superior, II=ruta inferior | unit (DB mockeada) | `pnpm vitest run test/unit/combos-generator.test.ts`                              | ❌ Wave 0 |
| SEM-04           | tecnica-generator: 4 bloques, **TECNICA_I y TECNICA_II con la MISMA `route`**                                 | unit               | `pnpm vitest run test/unit/tecnica-generator.test.ts`                             | ❌ Wave 0 |
| SEM-03/04 (D-10) | los 6 niveles se generan en los 3 level groups                                                                | integración        | `pnpm vitest run test/sessions/generate-modes.test.ts -t "6 niveles"`             | ❌ Wave 0 |
| SEM-03/04 (D-11) | **STRETCHING idéntico en los 6 niveles del mismo día** (anti-Pitfall 1)                                       | unit               | `pnpm vitest run test/unit/combos-generator.test.ts -t "stretching determinista"` | ❌ Wave 0 |
| SEM-06           | `validateSession` sin ERROR para sesiones combos/técnica                                                      | unit               | incluido en los dos anteriores (assert sobre `session.trace`)                     | ❌ Wave 0 |
| SEM-12           | roles nuevos persisten en `session_blocks.role` sin truncar                                                   | integración        | `test/sessions/generate-modes.test.ts`                                            | ❌ Wave 0 |
| SEM-13 (a)       | `POST /admin/generate` con `dayModes` enruta al generador correcto; valor inválido → 400                      | integración        | `pnpm vitest run test/sessions/generate-modes.test.ts`                            | ❌ Wave 0 |
| SEM-13 (b)       | `getWeeklySchedule` devuelve "Combos"/"Técnica"/"General" según la sesión aprobada del día                    | integración        | `pnpm vitest run test/scheduling/derived-class-label.test.ts`                     | ❌ Wave 0 |
| SEM-13 (c)       | rename no duplica la actividad al sembrar una sede nueva                                                      | integración        | test sobre `seedDefaultSchedules` en `test/scheduling/`                           | ❌ Wave 0 |
| SEM-05           | el ancla tiene una fila por (week, day) etiquetado W12–W26 y **`sessions` no cambió**                         | migración          | `pnpm vitest run test/migrations/` + assert de conteo de `sessions` antes/después | ❌ Wave 0 |
| Regresión        | `regular` y `rom` generan byte-idéntico a antes                                                               | integración        | suite existente `test/sessions/` + `test/unit/rom-generator.test.ts`              | ✅ existe |
| Regresión        | gates de tenancy                                                                                              | integración        | `pnpm vitest run test/tenancy test/db` + `pnpm lint:tenant`                       | ✅ existe |

### Sampling Rate

- **Por commit de tarea:** `pnpm vitest run test/unit/` (rápido, sin DB pesada) + `pnpm tsc --noEmit`
- **Por merge de wave:** `pnpm vitest run test/unit test/sessions test/scheduling test/tenancy test/db`
- **Gate de fase:** `pnpm test` completo en verde **en CI** (regla del proyecto: no correr el suite completo localmente) + `pnpm lint:tenant` sin discrepancias nuevas antes de `/gsd:verify-work`

⚠️ **Trampa operativa heredada de la fase 174.1:** un proceso `vitest` huérfano de un ejecutor colisiona con la MySQL de test y produce cientos de falsos rojos. Los ejecutores corren tests **solo en foreground con timeout amplio** — prohibido `run_in_background` y prohibido esperar con loops de `pgrep`. El gate de suite larga lo corre el orquestador, no el ejecutor. `[CITED: CLAUDE.md §Ejecución de fases GSD con modelo barato]`

### Wave 0 Gaps

- [ ] `test/unit/combos-generator.test.ts` — cubre SEM-03, SEM-06, D-05, D-11
- [ ] `test/unit/tecnica-generator.test.ts` — cubre SEM-04, SEM-06, D-08
- [ ] `test/sessions/generate-modes.test.ts` — cubre SEM-01, SEM-12, SEM-13(a), D-10
- [ ] `test/scheduling/derived-class-label.test.ts` — cubre SEM-13(b)(c), D-15, D-16, D-17
- [ ] Assert de "histórico intacto" para SEM-05 (conteo + checksum de `sessions` antes/después de la migración)
- Framework: **ya instalado**, no hace falta setup nuevo. Los mocks de `runInitiumPipeline` y `createInitialContext` para los tests unitarios se copian tal cual de `test/unit/rom-generator.test.ts:68-80`.

---

## Security Domain

`security_enforcement` no está definido en `.planning/config.json` → se trata como habilitado.

### Applicable ASVS Categories

| Categoría ASVS        | Aplica                   | Control estándar                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | sí (heredado)            | `fastify.authenticate` en el `onRequest` global del plugin admin — **ya existe, no se toca**                                                                                                                                                                                       |
| V3 Session Management | no                       | Sin cambios de sesión/token                                                                                                                                                                                                                                                        |
| V4 Access Control     | sí (heredado)            | `canAccessTraining(request.user)` en el hook `onRequest` de `admin/routes.ts:65-73` → 403 si no es dueño ni el coach de entrenamiento. **Los generadores nuevos quedan detrás del mismo hook automáticamente.** `[VERIFIED]`                                                       |
| V5 Input Validation   | **sí — foco de la fase** | JSON Schema de Fastify. El `dayModes` nuevo **debe** declarar `enum: ["regular","rom","combos","tecnica"]` y `additionalProperties: false`. Sin eso, un `session_mode` arbitrario entra y se persiste (la columna es `varchar(10)` libre — **no hay red de contención en la DB**). |
| V6 Cryptography       | no                       | —                                                                                                                                                                                                                                                                                  |

### Known Threat Patterns

| Patrón                                     | STRIDE                 | Mitigación estándar                                                                                    |
| ------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Inyección SQL                              | Tampering              | Drizzle ORM parametrizado en todas partes; las migraciones son SQL estático sin interpolación de input |
| `session_mode` arbitrario persistido       | Tampering              | `enum` en el JSON Schema del body (ver V5) — la única defensa, porque la columna no valida             |
| Cross-tenant leak en la tabla del ancla    | Information Disclosure | `tenantIdColumn()` + alta en `GYM_OWNED_TABLES` + los gates CON-03/CON-06 de master                    |
| Mass assignment vía el body de `/generate` | Tampering              | `additionalProperties: false` en el body (Fastify lo aplica si se declara)                             |
| Escalada por rol de bloque inyectado       | Tampering              | Los roles los fija el generador server-side; **nunca vienen del payload**                              |

---

## Assumptions Log

| #   | Claim                                                                                                                                | Sección                                   | Riesgo si está mal                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `GOAL_PLAN_ROUTE_MAP.tren_superior` / `.tren_inferior` son la partición superior/inferior que el coach quiere para COMBOS I/II       | Hallazgo 5                                | Los combos salen con rutas que el coach considera mal agrupadas → edición manual masiva, que es exactamente lo que la fase quiere evitar. **Confirmar con el usuario en plan-phase.** |
| A2  | El efecto retroactivo del rename "Calistenia"→"General" en analytics/reports/ratings históricos es aceptable                         | Hallazgo 9                                | Reports de meses pasados cambian de etiqueta sin aviso. **Confirmar con Franco.**                                                                                                     |
| A3  | La estructura de 2 bloques superior/inferior (D-05) es preferible a los 3 bloques de skill que el coach usa hoy en prod              | CONTEXT D-05 (el propio CONTEXT lo marca) | El generador produce algo que el coach no usa. Ya está señalado en el CONTEXT como "reconfirmar si surge fricción".                                                                   |
| A4  | Hay exactamente una fila `activities` con `name='Calistenia'` en prod (no variantes por sede)                                        | Runtime State Inventory                   | El `UPDATE … WHERE name='Calistenia'` renombra menos (o más) filas de las esperadas. **Verificable con un SELECT read-only antes de la migración** (requiere OK para SSH).            |
| A5  | MySQL local disponible para el ejecutor                                                                                              | Environment Availability                  | Los tests solo se validan en CI (que es el flujo normal del proyecto de todos modos)                                                                                                  |
| A6  | Un rol de 12 chars (`TECNICA_II`) y modos de 7 chars no chocan con ningún índice/constraint de longitud fuera de las columnas leídas | Hallazgo 1, 3                             | Truncado silencioso. Riesgo muy bajo: `varchar(20)` y `varchar(10)` verificados en schema **y** en la SQL de la migración 0080.                                                       |
| A7  | El detector de firmas de SEM-05 corriendo contra prod va a reproducir la tabla W21–W26 del CONTEXT                                   | Hallazgo 8                                | El retro-etiquetado queda incompleto o con etiquetas erróneas. Mitigación: las semanas W21–W26 ya están relevadas a mano — usarlas como **test de aceptación del detector**.          |

---

## Open Questions (RESOLVED)

1. **¿Los generadores nuevos reusan el pipeline (stages 2-7) o son autocontenidos?** — RESOLVED: ver D-P6 (Q1).
   - Lo que sabemos: `resolveRotator` no soporta roles nuevos (`default: throw`); `goal-plan-pipeline.ts` ya demuestra el reemplazo de Stage 1 reusando 2-7; ROM es autocontenido pero solo cubre 2 niveles sin budget.
   - Lo que no está claro: cuánta lógica de `selectExercises`/`deriveBudget` necesita realmente un bloque de combos (que son 3+ ejercicios encadenados con reps bajas, no un bloque de fuerza clásico).
   - Recomendación: **reusar el pipeline** (Pattern 2). Con 6 niveles, reimplementar la selección por dificultad es la parte cara y ya calibrada. Si en la ejecución resulta que el pipeline pelea con el formato Combos, degradar a autocontenido solo para el bloque problemático.

2. **¿COMBOS_I/II mapean a alguna familia de `format_compatibility`, o se saltean el catálogo de formatos compatibles?** — RESOLVED: ver D-P4 (Q2).
   - Lo que sabemos: `format_compatibility.block` es un `mysqlEnum` real de 5 valores; `edit-service.ts` mapea rol→familia con un `Record<string,string>` que no falla el typecheck.
   - Lo que no está claro: si el editor del admin necesita ofrecer formatos alternativos para un bloque de combos (D-06 dice que el formato es fijo "Combos", así que quizá no).
   - Recomendación: mapear COMBOS*\*→`'nucleus'` y TECNICA*\*→`'nucleus'`, STRETCHING→sin mapeo (lista vacía es correcto: el formato es fijo). Evita ALTER del enum. Decidir en plan-phase.

3. **¿`tv/class-day.ts` se corrige en la 159 o se difiere a la 160 (SEM-15)?** — RESOLVED: ver D-P3 (Q3).
   - Lo que sabemos: hoy lee el modo de `day_modes`; con el modelo nuevo va a reportar "regular" en días de combos. Es backend, y la 159 es la fase backend.
   - Recomendación: corregirlo en la 159 (leer `sessions.session_mode` con fallback a `day_modes`) y dejar solo el render para la 160. El CONTEXT marca SEM-15 como "coordinar con el trabajo TV vivo en `et-tv2`/`feat/tv-login-staging`" — ⚠️ **ese trabajo está en staging Y en master como historias separadas: cada cambio de TV es doble push.** El plan debe decidir si toca TV o no.

4. **¿El rename DEUTEROS→A/B incluye el badge `D1`/`D2` del API en la 159, o todo se difiere a SEM-11?** — RESOLVED: ver D-P5 (Q4).
   - Recomendación: incluir solo el badge del API en la 159 (es backend) y dejar el PDF y la centralización para SEM-11. Que el plan lo diga explícitamente para que no quede en tierra de nadie.

5. **¿Cuántos ejercicios lleva un bloque de combo?** — RESOLVED: ver D-P7 (Q5).
   - Marcado como discreción de Claude. Prod usa ≥3 con reps 1–6. `prescribeCombos` reparte el budget entre los ejercicios que reciba. Recomendación: 3, editable — coincide con la práctica del coach y con el default de 3 rondas.

---

## Sources

### Primary (HIGH confidence) — código leído de `origin/master` en esta sesión

- `el-templo-api/src/db/schema/`: `sessions.ts`, `session-blocks.ts`, `session-prescriptions.ts`, `day-modes.ts`, `routes.ts`, `weekly-rotator.ts`, `exercises.ts`
- `el-templo-api/src/db/migrations/`: `0080_rom_mode_day_modes.sql`, `0172_formats_combos_stretching_ruta_fullbody.sql`, `0191_tenant_anchors.sql`; inventario completo de numeración en todas las refs del repo
- `el-templo-api/src/modules/sessions/`: `rom-generator.ts`, `types.ts`, `service.ts`, `routes.ts`, `schemas.ts`, `validators/session-validator.ts`, `validators/block-validator.ts`
- `el-templo-api/src/modules/sessions/pipeline/`: `stage-1-rotator.ts`, `goal-plan-pipeline.ts`, `initium-pipeline.ts`, `format-prescribers.ts`, `utils/mobility-selection.ts`, `utils/mobility-routes.ts`, `utils/constants.ts`
- `el-templo-api/src/modules/admin/`: `routes.ts`, `service.ts`, `schemas.ts`, `edit-service.ts`, `format-params.ts`
- `el-templo-api/src/modules/`: `goal-plans/constants.ts`, `goal-plans/service.ts`, `scheduling/service.ts`, `tv/class-day.ts`, `shared/week-dates.ts`
- `el-templo-api/src/db/`: `tenant-tables.ts`, `seed-production.ts`
- `el-templo-api/test/`: `vitest.config.ts`, `unit/rom-generator.test.ts`, `tenancy/iso-01-manifiesto.test.ts`, `db/tenant-tables.test.ts`, inventario de `test/sessions/`
- `.claude/skills/el-templo-db-migrations/SKILL.md`, `.claude/skills/el-templo-change-control/SKILL.md`
- `./CLAUDE.md`

### Secondary (MEDIUM confidence) — documentos de discovery del proyecto

- `.planning/phases/159-…/159-CONTEXT.md` (decisiones + evidencia SSH prod 2026-08-13)
- `.planning/phases/159-…/159-DISCUSSION-LOG.md`
- `.docs/coach-improvements/DISCOVERY-SEMANA-NUEVA-2026-07-07.md` (firmas de detección; su conclusión "fijo desde W19" está **desmentida** por la evidencia de prod del CONTEXT)
- `.planning/ROADMAP.md` §v5.6

### Tertiary (LOW confidence)

- Ninguna. No se usó WebSearch ni Context7: la fase es 100% código propio del monorepo, sin bibliotecas externas nuevas.

---

## Metadata

**Desglose de confianza:**

- Standard stack: **HIGH** — no hay stack nuevo; todo verificado leyendo `origin/master` (no el checkout, que está 5 migraciones atrás)
- Arquitectura: **HIGH** — los dos moldes (`rom-generator.ts`, `goal-plan-pipeline.ts`) están leídos completos; el bloqueante del `weekly_rotator` está verificado en el `switch` de `stage-1-rotator.ts`
- Numeración de migraciones: **HIGH** — inventario exhaustivo sobre todas las refs del repo, 2026-08-13
- Pitfalls: **HIGH** para 1/2/3/4/5/7 (verificados en el código); **MEDIUM** para 8 (citado del discovery, no re-verificado contra prod en esta sesión)
- Partición superior/inferior (A1) y efecto retroactivo del rename (A2): **MEDIUM** — dependen de confirmación del usuario, no de código

**Research date:** 2026-08-13
**Valid until:** 2026-09-12 (30 días) — **salvo** que el tren v6.0 (fases 173/174/174.1/175) llegue a master antes: eso mueve la numeración de migraciones, agrega los helpers de tenancy strict a los módulos de sessions/scheduling e invalida el § Hallazgo 10 y parte del Pitfall 7. **Si el tren mergea a master antes de ejecutar esta fase, re-verificar numeración y patrón de tenancy vigente.**
