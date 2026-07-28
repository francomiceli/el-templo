// Módulo: tenant — la ÚNICA API de lectura y escritura con tenant (v6.0, CON-03/CON-04)
//
// QUÉ ES
// ------
// Este archivo es la capa 2 del diseño de tenancy (doc 03 §3): las funciones
// que todo módulo usa para filtrar y para escribir con `tenant_id`. La capa 1
// (`country-scope.ts`) resuelve QUIÉN es el gimnasio del request; esta capa es
// la que APLICA ese dato a las queries.
//
// Hay UNA sola API, no dos (CON-03). El contrato es `{ tenantId }` PLANO, así
// que el `scope` de un request (`CountryScope`) y un `TenantContext` construido
// a mano son estructuralmente compatibles: los caminos que nacen fuera de un
// request —los 7 crons, el webhook de Wellhub, los scripts CLI— pasan por los
// mismos helpers que las rutas, sin una API paralela que se pueda desincronizar.
//
// CONVENCIONES DE USO (las fija el doc 03 §3 junto con la firma)
// --------------------------------------------------------------
//   - `and(tenantWhere(table, scope), ...resto)` como PRIMER término de TODO
//     WHERE sobre una tabla gym-owned (las 87 de `src/db/tenant-tables.ts`).
//   - En un `sql` crudo: `WHERE tenant_id = ${scope.tenantId} AND ...`.
//   - En todo INSERT sobre tabla gym-owned: `.values(tenantValues(scope, {...}))`.
//
// DE DÓNDE SALE EL TENANT
// -----------------------
// Del servidor, SIEMPRE. Texto canónico de `src/db/schema/tenant-column.ts:10-13`:
//
//   "El valor SALE SIEMPRE DEL SERVIDOR (`scope.tenantId` / `TenantContext`,
//    resuelto por attachScope leyendo `users.tenant_id`). JAMÁS de un payload,
//    de una query string ni del JWT — el tenant no viaja por el borde
//    (D-02/D-03). Esta columna no se expone en ningún schema de request."
//
// Las cuatro fuentes legítimas de un `TenantContext`, y no hay una quinta:
//   1. `assertTenant(request.scope, "<dónde>")` — camino con request.
//   2. El loop `forEachActiveTenant` de los crons (D-01).
//   3. La derivación del webhook de Wellhub
//      (`payload.gym.id` → `branches.wellhub_gym_id` → `branches.tenant_id`, CON-04).
//   4. El `--tenant=<id>` obligatorio de los scripts CLI que escriben gym-owned (D-06).
//
// POR QUÉ HAY UN GUARD (`assertTenant`)
// -------------------------------------
// `CountryScope.tenantId` es `number | null` y la firma lockeada del doc 03 pide
// `number`. Ese `null` es corrupción de datos y significa DENY — nunca "todos
// los gimnasios". Es una orden explícita de `country-scope.ts:33-37`. Por eso el
// narrowing es un guard EXPORTADO y fail-closed (403 `TENANT_UNRESOLVED`), y no
// un non-null assertion ni un `?? 1` escondido: prohibidos los dos, en todo el
// repo, para siempre. El guard se llama en el CALL SITE y no dentro de
// `tenantWhere`, para que el narrowing sea visible en el diff que lo introduce.
//
// ALCANCE DE LA FASE 169 (D-02)
// -----------------------------
// El `TenantContext` llega hasta el CUERPO de los jobs y hasta el punto de
// derivación del webhook. Los services MANTIENEN su firma actual hasta su fase
// de adopción (172-175, `finance` primero). Con un solo tenant activo el
// resultado es idéntico al de hoy: el cuerpo de cada job sigue siendo global.
// Por eso el gate del MILESTONE (no de esta fase) es que el tenant 2 no se
// onboardea hasta que la batería de aislamiento ISO-03 (fase 171) esté verde.
//
// AISLAMIENTO DE ERRORES EN EL SWEEP (D-03)
// -----------------------------------------
// Un gimnasio roto no puede frenar a los demás: `forEachActiveTenant` atrapa por
// iteración, loguea con `tenantId` estructurado y SIGUE. `log.error` de pino ya
// llega a Sentry vía `instrument.ts` (CLAUDE.md), así que este archivo no
// importa `@sentry/node`.
//
// Este archivo NO se exporta desde el barrel `src/modules/shared/index.ts`, a
// propósito: `country-scope.ts` tampoco está y se importa por path directo desde
// sus 22 call sites. La 169 es consistente con eso.
import { eq } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { AppError } from "./errors";

/**
 * Id de gimnasio. Alias de `number` por ahora; un brand type se evalúa más
 * adelante (mismo diferimiento que `TxHandle`), cuando el costo de tocarlo sea
 * menor que el de convivir con ids desnudos.
 */
export type TenantId = number;

/**
 * Fase 169 (CON-03) — código estable del 403 con el que se corta un camino cuyo
 * gimnasio no se pudo resolver (`scope.tenantId === null`).
 *
 * Hermano de `TENANT_SUSPENDED` (`country-scope.ts:20`), pero NO es lo mismo:
 * `TENANT_SUSPENDED` es estado comercial (el gimnasio existe y está cortado a
 * propósito); `TENANT_UNRESOLVED` es corrupción de datos (la FK
 * `fk_users_tenant` lo vuelve imposible en la práctica). Los dos responden 403
 * porque aguas abajo el efecto es el mismo: no se toca un solo dato.
 *
 * 403 y no 500 deliberadamente: el criterio heredado de la 166 es DENEGAR aguas
 * abajo, no convertir una inconsistencia de datos en una caída del servicio.
 */
export const TENANT_UNRESOLVED = "TENANT_UNRESOLVED";

/**
 * Gimnasio dueño de los datos de una operación, ya resuelto server-side.
 *
 * `{ tenantId }` plano a propósito (CON-03): `CountryScope` lo satisface
 * estructuralmente, así que un `request.scope` narrowed por {@link assertTenant}
 * y un contexto construido por el loop de crons son el MISMO tipo para todos
 * los helpers de acá. No hay dos APIs.
 */
export interface TenantContext {
  tenantId: TenantId;
}

/**
 * Interfaz mínima de logger que {@link forEachActiveTenant} necesita.
 *
 * Estructural a propósito: la satisfacen tanto el `pino()` que cada job crea
 * (`expire-lost-leads.ts:32`) como el `FastifyBaseLogger` que reciben los
 * services por constructor. El sweep no importa pino ni Fastify, así que se
 * puede testear con un logger falso sin montar nada.
 */
export interface TenantLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

/** Resultado agregado de un barrido por tenants activos. */
export interface TenantSweepResult {
  /** Cuántos tenants activos se encontraron. */
  tenants: number;
  /** Para cuántos el callback terminó sin lanzar. */
  ok: number;
  /** Para cuántos lanzó (ya logueado y absorbido, D-03). */
  failed: number;
}

/**
 * Filtro estándar por gimnasio. Firma LOCKEADA por el doc 03 §3 — no se
 * re-diseña.
 *
 * ```ts
 * const rows = await db
 *   .select()
 *   .from(schema.auraConfig)
 *   .where(and(tenantWhere(schema.auraConfig, ctx), eq(schema.auraConfig.sourceType, "x")));
 * ```
 *
 * `scope` pide `TenantId` (o sea `number`), NO `number | null`: un
 * `request.scope` crudo NO compila contra esta firma y tiene que pasar antes por
 * {@link assertTenant}. Esa fricción es la mitigación de T-169-01 movida al
 * compilador — sin ella, un `null` produciría una query SIN filtro de tenant
 * sobre una tabla gym-owned.
 */
export function tenantWhere<T extends { tenantId: AnyMySqlColumn }>(
  table: T,
  scope: { tenantId: TenantId },
) {
  return eq(table.tenantId, scope.tenantId);
}

/**
 * Valores de INSERT sobre una tabla gym-owned. Firma LOCKEADA por el doc 03 §3.
 *
 * ```ts
 * await db.insert(schema.auraConfig).values(tenantValues(ctx, { sourceType: "x" }));
 * ```
 *
 * El `tenantId` del scope va DESPUÉS del spread de `values` y por lo tanto PISA
 * cualquier `tenantId` que viniera adentro: es la mitigación de mass-assignment
 * (T-169-02) a nivel de tipo y de runtime a la vez. Si un día un body del cliente
 * se spreadea hasta acá, el gimnasio sigue saliendo del servidor.
 *
 * No muta `values`: devuelve un objeto nuevo.
 */
export function tenantValues<V extends Record<string, unknown>>(
  scope: { tenantId: TenantId },
  values: V,
): V & { tenantId: TenantId } {
  return { ...values, tenantId: scope.tenantId };
}

/**
 * Narrowing fail-closed de un scope de request a un {@link TenantContext}.
 *
 * Es el ÚNICO puente permitido entre `CountryScope.tenantId` (`number | null`) y
 * la firma lockeada de los helpers (`number`). Prohibido resolverlo con un
 * non-null assertion o con un default numérico: un gimnasio no resoluble es
 * DENY, jamás "el tenant 1" y jamás "todos los gimnasios"
 * (`country-scope.ts:33-37`).
 *
 * @param scope cualquier cosa con `tenantId` — típicamente `request.scope`.
 * @param where dónde se llamó, para que el log del 403 sea accionable
 *   (p. ej. `"finance.createTransaction"`).
 * @throws {AppError} 403 con `code = TENANT_UNRESOLVED` cuando `tenantId` es
 *   `null` o `undefined`.
 */
export function assertTenant(
  scope: { tenantId: number | null },
  where: string,
): TenantContext {
  const tenantId = scope.tenantId;
  if (typeof tenantId !== "number") {
    throw new AppError(
      `No se pudo resolver el gimnasio (${where})`,
      403,
      TENANT_UNRESOLVED,
    );
  }
  return { tenantId };
}

/**
 * Los gimnasios ACTIVOS, ordenados por id.
 *
 * La comparación es POSITIVA contra `'active'` y no una exclusión de la lista de
 * estados malos (`suspended`/`archived`, `src/db/schema/tenants.ts:45-49`): un
 * estado que se agregue al enum en el futuro queda DENEGADO por default en vez
 * de colarse en el barrido de todos los crons. Mismo criterio que
 * `country-scope.ts:180-184`.
 *
 * La lista se resuelve en cada llamada, no en el boot: activar un gimnasio no
 * debería exigir un restart de la API (mismo espíritu que "el tenant no viaja en
 * el JWT", `country-scope.ts:30-31`).
 */
export async function listActiveTenants(
  db: MySql2Database<typeof schema>,
): Promise<TenantContext[]> {
  const rows = await db
    .select({ id: schema.tenants.id })
    .from(schema.tenants)
    .where(eq(schema.tenants.status, "active"))
    .orderBy(schema.tenants.id);
  return rows.map((row) => ({ tenantId: row.id }));
}

/**
 * Corre `run` una vez por gimnasio activo (D-01), en SECUENCIA.
 *
 * Secuencial y no en paralelo a propósito: con un solo tenant activo no hay nada
 * que paralelizar, y el orden secuencial conserva exactamente el comportamiento
 * actual de los 7 jobs (misma presión sobre el pool de MySQL que hoy).
 *
 * Aislamiento de errores (D-03): el `try/catch` está DENTRO del loop. Si `run`
 * lanza para un gimnasio, se loguea con `tenantId` como CAMPO ESTRUCTURADO
 * (jamás interpolado en el mensaje) y el barrido SIGUE con el siguiente. Un
 * gimnasio roto no frena a los demás (T-169-04). El error no se re-lanza: el
 * resultado devuelto es la forma de enterarse.
 *
 * Lista vacía: no es un error (podría ser una base recién provisionada), pero
 * tampoco puede pasar en silencio — se loguea `warn` y el resultado vuelve en
 * cero.
 */
export async function forEachActiveTenant(
  db: MySql2Database<typeof schema>,
  log: TenantLogger,
  jobName: string,
  run: (ctx: TenantContext) => Promise<void>,
): Promise<TenantSweepResult> {
  const tenants = await listActiveTenants(db);

  if (tenants.length === 0) {
    log.warn({ job: jobName }, "Barrido por tenant sin gimnasios activos");
    return { tenants: 0, ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;
  for (const ctx of tenants) {
    try {
      await run(ctx);
      ok += 1;
    } catch (err: unknown) {
      failed += 1;
      log.error(
        { err, tenantId: ctx.tenantId, job: jobName },
        "Barrido por tenant fallo para un gimnasio; sigue con el siguiente",
      );
    }
  }

  return { tenants: tenants.length, ok, failed };
}
