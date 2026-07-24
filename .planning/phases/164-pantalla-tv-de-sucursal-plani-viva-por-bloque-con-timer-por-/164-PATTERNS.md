# Phase 164: Pantalla TV de sucursal — plani viva por bloque - Pattern Map

**Mapped:** 2026-07-24
**Files analyzed:** 31 new/modified files
**Analogs found:** 27 / 31 (4 sin analog real — ver "No Analog Found")

> Fuente del listado de archivos: `164-CONTEXT.md` (D-01..D-24) + `164-RESEARCH.md`
> ("Estructura recomendada", líneas 291-334, y "Wave 0 Gaps").
> Este documento NO reabre decisiones: solo dice **de qué archivo se copia cada patrón**.

---

## File Classification

### Backend — `el-templo-api`

| New/Modified File                                  | Role                 | Data Flow            | Closest Analog                                                                 | Match Quality     |
| -------------------------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `src/db/schema/tv.ts` (new)                        | model (schema)       | —                    | `src/db/schema/refresh-tokens.ts`                                              | exact             |
| `src/db/schema/index.ts` (mod)                     | barrel/config        | —                    | itself (append `export * from "./tv"`)                                         | exact             |
| `src/db/migrations/0189_tv_screen.sql` (new)       | migration            | —                    | `0188_bookings_trial_date_index.sql` + `0185_users_branch_change_tracking.sql` | exact             |
| `src/modules/tv/index.ts` (new)                    | barrel               | —                    | `src/modules/coach/index.ts`                                                   | exact             |
| `src/modules/tv/device-auth.ts` (new)              | middleware (hook)    | request-response     | `src/modules/coach/routes.ts:24-33` + `refresh-token-service.ts` hash          | role-match        |
| `src/modules/tv/device-routes.ts` (new)            | route/controller     | polling read (2.5 s) | `src/modules/coach/routes.ts`                                                  | role-match        |
| `src/modules/tv/control-routes.ts` (new)           | route/controller     | request-response (W) | `src/modules/coach/routes.ts` + `shared/branch-access.ts`                      | exact             |
| `src/modules/tv/pairing.ts` (new)                  | service              | CRUD one-shot        | `src/modules/auth/refresh-token-service.ts`                                    | exact             |
| `src/modules/tv/service.ts` (new)                  | service              | read + upsert        | `src/modules/admin/service.ts::getDaySessionDetails`                           | role-match        |
| `src/modules/tv/class-day.ts` (new)                | service (resolver)   | batch read           | `src/modules/sessions/routes.ts:456-507`                                       | exact             |
| `src/modules/tv/roster.ts` (new)                   | utility (pure)       | transform            | `el-templo-admin/src/utils/pdf/session-data-transformer.ts:19-40, 284-291`     | exact (cross-app) |
| `src/modules/tv/timer-spec.ts` (new)               | utility (pure)       | transform            | `src/modules/admin/format-params.ts::formatParamsLabel`                        | exact             |
| `src/modules/tv/schemas.ts` (new)                  | config (JSON Schema) | —                    | `src/modules/sessions/schemas.ts`                                              | exact             |
| `src/modules/tv/types.ts` (new)                    | types                | —                    | `src/modules/coach/types.ts` (shape trivial)                                   | role-match        |
| `src/app.ts` (mod)                                 | config (wiring)      | —                    | `src/app.ts:216-240` (registro de `coachRoutes` / `coachLoadRoutes`)           | exact             |
| `src/modules/shared/permissions.ts` (mod)          | config (RBAC)        | —                    | `permissions.ts:115-118, 241` (composición core + override)                    | exact             |
| `src/modules/shared/week-dates.ts` (new, opcional) | utility (pure)       | transform            | `src/modules/sessions/routes.ts:69-80` (extraer, no duplicar)                  | exact             |

### Tests — `el-templo-api/test/tv/`

| New/Modified File                      | Role         | Data Flow  | Closest Analog                                 | Match Quality |
| -------------------------------------- | ------------ | ---------- | ---------------------------------------------- | ------------- |
| `test/tv/tv-pairing.test.ts` (new)     | test (integ) | req-resp   | `test/coach/outstanding-balances.test.ts`      | exact         |
| `test/tv/tv-device-poll.test.ts` (new) | test (integ) | polling    | idem                                           | exact         |
| `test/tv/tv-control.test.ts` (new)     | test (integ) | req-resp   | idem                                           | exact         |
| `test/tv/tv-class-day.test.ts` (new)   | test (integ) | batch read | `test/sessions/sessions-gating.test.ts` + idem | role-match    |
| `test/tv/tv-timer-spec.test.ts` (new)  | test (unit)  | transform  | `test/rbac-sets.test.ts` (unit puro, sin app)  | exact         |
| `test/helpers.ts` (mod)                | test helper  | —          | `test/helpers.ts:144-225` (TABLES_TO_CLEAN)    | exact         |

### Frontend kiosco — `el-templo-admin` (fuera del SPA)

| New/Modified File                    | Role                    | Data Flow | Closest Analog                                      | Match Quality            |
| ------------------------------------ | ----------------------- | --------- | --------------------------------------------------- | ------------------------ |
| `src/tv/tv.ts` (new)                 | app standalone (ES2015) | polling   | **ninguno** — ver No Analog Found                   | none                     |
| `src/tv/timer.ts` (new)              | utility (pure)          | transform | `src/modules/tv/timer-spec.ts` (port 1:1)           | exact (por construcción) |
| `src/tv/tsconfig.tv.json` (new)      | config                  | —         | **ninguno** — ver No Analog Found                   | none                     |
| `scripts/build-tv.mjs` (new)         | build script (node)     | file-I/O  | `scripts/copy-ffmpeg.mjs`                           | exact                    |
| `package.json` (mod: `build` script) | config                  | —         | `package.json:9-15` (`postinstall` encadena script) | exact                    |
| `.gitignore` (mod: `/public/tv`)     | config                  | —         | `el-templo-admin/.gitignore` ("Build output")       | exact                    |

### Frontend SPA — `el-templo-admin`

| New/Modified File                            | Role       | Data Flow        | Closest Analog                                                  | Match Quality |
| -------------------------------------------- | ---------- | ---------------- | --------------------------------------------------------------- | ------------- |
| `src/composables/useTvApi.ts` (new)          | composable | request-response | `src/composables/useFinanceLoadApi.ts`                          | exact         |
| `src/pages/TvControlPage.vue` (new)          | page (Vue) | request-response | `src/pages/DeudasPage.vue` (selector de sede + rol)             | role-match    |
| `src/pages/TvDevicesPage.vue` (new)          | page (Vue) | CRUD listado     | `src/pages/AppWaitlistPage.vue` (loading/error/empty/table)     | exact         |
| `src/router/routes.ts` (mod)                 | config     | —                | `routes.ts:28-33` (`meta.public`) + `:44-48` (`allowedRoles`)   | exact         |
| `src/utils/pdf/quotes.ts` (new, extract)     | constants  | —                | `src/utils/pdf/session-pdf-builder.ts:205-250` (mover tal cual) | exact         |
| `src/utils/pdf/session-pdf-builder.ts` (mod) | refactor   | —                | idem (importa desde `quotes.ts`)                                | exact         |

### Docs

| New/Modified File                        | Role | Data Flow | Closest Analog      | Match Quality |
| ---------------------------------------- | ---- | --------- | ------------------- | ------------- |
| `deploy/TV-KIOSK-RUNBOOK.md` (new, D-21) | doc  | —         | `deploy/RUNBOOK.md` | exact         |

---

## Pattern Assignments

### `src/db/schema/tv.ts` (model, schema)

**Analog:** `el-templo-api/src/db/schema/refresh-tokens.ts` (fase 116 — mismo modelo de token opaco)

**Imports + tabla con token hash** (`refresh-tokens.ts:1-49`):

```ts
// Module: refresh-tokens — phase 116
import {
  mysqlTable,
  int,
  varchar,
  timestamp,
  index,
  type AnyMySqlColumn,
} from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_refresh_tokens_user_id").on(table.userId)],
);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
```

**Qué copiar literalmente:** `varchar("token_hash", { length: 64 }).notNull().unique()`, el
`revokedAt: timestamp("revoked_at")` nullable, el `createdAt` con `defaultNow().notNull()`,
el `index(...)` en el array-form del segundo argumento, y el bloque `relations()` al final.
**Qué cambia (D-03):** `tv_devices` NO lleva `expiresAt`; lleva `isActive: boolean("is_active").default(true).notNull()`
y `lastSeenAt: timestamp("last_seen_at")` (D-05).

**Docblock de seguridad a replicar** (`refresh-tokens.ts:13-31`): el header explica _por qué_
solo se persiste el sha256. El schema de TV debe llevar el mismo tipo de comentario
(RESEARCH Pitfall 9 exige además documentar el `fsp: 3` como primer uso del repo).

**Barrel** (`el-templo-api/src/db/schema/index.ts`, últimas líneas):

```ts
export * from "./refresh-tokens";
export * from "./user-status-history";
export * from "./campaigns";
export * from "./class-coach-assignments";
export * from "./coach-ratings";
```

→ agregar `export * from "./tv";`. Sin esto `schema.tvDevices` es `undefined` en runtime
(RESEARCH Runtime State Inventory).

---

### `src/db/migrations/0189_tv_screen.sql` (migration)

**Analog:** `0188_bookings_trial_date_index.sql` (header narrativo) + `0185_users_branch_change_tracking.sql` (DDL multi-columna)

**Header pattern** (0188, verbatim — nótese: **cero `;` dentro de los comentarios `--`**):

```sql
-- Fix: trials dialog (SesionesDePruebaDialog) timed out (>10s) in prod.
-- ...
-- NOTE the physical column is booking_status (mysqlEnum first arg), even
-- though the TS property is status -- same as the sibling index in mig 0035.
-- Hand-written (db:generate is broken by pre-existing drift, see skill
-- el-templo-db-migrations). No semicolons in comments (parser splits on them).
-- Index-only, no data.
CREATE INDEX `idx_bookings_trial_date_status` ON `bookings` (`is_trial`, `booking_date`, `booking_status`);
```

**DDL pattern** (0185:7-9):

```sql
ALTER TABLE users
  ADD COLUMN branch_updated_at TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN branch_source ENUM('manual', 'auto') NULL DEFAULT NULL;
```

**⚠ Verificación obligatoria antes de escribir el archivo (C-05):** el checkout actual
(`fix/referral-preview-y-refresh-ficha`) tiene como máximo **0181** en
`el-templo-api/src/db/migrations/`, pero `origin/master` ya tiene **0188** y
`origin/staging` tiene además `0186_wellhub_integration.sql`. El planner DEBE hacer que la
tarea arranque desde una rama basada en `origin/master` actualizado y re-verificar con
`git ls-tree --name-only origin/master el-templo-api/src/db/migrations/ | sort | tail -3`.
Escribir 0182 desde este checkout sería una colisión garantizada.

---

### `src/modules/tv/pairing.ts` + `device-auth.ts` (service + middleware)

**Analog primario:** `el-templo-api/src/modules/auth/refresh-token-service.ts` (fase 116)

**Imports + DI por constructor** (`refresh-token-service.ts:22-49`):

```ts
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import * as schema from "../../db/schema";

export class RefreshTokenService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}
```

**Hash + generación del token opaco** (`:51-59`) — **copiar tal cual**, es el patrón exigido
por el RESEARCH (Pattern 1) tanto para el `device_token` como para el `device_code`:

```ts
  /** sha256 hex of the plaintext token. The plaintext is never persisted. */
  private hash(plain: string): string {
    return createHash("sha256").update(plain).digest("hex");
  }

  /** Generate a fresh opaque token plaintext (256 bits, url-safe). */
  private generatePlain(): string {
    return randomBytes(32).toString("base64url");
  }
```

**Emitir + devolver el plaintext una sola vez** (`:70-78`):

```ts
  async issue(userId: number): Promise<string> {
    const plain = this.generatePlain();
    await this.db.insert(schema.refreshTokens).values({
      userId,
      tokenHash: this.hash(plain),
      expiresAt: this.expiry(),
    });
    return plain; // única vez que el caller lo ve
  }
```

**Lookup por hash** (`:80-87`):

```ts
  private async findByPlain(plain: string): Promise<RefreshTokenRow | null> {
    const [row] = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, this.hash(plain)))
      .limit(1);
    return row ?? null;
  }
```

**Consumo one-shot / idempotente vía `UPDATE` condicional** (`:150-160` — `revoke()`).
Es exactamente la forma que el RESEARCH (Pattern 2, Pitfall 10) pide para el claim del
pairing: un solo `UPDATE ... WHERE claimed_at IS NULL`, nunca `SELECT` + `UPDATE`:

```ts
  async revoke(plainToken: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(schema.refreshTokens.tokenHash, this.hash(plainToken)),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }
```

**Logging de rutas fallidas a `warn` (no `error`)** — `refresh-token-service.ts:105, 112, 121`
usa `this.log.warn(...)` explícitamente "to avoid Sentry spam". Un TV revocado que sigue
polleando generaría un 401 cada 2.5 s: **mismo criterio, `warn` nunca `error`**.

**Error tipado + mapeo a 401** (`:35-41`):

```ts
export class RefreshTokenError extends Error {
  readonly code = "REFRESH_INVALID" as const;
  constructor(message = "Refresh token invalido") {
    super(message);
    this.name = "RefreshTokenError";
  }
}
```

---

### `src/modules/tv/device-routes.ts` y `control-routes.ts` (routes)

**Analog:** `el-templo-api/src/modules/coach/routes.ts` (59 líneas — módulo completo, gate a nivel plugin)

**Archivo entero como plantilla** (`coach/routes.ts:13-58`):

```ts
import { FastifyPluginAsync } from "fastify";
import { CoachService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { coachOutstandingBalancesSchema } from "./schemas";
import { COACH_DEBTS_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import type { CoachOutstandingBalancesFilters } from "./types";

export const coachRoutes: FastifyPluginAsync = async (fastify) => {
  const coachService = new CoachService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(COACH_DEBTS_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.get<{ Querystring: { search?: string } }>(
    "/outstanding-balances",
    { schema: coachOutstandingBalancesSchema },
    async (request, reply) => {
      try {
        const filters: CoachOutstandingBalancesFilters = {
          search: request.query.search,
        };
        return await coachService.getOutstandingBalances(filters, {
          role: request.scope.role,
          isOwner: request.scope.isOwner,
          country: request.scope.country,
          branchIds: request.scope.branchIds,
        });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get coach outstanding balances",
        );
      }
    },
  );
};
```

**Cómo se adapta:**

- `control-routes.ts` = este archivo casi verbatim, cambiando `COACH_DEBTS_ROLES` por el set
  nuevo (`TV_CONTROL_ROLES`, D-01 = owner + coach) y agregando el `preHandler` de sede.
- `device-routes.ts` = **mismo esqueleto pero el hook NO llama `fastify.authenticate`**:
  llama al `deviceAuth` propio (token `Authorization: Device <token>`) y **no** llama
  `attachCountryScope` (el TV no es un user; su `branchId` sale de la fila, nunca del request
  — RESEARCH Security Domain V4).
- El `try/catch (err: unknown)` + `handleServiceError(err, reply, request.log, "<contexto>")`
  va en **todos** los handlers.

**Barrel del módulo** (`el-templo-api/src/modules/coach/index.ts`, archivo de 1 línea):

```ts
export { coachRoutes } from "./routes";
```

**Registro en `app.ts`** (`app.ts:216-240` — copiar incluso el estilo del comentario
explicando por qué son dos plugins separados con guards distintos):

```ts
// Coach routes (simplified Deudas tab for professors at the door)
await app.register(coachRoutes, {
  prefix: "/api/admin/coach",
});

// Phase 140 — coach PoS load plugin. SEPARATE registration (its own
// FINANCE_LOAD_ROLES guard) so the finance module's FINANCE_READ_ROLES hook
// (coach excluded) never blocks the coach load endpoints.
await app.register(coachLoadRoutes, {
  prefix: "/api/admin/finance/coach-load",
});
```

→ El módulo TV necesita **dos registros separados** por la misma razón (guards
incompatibles): `tvDeviceRoutes` en `/api/tv` (device token) y `tvControlRoutes` en
`/api/admin/tv` (JWT staff).

---

### `src/modules/shared/permissions.ts` (mod — set de roles nuevo)

**Analog:** el propio archivo, `permissions.ts:115-118` y `:241`

**Composición core + override (patrón obligatorio, D-06 del proyecto):**

```ts
export const COACH_DEBTS_ROLES = [
  ...TEMPLO_RBAC_OVERRIDES.deudas,
  ...ADMIN_ROLES,
] as const;

// ...

export const FINANCE_LOAD_ROLES = [...FINANCE_WRITE_ROLES, "coach"] as const;
```

**Cómo aplica (D-01 = Dueño + coaches):** `export const TV_CONTROL_ROLES = [...ADMIN_ROLES, "coach"] as const;`
con docblock explicando el alcance (qué NO habilita). El uso en el hook es siempre con el
cast `(TV_CONTROL_ROLES as readonly string[]).includes(request.user.role)`.

**Test que lo vigila** — `test/rbac-sets.test.ts:1-30` (unit puro, sin app ni MySQL):

```ts
import { describe, it, expect } from "vitest";
import {
  CAJA_ROLES,
  COACH_DEBTS_ROLES /* ... */,
} from "../src/modules/shared/permissions";

describe("RBAC sets — core white-label + Templo overrides", () => {
  it("COACH_DEBTS_ROLES stays byte-identical (composed deudas-override + core)", () => {
    expect([...COACH_DEBTS_ROLES]).toEqual([
      "coach",
      "gestion",
      "admin",
      "owner",
    ]);
  });
});
```

→ agregar un `it()` para `TV_CONTROL_ROLES` en ese mismo archivo.

---

### `src/modules/tv/class-day.ts` (service — resolución de la sesión del día)

**Analog:** `el-templo-api/src/modules/sessions/routes.ts:456-507` (handler de `GET /sessions/daily`)

**Semana + día + ROM + candidatos + 404** (`sessions/routes.ts:456-507`):

```ts
// 4. Derive week number from the requested date
const week = dateToWeekNumber(date);
// 5. Convert date to day of week
const dayName = dateToDayName(date);

// Skip Sundays (domingo) - no sessions
if (dayName === "domingo") {
  return reply.status(400).send({ error: "No hay sesiones los domingos" });
}

// 6. Check if this day is a ROM day and map level accordingly (per D-29)
const dayNumber = DAY_NAME_TO_NUMBER[dayName];
let effectiveLevel: string = memberLevel;
if (dayNumber) {
  const [dayModeRow] = await fastify.db
    .select()
    .from(schema.dayModes)
    .where(eq(schema.dayModes.dayOfWeek, dayNumber));
  if (dayModeRow?.sessionMode === "rom") {
    effectiveLevel =
      memberLevel === "alfa" || isKairos(memberLevel) ? "alfa" : "delta";
  }
}

// 8. Check DB for approved sessions only (no auto-generation for members).
const found = await sessionService.getSessionsByDayIds(candidates, true);
const session = candidates.map((id) => found.get(id)).find(Boolean);
if (!session) {
  return reply.status(404).send({
    error: "Sesion no disponible",
    message: "La sesion para este dia aun no ha sido aprobada",
  });
}
```

**Cómo se adapta:**

- **Lo que se copia:** la detección de día ROM leyendo `schema.dayModes` por `dayOfWeek`
  (D-23 / Pitfall 2), y el uso de `getSessionsByDayIds(candidates, true)` con el flag
  `approvedOnly = true`.
- **Lo que cambia:** la fecha NO viene del query — sale de `todayInTz(branch.timezone)`
  (ver Shared Pattern "TZ por sede"). Y el 404 se convierte en `screen: "idle"` sin campo
  de error para el device (D-09); el 404/flag explícito queda solo para
  `GET /control/context` (D-10).

**Semana SPOM** (`sessions/routes.ts:69-80` — hoy **duplicado** en
`el-templo-admin/src/utils/weekDates.ts`; el RESEARCH pide extraerlo a `modules/shared/`
en vez de crear una tercera copia):

```ts
const WEEK_ONE_MONDAY = new Date("2026-02-23T00:00:00");

function dateToWeekNumber(date: string): number {
  const d = new Date(date + "T00:00:00");
  const diffMs = d.getTime() - WEEK_ONE_MONDAY.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.max(1, Math.min(52, week));
}
```

---

### `src/modules/tv/service.ts` (service — batch del día multi-nivel)

**Analog:** `el-templo-api/src/modules/admin/service.ts:316-393` (`getDaySessionDetails`)

**Batch de 3 niveles (sesiones → bloques → prescripciones), sin N+1** (`admin/service.ts:329-392`):

```ts
const sessions = await this.db
  .select()
  .from(schema.sessions)
  .where(and(...conditions));
if (sessions.length === 0) return [];

// 2. Batch fetch all blocks for all sessions
const sessionIds = sessions.map((s) => s.id);
const allBlocks = await this.db
  .select()
  .from(schema.sessionBlocks)
  .where(inArray(schema.sessionBlocks.sessionId, sessionIds))
  .orderBy(asc(schema.sessionBlocks.sortOrder));

// 3. Batch fetch all prescriptions for all blocks
const blockIds = allBlocks.map((b) => b.id);
const allPrescriptions =
  blockIds.length > 0
    ? await this.db
        .select({
          id: schema.sessionPrescriptions.id,
          blockId: schema.sessionPrescriptions.blockId,
          exerciseId: schema.sessionPrescriptions.exerciseId,
          exerciseName: schema.sessionPrescriptions.exerciseName,
          // ...
          exerciseRoute: schema.exercises.route,
        })
        .from(schema.sessionPrescriptions)
        .leftJoin(
          schema.exercises,
          eq(schema.sessionPrescriptions.exerciseId, schema.exercises.id),
        )
        .where(inArray(schema.sessionPrescriptions.blockId, blockIds))
        .orderBy(asc(schema.sessionPrescriptions.sortOrder))
    : [];

// 4/5. Group prescriptions by blockId, blocks by sessionId (Map)
const prescriptionsByBlock = new Map<number, typeof allPrescriptions>();
for (const p of allPrescriptions) {
  const list = prescriptionsByBlock.get(p.blockId) ?? [];
  list.push(p);
  prescriptionsByBlock.set(p.blockId, list);
}
```

**Qué agregar sobre el analog (RESEARCH "Don't Hand-Roll"):** el filtro
`eq(schema.sessions.status, "approved")` en `conditions`, y `videoUrl: schema.exercises.videoUrl`
en el `.select()` del leftJoin (mismo leftJoin ya existente a `exercises`) para alimentar
`assembleVideoUrl()`.

**⚠ Trampa Drizzle documentada en la memoria del proyecto:** las columnas del `.select()`
van **calificadas** (`schema.tabla.columna`), nunca sueltas — ver
`reference_drizzle_select_unqualified_columns.md`. El analog ya lo hace correctamente.

---

### `src/modules/tv/roster.ts` (utility pura — orden canónico por rol)

**Analog:** `el-templo-admin/src/utils/pdf/session-data-transformer.ts:19-40` y `:284-291`
(cross-app: la lógica hoy vive en el admin y hay que **portarla al API**, no reimplementarla)

**Orden canónico + fuente determinista del INITIUM** (`session-data-transformer.ts:19-40`) —
copiar **también el comentario**, que es la justificación de Pitfall 1:

```ts
const LEVEL_ORDER = ["alfa", "delta", "sigma", "kairos"];

// INITIUM es el calentamiento compartido del día: se imprime UNA vez para todos
// los niveles. Desde el fix de generación post-v5.1 sale idéntico en todas las
// sesiones, pero semanas viejas o ediciones manuales pueden divergir — por eso
// la fuente se elige con orden determinista (alfa = canónico) en vez de tomar
// la primera sesión que llegue del API (orden de filesort, no garantizado).
const INITIUM_SOURCE_ORDER = ["alfa", "delta", "sigma", "kairos"];

/** Pick the canonical INITIUM block: first level in INITIUM_SOURCE_ORDER that has one. */
function findInitiumBlock(sessions: SessionDetail[]): SessionBlock | undefined {
  const byLevel = new Map(sessions.map((s) => [s.memberLevel, s]));
  for (const level of INITIUM_SOURCE_ORDER) {
    const block = byLevel.get(level)?.blocks.find((b) => b.role === "INITIUM");
    if (block) return block;
  }
  // Fallback: any session with an INITIUM (covers levels outside the list)
  for (const s of sessions) {
    const block = s.blocks.find((b) => b.role === "INITIUM");
    if (block) return block;
  }
  return undefined;
}
```

**Lookup por rol con el alias EPIKOS/ATHLOS** (`session-data-transformer.ts:284-291`) —
si esto no se copia, el último bloque desaparece del TV en las sesiones que usan ATHLOS:

```ts
/**
 * Find a block by role from a session's blocks.
 * For EPIKOS/ATHLOS, checks both roles.
 */
function findBlock(
  blocks: SessionBlock[],
  role: string,
): SessionBlock | undefined {
  if (role === "EPIKOS") {
    return blocks.find((b) => b.role === "EPIKOS" || b.role === "ATHLOS");
  }
  return blocks.find((b) => b.role === role);
}
```

---

### `src/modules/tv/timer-spec.ts` (utility pura — FormatParams → TimerSpec)

**Analog:** `el-templo-api/src/modules/admin/format-params.ts` (la unión discriminada y su switch exhaustivo)

**Forma de la unión** (`format-params.ts:15-40`):

```ts
export type FormatParams =
  // ── Time-based ──────────────────────────────────────────────────────────
  | { type: "amrap"; minutes: number }
  | { type: "amrap_series"; minutes: number; rounds: number }
  | { type: "emom"; intervalSeconds: number; totalMinutes: number }
  | { type: "tabata"; workSeconds: number; restSeconds: number; rounds: number }
  | {
      type: "interval";
      workSeconds: number;
      restSeconds: number;
      rounds: number;
    }
  | { type: "hiit"; workSeconds: number; restSeconds: number; rounds: number }
  | { type: "time_cap"; minutes: number }
  | { type: "every_x_seconds"; intervalSeconds: number; totalMinutes: number }
  | { type: "on_the_x"; intervalSeconds: number; rounds: number }
  | { type: "for_time"; timeCapMinutes?: number };
// ...
```

**Cierre exhaustivo del switch** (`format-params.ts:710-714`) — **este es el patrón clave**:
garantiza que agregar un formato nuevo al catálogo rompa la compilación de `toTimerSpec()`
en vez de degradar silenciosamente:

```ts
    default: {
      const _exhaustive: never = params;
      return String((_exhaustive as { type: string }).type || "Unknown");
    }
```

**Nota de agrupación (DRY, RESEARCH Pattern 5):** `tabata`, `interval` y `hiit` tienen la
**misma forma exacta** (`workSeconds/restSeconds/rounds`) → una sola rama con fall-through
de `case`, como hace `levelToLevelGroup` en `sessions/routes.ts:41-58`:

```ts
function levelToLevelGroup(level: string): LevelGroup {
  switch (level) {
    case "kairos":
    case "alfa":
    case "delta":
      return "alfa_delta";
    // ...
  }
}
```

---

### `src/modules/tv/schemas.ts` (config — JSON Schema)

**Analog:** `el-templo-api/src/modules/sessions/schemas.ts:3-24`

**Schema + interfaz tipada emparejadas** (el repo declara siempre las dos, en el mismo archivo):

```ts
export const getDailySessionSchema = {
  querystring: {
    type: "object",
    required: ["date"],
    properties: {
      date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      level: {
        type: "string",
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
      },
      view: { type: "string", enum: ["templo", "program"] },
    },
  },
};

export interface GetDailySessionInput {
  date: string;
  level?: "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan";
  view?: "templo" | "program";
}
```

**Cómo aplica (RESEARCH Security V5):** `level` y `blockRole` como `enum`; `exerciseIndex`
como `{ type: "integer", minimum: 0 }`; `userCode` con `pattern` del alfabeto elegido
(`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`), igual que el `pattern` de fecha del analog.

---

### `test/tv/*.test.ts` (tests de integración)

**Analog:** `el-templo-api/test/coach/outstanding-balances.test.ts`

**Header + imports** (`:1-27`):

```ts
/**
 * Integration tests for the coach-facing Deudas tab.
 *
 * Endpoint: GET /api/admin/coach/outstanding-balances
 *
 * Coverage:
 *  - Coach sees aggregated debts of members in their assigned branch(es).
 *  - ...
 *
 * Runs against the per-worker test MySQL DB (eltemplo_test_<POOL_ID>).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  cleanAllTestData,
  createStaffUser,
  getAuthToken,
  registerUser,
} from "../helpers";
import * as schema from "../../src/db/schema";

const URL = "/api/admin/coach/outstanding-balances";
```

**Sufijos únicos para `code` de sede** (`:29-35`) — necesario porque los tests comparten
la DB del worker:

```ts
function nextSuffix(prefix: string): string {
  const t = Date.now().toString(36).slice(-5);
  const r = Math.floor(Math.random() * 1000)
    .toString(36)
    .padStart(2, "0");
  return `${prefix}${t}${r}`;
}
```

**Ciclo de vida + inject autenticado** (`:211-238`):

```ts
describe("GET /api/admin/coach/outstanding-balances", () => {
  let app: FastifyInstance;
  let ctx: SeededContext;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => {
    await cleanAllTestData(app);
    await app.db.delete(schema.balances);
    ctx = await seedFixtures(app);
  });

  it("coach lists aggregated debts of members in their branch", async () => {
    const res = await app.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${ctx.coachArToken}` },
    });
```

→ Para `device-routes` el header cambia a `{ authorization: \`Device ${deviceToken}\` }`.

**Fixture de sede AR/ES en el seed** (`:49-68`) — copiar para el test de TZ (D-07 con
`Europe/Madrid`, RESEARCH Test Map):

```ts
const [ar] = await app.db
  .insert(schema.branches)
  .values({
    name: "AR-Coach-Test",
    code: nextSuffix("ARCO"),
    country: "AR",
    isVirtual: false,
    isActive: true,
  })
  .$returningId();
```

**Staff con rol + user_branches automático** (`test/helpers.ts:426-479`) — `createStaffUser`
ya inserta la fila en `user_branches` para coach/recepción, que es lo que hace pasar
`canAccessBranch` Rule 4:

```ts
if (data.role === "coach" || data.role === "recepcion") {
  await app.db
    .insert(schema.userBranches)
    .values({ userId: result.id, branchId: data.branchId });
}
```

**Token JWT** (`test/helpers.ts:59-74`): `getAuthToken(app, email, password)` → `POST /api/auth/login`.

**`TABLES_TO_CLEAN` (mod obligatoria — Pitfall 11)** (`test/helpers.ts:144-225`): lista
explícita, con comentario por grupo. Agregar antes de las "Core entity tables":

```ts
  schema.memberLogins,
  schema.refreshTokens,
  schema.userStatusHistory,
```

→ insertar `schema.tvClassState, schema.tvDevices` (y `schema.tvPairings` si es tabla aparte)
en ese bloque, con un comentario del estilo del resto ("Fase 164: estado del TV por sede —
sin limpiar se filtra entre archivos de test").

**Test unitario puro (para `timer-spec`)** — analog `test/rbac-sets.test.ts:1-22`: solo
`describe/it/expect` + import del módulo, **sin** `createTestApp` ni MySQL.

---

### `src/composables/useTvApi.ts` (composable admin)

**Analog:** `el-templo-admin/src/composables/useFinanceLoadApi.ts` (fase 140 — el más reciente del repo)

**Header con las reglas del proyecto declaradas** (`:1-23`):

```ts
/**
 * Coach PoS "Pagos" API composable (Phase 140, Wave 3).
 *
 * Thin wrapper over the Wave 2 coach-load plugin ...
 *
 * Per CLAUDE.md: the composable registers NO Vue unmount hook (callers own the
 * lifecycle and call `cleanup()`); no `console.*` (use createLogger if needed);
 * no `any`.
 */

import { ref } from "vue";
import { api } from "src/boot/axios";
import { extractError } from "src/utils/extract-error";
```

**Cuerpo de un método (loading/error/try/catch/finally)** (`:160-207`):

```ts
export function useFinanceLoadApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getAutocompletar(userId: number): Promise<AutocompletarResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AutocompletarResult>(
        `/admin/finance/coach-load/autocompletar/${userId}`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el plan del socio');
      throw err;
    } finally {
      loading.value = false;
    }
  }
```

**`cleanup()` + return** (`:301-316`) — C-14 lo exige, sin `onUnmounted` adentro:

```ts
  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getAutocompletar, payPlan, /* ... */ cleanup };
}
```

**Interfaces de request/response en el mismo archivo** (`:27-158`), documentadas con el
decision-id que las justifica (`/** Phase 151 (COBRO-04): ... */`). Para TV: `TvClassContext`,
`TvStateWrite`, `TvDeviceRow`, etc. — y **cada write devuelve el estado nuevo completo**
(RESEARCH Summary §3, control ciego D-13).

---

### `src/pages/TvControlPage.vue` (página del profe)

**Analog:** `el-templo-admin/src/pages/DeudasPage.vue` (selector de sede + gating por rol + composable)

**Selector en el header + gating** (`DeudasPage.vue:7-20`):

```vue
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Deudas</div>
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
        />
      </div>
    </div>
```

**Carga del catálogo de sedes** (`DeudasPage.vue:129-145`) — **usar este helper, no una
llamada nueva** (D-11 arranca en la sede del profe con selector para cambiar):

```ts
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: "Todas las sedes", value: undefined },
]);

async function fetchBranches(): Promise<void> {
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = [
      { label: "Todas las sedes", value: undefined },
      ...branches.map((b: BranchOption) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    log.error("Error fetching branches", { error: message });
  }
}
```

**Setup imports + logger + rol** (`DeudasPage.vue:68-97`):

```ts
import { ref, computed, watch, onMounted } from "vue";
import { useAuthStore } from "src/stores/useAuthStore";
import { useMembersApi } from "src/composables/useMembersApi";
import { createLogger } from "src/utils/logger";
import type { BranchOption } from "src/types/member";

const log = createLogger("DeudasPage");
const authStore = useAuthStore();
const isOwner = computed(() => authStore.user?.role === "owner");
```

**Nota de alcance (D-13):** el analog aporta el **chasis** (selector de sede, gating, logger,
composable, `onMounted`). La botonera GRANDE en secciones BLOQUES / NIVELES / EJERCICIO /
TIMER no tiene analog en el repo — es UI nueva; el UI-SPEC manda ahí.

---

### `src/pages/TvDevicesPage.vue` (vinculación + monitoreo, D-05)

**Analog:** `el-templo-admin/src/pages/AppWaitlistPage.vue` (178 líneas — listado simple con estados)

**Template completo con los 4 estados (loading / error / empty / table)** (`AppWaitlistPage.vue:1-46`):

```vue
<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <h4 class="q-mt-none q-mb-none">App Waitlist</h4>
      <q-space />
      <q-btn
        v-if="entries.length > 0"
        icon="download"
        label="Exportar CSV"
        color="primary"
        outline
        dense
        @click="exportCsv"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="row justify-center q-pa-xl">
      <q-spinner size="40px" color="primary" />
    </div>

    <!-- Error -->
    <q-banner v-else-if="error" class="bg-negative text-white q-mb-md">
      <template #avatar><q-icon name="error" /></template>
      {{ error }}
    </q-banner>

    <!-- Empty state -->
    <div
      v-else-if="entries.length === 0"
      class="text-center q-pa-xl text-grey-6"
    >
      No hay registros de lista de espera a&uacute;n.
    </div>

    <!-- Table -->
    <q-table
      v-else
      :rows="entries"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :pagination="{ rowsPerPage: 20 }"
    />
  </q-page>
</template>
```

**Columnas con `format`** (`AppWaitlistPage.vue:79-101`) — patrón directo para "visto hace X"
(`lastSeenAt` → texto relativo) y para el chip de revocado:

```ts
const columns = [
  {
    name: "nombre",
    label: "Nombre",
    field: "nombre",
    align: "left" as const,
    sortable: true,
  },
  {
    name: "moduloInteres",
    label: "Módulos Interesados",
    field: "moduloInteres",
    align: "left" as const,
    sortable: true,
    format: (val: string) => formatModulos(val),
  },
];
```

---

### `src/router/routes.ts` (mod)

**Analog:** el propio archivo, `:28-33` y `:44-48`

**Ruta pública (sin login)** — el patrón exacto que la ruta `/tv` necesitaría **si fuese
una ruta Vue**:

```ts
const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true },
  },
```

**Ruta de staff con gate de rol:**

```ts
      {
        path: 'sessions',
        component: () => import('pages/SessionsPage.vue'),
        meta: { allowedRoles: ['coach', 'owner'] as AdminRole[], trainingOnly: true },
      },
```

**Guard que las consume** (`src/router/index.ts:27, 52-67`): `if (to.meta.public)` corta antes
de `checkAuth`; `to.meta.allowedRoles` bouncea por rol.

**⚠ Aclaración crítica para el planner (D-24 + RESEARCH Pitfall 3):** la decisión tomada es
que `/tv` **NO es una ruta Vue** sino `public/tv/index.html` estático servido por nginx.
Entonces en `routes.ts` **no se agrega `/tv`** — solo las dos rutas nuevas del SPA
(`/tv/control` y `/tv/devices`) con `meta.allowedRoles` = el equivalente frontend de
`TV_CONTROL_ROLES`. Agregar `path: 'tv'` al SPA rompería el fallback de nginx y anularía
toda la estrategia de compatibilidad. El `meta: { public: true }` queda documentado acá
solo por si el planner necesita el precedente.

---

### `scripts/build-tv.mjs` (build script del kiosco)

**Analog:** `el-templo-admin/scripts/copy-ffmpeg.mjs` (38 líneas — el único script de build del admin)

**Archivo completo como plantilla** (`copy-ffmpeg.mjs:1-38`):

```js
import {
  copyFileSync,
  mkdirSync,
  existsSync,
  statSync,
  utimesSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "node_modules/@ffmpeg/core/dist/esm");
const dest = resolve(root, "public/ffmpeg");

if (!existsSync(src)) {
  console.error(`[copy-ffmpeg] source missing: ${src}`);
  console.error("[copy-ffmpeg] run pnpm install first");
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
// ... copia + utimesSync para que rsync skipee si no cambió
```

**Qué copiar:** ESM (`import` + `type: module` ya está en `package.json:7`), resolución de
rutas con `fileURLToPath`, prefijo `[nombre-script]` en los logs, `process.exit(1)` ante
fuente faltante (RESEARCH pide exactamente eso para que CI detecte el fallo), y
`utimesSync` para no re-rsyncar assets idénticos en cada deploy.

**Nota:** este es el **único lugar del repo** donde `console.*` es correcto (script de build
en Node, no código de app — C-02 aplica a `src/`).

**Encadenado en `package.json`** (`el-templo-admin/package.json:9-15`):

```json
  "scripts": {
    "dev": "quasar dev",
    "build": "quasar build",
    "postinstall": "quasar prepare && node scripts/copy-ffmpeg.mjs"
  },
```

→ el patrón de encadenar con `&&` es el que usa `postinstall`; `build` pasa a
`"node scripts/build-tv.mjs && quasar build"`.

**`.gitignore`** (`el-templo-admin/.gitignore`, sección "Build output") — agregar `/public/tv`
junto a `/dist`.

---

### `src/utils/pdf/quotes.ts` (extracción DRY) + assets de la estética

**Analog / fuente:** `el-templo-admin/src/utils/pdf/session-pdf-builder.ts`

**Tokens de color + símbolos de nivel** (`:36-50`) — se convierten en CSS custom properties
del kiosco (`--bg-cream`, `--navy`, `--gold`, `--sand`, `--border-muted`):

```ts
const BG_CREAM = "#F2EBE1"; // Crema Mármol - main background
const NAVY = "#24364A"; // Azul Profundo - headers, primary text
const GOLD = "#B08D6E"; // Oro Mate - accents, borders, subtitles
const SAND = "#DBCAB4"; // Arena Suave - card backgrounds
const BORDER_MUTED = "#c5b9a8"; // Muted border color

const LEVEL_SYMBOLS: Record<string, string> = {
  alfa: "α",
  delta: "Δ",
  sigma: "Σ",
  omega: "Ω",
};

const LEVEL_ORDER = ["alfa", "delta", "sigma", "kairos"];
```

**`QUOTES` a extraer tal cual** (`:205-250`, hoy **no exportada**) — D-06/D-08 piden
literalmente estas frases:

```ts
// Motivational quotes for closing page
// Each quote is split: main text (navy) + goldText (gold accent on the punchline)
const QUOTES = [
  {
    text: "“LAS CADENAS DE LA DISCIPLINA SON LIGERAS COMPARADAS CON ",
    goldText: "EL PESO DEL ARREPENTIMIENTO.”",
    author: "Jim Rohn.",
  },
  // ... 10 en total
];
```

**Movimiento requerido:** cortar el array a `src/utils/pdf/quotes.ts` con `export const QUOTES`,
importarlo de vuelta en `session-pdf-builder.ts` (cero cambio de comportamiento) y consumirlo
desde el build del TV. **Nota de codificación:** el archivo usa escapes `“`/`”`
para las comillas tipográficas — mantener ese estilo.

**El ☉ como vector, no como glifo** (`:52-85`) — Pitfall 6. El PDF ya tuvo este problema y
lo resolvió dibujándolo; el TV hace lo mismo con CSS (círculo `border` + punto) o SVG:

```ts
/**
 * Kairos glyph (☉) drawn as a VECTOR — Roboto (the PDF font) lacks U+2609, so the
 * character would render as tofu. We draw a gold ring + centre dot (sol/ciclo)...
 */
function kairosGlyphColumn(
  diameter: number,
  topMargin: number /* ... */,
): Column {
  const r = diameter / 2;
  const ring = Math.max(5, Math.round(diameter * 0.1));
  // canvas: ellipse lineColor GOLD lineWidth ring  +  ellipse color GOLD
}
```

---

### `src/tv/tv.ts` — reproducción de video (parte con analog)

**Analog:** `el-templo-app/src/modules/training/components/player/VideoPlaceholder.vue`
(⚠ la ruta real; el CONTEXT dice `el-templo-app/src/components/` — **no existe ahí**)

**Atributos del `<video>` + fallback** (`VideoPlaceholder.vue:1-31`):

```vue
<div v-if="!videoUrl || videoFailed" class="video-placeholder">
      <q-icon name="videocam" size="48px" color="grey-6" />
      <span class="video-placeholder__text">Video proximamente</span>
    </div>

<template v-else>
  <video
    ref="videoRef"
    class="video-player"
    autoplay
    loop
    muted
    playsinline
    preload="auto"
    :poster="posterUrl"
    :src="videoUrl"
    @canplay="onVideoReady"
    @error="handleVideoError"
  />
</template>
```

**Reload al cambiar de fuente + autoplay defensivo** (`:71-94`) — Pitfall 13 (memoria del
kiosco) exige exactamente esto: **un solo** elemento `<video>` cuyo `src` cambia + `load()`,
nunca recrear el nodo:

```ts
async function attemptAutoplay(): Promise<void> {
  if (!videoRef.value || !props.videoUrl) return;
  try {
    await videoRef.value.play();
  } catch {
    // Autoplay was blocked - video will show first frame
    log.debug("Autoplay blocked, user interaction required");
  }
}

watch(
  () => props.videoUrl,
  (newUrl) => {
    videoFailed.value = false;
    videoLoading.value = true;
    if (newUrl && videoRef.value) {
      videoRef.value.load();
      attemptAutoplay();
    }
  },
);
```

**CSS del contenedor** (`:102-132`): `object-fit: cover`, `position: relative` +
`inset: 0` en el placeholder. `object-fit` es Chromium ≤49 → **seguro** para el piso.

**⚠ Traducción obligatoria:** el analog es Vue/Quasar/SCSS. En `src/tv/` hay que reescribirlo
en TS plano ES2015 + DOM (`document.getElementById`, `addEventListener('error')`), sin
`q-icon`, sin `<template>`, y sin `gap` en flex (Pitfall 4). El **comportamiento** ("Video
proximamente" ante URL nula o error de carga) se copia literal.

---

### `deploy/TV-KIOSK-RUNBOOK.md` (D-21)

**Analog:** `deploy/RUNBOOK.md` (517 líneas)

**Header + sección "Quick Reference" con bloque de comandos comentado** (`RUNBOOK.md:1-30`):

```markdown
# El Templo - Production Incident Runbook

Reference guide for handling common production incidents. Designed for the solo developer to follow under pressure when something breaks.

**Server:** Ubuntu 22.04 on AWS EC2 (t3.small, sa-east-1)
**Last updated:** 2026-02-14

---

## 1. Quick Reference
```

→ Mismo formato: título, párrafo de propósito, bloque de metadatos en negrita con
**Last updated**, `---`, y secciones numeradas. Para el TV las secciones son:
URL `/tv/`, fullscreen, screensaver/auto-power-off por marca, beeps, re-vincular, `?diag=1`.

---

## Shared Patterns

### 1. Guard de rol a nivel plugin (aplicar a: `control-routes.ts`)

**Source:** `el-templo-api/src/modules/coach/routes.ts:24-33`

```ts
fastify.addHook("onRequest", async (request, reply) => {
  await fastify.authenticate(request, reply);
  if (!(COACH_DEBTS_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso requerido",
    });
  }
  await attachCountryScope(request, fastify.db);
});
```

Un solo punto de control por plugin, nunca `if (role !== 'coach')` por handler.

### 2. Scoping por sede (aplicar a: todos los writes de `control-routes.ts`)

**Source:** `el-templo-api/src/modules/shared/branch-access.ts:161-201`

```ts
/**
 * Usage:
 *   fastify.get("/foo", {
 *     schema: fooSchema,
 *     preHandler: [requireBranchAccess({ from: "query.branchId" })],
 *   }, handler);
 */
export function requireBranchAccess(opts: {
  from: BranchIdLocation;   // "query.branchId" | "params.branchId" | "body.branchId"
  optional?: boolean;
}): preHandlerHookHandler {
```

y su predicado puro (`:70-121`), cuya Regla 4 es la que habilita al coach:

```ts
// Rule 4: coach/recepción — branch must be in operational set.
if (scope.role === "coach" || scope.role === "recepcion") {
  return scope.branchIds.includes(branchId);
}
```

En denegación responde 403 con `code: BRANCH_OUT_OF_SCOPE` + `request.log.warn` estructurado
(`:184-199`). **`attachCountryScope` debe correr antes** (ver Shared Pattern 1).

**⚠ NO aplica a `device-routes.ts`:** el `branchId` del TV sale de `request.tvDevice.branchId`
(la fila), jamás del payload.

### 3. TZ por sede — "hoy" y día de la semana (aplicar a: `class-day.ts`, `service.ts`)

**Source:** `el-templo-api/src/modules/shared/date-utils.ts:117-145`

```ts
/**
 * Get the current date string ("YYYY-MM-DD") as seen in the given timezone.
 */
export function todayInTz(tz: string, now: Date = new Date()): string {
  // en-CA locale formats dates as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}

/**
 * Get the current ISO day-of-week (1=Mon ... 7=Sun) in the given timezone.
 */
export function dowInTz(tz: string, now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  })
    .formatToParts(now)
    .find((p) => p.type === "weekday")!.value;
  const map: Record<string, number> = { Mon: 1, Tue: 2, /* ... */ Sun: 7 };
  return map[weekday]!;
}
```

Ambas aceptan `now` inyectable → los tests de borde de día (D-07, `Europe/Madrid`) no
necesitan fake timers.

### 4. Expire-on-read (aplicar a: `service.ts`, lectura del estado de clase — D-07)

**Source:** `el-templo-api/src/modules/subscriptions/service.ts:4635-4656`

```ts
  /**
   * Auto-expire active subscriptions past their end date for a given user.
   * "Expire on read" pattern — no cron job needed.
   */
  private async autoExpireSubscriptions(userId: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const expiredSubs = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, userId),
          eq(schema.subscriptions.status, "active"),
          sql`${schema.subscriptions.endDate} < ${today}`,
        ),
      );
    if (expiredSubs.length === 0) return;
```

**Diferencia clave para TV:** el analog calcula `today` con `toISOString()` (UTC). El TV
**debe** usar `todayInTz(branch.timezone)` (Shared Pattern 3) — si no, la sede de Barcelona
limpia el estado a la hora equivocada.

### 5. Manejo de errores en handlers (aplicar a: todos los routes del módulo)

**Source:** `el-templo-api/src/modules/shared/error-handler.ts:26-46`

```ts
export function handleServiceError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof AppError) {
    const label = STATUS_LABELS[err.statusCode] ?? "Error desconocido";
    reply.code(err.statusCode).send({ error: label, message: err.message });
    return;
  }
  log.error({ err }, `Error in ${context}`);
  reply.code(500).send({
    error: "Error del servidor",
    message: "Error interno del servidor",
  });
}
```

Uso desde el handler: `catch (err: unknown) { handleServiceError(err, reply, request.log, "tv poll state"); }`.
Los servicios lanzan subclases de `AppError` (`shared/errors.ts`), nunca arman la respuesta.

### 6. URL pública del video (aplicar a: `service.ts`)

**Source:** `el-templo-api/src/modules/shared/video-url.ts`

```ts
export function assembleVideoUrl(
  key: string | null | undefined,
): string | null {
  if (!key) return null;
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl) return null;
  return `${baseUrl}/${key}`;
}
```

Nunca concatenar `R2_PUBLIC_URL` a mano: el helper ya maneja key nula y env var ausente
(devuelve `null` → el TV cae al placeholder "Video proximamente").

### 7. Logging (aplicar a: todo)

- **API (C-01):** `request.log.warn(...)` / `request.log.error({ err }, "...")` — ejemplos en
  `branch-access.ts:185-192` y `error-handler.ts:44`. Un TV revocado polleando ⇒ `warn`.
- **Admin SPA (C-02):** `el-templo-admin/src/utils/logger.ts` →
  `const log = createLogger('TvControlPage');` (uso real en `DeudasPage.vue:81`). `error()`
  manda a Sentry automáticamente.
- **`src/tv/` (Pitfall 12):** `createLogger` **no** es accesible desde el bundle estático —
  logger mínimo propio con la **misma forma** (`debug/info/warn/error`, prefijo `[contexto]`)
  y un docblock explicando por qué no importa el del SPA.
- **Scripts `.mjs`:** `console.error` + `process.exit(1)` es correcto (ver `copy-ffmpeg.mjs`).

---

## No Analog Found

Archivos sin correspondencia en el repo — el planner usa `164-RESEARCH.md` / `164-UI-SPEC.md`
como fuente en lugar de un analog:

| File                                                           | Role                  | Data Flow        | Reason                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el-templo-admin/src/tv/tv.ts`                                 | app standalone ES2015 | polling + render | **No existe una sola línea de frontend sin framework en el repo.** Los 3 apps son Vue/Quasar. Usar RESEARCH Pattern 7 (escalado por `font-size`), Pattern 6 (offset de reloj) y el mockup `164-tv-mockup-template.html` como HTML de partida                         |
| `el-templo-admin/src/tv/tsconfig.tv.json`                      | config                | —                | No hay ningún tsconfig con `target: es2015` en el repo (el admin y el api compilan a ES2022+). Configuración nueva por diseño: `--target es2015 --lib es2015,dom` actúa de linter de compatibilidad (Pitfall 5)                                                      |
| `el-templo-api/src/modules/tv/pairing.ts` — **flujo** RFC 8628 | service               | one-shot claim   | El **patrón de token** sí tiene analog (`refresh-token-service.ts`), pero el split `user_code`/`device_code` no existe en el repo. `shared/qr-token.ts` es HMAC stateless y explícitamente **no sirve** (D-03 exige revocación por fila). Fuente: RESEARCH Pattern 2 |
| Botonera grande del profe (dentro de `TvControlPage.vue`)      | UI                    | —                | No hay ninguna superficie de "botones gigantes en medio de una clase" en el admin. `DeudasPage.vue` aporta el chasis (sede/rol/composable); el layout de BLOQUES/NIVELES/EJERCICIO/TIMER es UI nueva (D-13 + UI-SPEC)                                                |

**Además, sin verificación posible en este entorno:** la compatibilidad real de `/tv` en un
smart TV (D-20). No hay analog ni test automatizable — RESEARCH lo marca como
`checkpoint:human-verify` obligatorio con `?diag=1`.

---

## Notas de riesgo para el planner (derivadas del mapeo)

1. **El checkout está atrasado.** Máximo de migraciones en el working tree = **0181**;
   `origin/master` = **0188**. La rama de la fase debe salir de `origin/master` actualizado
   **antes** de escribir `0189_tv_screen.sql`, o el número colisiona.
2. **`roster.ts` es un port cross-app.** La lógica canónica de roles/INITIUM hoy vive **solo**
   en el admin (`session-data-transformer.ts`). Al portarla al API quedan dos copias: el plan
   debe decidir explícitamente si el PDF pasa a consumir la del API o si se acepta la
   duplicación (y documentarlo), igual que el caso ya conocido de `dateToWeekNumber`
   (duplicado hoy en `sessions/routes.ts:72` y `el-templo-admin/src/utils/weekDates.ts`).
3. **`QUOTES` es una extracción con blast radius en el PDF.** Mover el array toca
   `session-pdf-builder.ts`, que no tiene tests. Cambio mecánico puro (cortar + `export` +
   `import`), sin reformatear el contenido.
4. **El admin no tiene test runner.** Ningún archivo bajo `el-templo-admin/src/` (composable,
   page, `src/tv/`) queda cubierto por CI: solo lint (`continue-on-error`) + build, y **sin
   typecheck**. De ahí que el RESEARCH empuje toda la lógica derivable al API. Verificación
   local obligatoria: `npx vue-tsc --noEmit` + `npx tsc -p src/tv/tsconfig.tv.json --noEmit`.

---

## Metadata

**Analog search scope:**
`el-templo-api/src/modules/{auth,coach,sessions,admin,subscriptions,shared}`,
`el-templo-api/src/db/{schema,migrations}`, `el-templo-api/src/app.ts`,
`el-templo-api/test/{helpers.ts,coach,rbac-sets.test.ts}`,
`el-templo-admin/src/{composables,pages,router,utils,tv?}`, `el-templo-admin/scripts`,
`el-templo-app/src/modules/training/components/player`, `deploy/`

**Files scanned:** 38 (26 leídos en detalle, 12 inspeccionados por grep/estructura)
**Analogs extracted:** 27
**Pattern extraction date:** 2026-07-24
