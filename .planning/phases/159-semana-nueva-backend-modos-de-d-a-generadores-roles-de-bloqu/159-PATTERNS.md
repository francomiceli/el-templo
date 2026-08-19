# Phase 159: Semana nueva backend — modos de día, generadores, roles de bloque y horarios - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 26 (12 nuevos, 14 modificados)
**Analogs found:** 25 / 26
**Base de lectura:** `origin/master` (⚠️ el checkout local está en migraciones 0196 y NO refleja master — todos los números de línea de este documento son de `git show origin/master:<path>`)

---

## File Classification

### Archivos NUEVOS

| Nuevo archivo                                                   | Rol                    | Data Flow                | Analog más cercano                                                   | Match      |
| --------------------------------------------------------------- | ---------------------- | ------------------------ | -------------------------------------------------------------------- | ---------- |
| `src/modules/sessions/combos-generator.ts`                      | service (generador)    | transform (read→compute) | `src/modules/sessions/rom-generator.ts`                              | exact      |
| `src/modules/sessions/tecnica-generator.ts`                     | service (generador)    | transform                | `src/modules/sessions/rom-generator.ts`                              | exact      |
| `src/modules/sessions/pipeline/semana-nueva-pipeline.ts`        | pipeline orchestrator  | transform (staged)       | `src/modules/sessions/pipeline/goal-plan-pipeline.ts`                | exact      |
| `src/modules/sessions/pipeline/utils/stretching-selection.ts`   | utility                | transform (query + pick) | `src/modules/sessions/pipeline/utils/mobility-selection.ts`          | role-match |
| `src/db/schema/session-week-regime.ts`                          | model (schema)         | CRUD                     | `src/db/schema/day-modes.ts`                                         | exact      |
| `src/db/migrations/0202_session_week_regime.sql`                | migration (DDL)        | batch                    | `src/db/migrations/0189_tv_screen.sql`                               | parcial ⚠️ |
| `src/db/migrations/0203_backfill_regime_w12_w26.sql`            | migration (@data-only) | batch                    | `src/db/migrations/0183_backfill_lost_leads.sql`                     | exact      |
| `src/db/migrations/0204_rename_calistenia_general.sql`          | migration (@data-only) | batch                    | `src/db/migrations/0172_formats_combos_stretching_ruta_fullbody.sql` | exact      |
| `src/db/scripts/0203_regime_dryrun.sql` (opcional, recomendado) | script                 | batch (read-only)        | `src/db/scripts/0183_backfill_lost_leads_dryrun.sql`                 | exact      |
| `test/unit/combos-generator.test.ts`                            | test (unit, DB mock)   | transform                | `test/unit/rom-generator.test.ts`                                    | exact      |
| `test/unit/tecnica-generator.test.ts`                           | test (unit, DB mock)   | transform                | `test/unit/rom-generator.test.ts`                                    | exact      |
| `test/sessions/generate-modes.test.ts`                          | test (integración)     | request-response         | `test/sessions/sessions.test.ts`                                     | exact      |
| `test/scheduling/derived-class-label.test.ts`                   | test (integración)     | request-response         | `test/scheduling/155-horarios.test.ts`                               | exact      |

### Archivos MODIFICADOS

| Archivo                                                | Rol                                | Data Flow        | Qué cambia (línea en master)                                                                                              |
| ------------------------------------------------------ | ---------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/sessions/types.ts`                        | types                              | —                | `BlockRole` (:38-47) += 5 roles; `DaySession.sessionMode` (:160-161) += 2 modos                                           |
| `src/modules/sessions/service.ts`                      | service                            | CRUD             | casts `as "regular" \| "rom"` (:738, :869); `saveSession` ya persiste el modo (:458-459)                                  |
| `src/modules/sessions/validators/block-validator.ts`   | validator                          | transform        | `FORMAT_COMPATIBILITY` (:20-49) — `Record<BlockRole,…>` exhaustivo                                                        |
| `src/modules/sessions/validators/session-validator.ts` | validator                          | transform        | `INTENSITY_RANGES` (:25-36) + rama de conteo de bloques (:56-76)                                                          |
| `src/modules/admin/service.ts`                         | service                            | batch            | ruteo por modo en `generateWeek` (:630-699); badge `D1`/`D2` (:175-177)                                                   |
| `src/modules/admin/schemas.ts`                         | config (schema)                    | request-response | `generateWeekSchema` (:48-68) += `dayModes` + `additionalProperties:false`                                                |
| `src/modules/admin/routes.ts`                          | route (SOLO LECTURA, NO modificar) | request-response | `enum: ["regular","rom"]` del PUT day-modes (:122) — **NO extender** (D-02: combos/tecnica solo per-request en /generate) |
| `src/modules/admin/edit-service.ts`                    | service                            | CRUD             | `blockMap` rol→familia de `format_compatibility` (:661-668)                                                               |
| `src/modules/scheduling/service.ts`                    | service                            | CRUD/read-model  | `getWeeklySchedule` (:169-331) etiqueta derivada; `seedDefaultSchedules` (:792-805) literal                               |
| `src/modules/tv/class-day.ts`                          | service                            | read-model       | `resolveClassDay` lee `day_modes` (:132-142) → debe leer `sessions.session_mode`                                          |
| `src/db/seed-production.ts`                            | script                             | batch            | get-or-create por literal `"Calistenia"` (:100-124)                                                                       |
| `src/db/schema/index.ts`                               | config                             | —                | `export * from "./session-week-regime"` (patrón :11, :20, :68)                                                            |
| `src/db/tenant-tables.ts`                              | config                             | —                | alta de la tabla en `GYM_OWNED_TABLES` (:64+, orden alfabético)                                                           |
| `test/tenancy/iso-01-manifiesto.test.ts`               | test                               | —                | SOLO si se agrega ruta HTTP nueva (`ENTRADAS_BASELINE = 370`, :171) — evitarlo                                            |

---

## Pattern Assignments

### `src/modules/sessions/combos-generator.ts` y `tecnica-generator.ts` (service, transform)

**Analog:** `el-templo-api/src/modules/sessions/rom-generator.ts` (252 líneas, leído completo)

**Imports + docblock** (rom-generator.ts:1-27) — copiar la forma exacta, incluido el docblock que declara estructura de bloques y "bypasses/reuses the pipeline":

```ts
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type {
  DaySession,
  BlockPlan,
  ExercisePrescription,
  BlockRole,
  TraceEvent,
} from "./types";
import { LEVEL_DIFFICULTY_MAP } from "../shared/training-constants";
import { runInitiumPipeline } from "./pipeline/initium-pipeline";
import { createInitialContext } from "./pipeline/context";
```

**Constantes de módulo exportadas** (rom-generator.ts:29-56) — el mapa rol→pool y los defaults van arriba del archivo, exportados y comentados con la decisión que los origina:

```ts
/** Body zone to mobilityRelated field mapping (per D-11) */
export const ROM_ZONE_MOBILITY_MAP: Record<string, string[]> = { … };
/** ROM block roles in execution order */
const ROM_BLOCK_ROLES: BlockRole[] = ["ROM_LOWER", "ROM_CORE", "ROM_UPPER"];
```

→ equivalente para 159: `COMBOS_ROUTE_POOLS = { COMBOS_I: GOAL_PLAN_ROUTE_MAP.tren_superior, COMBOS_II: GOAL_PLAN_ROUTE_MAP.tren_inferior }` (D-P1) y `COMBOS_BLOCK_ROLES: BlockRole[] = ["COMBOS_I","COMBOS_II"]`.

**Firma + dayId + INITIUM compartido** (rom-generator.ts:79-109) — ⚠️ el `dayId` debe ser el MISMO esquema que los días regulares:

```ts
export async function generateRomSession(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  memberLevel: "alfa" | "delta",
): Promise<DaySession> {
  const dayId = `W${week}-${day}-${memberLevel}`;
  const sessionTrace: TraceEvent[] = [];
  …
  const initiumCtx = createInitialContext(week, day, "alfa_delta", memberLevel, "INITIUM");
  const initiumBlock = await runInitiumPipeline(initiumCtx, db);
  blocks.push(initiumBlock);
```

⚠️ **Diferencia obligatoria vs ROM:** los generadores nuevos reciben `levelGroup: LevelGroup` y `memberLevel: ExerciseLevel` (6 niveles, D-10), no el `"alfa_delta"` hardcodeado ni el par `"alfa"|"delta"`.

**Trace event por bloque** (rom-generator.ts:111-127 y 221-238) — copiar la forma exacta del `TraceEvent` manual (los generadores autocontenidos no usan `createTraceEvent`, arman el objeto a mano):

```ts
sessionTrace.push({
  ts: new Date().toISOString(),
  severity: "INFO",
  code: "ROM_INITIUM_GENERATED",
  where: {
    week,
    day,
    levelGroup: "alfa_delta",
    memberLevel,
    blockId: initiumBlock.blockId,
    role: "INITIUM",
  },
  decision: {
    exerciseCount: initiumBlock.exercises.length,
    format: initiumBlock.format.name,
  },
});
```

**Degradación de pool fino** (rom-generator.ts:157-185) — el patrón de fallback con `severity: "WARNING"` + `decision.fallback` es el molde para "pool de ruta fino para 6 niveles" (discreción del CONTEXT):

```ts
if (eligible.length < 3) {
  sessionTrace.push({ ts: …, severity: "WARNING", code: "ROM_POOL_THIN",
    where: { …, role },
    decision: { zone: role, eligibleCount: eligible.length, fallback: "relaxing_difficulty_filter" } });
  eligible = zoneExercises.filter((ex) => ex.effort === "CON");
  …
}
```

**Construcción del BlockPlan y return** (rom-generator.ts:205-252):

```ts
const blockId = `ROM-${role}-W${week}-${day}-${memberLevel}`;
blocks.push({
  blockId, role, route: role, pattern: "MOVILIDAD",
  intensity: ROM_INTENSITY, repsBudget: ROM_REPS_BUDGET,
  format: { formatId: 0, name: "ROM" },          // ⚠️ NO copiar el 0 (ver abajo)
  formatParams: { type: "rom", rounds: 3, restSeconds: ROM_REST_SECONDS },
  exercises, trace: [], mobilityExercise: undefined,
});
…
return { dayId, week, day, levelGroup: "alfa_delta", memberLevel, blocks,
         trace: sessionTrace, goalPlanType: null, sessionMode: "rom" };
```

⚠️ **NO copiar `formatId: 0`.** 'Combos' y 'Stretching' SON filas reales de `formats` (migración 0172). El id se resuelve con una query por nombre; molde de lookup en `src/modules/sessions/routes.ts:376-386`:

```ts
const formatRows = await fastify.db
  .select({ name: schema.formats.name, description: schema.formats.description })
  .from(schema.formats);
const formatDescriptions = new Map<string, string>(…);
```

---

### `src/modules/sessions/pipeline/semana-nueva-pipeline.ts` (pipeline orchestrator, transform)

**Analog:** `el-templo-api/src/modules/sessions/pipeline/goal-plan-pipeline.ts` (375 líneas, leído completo) — **este es el molde canónico de D-P6.**

**Imports de stages reusados** (goal-plan-pipeline.ts:22-38) — copiar literal, es el "Stage 1 reemplazado, 2-7 intactos":

```ts
// Import pipeline stages (reused from main pipeline)
import { resolveSpom } from "./stage-2-spom";
import { deriveBudget } from "./stage-3-budget";
import { deriveContraction } from "./stage-4-contraction";
import { selectFormat } from "./stage-5-format";
import { selectExercises } from "./stage-6-exercises";
import { generatePrescriptions } from "./stage-7-prescription";
import { runInitiumPipeline } from "./initium-pipeline";
import { GOAL_PLAN_ROUTE_MAP } from "../../goal-plans/constants";
import { ROUTE_TO_MOBILITY_ROUTES } from "./utils/mobility-routes";
```

**Hash determinístico** (goal-plan-pipeline.ts:40-50) — ⚠️ es `function` privada del archivo; para 159 conviene **exportarla** desde un util compartido o duplicarla con el mismo cuerpo byte-a-byte (DRY: preferible extraerla, CLAUDE.md #8):

```ts
/**
 * Simple deterministic hash of a string.
 * Sums character codes for reproducible routing.
 */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i) * (i + 1)) | 0;
  }
  return Math.abs(hash);
}
```

**Resolución de ruta que reemplaza Stage 1** (goal-plan-pipeline.ts:52-88):

```ts
function resolveGoalPlanRoute(
  ctx: BlockContext,
  goalPlanType: GoalPlanType,
): BlockContextWithRoute {
  const allowedRoutes = GOAL_PLAN_ROUTE_MAP[goalPlanType];
  const hashInput = `${ctx.week}-${ctx.day}-${ctx.role}`;
  const routeIndex = simpleHash(hashInput) % allowedRoutes.length;
  const selectedRoute = allowedRoutes[routeIndex];

  const traceEvent = createTraceEvent(ctx, "GOAL_PLAN_ROUTE_SELECTED", "INFO", {
    goalPlanType,
    allowedRoutes,
    hashInput,
    routeIndex,
    selectedRoute,
    source: "goal_plan_route_map",
  });

  return { ...appendTrace(ctx, traceEvent), route: selectedRoute };
}
```

⚠️ **Para TECNICA (D-08): el `hashInput` DEBE excluir `ctx.role`** (`` `${ctx.week}-${ctx.day}` ``) para que TECNICA_I y TECNICA_II caigan en la misma ruta. Para COMBOS sí se incluye el rol (pools distintos, pero el rol en el hash evita colisión de índices).

**Cuerpo del pipeline: INITIUM desviado + stages 3-7 + formato forzado + assemble + catch** (goal-plan-pipeline.ts:245-375). Bloques clave a copiar:

```ts
export async function runGoalPlanBlockPipeline(
  initialContext: BlockContext, spomService: SpomService,
  db: MySql2Database<typeof schema>, goalPlanType: GoalPlanType,
  options?: BlockPipelineOptions,
): Promise<BlockPlan> {
  if (initialContext.role === "INITIUM") {
    return runInitiumPipeline(initialContext, db, options?.excludeFormatNames, goalPlanMobilityRoutes);
  }
  …
  // Stage 5: Select format (or use forced format for Deuteros consistency)
  let ctx5;
  if (options?.forcedFormat) {
    const formatTrace = createTraceEvent(ctx4, "FORMAT_FORCED", "INFO", {
      reason: "Deuteros blocks must share same format",
      formatId: options.forcedFormat.formatId, formatName: options.forcedFormat.name,
    });
    ctx5 = { ...appendTrace(ctx4, formatTrace), format: options.forcedFormat };
  } else {
    ctx5 = await selectFormat(ctx4, db, options?.excludeFormatNames);
  }
  const ctx6 = await selectExercises(ctx5, db);
  const finalCtx = generatePrescriptions(ctx6);

  const blockPlan: BlockPlan = {
    blockId: finalCtx.blockId, role: finalCtx.role, route: finalCtx.route,
    pattern: finalCtx.pattern, intensity: finalCtx.intensity, repsBudget: finalCtx.repsBudget,
    format: finalCtx.format, formatParams: finalCtx.formatParams,
    exercises: finalCtx.prescriptions, trace: finalCtx.trace,
  };
  return blockPlan;
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorTrace = createTraceEvent(ctx, "PIPELINE_ERROR", "ERROR", {
    stage: "goal_plan_pipeline", error: errorMessage, goalPlanType,
  });
  ctx = appendTrace(ctx, errorTrace);
  throw error;
}
```

**`BlockPipelineOptions` ya soporta `forcedFormat`** — `src/modules/sessions/pipeline/index.ts:28-36`, no hay que extenderlo:

```ts
export interface BlockPipelineOptions {
  /** Force a specific format (used for Deuteros consistency) */
  forcedFormat?: { formatId: number; name: string };
  /** Format names already used in this day's session (avoid repeats) */
  excludeFormatNames?: string[];
}
```

**Fuente de las rutas superior/inferior** (`src/modules/goal-plans/constants.ts:12-33`) — usar tal cual, sin mapa nuevo (D-P1):

```ts
export const GOAL_PLAN_ROUTE_MAP: Record<GoalPlanType, string[]> = {
  tren_superior: ["HS","HSPU","PHS","OAPU","PLPU", "MU","OAP","OAR","BL", "HD/ID","MN/RP", "FL","FLR", "TTB"],
  tren_inferior: ["SU","SS","PS","QC", "DS", "NC","HT"],
  …
};
```

---

### `src/modules/sessions/pipeline/utils/stretching-selection.ts` (utility, transform)

**Analog de estructura:** `src/modules/sessions/pipeline/utils/mobility-selection.ts` (83 líneas, leído completo)
**Analog de determinismo:** `goal-plan-pipeline.ts:44-50` (`simpleHash`) — ⚠️ **NO** el `Math.random()` del analog de estructura.

**Query del pool + fallback + prescripción por contracción** (mobility-selection.ts:34-83) — copiar todo MENOS la línea 68:

```ts
export async function selectMobilityExercise(
  blockRoute: string,
  db: MySql2Database<typeof schema>,
): Promise<ExercisePrescription | null> {
  const allMobility = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(eq(schema.exercises.pattern, 'MOVILIDAD'));

  if (allMobility.length === 0) return null;
  …
  if (pool.length === 0) { pool = allMobility; }   // fallback a pool completo

  // 5. Random selection from valid pool
  const selected = pool[Math.floor(Math.random() * pool.length)];   // 🔴 PROHIBIDO copiar (Pitfall 1)

  const isISO = selected.effort?.toUpperCase() === 'ISO';
  return {
    exerciseId: selected.id, name: selected.name,
    contraction: isISO ? 'ISO' : 'CON',
    reps: isISO ? 0 : MOBILITY_DEFAULTS.CON_REPS,
    seconds: isISO ? MOBILITY_DEFAULTS.ISO_SECONDS : 0,
    rest: 0, exerciseType: 'mobility',
  };
}
```

**Reemplazo obligatorio de la línea 68** (pool ordenado por id + hash puro de `(week, day)`, sin `memberLevel` — si el nivel entra al hash, los 6 niveles divergen y se rompe D-11):

```ts
const ordered = [...pool].sort((a, b) => a.id - b.id);
const picked: typeof ordered = [];
for (let i = 0; picked.length < 4 && picked.length < ordered.length; i++) {
  const idx = simpleHash(`${week}-${day}-STRETCHING-${i}`) % ordered.length;
  const cand = ordered[idx];
  if (!picked.some((p) => p.id === cand.id)) picked.push(cand); // deduplicar sin romper pureza
}
```

⚠️ El otro `Math.random()` del repo que NO hay que copiar es `shuffleArray` de `rom-generator.ts:61-68`.

---

### `src/db/schema/session-week-regime.ts` (model, CRUD)

**Analog:** `src/db/schema/day-modes.ts` (24 líneas, leído completo) — misma familia (config por semana/día, gym-owned, unique por tenant).

```ts
import { mysqlTable, int, varchar, uniqueIndex } from "drizzle-orm/mysql-core";
import { tenantIdColumn } from "./tenant-column";

export const dayModes = mysqlTable(
  "day_modes",
  {
    id: int("id").primaryKey().autoincrement(),
    // Fase 167 (COL-01): tenancy. Valor server-side, nunca de payload. Ver src/db/schema/tenant-column.ts
    tenantId: tenantIdColumn(),
    dayOfWeek: int("day_of_week").notNull(), // 1=Mon, 2=Tue, ..., 6=Sat
    sessionMode: varchar("session_mode", { length: 10 })
      .default("regular")
      .notNull(),
  },
  (table) => [
    // Fase 168 (CON-01): unicidad POR TENANT — un modo por día de la semana POR
    // gimnasio. Índice byte-for-byte con la migración 0196.
    uniqueIndex("uq_day_modes_tenant_day_of_week").on(
      table.tenantId,
      table.dayOfWeek,
    ),
  ],
);
```

**Analog secundario (enums de day/levelGroup reusables):** `src/db/schema/weekly-rotator.ts:5-6`:

```ts
export const dayEnum = mysqlEnum("day", [
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
]);
export const levelGroupEnum = mysqlEnum("level_group", [
  "alfa_delta",
  "sigma",
  "omega",
]);
```

⚠️ Regla dura del skill de migraciones (M6): en `mysqlEnum("primer_arg", …)` el primer argumento **es** el nombre físico de la columna. Reusar `dayEnum` re-declara la columna `day` — correcto para la tabla nueva.

**Contrato de la columna de tenancy** (`src/db/schema/tenant-column.ts`, fuente única):

```ts
export function tenantIdColumn() {
  return int("tenant_id")
    .notNull()
    .default(1)
    .references(() => tenants.id);
}
```

**Alta obligatoria en la clasificación** (`src/db/tenant-tables.ts:51-64`) — el test `test/db/tenant-tables.test.ts` es fail-closed:

```ts
// Agregar una tabla nueva al schema OBLIGA a clasificarla acá. El test
// `test/db/tenant-tables.test.ts` es fail-closed: una tabla sin clasificar deja
// la suite en rojo, no pasa en silencio.
export const GYM_OWNED_TABLES = [
  "academy_inquiries",
  "activities",
  …   // orden alfabético: `session_week_regime` va entre "sessions" (:132) y "spom_rules"
];
```

**Export del schema** (`src/db/schema/index.ts`, patrón de líneas :11, :20-21, :68): `export * from "./session-week-regime";`

---

### `src/db/migrations/0202_session_week_regime.sql` (migration DDL, batch) — ⚠️ único con match parcial

**Analog de estilo/header/DDL:** `src/db/migrations/0189_tv_screen.sql` (última `CREATE TABLE` de master).
**Gap:** en master NO existe ninguna `CREATE TABLE` posterior a la tanda de tenancy (0192-0195 son ALTERs). `session_week_regime` es la **primera tabla gym-owned que nace con `tenant_id`** — hay que componer el DDL de 0189 con el contrato de columna de `tenant-column.ts` y el estilo de unique compuesta de 0196.

**Header obligatorio** (0189_tv_screen.sql:1-30) — reproducir las 4 declaraciones (propósito, hand-written, numeración verificada en ambas ramas, y la advertencia del `;`):

```sql
-- 0189_tv_screen.sql
-- Fase 164 (pantalla TV de sucursal): tres tablas nuevas …
--
-- Hand-written: db:generate pega contra el drift interactivo preexistente de
-- sessions.goal_plan_type (mismo motivo que 0184 y 0188). NUNCA drizzle-kit
-- push/migrate -- la tabla _migrations es la unica fuente de verdad, local y prod.
--
-- Numeracion: 0188_bookings_trial_date_index.sql es la ultima tanto en
-- origin/master como en origin/staging, verificado antes de escribir este
-- archivo, asi que 0189 es el siguiente libre real en ambas ramas.
--
-- Un comentario SQL NUNCA debe contener el separador de statements -- el runner
-- parte los statements crudos primero y recien despues borra los comentarios de
-- doble guion.
```

⚠️ Para 159 el texto de numeración debe decir **0202** (master en 0201 con hueco en 0200 que ocupa el tren v6.0; ninguna rama llega a 0202).

**DDL** (0189_tv_screen.sql:32-46) — backticks, `PRIMARY KEY` al final, `KEY`/`UNIQUE KEY`/`CONSTRAINT … FOREIGN KEY` nombrados:

```sql
CREATE TABLE `tv_devices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `branch_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tv_devices_token_hash_unique` (`token_hash`),
  KEY `idx_tv_devices_branch` (`branch_id`),
  CONSTRAINT `tv_devices_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`)
);
```

Composición requerida para 159 (de `tenant-column.ts` + CON-01): `` `tenant_id` int NOT NULL DEFAULT 1 ``, `CONSTRAINT fk_session_week_regime_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)`, y la unique compuesta con `tenant_id` **primero**: `UNIQUE KEY uq_session_week_regime_tenant_week_day (tenant_id, week, day)`.

---

### `0203_backfill_regime_w12_w26.sql` (migration @data-only, batch)

**Analog:** `src/db/migrations/0183_backfill_lost_leads.sql` — es el backfill retroactivo más reciente y trae los tres elementos que 159 necesita: backup previo, regla explícita documentada, y script de dry-run separado.

```sql
-- 0183_backfill_lost_leads.sql
-- Phase 163 (AUTO-05, D-08): backfill retroactivo de la maquina de estados.
-- Hand-written (…). NEVER drizzle-kit push/migrate -- la tabla
-- _migrations es la unica fuente de verdad, local y prod.
--
-- Que hace:
--   1. Snapshot de las columnas … en users_lead_backup_0183 … para poder auditar/revertir la
--      reclasificacion retroactiva. Patron exacto del backup de 0170:29-34. Los
--      deploys NO respaldan la DB, por eso el backup vive en la migracion.
--   2. Aplica UNA vez la regla del cron …
--
-- Referencia del brief: … El dry-run contra prod (src/db/scripts/0183_backfill_lost_leads_dryrun.sql)
-- es item de verificacion humana ANTES de que el pipeline aplique esta migracion.

CREATE TABLE users_lead_backup_0183 AS …
```

⚠️ Para SEM-05 el backup NO hace falta (la migración solo INSERTA en una tabla nueva; D-18 exige `sessions` intacto), pero **sí el dry-run** (`src/db/scripts/0203_regime_dryrun.sql`) para validar las firmas contra prod antes de aplicar.

**Idempotencia:** usar el patrón `INSERT … SELECT … WHERE NOT EXISTS` de 0172 (abajo), con las filas W12–W26 como literales calculados por el detector TS, no con SQL de percentiles.

---

### `0204_rename_calistenia_general.sql` (migration @data-only, batch)

**Analog:** `src/db/migrations/0172_formats_combos_stretching_ruta_fullbody.sql` (leído completo, 20 líneas) — el marcador `@data-only` va en la **primera línea**, y cada statement es idempotente por sí mismo:

```sql
-- @data-only
-- v5.6 (primera tanda chica): formatos "Combos" y "Stretching" + ruta FULLBODY
-- Combos: reemplaza el uso de Complex para los dias de combos (rondas y reps editables)
-- …
-- Idempotente: cada insert se saltea si la fila ya existe

INSERT INTO formats (name, type, description)
SELECT 'Combos', 'Technical', 'Combo de ejercicios encadenados sin descanso, rondas y reps editables'
WHERE NOT EXISTS (SELECT 1 FROM formats WHERE name = 'Combos');
```

→ Para el rename (D-P2), el equivalente idempotente es `UPDATE activities SET name = 'General' WHERE name = 'Calistenia';` (no-op en replay). **Va en el MISMO commit que las dos ediciones de código** (`scheduling/service.ts:792-805` y `seed-production.ts:100-124`) — si no, la próxima sede duplica la actividad (Pitfall 4).

---

### `src/modules/admin/service.ts` — ruteo por modo en `generateWeek` (service, batch)

**Analog:** el archivo mismo, rama ROM (admin/service.ts:630-699). El bloque a extender:

```ts
async generateWeek(
  week: number,
  options: { days?: string[]; levelGroups?: string[]; regenerate?: boolean },
): Promise<{ generated: number; skipped: number; failed: number; warnings: string[] }> {
  …
  // Import SessionGeneratorService dynamically to avoid circular deps
  const { SessionGeneratorService } = await import("../sessions/service.js");
  const { generateRomSession } = await import("../sessions/rom-generator.js");
  const sessionService = new SessionGeneratorService(this.db);

  // Load day modes for ROM routing (per D-17)
  const dayModeRows = await this.db.select().from(schema.dayModes);
  const dayModeMap = new Map(dayModeRows.map((r) => [r.dayOfWeek, r.sessionMode]));

  for (const day of days) {
    const dayNumber = DAY_NAME_TO_NUMBER[day];
    const dayMode = dayNumber ? dayModeMap.get(dayNumber) || "regular" : "regular";

    if (dayMode === "rom") {
      for (const memberLevel of ["alfa", "delta"] as const) {
        const dayId = `W${week}-${day}-${memberLevel}`;
        const existing = await sessionService.getSessionByDayId(dayId);
        if (existing && !options.regenerate) { skipped++; continue; }
        if (existing && options.regenerate) {
          await this.db.delete(schema.sessions).where(eq(schema.sessions.dayId, dayId));
        }
        try {
          const session = await generateRomSession(this.db, week, day, memberLevel);
          await sessionService.saveSession(session);
          generated++;
        } catch (err: unknown) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          warnings.push(`${dayId} (ROM): ${errorMsg}`);
        }
      }
      continue; // Skip the regular levelGroups loop for ROM days
    }
```

**Patrón de expansión de levelGroup → memberLevels** (admin/service.ts:719-724) — los generadores nuevos lo replican tal cual (D-10, 6 niveles):

```ts
const memberLevels: ExerciseLevel[] =
  levelGroup === "alfa_delta"
    ? ["alfa", "delta", "kairos"]
    : levelGroup === "sigma"
      ? ["sigma"]
      : ["omega", "spartan"];
```

**Import dinámico** (`await import("../sessions/rom-generator.js")`, :653) — los dos generadores nuevos se importan igual, con la extensión `.js`.

**Badge DEUTEROS (D-P5, único cambio de rename en la 159)** — admin/service.ts:166-177:

```ts
// Build routes summary map: sessionId -> "I, N: SU 55%, D1: PHS 60%, D2: HT 65%, A: FLR 60%"
let label = b.role.charAt(0);
if (b.role === "DEUTEROS_1") label = "D1";
else if (b.role === "DEUTEROS_2") label = "D2";
```

⚠️ Los literales `'DEUTEROS I'`/`'DEUTEROS II'` del PDF (`el-templo-admin/src/utils/pdf/…`) NO son de esta fase — SEM-11/160.

---

### `src/modules/admin/schemas.ts` — body de `/generate` (config, request-response)

**Analog:** el propio `generateWeekSchema` (admin/schemas.ts:48-68) + el uso de `additionalProperties: false` de los schemas hermanos (:173, :327, :415, :482, :503):

```ts
export const generateWeekSchema = {
  body: {
    type: "object",
    required: ["week"],
    properties: {
      week: { type: "integer", minimum: 1, maximum: 52 },
      days: {
        type: "array",
        items: {
          type: "string",
          enum: ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"],
        },
      },
      levelGroups: {
        type: "array",
        items: { type: "string", enum: ["alfa_delta", "sigma", "omega"] },
      },
      regenerate: { type: "boolean", default: false },
    },
  },
};
```

⚠️ Este schema hoy **no** tiene `additionalProperties: false` — agregarlo junto con `dayModes` (V5 Input Validation: la columna `varchar(10)` no valida nada, el enum del JSON Schema es la única defensa).

**Molde de "objeto con claves dinámicas + shape por clave"** para `dayModes` — admin/schemas.ts:510-516:

```ts
 * Keyed by route code; additionalProperties carries the per-route shape.
      additionalProperties: { … },
```

**Enum del PUT day-modes** — `admin/routes.ts:122`: `enum: ["regular", "rom"]`. ⚠️ **NO extender** (revisión plan-checker: extenderlo reabriría el bug de "día fijo" que D-02 prohíbe). combos/tecnica existen SOLO como override per-request en el body de `/generate`, nunca como valor fijable de `day_modes`.

**Auth: NO hay nada que escribir.** `admin/routes.ts:64-73` aplica el hook a todo el plugin:

```ts
// exclusive training coach only (see canAccessTraining).
fastify.addHook("onRequest", async (request, reply) => {
  …
  if (!canAccessTraining(request.user)) { … }
```

Y `/generate` ya está registrado ahí (`admin/routes.ts:256-267`) → **no se agregan rutas HTTP nuevas** ⇒ ISO-01 (`ENTRADAS_BASELINE = 370`) no se toca.

---

### `src/modules/sessions/validators/*` (validator, transform)

**`FORMAT_COMPATIBILITY`** — block-validator.ts:19-49 (`Record<BlockRole, readonly string[]>`, exhaustivo → el typecheck exige los 5 roles nuevos):

```ts
/** Block roles that allow certain formats (based on actual DB formats) */
const FORMAT_COMPATIBILITY: Record<BlockRole, readonly string[]> = {
  INITIUM: ["EMOM", "Couplet", "Buy-in", "Straight Sets"], // Warmup formats
  …
  EPIKOS: ["AMRAP","EMOM","Tabata","For Time","Chipper","Complex","Combos","I Go You Go"],
  // ROM blocks use fixed For Quality format
  ROM_LOWER: ["For Quality"],
  ROM_CORE: ["For Quality"],
  ROM_UPPER: ["For Quality"],
};
```

→ patrón para 159: `COMBOS_I/II: ["Combos"]`, `TECNICA_I/II: ["For Quality","Cluster","Accumulate X"]`, `STRETCHING: ["Stretching"]` (comentario de una línea explicando el formato fijo, como el de ROM).

**`INTENSITY_RANGES`** — session-validator.ts:24-36 (mismo mecanismo exhaustivo; ROM usa `{min:30,max:70}`):

```ts
const INTENSITY_RANGES: Record<BlockRole, { min: number; max: number }> = {
  INITIUM: { min: 10, max: 40 },
  …
  // ROM blocks use fixed moderate intensity
  ROM_LOWER: { min: 30, max: 70 },
};
```

**Conteo de bloques — el que NO falla el typecheck (Pitfall 3)** — session-validator.ts:56-76:

```ts
// Detect ROM session (3 body-zone blocks, different structure from regular)
const isRomSession =
  session.sessionMode === "rom" ||
  session.blocks.some((b) => b.role.startsWith("ROM_"));

// Check 1: Block count (ROM = 4: INITIUM + 3 zones, regular = 4-5)
if (isRomSession) {
  if (session.blocks.length !== 4) {
    sessionErrors.push(`ROM session has ${session.blocks.length} blocks (expected: 4)`);
  }
} else if (session.blocks.length < MIN_BLOCKS) { … }
```

→ generalizar a "sesión de estructura fija de 4 bloques" (`rom | combos | tecnica`) en vez de agregar un tercer `if`.

**`BlockRole` y `sessionMode`** — types.ts:37-47 y :158-161:

```ts
/** Block roles in a training session (5 blocks for regular, 3 for ROM) */
export type BlockRole =
  | "INITIUM" | "NUCLEUS" | "DEUTEROS_1" | "DEUTEROS_2" | "ATHLOS" | "EPIKOS"
  | "ROM_LOWER" | "ROM_CORE" | "ROM_UPPER";
…
/** Session mode: 'regular' (default SPOM) or 'rom' (mobility-focused) */
readonly sessionMode?: "regular" | "rom";
```

Y los dos casts que arrastra (`sessions/service.ts:737-738` y `:868-869`):

```ts
...(session.sessionMode && session.sessionMode !== "regular"
  ? { sessionMode: session.sessionMode as "regular" | "rom" }
```

`saveSession` ya persiste el modo sin cambios (`sessions/service.ts:458-459`).

---

### `src/modules/admin/edit-service.ts` — `blockMap` (service, CRUD) — mapa NO exhaustivo ⚠️

**Analog:** el propio bloque (edit-service.ts:657-669). No falla el typecheck: hay que acordarse a mano (D-P4 → los 4 roles nuevos mapean a `'nucleus'`, STRETCHING sin entrada):

```ts
async getCompatibleFormats(params: CompatibleFormatsParams): Promise<CompatibleFormat[]> {
  const { blockRole, level, intensity } = params;
  const blockMap: Record<string, string> = {
    INITIUM: "initium",
    NUCLEUS: "nucleus",
    DEUTEROS_1: "deuteros",
    DEUTEROS_2: "deuteros",
    ATHLOS: "athlos",
    EPIKOS: "epikos",
  };
  const compatBlock = blockMap[blockRole];

  // Fetch compatible formats (if block role maps)
  let compatibleRows: CompatibleFormat[] = [];
  if (compatBlock) { … }
```

El `if (compatBlock)` es exactamente la razón por la que STRETCHING sin mapeo devuelve lista vacía **sin romper** (formato fijo, D-P4). `format_compatibility.block` es un `mysqlEnum` real de 5 valores → mapear a `'nucleus'` evita el ALTER.

---

### `src/modules/scheduling/service.ts` — etiqueta derivada (service, read-model)

**Analog:** el propio `getWeeklySchedule` (scheduling/service.ts:169-331).

**Query de slots (el `activityName` y el `isSpecial` a proteger)** — :169-197:

```ts
const scheduleRows = await this.db
  .select({
    id: schema.schedules.id,
    activityId: schema.schedules.activityId,
    activityName: schema.activities.name,
    // Phase 155-01 (D-06/D-07): per-slot effective capacity source.
    activityMaxCapacity: schema.activities.maxCapacity,
    // Phase 162-01 (APP-01): special-activity flag for the member badge.
    isSpecial: schema.activities.isSpecial,
    dayOfWeek: schema.schedules.dayOfWeek,
    …
  })
  …
```

**Patrón anti-N+1 a copiar para el mapa de modos (Pitfall 5)** — :207 y :209-275: TODAS las agregaciones se precargan en Maps/Sets antes del loop, con comentario que documenta el porqué:

```ts
const holidayDates = new Set(holidaysInWeek.map((h) => h.date));

// Batch-fetch confirmed booking counts (single GROUP BY instead of N+1).
// … The bookingDate filter is essential: without it MySQL scans every
// historical booking for the branch's schedules, which timed out (>10s) in production …
const bookingCountMap = new Map<string, { bookedCount: number; trialCount: number }>();
…
for (const row of bookingCounts) {
  bookingCountMap.set(`${row.scheduleId}-${row.bookingDate}`, { … });
}
```

**Loop de slots — dónde entra la derivación** — :277-324 (`slotDate` ya está calculado, que es lo que permite resolver semana/día):

```ts
// Build slot views using the pre-fetched counts
const slots: WeeklySlotView[] = [];

for (const row of scheduleRows) {
  // Calculate the actual date for this slot in the given week
  // weekStartDate is Monday (day 1), so offset = dayOfWeek - 1
  const slotDate = addDays(weekStartDate, row.dayOfWeek - 1);
  …
  // Phase 155 (D-06/D-07, WR-02): effective per-slot cap resolved via the
  // shared pure helper (batched coalesce kept — one query per week).
  const slotCapacity = resolveEffectiveCapacity(row.activityMaxCapacity, maxCapacity);

  slots.push({
    id: row.id,
    activityName: row.activityName,     // ← punto de inserción de la etiqueta derivada
    …
    isHoliday: holidayDates.has(slotDate),
    isSpecial: row.isSpecial,           // ← guarda: no renombrar actividades especiales
  });
}
```

⚠️ Hay un **segundo** proyector con `activityName` en el mismo archivo (:960-993) — verificar si necesita la misma derivación.

**Get-or-create por literal (Pitfall 4)** — scheduling/service.ts:792-805:

```ts
// Get or create "Calistenia" activity
let [regularActivity] = await this.db
  .select({ id: schema.activities.id })
  .from(schema.activities)
  .where(eq(schema.activities.name, "Calistenia"))
  .limit(1);

if (!regularActivity) {
  const result = await this.db.insert(schema.activities).values({
    name: "Calistenia",
    description: "Clase grupal de entrenamiento funcional",
  });
  regularActivity = { id: Number(result[0].insertId) };
}
```

Gemelo en `src/db/seed-production.ts:100-124` (tres ocurrencias del literal: select, insert, re-select):

```ts
// activities has no unique constraint on name, so check-then-insert.
const existingActivity = await db.select({ id: activities.id }).from(activities)
  .where(eq(activities.name, "Calistenia")).limit(1);
if (existingActivity.length === 0) {
  await db.insert(activities).values({ name: "Calistenia", isActive: true });
  console.log("Created activity: Calistenia");
} else {
  await db.update(activities).set({ isActive: true }).where(eq(activities.name, "Calistenia"));
  …
}
const [activity] = await db.select({ id: activities.id }).from(activities)
  .where(eq(activities.name, "Calistenia")).limit(1);
if (!activity) { throw new Error("Failed to find Calistenia activity after insert"); }
```

⚠️ `seed-production.ts` usa `console.log` (script de seed, excepción histórica al estándar de logging) — **no** replicar `console.log` en código de servicio.

---

### `src/modules/tv/class-day.ts` — modo del día (service, read-model) — D-P3

**Analog:** el propio `resolveClassDay` (tv/class-day.ts:118-163). La query de `sessions` con `goal_plan_type IS NULL` ya existe **debajo** de la lectura de `day_modes` — el fix es leer el modo de esas mismas filas:

```ts
export async function resolveClassDay(
  db: MySql2Database<typeof schema>, branch: ClassDayBranch, now?: Date,
): Promise<ClassDay> {
  const date = todayInTz(branch.timezone, now);
  const dayName = dateToDayName(date);
  const week = dateToWeekNumber(date);
  …
  // 1. Modo del dia. El sabado viene seedeado como ROM desde la migracion 0080
  //    (D-23), pero se lee de `day_modes` y no se asume por el nombre del dia.
  const dayNumber = DAY_NAME_TO_NUMBER[dayName];
  let mode: TvClassMode = "regular";
  if (dayNumber) {
    const [dayModeRow] = await db
      .select({ sessionMode: schema.dayModes.sessionMode })
      .from(schema.dayModes)
      .where(eq(schema.dayModes.dayOfWeek, dayNumber));
    if (dayModeRow?.sessionMode === "rom") mode = "rom";
  }

  // 2. Sesiones aprobadas de la plani REGULAR (D-14): `goal_plan_type IS NULL`.
  //    Los goal plans son curados por socio, no son "la clase de la sede".
  const sessionRows = await db
    .select({ id: schema.sessions.id, dayId: schema.sessions.dayId })
    .from(schema.sessions)
    .where(and(
      eq(schema.sessions.week, week),
      eq(schema.sessions.day, dayName),
      eq(schema.sessions.status, "approved"),
      isNull(schema.sessions.goalPlanType),
    ));
```

→ agregar `sessionMode: schema.sessions.sessionMode` al select del paso 2 y derivar `mode` de ahí, con `day_modes` como fallback. **Cero queries nuevas.**
⚠️ **DOBLE PUSH** (staging `et-tv2` + master `et-tv-master`) — el trabajo de TV vive como dos historias separadas.

**Helpers de semana/día (fuente única, no duplicar)** — `src/modules/shared/week-dates.ts`: `WEEK_ONE_MONDAY` (:23), `dateToWeekNumber` (:29), `dateToDayName` (:41).

---

### `test/unit/combos-generator.test.ts` y `tecnica-generator.test.ts` (test unit, DB mock)

**Analog:** `test/unit/rom-generator.test.ts` (537 líneas).

**Docblock + mocks del INITIUM y del contexto** (:1-83) — copiar tal cual, cambiando los literales de día/nivel:

```ts
/**
 * Unit tests for ROM session generator
 * …
 * Uses mocked DB queries to test pure generation logic.
 * INITIUM pipeline is mocked to isolate ROM zone generation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DaySession, BlockPlan, BlockRole } from "../../src/modules/sessions/types";

const MOCK_INITIUM_BLOCK: BlockPlan = {
  blockId: "W1-sabado-alfa-INITIUM",
  role: "INITIUM" as BlockRole,
  route: "INITIUM", pattern: "FLOW", intensity: 30, repsBudget: 80,
  format: { formatId: 1, name: "Flow" },
  formatParams: { type: "standard" as const },
  exercises: [ … 4 mocks … ],
  trace: [],
};

vi.mock("../../src/modules/sessions/pipeline/initium-pipeline", () => ({
  runInitiumPipeline: vi.fn().mockResolvedValue(MOCK_INITIUM_BLOCK),
}));

vi.mock("../../src/modules/sessions/pipeline/context", () => ({
  createInitialContext: vi.fn().mockReturnValue({
    week: 1, day: "sabado", levelGroup: "alfa_delta", memberLevel: "alfa",
    blockId: "W1-sabado-alfa-INITIUM", role: "INITIUM", trace: [],
  }),
}));
```

**Mock de DB** (:267-278) — encadenado `select().from().where()`:

```ts
// Mock DB that returns exercises when queried
function createMockDb(exercises = MOCK_EXERCISES) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(exercises),
    }),
  });
  return { select: mockSelect } as unknown;
}
```

**Forma de los casos** (:280-305) — import dinámico dentro del `it`, cast por `Parameters<typeof …>[0]`, aserciones de estructura por rol:

```ts
describe("ROM Generator", () => {
  describe("generateRomSession", () => {
    it("returns DaySession with session_mode='rom', INITIUM first, then 3 ROM blocks", async () => {
      const { generateRomSession } = await import("../../src/modules/sessions/rom-generator");
      const db = createMockDb();
      const session = await generateRomSession(db as Parameters<typeof generateRomSession>[0], 1, "sabado", "alfa");

      expect(session.sessionMode).toBe("rom");
      expect(session.blocks).toHaveLength(4);
      const roles = session.blocks.map((b: BlockPlan) => b.role);
      expect(roles[0]).toBe("INITIUM");
      expect(roles).toContain("ROM_LOWER");
      expect(roles).not.toContain("ATHLOS");
    });
```

**Caso de degradación** (:441 `"succeeds with graceful fallback when pool is thin"`, con `createMockDb(thinnerPool)`) — molde para el pool fino de ruta.

🔴 **Test que NO tiene analog y es obligatorio (Pitfall 1):** generar los 6 niveles del mismo `(week, day)` y assertear que los `exerciseId` del bloque STRETCHING son idénticos. Se construye con el mismo `createMockDb`, llamando 6 veces al generador.

---

### `test/sessions/generate-modes.test.ts` (test integración, request-response)

**Analog:** `test/sessions/sessions.test.ts:1-56` (bootstrap con helpers reales contra MySQL):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";
import { createTestApp, getAuthToken, registerUser } from "../helpers";

describe("Session Routes", () => {
  let app: FastifyInstance;
  let memberToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    const reg = await registerUser(app, { email: "session-member@test.com", password: "password123", branchId: 1 });
    memberToken = await getAuthToken(app, "session-member@test.com", "password123");
    …
  });

  afterAll(async () => { await app.close(); });

  describe("GET /api/sessions/daily", () => {
    it("returns 401 without authentication", async () => {
      const res = await app.inject({ method: "GET", url: "/api/sessions/daily?date=2026-02-10" });
      expect(res.statusCode).toBe(401);
    });
```

⚠️ Los usuarios se resuelven por email (`registerUser` + `getAuthToken`), **nunca con ids hardcodeados** (regla dura del proyecto).

---

### `test/scheduling/derived-class-label.test.ts` (test integración, request-response)

**Analog:** `test/scheduling/155-horarios.test.ts:1-40` — docblock que enumera los casos mapeados a decisiones + helpers de limpieza:

```ts
/**
 * Phase 155 Plan 02: horarios — clases simultáneas (HOR-01) + cupo efectivo
 * por actividad (HOR-03) + ABM del cupo (D-08).
 *
 * Garantiza por integración el comportamiento del backend … Corre en CI contra el MySQL de test; el gate
 * local es solo tsc (no se corre el suite localmente).
 *
 * Casos:
 * Simultaneidad (D-01 / HOR-01):
 * - Solape de la MISMA actividad → 409.
 * …
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import {
  createTestApp,
  getAuthToken,
  registerUser,
  cleanAllTestData,
  dateOffsetStr,
} from "../helpers";
```

`cleanAllTestData` y `dateOffsetStr` son los helpers que este test necesita (sesiones aprobadas de una semana concreta + slots de esa semana).

---

### `test/migrations/…` (opcional pero recomendado para SEM-05)

**Analog:** `test/migrations/0196-tenant-unique-contracts.test.ts:1-45`. Su tesis aplica literal a la 0202/0203: el runner y `test/setup.ts` **toleran errores** y registran la migración igual, así que el test **no debe preguntarle a `_migrations`**, debe interrogar `INFORMATION_SCHEMA` / los datos reales:

```
 * Por eso este archivo NO le pregunta a `_migrations` si la 0196 corrió: le
 * pregunta a `INFORMATION_SCHEMA` por el resultado real —nombres de índice,
 * columnas, orden de columnas y `NON_UNIQUE`—, y exige además que los doce
 * nombres viejos hayan DESAPARECIDO. Presente lo nuevo y ausente lo viejo son
 * dos afirmaciones distintas: una migración a medias puede cumplir la primera.
 …
 *   (c) Idempotencia: la 0196 aparece exactamente una vez en `_migrations`.
```

→ para 159: (a) la unique `(tenant_id, week, day)` existe con `SEQ_IN_INDEX=1` en `tenant_id`; (b) el conteo de filas de `sessions` es idéntico antes/después (D-18, histórico intacto); (c) la fila W21–W26 relevada en el CONTEXT coincide con lo insertado.

---

## Shared Patterns

### Determinismo (aplica a: `stretching-selection.ts`, `semana-nueva-pipeline.ts`, ambos generadores)

**Source:** `src/modules/sessions/pipeline/goal-plan-pipeline.ts:44-50`
**Anti-source (prohibido copiar):** `rom-generator.ts:61-68` (`shuffleArray` con `Math.random`), `pipeline/utils/mobility-selection.ts:68`

```ts
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++)
    hash = (hash + input.charCodeAt(i) * (i + 1)) | 0;
  return Math.abs(hash);
}
```

Regla: toda selección que se repita a través de los 6 niveles debe ser función pura de `(week, day[, role])`. Si el `memberLevel` entra en el `hashInput`, D-11 se rompe.

### Trace / logging (aplica a: ambos generadores, pipeline nuevo)

**Source A (autocontenido, objeto literal):** `rom-generator.ts:111-127`
**Source B (pipeline, helper):** `goal-plan-pipeline.ts:70-82` → `createTraceEvent(ctx, "CODE", "INFO"|"WARNING"|"ERROR", { … })` + `appendTrace(ctx, evt)`

Códigos con prefijo del dominio (`ROM_BLOCK_GENERATED`, `GOAL_PLAN_ROUTE_SELECTED`, `GOAL_PLAN_SPOM_FALLBACK`) → para 159: `COMBOS_*` / `TECNICA_*` / `STRETCHING_*`.
**Nunca `console.log`** en código de servicio (CLAUDE.md #1).

### Manejo de errores (aplica a: `generateWeek`, pipeline nuevo)

**Source:** `admin/service.ts:692-696` y `goal-plan-pipeline.ts:364-374`

```ts
} catch (err: unknown) {
  failed++;
  const errorMsg = err instanceof Error ? err.message : String(err);
  warnings.push(`${dayId} (ROM): ${errorMsg}`);
}
```

Un fallo de un `dayId` no aborta la generación de la semana: se cuenta en `failed` y se acumula en `warnings`. En el pipeline, en cambio, se agrega el trace `PIPELINE_ERROR` y **se re-lanza**.

### Tenancy (aplica a: schema nuevo, migraciones, todo acceso a la tabla nueva)

**Sources:** `src/db/schema/tenant-column.ts` (definición única), `src/db/schema/day-modes.ts:9,19-22` (uso + unique por tenant), `src/db/tenant-tables.ts:51-64` (clasificación fail-closed)

Tres gates que se disparan (Pitfall 7): `test/db/tenant-tables.test.ts` (alta obligatoria en `GYM_OWNED_TABLES`), `pnpm lint:tenant` / `test/tenancy/con-06-lint.test.ts` (el acceso nuevo debe usar el patrón vigente **en master**, que NO es el strict del tren v6.0), `test/tenancy/iso-01-manifiesto.test.ts` (`ENTRADAS_BASELINE = 370`, solo si se agrega ruta HTTP — evitarlo extendiendo el body de `/generate`).

### Convenciones de migración (aplica a: 0202, 0203, 0204)

**Sources:** `0189_tv_screen.sql:1-30` (header hand-written + numeración verificada en master Y staging + advertencia del `;`), `0172_…sql:1-8` (`@data-only` en primera línea + "Idempotente: …"), `0183_backfill_lost_leads.sql:1-38` (backfill retroactivo + dry-run separado en `src/db/scripts/`)

Reglas duras heredadas del skill: nunca `drizzle-kit migrate`; nunca `;` dentro de un comentario `--`; SQL en el mismo commit que el schema; datos de prod siempre por migración; numeración = **0202** (verificada contra todas las refs, no contra el checkout local).

### Auth / access control (aplica a: `/generate`)

**Source:** `src/modules/admin/routes.ts:64-73`

```ts
// exclusive training coach only (see canAccessTraining).
fastify.addHook("onRequest", async (request, reply) => {
  …
  if (!canAccessTraining(request.user)) { … }
```

Heredado por todo el plugin admin — los cambios de 159 **no escriben una sola línea de auth**.

### Anti-N+1 en read models (aplica a: etiqueta derivada del horario)

**Source:** `scheduling/service.ts:207` (Set de feriados), `:209-275` (GROUP BY único con comentario del timeout de prod), `:295-300` (helper puro + "one query per week")

Toda agregación se precarga en un `Map`/`Set` **antes** del loop de slots, con un comentario que documenta por qué.

---

## No Analog Found

| Archivo / pieza                                          | Rol       | Data Flow | Razón                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0202_session_week_regime.sql` (parte tenancy del DDL)   | migration | batch     | En master no existe ninguna `CREATE TABLE` posterior a la tanda de tenancy (última: `0190_tenants_core.sql`; 0192-0195 son ALTERs). Es la **primera tabla gym-owned que nace con `tenant_id`** → componer: DDL de `0189_tv_screen.sql` + contrato de `tenant-column.ts` + unique compuesta estilo 0196. |
| Detector de firmas W12–W26 (script TS de SEM-05)         | script    | batch     | No hay analog de "script de análisis que produce literales para una migración". Lo más cercano: `src/db/scripts/0183_backfill_lost_leads_dryrun.sql` (dry-run SQL) y `src/db/scripts/verify-tenant-backfill.ts` (verificador TS). Usar RESEARCH §Hallazgo 8 como spec.                                  |
| Test de determinismo de STRETCHING a través de 6 niveles | test      | transform | Ningún test del repo compara la salida de N generaciones del mismo día. Se construye con el `createMockDb` de `rom-generator.test.ts:268-278` llamando 6 veces al generador.                                                                                                                            |

---

## Metadata

**Analog search scope:** `el-templo-api/src/modules/{sessions,admin,scheduling,tv,goal-plans,shared}`, `el-templo-api/src/db/{schema,migrations,scripts}`, `el-templo-api/test/{unit,sessions,scheduling,migrations,tenancy,db}` — todo leído de `origin/master`
**Files scanned:** 28 (18 leídos en detalle, 10 por grep dirigido)
**Pattern extraction date:** 2026-08-13
**⚠️ Invalidación:** si el tren v6.0 (fases 173/174/174.1/175) mergea a master antes de ejecutar, cambian (a) la numeración de migraciones, (b) el patrón de tenancy vigente en `modules/sessions` y `modules/scheduling` (pasa a strict con `tenantWhere`/`assertTenant`), (c) `ENTRADAS_BASELINE`. Re-verificar los tres antes de ejecutar.
