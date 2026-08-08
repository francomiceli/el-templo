# Phase 169: Capa de escritura — helpers `tenantWhere`/`tenantValues` y `TenantContext` - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 24 (7 nuevos, 17 modificados)
**Analogs found:** 22 / 24

> **⚠️ Base de lectura.** Todos los excerpts salen de `origin/master` = `1200b8af`
> (fases 166-168 mergeadas). El checkout principal `/home/franco/projects/el-templo`
> está en `fix/referral-preview-y-refresh-ficha`, **244 commits atrás** — NO leer ni
> editar ahí. El worktree `/home/franco/projects/et-168-contratos` está exactamente en
> `origin/master` y es la fuente de estos excerpts. Los paths de abajo se escriben
> relativos a `el-templo-api/` para que sirvan en el worktree nuevo de la fase.
>
> **Sin migraciones.** La fase no toca DB (tope aplicado en prod: 0196). Si algo
> obligara a una migración, reservar desde 0197 y leer el skill `el-templo-db-migrations`.

---

## File Classification

### Archivos NUEVOS

| Archivo                                                                    | Rol                                  | Data flow                        | Analog más cercano                                                                                                                                         | Match             |
| -------------------------------------------------------------------------- | ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/modules/shared/tenant.ts`                                             | utility (funciones puras + iterador) | transform + batch                | `src/modules/shared/member-search.ts` (fn pura → condición Drizzle) + `src/jobs/mark-no-shows.ts:59-72,177-189` (iterador de dimensión)                    | exact (compuesto) |
| `src/db/scripts/require-tenant.ts` (helper CLI `--tenant`)                 | utility / CLI                        | batch + validación pre-escritura | `src/db/scripts/verify-tenant-uniques.ts:580-620` (idioma CLI: env, conexión, exit codes)                                                                  | role-match        |
| `test/tenancy/tenant-helpers.test.ts`                                      | test (unit)                          | transform                        | `test/shared/tenant-scope.test.ts:29-119` (unit directo sobre helper de tenancy)                                                                           | exact             |
| `test/tenancy/con-04-crons-per-tenant.test.ts`                             | test (integración)                   | batch                            | `test/jobs/reassign-multibranch.test.ts:11-92` (cron contra MySQL real) + `test/tenancy/con-01-uniques-cross-tenant.test.ts:54-63,279+` (2º tenant ad-hoc) | exact             |
| `test/tenancy/con-04-write-paths-tenant-id.test.ts` (batería D-09)         | test (integración)                   | request-response                 | `test/tenancy/con-01-uniques-cross-tenant.test.ts:109-164` (helpers de aserción con mensaje explicativo)                                                   | role-match        |
| `test/wellhub/webhook-tenant-derivation.test.ts` (o extender el existente) | test (integración)                   | event-driven                     | `test/wellhub/webhook-checkin.test.ts:1-60` (payload + firma + `gym_sin_sede`)                                                                             | exact             |
| `test/tv/tv-pairing-tenant.test.ts` (o extender el existente)              | test (integración)                   | request-response                 | `test/tv/tv-pairing.test.ts:32,135-165` (ciclo start→claim→status)                                                                                         | exact             |

### Archivos MODIFICADOS

| Archivo                                                                             | Rol                | Data flow                        | Analog más cercano                                                                  | Match      |
| ----------------------------------------------------------------------------------- | ------------------ | -------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| `src/jobs/mark-no-shows.ts`                                                         | job/cron           | batch                            | **es él mismo el analog canónico** (loop por dimensión ya implementado)             | exact      |
| `src/jobs/expire-lost-leads.ts`                                                     | job/cron           | batch (SQL crudo)                | `mark-no-shows.ts:177-189`                                                          | exact      |
| `src/jobs/reassign-multibranch.ts`                                                  | job/cron           | batch (query builder)            | `mark-no-shows.ts:177-189`                                                          | exact      |
| `src/jobs/auto-approve.ts`                                                          | job/cron           | batch (delega a service)         | `mark-no-shows.ts:191-223`                                                          | exact      |
| `src/jobs/auto-resume-pauses.ts`                                                    | job/cron           | batch (3 barridos)               | `mark-no-shows.ts:191-223`                                                          | exact      |
| `src/jobs/notification-cron.ts` (4 schedules)                                       | job/cron           | batch + pub-sub                  | `notification-cron.ts:274-296` + su propio loop por tz (`:509-548`)                 | exact      |
| `src/jobs/wellhub-sync.ts`                                                          | job/cron           | batch + request-response externo | `mark-no-shows.ts:191-223`                                                          | exact      |
| `src/index.ts`                                                                      | config (bootstrap) | —                                | `src/index.ts:37-45` (el registro actual)                                           | exact      |
| `src/modules/wellhub/service.ts`                                                    | service            | event-driven                     | `service.ts:167-190` + `:641-653` (`findBranchByGymId`)                             | exact      |
| `src/modules/tv/pairing.ts`                                                         | service            | request-response                 | `pairing.ts:139-185` (`claim`)                                                      | exact      |
| `scripts/seed-onboarding-aura.ts`                                                   | script CLI         | file-I/O / batch                 | `src/db/scripts/verify-tenant-uniques.ts:580-620`                                   | role-match |
| `src/db/run-migrations.ts` (solo anotación)                                         | script exento      | —                                | `src/db/schema/tv.ts:80` (idioma de anotación de exención)                          | exact      |
| `src/db/scripts/verify-tenant-backfill.ts` / `verify-tenant-uniques.ts` (anotación) | script exento      | —                                | ídem                                                                                | exact      |
| `src/db/seed.ts` / `src/db/seed-spom.ts` (anotación)                                | script exento      | —                                | ídem                                                                                | exact      |
| `scripts/wellhub-sandbox.ts` (anotación)                                            | script exento      | —                                | ídem                                                                                | exact      |
| `src/modules/shared/index.ts` (barrel, opcional)                                    | config             | —                                | `src/modules/shared/index.ts` completo                                              | exact      |
| Sitios de mass-assignment (D-08, 6 candidatos)                                      | routes             | request-response                 | `src/modules/finance/transaction-service.ts:280-300` (INSERT con campos ENUMERADOS) | exact      |

---

## Pattern Assignments

### 1. `src/modules/shared/tenant.ts` (NUEVO — corazón de la fase)

#### 1a. Firma exacta de los helpers — NO re-diseñar

**Fuente canónica:** `.docs/saas-multitenancy/03-diseno-tenant-db-layer.md` §3, capa 2.
El doc trae el código propuesto tal cual; la fase lo implementa sin variaciones:

```ts
// src/modules/shared/tenant.ts (propuesto por el doc 03 §3)
export type TenantId = number; // considerar brand type más adelante (mismo diferimiento que TxHandle)

/** Filtro estándar: tenantWhere(schema.members, scope) → eq(table.tenantId, scope.tenantId) */
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}

/** Valores de INSERT: siempre del scope server-side (regla de escritura, README §4.2) */
export function tenantValues<V>(scope: { tenantId: TenantId }, values: V) {
  return { ...values, tenantId: scope.tenantId };
}
```

Convenciones que el doc fija junto con la firma (van al docblock del archivo nuevo):

- `and(tenantWhere(table, scope), ...resto)` como PRIMER término de todo WHERE gym-owned.
- En ` sql` ``crudos:`WHERE tenant_id = ${scope.tenantId} AND ...`.
- `{ tenantId }` plano = contrato único: scope de request y `TenantContext` son
  estructuralmente compatibles, **no hay dos APIs**.

`AnyMySqlColumn` ya se usa en el repo (importado de `drizzle-orm/mysql-core`):
`src/db/schema/users.ts:12`, `src/db/schema/referrals.ts:10`, `refresh-tokens.ts:8`.

#### 1b. Fail-closed sobre `tenantId: number | null` — regla heredada de la 166

**Analog:** `src/modules/shared/country-scope.ts:22-39` (el tipo que los helpers reciben).

```ts
export interface CountryScope {
  /**
   * Fase 166 (FUND-03) — gimnasio (tenant) dueño de los datos de este request.
   * ...
   * `null` es el estado fail-closed de corrupción de datos — mismo criterio
   * que `country: null`. La FK `fk_users_tenant` lo vuelve imposible en la
   * práctica; si aun así ocurre, el hook escala un `request.log.error`. Todo
   * helper de tenancy (fase 169 en adelante) DEBE tratar `null` como deny,
   * jamás como "todos los gimnasios".
   */
  tenantId: number | null;
```

⚠️ **Punto de fricción concreto para el planner:** la firma del doc 03 pide
`{ tenantId: TenantId }` (o sea `number`), pero `CountryScope.tenantId` es
`number | null`. El call site pasa un scope de request → **no compila sin narrowing**.
El plan debe resolverlo explícitamente (opciones: type guard `assertTenant(scope)` que
lanza, o la firma acepta `number | null` y lanza en runtime). El CONTEXT lockea la
firma **del doc**, así que la salida natural es un guard exportado del mismo archivo,
nunca un `!` ni un `?? 1`. El comentario de arriba es la orden explícita: `null` = deny.

#### 1c. Módulo de funciones puras en `shared/` — idioma del archivo

**Analog:** `src/modules/shared/member-search.ts` (fn pura → condición Drizzle, sin clase,
sin `db`, docblock arriba con las reglas).

```ts
import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/**
 * Build a robust SQL condition to search members by name/email/DNI.
 * Rules: ...
 * Returns null if the search string has no meaningful tokens.
 */
export function buildMemberNameSearchCondition(
  search: string,
  options: { includeDni?: boolean } = {},
): SQL | null {
```

Confirma la decisión del CONTEXT ("los helpers son funciones puras, no wrappers de `db`"):
los services son singletons y el scope fluye por argumento, igual que `country` y `tx`.

#### 1d. `forEachActiveTenant` — iterador (Claude's Discretion)

**Analog exacto:** `src/jobs/mark-no-shows.ts:59-72` + `:177-189`. Es literalmente el
mismo shape (descubrir la dimensión con una query, iterar, agregar resultados):

```ts
/** Return the distinct timezones of active, non-virtual branches. */
async function getDistinctBranchTimezones(
  db: MySql2Database<typeof schema>,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tz: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
      ),
    );
  return rows.map((r) => r.tz);
}

export async function runMarkNoShows(
  db,
): Promise<{ updated: number; decremented: number }> {
  const tzs = await getDistinctBranchTimezones(db);
  let updated = 0;
  let decremented = 0;
  for (const tz of tzs) {
    const r = await runMarkNoShowsForTz(db, tz);
    updated += r.updated;
    decremented += r.decremented;
  }
  return { updated, decremented };
}
```

El equivalente de la fase: `SELECT id FROM tenants WHERE status = 'active'` (D-05 y los
crons solo iteran activos) → loop secuencial → `TenantContext { tenantId }` por vuelta.

Filtro de estado: copiar el criterio de `country-scope.ts:180-184` — comparar **contra
`'active'`**, no contra la lista de estados malos, para que un estado futuro del enum
deniegue por default:

```ts
} else if (row.tenantStatus !== "active") {
  // 'suspended' (falta de pago, reversible) y 'archived' (baja lógica)
  // cortan igual. La comparación es contra 'active' y no contra la lista
  // de estados malos para que un estado futuro del enum deniegue por
  // default en vez de colarse.
```

Los valores del enum viven en `src/db/schema/tenants.ts:45-49` (`active`/`suspended`/`archived`).

---

### 2. Los 7 crons (`src/jobs/*.ts`) — loop por tenant activo (D-01/D-02/D-03)

#### 2a. Aislamiento de errores por iteración (D-03)

**Analog:** `src/jobs/mark-no-shows.ts:198-217` — try/catch DENTRO del loop, con la
dimensión en el log, y el loop sigue:

```ts
for (const tz of scheduled) {
  cron.schedule(
    "0 22 * * *",
    async () => {
      log.info({ tz }, "Running mark-no-shows job");
      try {
        const { updated, decremented } = await runMarkNoShowsForTz(db, tz);
        if (updated > 0) {
          log.info(
            { tz, updated, decremented },
            "Marked bookings as no_show and decremented class budgets",
          );
        }
      } catch (error) {
        log.error({ err: error, tz }, "Mark no-shows job failed");
      }
    },
    { timezone: tz },
  );
}
```

Para D-03 el campo del log pasa a ser `tenantId` en vez de `tz`. Sentry se engancha solo:
`log.error` de pino ya va a Sentry vía `instrument.ts` (CLAUDE.md).

**Segundo analog (loop interno con catch por elemento):** `src/jobs/notification-cron.ts:321-323`
(`for (const profile of profiles) { try { ... } catch { ... } }`) — mismo patrón a nivel
de item, útil si el loop de tenants va DENTRO del `cron.schedule` en vez de afuera.

#### 2b. Firma de job: lógica pura exportada + scheduler

**Analog:** `src/jobs/expire-lost-leads.ts:73-138` — el idioma más limpio de los 7:

```ts
/**
 * Corre el barrido completo una vez. Expuesto para tests e invocación manual
 * (mismo patrón que runMarkNoShows). Devuelve cuántos leads venció y cuántos
 * salteó por ser 'manual'.
 */
export async function runExpireLostLeads(
  db: MySql2Database<typeof schema>,
): Promise<{ expired: number; skippedManual: number }> { ... }

export function startExpireLostLeadsJob(db: MySql2Database<typeof schema>): void {
  cron.schedule("0 4 * * *", async () => {
    try {
      const { expired, skippedManual } = await runExpireLostLeads(db);
      if (expired > 0 || skippedManual > 0) {
        log.info({ expired, skippedManual }, "Expired stale trial leads to 'perdido'");
      }
    } catch (err: unknown) {
      log.error({ err }, "Expire-lost-leads job failed");
    }
  }, { timezone: "America/Argentina/Buenos_Aires" });

  log.info({ schedule: "0 4 * * *", timezone: "America/Argentina/Buenos_Aires" },
    "Expire-lost-leads cron scheduled for 04:00 daily (AR)");
}
```

`wellhub-sync.ts:32-58` y `mark-no-shows.ts:177-223` tienen la misma separación
`runX(db)` / `startXJob(db)`. **`auto-approve.ts` y `auto-resume-pauses.ts` NO la tienen**
(todo vive dentro del `cron.schedule`) → esos dos necesitan extraer el `runX(db, ctx)`
antes de poder testear el loop. Es la mayor asimetría entre los 7.

#### 2c. Estado por job (dónde entra el `TenantContext`)

| Job                              | Forma actual                               | Dónde entra el loop                                                          | Nota                                                                                                                                                     |
| -------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto-approve.ts:20-42`          | todo inline en `cron.schedule`             | extraer `runAutoApprove(db, ctx)` primero                                    | service instanciado en el body del job (`:21`)                                                                                                           |
| `auto-resume-pauses.ts:29-90`    | inline, 3 barridos con try/catch separados | ídem; los 3 catch ya existen                                                 | 6 services construidos en `:30-46`                                                                                                                       |
| `expire-lost-leads.ts:73-138`    | `run` + `start` ✅                         | envolver el cuerpo de `runExpireLostLeads`                                   | **SQL crudo** (`:84-102`): el filtro por tenant va como `AND u.tenant_id = ${ctx.tenantId}` cuando llegue la adopción; en la 169 solo baja el ctx (D-02) |
| `mark-no-shows.ts:177-223`       | `run` + `start`, ya loopea tz ✅           | loop tenant **por fuera** del loop tz (o producto cartesiano)                | única con doble dimensión                                                                                                                                |
| `notification-cron.ts:274-560`   | 4 `cron.schedule` en una función           | 4 loops (o helper local compartido)                                          | 2 de los 4 ya loopean tz (`:509-548`)                                                                                                                    |
| `reassign-multibranch.ts:74-294` | `run(db, opts)` + `start` ✅               | `opts` ya existe → agregar el ctx ahí es lo menos invasivo                   | tiene `dryRun` — respetarlo                                                                                                                              |
| `wellhub-sync.ts:32-78`          | `run` + `start` ✅, con guard de config    | loop dentro de `runWellhubSync` después del guard `if (!config) return null` | 6 services construidos en `:38-55`                                                                                                                       |

**D-02 recordatorio:** el ctx **no baja a los services**. Se loguea y queda disponible;
las firmas de service no cambian hasta 172-175.

---

### 3. `src/index.ts` — registro de crons

**Analog:** el bloque actual, `src/index.ts:37-45`:

```ts
// Start cron jobs after server is ready. Mark-no-shows and notifications
// discover branch timezones at boot, so they're async.
startAutoApproveJob(app.db);
startAutoResumePausesJob(app.db);
startExpireLostLeadsJob(app.db);
startReassignMultibranchJob(app.db);
startWellhubSyncJob(app.db);
await startMarkNoShowsJob(app.db);
await startNotificationJobs(app.db);
```

Dos de los 7 ya son `async` porque descubren su dimensión en el boot. Si el iterador de
tenants se resuelve **en el boot** (y no en cada tick), los otros 5 pasan a `async`
también y el comentario de `:37-38` hay que actualizarlo. **Preferible resolver la lista
de tenants en cada tick, no en el boot**: un tenant que se activa no debería exigir
restart (mismo espíritu que "el tenant no viaja en el JWT → suspender aplica en el
request siguiente, sin re-login", `country-scope.ts:30-31`).

---

### 4. `src/modules/wellhub/service.ts` — derivación del tenant (D-04/D-05, CON-04)

#### 4a. El lookup que hay que extender

**Analog exacto (el mismo archivo):** `src/modules/wellhub/service.ts:641-653`.

```ts
  private async findBranchByGymId(
    gymId: number,
  ): Promise<{ id: number; timezone: string } | null> {
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(eq(schema.branches.wellhubGymId, gymId))
      .limit(1);
    return branch ?? null;
  }
```

La derivación de CON-04 es **agregar dos columnas a este select**: `tenantId:
schema.branches.tenantId` y el `status` del tenant vía `leftJoin(schema.tenants, ...)`
(D-05 exige no procesar si el tenant no está `active`). El `leftJoin` + evaluación de
`tenantStatus` está resuelto en `country-scope.ts:151-194` — mismo shape, incluido el
comentario de por qué el join es LEFT.

#### 4b. Contrato de salida `skipped` (D-04) — se CONSERVA

**Analog:** `service.ts:180-187` (el camino `gym_sin_sede` que ya existe):

```ts
const branch = await this.findBranchByGymId(gymId);
if (!branch) {
  this.log.warn(
    { gymId },
    "Webhook checkin de Wellhub para un gym_id sin sede mapeada",
  );
  return { httpStatus: 200, outcome: "skipped", detail: "gym_sin_sede" };
}
```

D-05 agrega un hermano con la misma forma: `detail: "tenant_no_activo"` + `log.warn`
con `{ gymId, tenantId, tenantStatus }`, 200 `skipped`. El tipo `WebhookHandleResult`
(`service.ts:40-50`) ya admite `skipped` con `detail?: string` — no cambia.

⚠️ **Orden de operaciones (mina M6):** `handleEvent` (`:62-129`) escribe en
`wellhub_events` **ANTES** de resolver el gym (idempotencia global, unique M8 en
`wellhub_events.event_id`, ver `tenant-tables.ts:239-240`). Esa fila nace sin tenant
derivado — es el caso que el comentario de `src/db/schema/wellhub.ts:131-133` anticipa:

```
// webhook entra sin sesión y el tenant no viaja en el payload de forma directa. La
// derivación real (payload.gym.id -> branches.wellhub_gym_id -> branch.tenant_id) es
// trabajo de la fase 169. Hoy, con un solo tenant, el backfill es DIRECTO a 1.
```

El plan tiene que decidir explícitamente si `wellhub_events` se estampa post-derivación
(UPDATE junto al `status`, `:109-115`) o queda con el DEFAULT 1 anotado. Los otros
tres schemas de Wellhub ya llevan `tenantIdColumn()` (`wellhub.ts:36-37,67-68,98-99,128-129`).

#### 4c. Dónde nace el `TenantContext` (Claude's Discretion)

El service se instancia **por request** en la ruta (`src/modules/wellhub/routes.ts:124-130`),
a diferencia del resto del repo:

```ts
const client = new WellhubClient(config, request.log);
const service = new WellhubService(
  fastify.db,
  request.log,
  client,
  bookingService,
);
const result = await service.handleEvent(event, rawBody.toString("utf8"));
```

O sea que el ctx puede construirse dentro de `handleCheckin` sin tocar el constructor ni
la ruta — el camino menos invasivo y coherente con D-02.

**El mismo tratamiento va para `handleBookingEvent`** (`service.ts:131-152` despacha 3
tipos de evento de booking además del checkin). El CONTEXT nombra el checkin; el planner
debería cubrir los dos caminos o dejar escrito por qué no.

---

### 5. `src/modules/tv/pairing.ts` — exención pre-claim + estampado en el claim

#### 5a. Idioma de la anotación de exención

**Analog:** `src/db/schema/tv.ts:80` (la 168 ya dejó escrito el texto exacto que la 169
tiene que materializar):

```
// Mina M7: esta tabla es PRE-TENANT por diseno — la fila nace antes de que se sepa de
// quien es el televisor (branch_id nulo hasta el claim), asi que sus dos codigos quedan
// GLOBALES a proposito y para siempre (lista M8 aprobada), porque el claim tiene que
// resolverlos sin scope. La columna de abajo entra igual con DEFAULT 1, el claim la va a
// estampar con el scope del staff (CON-04) y la exencion
// `/* tenant-safe: pairing pre-claim */` del sentinel la agregan las fases 169/170.
```

Los dos motivos M8 correspondientes ya están escritos en
`src/db/tenant-tables.ts:249-252` — el docblock nuevo debe apuntar ahí, no repetirlos.

**Sitio del INSERT pre-claim a anotar:** `pairing.ts:113-115`.

```ts
await this.db.insert(schema.tvPairings).values({ userCode, deviceCodeHash });
```

#### 5b. El claim estampa el tenant del scope de staff

**Analog:** `pairing.ts:145-158` (el UPDATE atómico actual):

```ts
const result = await this.db
  .update(schema.tvPairings)
  .set({
    claimedAt: new Date(),
    claimedBy,
    branchId,
    deviceName: name ?? null,
  })
  .where(
    and(
      eq(schema.tvPairings.userCode, userCode),
      isNull(schema.tvPairings.claimedAt),
    ),
  );
```

`tenantId` entra en ese `.set({...})` (o vía `tenantValues(ctx, {...})`). ⚠️ La firma de
`claim()` **no recibe scope hoy** (`claim(userCode, branchId, claimedBy, name?)`,
`:139-144`) → hay que agregar el parámetro y tocar el call site en
`src/modules/tv/control-routes.ts`. Es la única firma de service que la 169 cambia; el
CONTEXT lo habilita porque es CON-04, no adopción de módulo.

⚠️ **Segundo write post-claim:** `consume()` inserta en `tv_devices` (`pairing.ts:231-239`)
usando `pairing.branchId`. Ese insert también es gym-owned y no tiene scope de request
(el TV pollea sin sesión) — el tenant sale del pairing ya reclamado. El plan debería
cubrirlo o anotar por qué queda en DEFAULT 1.

---

### 6. Helper CLI `--tenant` (D-06/D-07) + retrofit

#### 6a. Idioma de script standalone del repo

**Analog:** `src/db/scripts/verify-tenant-uniques.ts:580-620` (main + env + conexión +
exit codes; el archivo entero es el modelo de docblock operativo del repo):

```ts
async function main(): Promise<number> {
  // Misma carga de env que src/db/run-migrations.ts.
  const envFile =
    process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
  dotenv.config({ path: path.resolve(process.cwd(), envFile) });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "eltemplo",
  });
  ...
}

if (require.main === module) {
  main()
    .then((code) => { process.exit(code); })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`verify-tenant-uniques fallo: ${message}`);
      process.exit(2);
    });
}
```

Códigos de salida ya convencionados: **0 OK, 1 discrepancias, 2 error de conexión/uso**
(`verify-tenant-uniques.ts:47-48`). El helper de `--tenant` debe abortar con **2** (error
de uso) cuando falta el flag o el tenant no existe — no con 1.

Este script también trae el **guard de base** que conviene replicar antes de escribir
(staging y prod comparten host MySQL, reference del MEMORY):

```ts
/** Paso 0 — guard de base. Primer statement de todo, siempre (T-168-13). */
async function stepDatabaseGuard(query: QueryFn): Promise<string> {
  const rows = await query("SELECT DATABASE() AS db");
  ...
}
```

#### 6b. El retrofit ejemplar (D-06)

**Archivo a modificar:** `scripts/seed-onboarding-aura.ts` (43 líneas, completo). Hoy
escribe `aura_config` cayendo en el DEFAULT 1 sin declararlo:

```ts
import "dotenv/config";
import { createSingleConnection } from "../src/db";
import { auraConfig } from "../src/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const { db, connection } = await createSingleConnection();
  const existing = await db
    .select({ id: auraConfig.id })
    .from(auraConfig)
    .where(eq(auraConfig.sourceType, "onboarding_completion"))   // ← sin tenantWhere
    .limit(1);
  ...
    await db.insert(auraConfig).values({                          // ← sin tenantValues
      sourceType: "onboarding_completion", defaultAmount: 50, ...
    });
```

Post-retrofit: `--tenant=<id>` obligatorio → `TenantContext` → `tenantWhere(auraConfig, ctx)`
en el SELECT y `tenantValues(ctx, {...})` en el INSERT. Es el ejemplar que demuestra los
dos helpers en un camino sin request.

⚠️ Ojo: `createSingleConnection()` (`src/db/index.ts:23-30`) devuelve `drizzle(connection)`
**sin el schema tipado** — distinto de `app.db`. El helper CLI tiene que funcionar con
ese handle o el retrofit no compila igual que el resto.

#### 6c. Scripts exentos (D-06) — 5 archivos, solo anotación

`src/db/run-migrations.ts`, `src/db/scripts/verify-tenant-backfill.ts`,
`src/db/scripts/verify-tenant-uniques.ts`, `src/db/seed.ts`, `src/db/seed-spom.ts`,
`scripts/wellhub-sandbox.ts`. Formato grepeable ya establecido:
`/* tenant-safe: <motivo> */` (doc 03 §3 capa 3 + `src/db/schema/tv.ts:80`).

Registrados en `package.json:12-20` como `db:migrate`, `db:verify-tenant`,
`db:verify-uniques`, `db:seed`, `seed:spom` — si el helper CLI suma un script npm nuevo,
va en ese mismo bloque.

---

### 7. Auditoría de mass-assignment (D-08)

**Buena noticia del sondeo:** los services **enumeran campos** en `.values({...})`; NO se
encontró ni un `.values({ ...body })` en `src/modules/`. El patrón correcto ya es el
default del repo.

**Analog de "cómo tiene que verse":** `src/modules/finance/transaction-service.ts:280-300`.

```ts
        .insert(schema.financialTransactions)
        .values({
          memberId: input.memberId,
          kind: input.kind,
          direction: input.direction,
          amount: input.amount,
          currency: input.currency ?? "ARS",
          ...
        });
```

Mismo idioma en `src/modules/members/service.ts:691-716`, `:862-882`, `:942+`.

**Los 6 sitios reales a auditar** son spreads de `request.body` a nivel **ruta**, que
llegan al service como `input` tipado (el riesgo es que el JSON schema de esa ruta no
tenga `additionalProperties: false` y que algún día alguien spreadee `input` en un
`.values`):

| Sitio                              | Línea      | Qué spreadea                                                       |
| ---------------------------------- | ---------- | ------------------------------------------------------------------ |
| `src/modules/members/routes.ts`    | `:650-655` | `createMember({ ...request.body, createdBy, referredBy })`         |
| `src/modules/members/routes.ts`    | `:765-768` | `createTrialMember({ ...request.body, createdBy })`                |
| `src/modules/scheduling/routes.ts` | `:635-638` | `rescheduleTrial({ bookingId, ...request.body })`                  |
| `src/modules/finance/routes.ts`    | `:310`     | `transactionService.create({ ...request.body, validationStatus })` |
| `src/modules/campaigns/routes.ts`  | `:187`     | `service.create({ ...request.body, country })`                     |
| `src/modules/gladius/routes.ts`    | `:185-188` | `service.createProduct({ ...request.body, country })`              |

**Precedente de defensa ya escrito en el repo** (el idioma del fix, si algo aparece):
`src/modules/exercise-adjustments/routes.ts:19` — _"The body schema sets
`additionalProperties: false`, so a spoofed [campo] …"_, y `src/modules/tv/schemas.ts:390`
— _"`additionalProperties: false` es la mitigacion de T-164-43: el cliente no …"_.
Hay 163 usos de `additionalProperties` en `src/` → verificar cuáles de esas 6 rutas lo
tienen y agregarlo donde falte es el fix natural, más barato que reescribir el spread.

También aplica el precedente de campo-que-jamás-viene-del-body,
`members/routes.ts:766`: _"Phase 114 D-31: createdBy comes from the JWT, never the
request body."_ — `tenant_id` es exactamente el mismo contrato, un escalón más arriba.

---

### 8. Tests

#### 8a. Sembrar un 2º tenant ad-hoc (patrón de la 168 — reusar, NO adelantar la 171)

**Analog:** `test/tenancy/con-01-uniques-cross-tenant.test.ts:54-63`.

```ts
// ─── Constantes de tenant ────────────────────────────────────────────────────
// Ningún número mágico suelto en las aserciones: los dos ids viven acá.
//
// El tenant 1 es El Templo, sembrado por la migración 0190 — existe siempre y
// este archivo NUNCA lo borra ni lo modifica.
const TENANT_TEMPLO = 1;
// Id fijo y ALTO a propósito: no colisiona con el autoincremento de `tenants`
// (que hoy está en 1) ni con ningún id que otra fase pueda sembrar. La fila la
// crea el `beforeAll` de este archivo y la borra su `afterAll`.
const TENANT_SEGUNDO = 90168;
```

Y su declaración de alcance (`:38-42`), que la 169 debe respetar textualmente:

> _"Los helpers de acá son mínimos y locales al archivo. Las fixtures 2-tenant completas
> son trabajo de la fase 171 (ISO-03) — no se adelanta esa API ni se agrega nada a
> `test/helpers.ts`."_

⚠️ La 169 necesita **su propio id** (p. ej. `90169`): dos archivos que usen 90168 en el
mismo worker de vitest se pisan (`isolate: false`, `vitest.config.ts:33-40`).

#### 8b. La trampa del DEFAULT 1 — obligatoria en todo test de esta fase

**Analog:** `con-01-uniques-cross-tenant.test.ts:28-32` y `:166-173`.

```
 * (a) `tenant_id` tiene DEFAULT 1 desde la fase 167. Un insert que se OLVIDE de
 *     estampar `tenantId` cae en el tenant 1 sin avisar: el test pasaría en
 *     verde probando exactamente nada. Por eso TODO insert de acá pasa
 *     `tenantId` explícito, incluso los del tenant 1 (T-168-15).
```

```
// LAS OCHO EXIGEN `tenantId: number` COMO PRIMER PARÁMETRO, y no es cosmético:
// es la mitigación de T-168-15 movida al compilador. ... Acá no hay forma de
// construir el payload sin decir de qué tenant es — `tsc` no compila si falta.
```

Aplica literal al test D-09 (mandar `tenantId: 2` en el body y verificar que la fila
nace con `tenant_id = 1`): sin este cuidado el test pasa verde probando nada.

#### 8c. Limpieza obligatoria del 2º tenant

**Analog:** `con-01-uniques-cross-tenant.test.ts:270-289` (`limpiarTenantSegundo`,
orden seguro de FKs, corre en `beforeAll` defensivo y `afterAll` obligatorio, mitigación
T-168-17). Y `test/shared/tenant-scope.test.ts:105-119` para el caso "no dejar el tenant
1 en estado raro":

```ts
// Red incondicional: pase lo que pase en un test, el worker sigue con el
// gimnasio operativo.
afterEach(async () => {
  await app.db.execute(
    sql`UPDATE tenants SET status='active' WHERE id = ${EL_TEMPLO_TENANT_ID}`,
  );
});
```

Crítico para el test del criterio 3 (tenant suspendido no se procesa): si el archivo deja
el tenant 1 suspendido, **rompe todos los tests siguientes del worker**.

#### 8d. Test de cron contra MySQL real

**Analog:** `test/jobs/reassign-multibranch.test.ts:11-64` (único test de job del repo).

```ts
import { createTestApp, cleanAllTestData } from "../helpers";
import { runReassignMultibranch } from "../../src/jobs/reassign-multibranch";

// "Ahora" pinneado. Ventana de asistencias = [NOW-30d, NOW].
const NOW = new Date("2026-06-15T12:00:00Z");

  beforeAll(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    app = await createTestApp();
  });
  afterAll(async () => { vi.useRealTimers(); await app.close(); });
  beforeEach(async () => { await cleanAllTestData(app); seq += 1; ... });
```

Se testea la **función pura exportada** (`runX`), nunca el `cron.schedule` — de ahí que
`auto-approve` y `auto-resume-pauses` necesiten la extracción del §2b.

⚠️ **Advertencia heredada de la 168-REVIEW:** `cleanAllTestData(app)` (`test/helpers.ts:244`)
es **global de admin**, no scopeada por tenant — va a morder cuando existan fixtures
2-tenant. En la 169 conviene NO usarla en el archivo que siembra el 2º tenant (el
`con-01` usa `cleanAllTestData` + su propio `limpiarTenantSegundo`, revisar ese orden).

#### 8e. Test del webhook

**Analog:** `test/wellhub/webhook-checkin.test.ts:1-60` — helpers `uniqueGymId()`,
`uniqueToken()`, `checkinPayload({...})`, firma HMAC con `createHmac`, y ya cubre
_"gym_id sin sede mapeada → skipped, no crea nada"_. El caso D-05 (gym mapeado a sede de
tenant suspendido) es un hermano directo de ese test.

#### 8f. Test unit del helper llamado directo

**Analog:** `test/shared/tenant-scope.test.ts:45-83` — cómo se ejercita un helper de
tenancy sin pasar por una ruta (fake request tipado + cast explícito):

```ts
/** El cast que exige llamar al hook fuera del ciclo de vida de una ruta. */
function run(req: FakeRequest): Promise<void> {
  return attachScope(req as unknown as FastifyRequest, app.db);
}
```

---

## Shared Patterns

### Docblock de decisión (aplica a TODOS los archivos nuevos/tocados)

**Source:** `src/db/tenant-tables.ts:1-51`, `src/db/schema/tenant-column.ts:1-30`,
`src/modules/shared/country-scope.ts:10-20`.

El milestone v6.0 escribe **por qué**, no solo qué, con secciones en MAYÚSCULA y
referencia a la fase/decisión (`Fase 167 (COL-01)`, `D-14`, `T-168-15`). Ejemplo
del formato:

```
// SEGUNDA RESPONSABILIDAD (fase 168, D-13/D-14)
// --------------------------------------------
// ...
// DE DÓNDE SALE LA LISTA
// ----------------------
```

Los archivos de la 169 tienen que citar sus decisiones (D-01…D-09) igual que la 167/168
citan las suyas. El REVIEW de la 168 marcó como warning los comentarios que quedaron
stale — escribir los punteros ("la exención la agregan las fases 169/170") con fecha de
vencimiento clara.

### Regla dura: `tenant_id` server-side, jamás del borde

**Source:** `src/db/schema/tenant-column.ts:11-16` — el texto canónico a citar:

```
// - El valor SALE SIEMPRE DEL SERVIDOR (`scope.tenantId` / `TenantContext`,
//   resuelto por attachScope leyendo `users.tenant_id`). JAMÁS de un payload,
//   de una query string ni del JWT — el tenant no viaja por el borde
//   (D-02/D-03). Esta columna no se expone en ningún schema de request.
```

**Apply to:** `tenant.ts`, los 7 jobs, wellhub, pairing, helper CLI, y los 6 sitios de D-08.

Nótese que el archivo **ya nombra `TenantContext`** — la 167 dejó el hueco escrito; la
169 lo llena. El nombre del tipo no se inventa.

### Fail-closed / default-deny

**Source:** `src/modules/shared/country-scope.ts:169-194` (el patrón completo: log.error
para corrupción de datos + deny aguas abajo, 403 solo para estado comercial).

```ts
      if (row.tenantStatus == null) {
        // El join no matcheó: corrupción de datos ... Se replica exactamente el patrón
        // fail-closed de `country = null` — denegación aguas abajo — en vez
        // de responder 403: una inconsistencia de datos no puede convertirse
        // en una caída masiva del servicio.
        request.log.error({ userId, role }, "attachScope: user has no resolvable tenant ...");
        tenantId = null;
      } else if (row.tenantStatus !== "active") {
```

**Apply to:** el iterador de tenants, la derivación del webhook (D-05) y el helper CLI
(D-07 valida existencia; **NO** exige `active` — contrato deliberadamente distinto).

### Error handling en jobs

**Source:** `src/jobs/expire-lost-leads.ts:127-129`. `catch (err: unknown)` + `log.error({ err }, "...")`,
nunca `console.*` (CLAUDE.md). Sentry viene gratis por pino/`instrument.ts`.

### Logging estructurado

**Source:** cada job crea su logger: `const log = pino({ name: "expire-lost-leads" });`
(`expire-lost-leads.ts:32`). Services reciben `FastifyBaseLogger` por constructor
(`wellhub/service.ts:53-58`, `tv/pairing.ts:66-70`). El `tenantId` va como **campo
estructurado** del primer argumento, jamás interpolado en el mensaje.

### Exención grepeable del sentinel

**Source:** doc 03 §3 capa 3 + `src/db/schema/tv.ts:80`. Formato:
`/* tenant-safe: <motivo> */`. La fase 170 construye el sentinel que las lee; la 169 las
**siembra**. Motivo obligatorio, nunca la anotación pelada.

### Barrel de `shared/`

**Source:** `src/modules/shared/index.ts` — el barrel exporta explícitamente por nombre
(no `export *`). Si `tenant.ts` se exporta ahí, seguir el formato:

```ts
export { auditLog } from "./audit-log";
export type {
  AuditAction,
  AuditTargetKind,
  AuditWriteParams,
} from "./audit-log";
```

Nota: `country-scope.ts` **no está** en el barrel (se importa por path directo desde los
22 call sites). Decisión libre para `tenant.ts`; ser consistente con lo que se elija.

---

## No Analog Found

| Archivo                                        | Rol                | Data flow | Motivo                                                                                                                                                      |
| ---------------------------------------------- | ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Iterador `forEachActiveTenant` sobre `tenants` | utility            | batch     | El shape existe (`getDistinctBranchTimezones`) pero **ningún código del repo itera `tenants`**: es la primera vez. El analog cubre la forma, no el dominio. |
| Test "cron NO procesa tenant suspendido"       | test (integración) | batch     | No hay precedente de test de cron con dos tenants. Se compone de dos analogs (`reassign-multibranch.test.ts` + `con-01`), ninguno lo cubre entero.          |

---

## Riesgos que el planner debería absorber (hallazgos del mapeo)

1. **`tenantId: number | null` vs la firma lockeada `{ tenantId: TenantId }`** (§1b) —
   no compila sin narrowing. Necesita decisión explícita en el plan.
2. **`auto-approve` y `auto-resume-pauses` no tienen `runX()` exportado** (§2b) — hay que
   extraerlo antes de poder testear el loop. Los otros 5 ya lo tienen.
3. **`wellhub_events` se escribe pre-derivación** (§4b) — la idempotencia global (M8) es
   anterior al lookup del gym. Decidir estampado post-hoc vs anotación.
4. **`TvPairingService.claim()` no recibe scope** (§5b) — única firma de service que la
   169 cambia; arrastra `control-routes.ts`. Y `consume()` inserta en `tv_devices` sin
   scope (segundo write post-claim, no mencionado en el CONTEXT).
5. **`createSingleConnection()` devuelve un `db` sin schema tipado** (§6b) — el helper CLI
   tiene que funcionar contra ese handle.
6. **`cleanAllTestData` es admin-global, no scopeada** (§8d) — warning heredado de la
   168-REVIEW; morderá en la 171 pero ya condiciona el orden de limpieza de la 169.
7. **`notification-cron` son 4 schedules en una sola función** (§2c) — el loop se
   multiplica por 4 si no se extrae un helper local.
8. **Id de tenant de test distinto de 90168** (§8a) — colisión entre archivos del mismo
   worker de vitest (`isolate: false`).

---

## Metadata

**Analog search scope:** `el-templo-api/src/jobs/`, `src/modules/shared/`,
`src/modules/wellhub/`, `src/modules/tv/`, `src/db/`, `src/db/scripts/`, `scripts/`,
`src/modules/{members,finance,campaigns,gladius,scheduling}/`, `test/`
**Files read in full or in targeted ranges:** 22
**Commit de lectura:** `1200b8af` (= `origin/master`, worktree `et-168-contratos`)
**Pattern extraction date:** 2026-07-27
