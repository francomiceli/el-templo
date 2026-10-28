/**
 * Push de Novedades (mig 0297) — paso del tick de notificaciones que encola la
 * push de las novedades que la pidieron y ya salieron al aire.
 *
 * CUÁNDO SE ENVÍA
 * ---------------
 * Al PUBLICARSE, nunca al guardar. `queueDueNovedadPushes` corre al principio de
 * cada tick de `notification-cron.ts` (cada 5 min, una vez por gimnasio activo,
 * ANTES de `processQueue`) y toma las novedades del gimnasio con
 * `push_requested = 1`, `push_queued_at IS NULL`, `status = 'active'` y
 * `publish_at <= ahora`. Una pausada o borrada antes de publicarse no entra
 * nunca; una programada entra recién cuando pasa su hora; una ya publicada a la
 * que se le prende la push entra en el próximo tick.
 *
 * IDEMPOTENCIA
 * ------------
 * Cada novedad se reclama con un UPDATE condicional (`push_queued_at = ahora
 * WHERE id = ? AND push_queued_at IS NULL AND status = 'active' AND
 * push_requested = 1`) y solo se encola si `affectedRows = 1`. El reclamo y los
 * INSERT de las filas de `pending_notifications` van en UNA transacción: dos
 * ticks superpuestos (o dos instancias de la API) se serializan en el lock de la
 * fila, y si algo falla a mitad de camino el rollback devuelve la novedad a "sin
 * encolar" para reintentar en el próximo tick sin dejar filas a medias.
 * "Ahora" es un `Date` de la app, nunca `NOW()` de MySQL (depende de la zona de
 * la sesión), igual que el resto del módulo.
 *
 * AUDIENCIA (sin N+1)
 * -------------------
 * Socios del gimnasio con `role = 'member'`, `status = 'activo'` y sin
 * `deleted_at` (misma definición que `loadActiveMembers` de
 * `notifications/rules.ts`), acotados a `scope_branch_ids` (NULL o `[]` = todas
 * las sedes; si no, `users.branch_id IN (...)`). Se respeta la categoría
 * `anuncios` de `notification_preferences` (el "Novedades" de la app) y se
 * descarta a quien no tiene device token, con la misma semántica que
 * `queueAdHocNotification` pero en bloque: 1 query de socios + 1 de opt-outs + 1
 * de dueños de token por novedad, y los INSERT en tandas de
 * {@link INSERT_CHUNK_SIZE}.
 *
 * Todo pasa por `tenantWhere`/`tenantValues`: el `ctx` viene del barrido
 * `forEachActiveTenant` del cron.
 */
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { novedades } from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  fallbackRouteFor,
  isAppSectionKey,
  type Destination,
} from "./destinations";

type DbInstance = MySql2Database<typeof schema>;
type NovedadRow = typeof novedades.$inferSelect;

/** Categoría de `notification_preferences` que gobierna estas push ("Novedades" en la app). */
export const NOVEDAD_PUSH_CATEGORY = "anuncios";
/** Filas de `pending_notifications` por INSERT. */
export const INSERT_CHUNK_SIZE = 500;
/** Nombre de respaldo si el gimnasio no tiene fila o nombre (no debería pasar: `tenants.name` es NOT NULL). */
const FALLBACK_PUSH_TITLE = "El Templo";

/** Resultado de encolar la push de UNA novedad. */
export interface NovedadPushResult {
  novedadId: number;
  /** Filas de `pending_notifications` creadas. */
  queued: number;
  /** Socios activos del alcance que NO recibieron la push por tener "Novedades" apagado. */
  skippedOptOut: number;
  /** Socios activos del alcance (y con "Novedades" prendido) sin device token. */
  skippedNoToken: number;
}

/** Resultado de un paso del tick para un gimnasio. */
export interface NovedadPushTickResult {
  /** Novedades que este tick reclamó. */
  novedades: number;
  /** Total de filas encoladas. */
  queued: number;
  /** Suma de socios omitidos por tener "Novedades" apagado. */
  skippedOptOut: number;
  /** Suma de socios omitidos por no tener device token. */
  skippedNoToken: number;
  /** Novedades que fallaron (quedan sin reclamar y se reintentan en el próximo tick). */
  failed: number;
}

/**
 * Destino de la push: el de la novedad, o `mi_templo` si no lleva ninguno
 * (los 3 campos NULL = "solo informa"). Una sección desconocida (dato
 * corrupto) también cae a `mi_templo`: la fila nunca queda sin destino.
 */
export function destinationForNovedadPush(
  row: Pick<
    NovedadRow,
    "destinationType" | "destinationSection" | "whatsappText"
  >,
): Destination {
  if (row.destinationType === "whatsapp_sales") {
    return {
      type: "whatsapp_sales",
      section: null,
      whatsappText: row.whatsappText,
    };
  }
  if (
    row.destinationType === "app_section" &&
    isAppSectionKey(row.destinationSection)
  ) {
    return {
      type: "app_section",
      section: row.destinationSection,
      whatsappText: null,
    };
  }
  return { type: "app_section", section: "mi_templo", whatsappText: null };
}

/** Título de la push: el de la novedad, o el nombre del gimnasio. */
export function resolvePushTitle(
  pushTitle: string | null,
  tenantName: string | null,
): string {
  const own = pushTitle?.trim();
  if (own) return own;
  return tenantName?.trim() || FALLBACK_PUSH_TITLE;
}

async function loadTenantName(
  db: DbInstance,
  ctx: TenantContext,
): Promise<string | null> {
  // `tenants` es la raíz del modelo: se filtra por su PK, no tiene tenant_id.
  const [row] = await db
    .select({ name: schema.tenants.name })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId))
    .limit(1);
  return row?.name ?? null;
}

/**
 * Ids de los socios que reciben la push de `row`, más los conteos de los que
 * quedan afuera. 3 queries sin importar el tamaño de la audiencia.
 */
async function resolveAudience(
  db: DbInstance,
  ctx: TenantContext,
  row: NovedadRow,
): Promise<{
  recipients: number[];
  skippedOptOut: number;
  skippedNoToken: number;
}> {
  const scope = row.scopeBranchIds ?? [];
  const members = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.role, "member"),
        eq(schema.users.status, "activo"),
        isNull(schema.users.deletedAt),
        scope.length > 0 ? inArray(schema.users.branchId, scope) : undefined,
      ),
    );

  // Opt-outs y dueños de token de TODO el gimnasio (conjuntos chicos, una query
  // cada uno) y se cruzan en memoria: evita un `IN (...)` de miles de ids.
  const optOutRows = await db
    .select({ userId: schema.notificationPreferences.userId })
    .from(schema.notificationPreferences)
    .where(
      and(
        tenantWhere(schema.notificationPreferences, ctx),
        eq(schema.notificationPreferences.category, NOVEDAD_PUSH_CATEGORY),
        eq(schema.notificationPreferences.enabled, false),
      ),
    );
  const optedOut = new Set(optOutRows.map((r) => r.userId));

  const tokenRows = await db
    .selectDistinct({ userId: schema.deviceTokens.userId })
    .from(schema.deviceTokens)
    .where(tenantWhere(schema.deviceTokens, ctx));
  const withToken = new Set(tokenRows.map((r) => r.userId));

  const recipients: number[] = [];
  let skippedOptOut = 0;
  let skippedNoToken = 0;
  for (const { id } of members) {
    if (optedOut.has(id)) {
      skippedOptOut += 1;
    } else if (!withToken.has(id)) {
      skippedNoToken += 1;
    } else {
      recipients.push(id);
    }
  }
  return { recipients, skippedOptOut, skippedNoToken };
}

/**
 * Reclama y encola la push de UNA novedad. Devuelve `null` si otro tick ya la
 * reclamó (o si la pausaron/borraron entre el SELECT y el UPDATE).
 */
async function queueNovedadPush(
  db: DbInstance,
  ctx: TenantContext,
  row: NovedadRow,
  getTenantName: () => Promise<string | null>,
  now: Date,
): Promise<NovedadPushResult | null> {
  const title = row.pushTitle?.trim()
    ? resolvePushTitle(row.pushTitle, null)
    : resolvePushTitle(null, await getTenantName());
  const destination = destinationForNovedadPush(row);
  const route = fallbackRouteFor(destination);

  return db.transaction(async (tx) => {
    const [claim] = await tx
      .update(novedades)
      .set({ pushQueuedAt: now })
      .where(
        and(
          tenantWhere(novedades, ctx),
          eq(novedades.id, row.id),
          eq(novedades.status, "active"),
          eq(novedades.pushRequested, true),
          isNull(novedades.pushQueuedAt),
        ),
      );
    if (claim.affectedRows !== 1) return null;

    const audience = await resolveAudience(tx, ctx, row);

    for (let i = 0; i < audience.recipients.length; i += INSERT_CHUNK_SIZE) {
      const chunk = audience.recipients.slice(i, i + INSERT_CHUNK_SIZE);
      await tx.insert(schema.pendingNotifications).values(
        chunk.map((userId) =>
          tenantValues(ctx, {
            userId,
            templateId: null,
            title,
            body: row.text,
            route,
            destinationType: destination.type,
            destinationSection: destination.section,
            whatsappText: destination.whatsappText,
            status: "pending" as const,
            scheduledAt: now,
          }),
        ),
      );
    }

    return {
      novedadId: row.id,
      queued: audience.recipients.length,
      skippedOptOut: audience.skippedOptOut,
      skippedNoToken: audience.skippedNoToken,
    };
  });
}

/**
 * Un paso del tick para UN gimnasio: encola la push de cada novedad vencida.
 * Un fallo en una novedad se loguea y NO frena a las demás (su transacción hizo
 * rollback, así que se reintenta en el próximo tick).
 */
export async function queueDueNovedadPushes(
  db: DbInstance,
  ctx: TenantContext,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<NovedadPushTickResult> {
  const due = await db
    .select()
    .from(novedades)
    .where(
      and(
        tenantWhere(novedades, ctx),
        eq(novedades.status, "active"),
        eq(novedades.pushRequested, true),
        isNull(novedades.pushQueuedAt),
        lte(novedades.publishAt, now),
      ),
    )
    .orderBy(novedades.publishAt, novedades.id);

  const result: NovedadPushTickResult = {
    novedades: 0,
    queued: 0,
    skippedOptOut: 0,
    skippedNoToken: 0,
    failed: 0,
  };
  if (due.length === 0) return result;

  // El nombre del gimnasio se lee una sola vez y solo si alguna novedad lo necesita.
  let tenantName: Promise<string | null> | undefined;
  const getTenantName = () => (tenantName ??= loadTenantName(db, ctx));

  for (const row of due) {
    try {
      const pushed = await queueNovedadPush(db, ctx, row, getTenantName, now);
      if (!pushed) continue;
      result.novedades += 1;
      result.queued += pushed.queued;
      result.skippedOptOut += pushed.skippedOptOut;
      result.skippedNoToken += pushed.skippedNoToken;
      log.info(
        {
          tenantId: ctx.tenantId,
          novedadId: pushed.novedadId,
          queued: pushed.queued,
          skippedOptOut: pushed.skippedOptOut,
          skippedNoToken: pushed.skippedNoToken,
        },
        "Push de novedad encolada",
      );
    } catch (err: unknown) {
      result.failed += 1;
      log.error(
        {
          tenantId: ctx.tenantId,
          novedadId: row.id,
          err: err instanceof Error ? err.message : "Unknown error",
        },
        "No se pudo encolar la push de una novedad (se reintenta en el próximo tick)",
      );
    }
  }

  return result;
}
