/**
 * InboxService — escritura de la bandeja de avisos (fase 215, D-17 y D-18).
 *
 * La bandeja (`member_notifications`) guarda una copia de cada aviso personal
 * que la app manda, durante 90 días (la cola `pending_notifications` se purga
 * a las 24 h). Escribe (planes 12 y 13) y, desde el plan 14, lee para la app:
 * lista paginada, contador de sin leer y marcar leído.
 *
 * Dos caminos de escritura, dos UNIQUE:
 * - `recordFromQueue`: el aviso salió de una fila de la cola. Lo hace único
 *   `(tenant_id, pending_notification_id)`: si el barrido reintenta, no se
 *   duplica.
 * - `recordDirect`: la persona no tiene push, así que no hay fila en la cola.
 *   Un job que se fija en la cola para no repetirse (ej. el recordatorio de
 *   clase, cada 5 minutos con ventana de 10) la volvería a pedir en el próximo
 *   tick. Por eso `dedupeKey` es obligatorio (armada con `inboxDedupeKey`) y lo
 *   hace único `(tenant_id, user_id, dedupe_key)`.
 *
 * La bandeja NUNCA frena la push: todo error se atrapa y se loguea.
 */
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import {
  isAnonymousGiver,
  type GiftGiverKind,
  type GiftReason,
  type GiftVoidCause,
} from "../aura/gift-rules";
import { hiddenCommunityUserIds } from "../scheduling/community-service";
import {
  INBOX_RETENTION_DAYS,
  formatInboxCursor,
  inboxKindFor,
  parseInboxCursor,
} from "./inbox-rules";

type DbInstance = MySql2Database<typeof schema>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Filas por sentencia de la purga y tope de lotes por corrida (LO-04). */
const INBOX_PURGE_BATCH = 1000;
const INBOX_PURGE_MAX_BATCHES = 50;

/** Fila de la cola de la que sale el aviso (campos que la bandeja copia). */
export interface InboxQueueRow {
  id: number;
  tenantId: number;
  userId: number;
  title: string;
  body: string;
  route: string | null;
  destinationType: string;
  destinationSection: string | null;
  whatsappText: string | null;
  inboxKind: string | null;
  templateCategory: string | null;
  inboxRefId: number | null;
}

/** Aviso personal de quien no tiene push (sin fila en la cola). */
export interface InboxDirectInput {
  userId: number;
  kind: string;
  refId?: number | null;
  dedupeKey: string;
  title: string;
  body: string;
  route: string | null;
  destinationType: string;
  destinationSection: string | null;
  whatsappText: string | null;
  shownAt: Date;
}

/** Fila de la lista de la bandeja (lo que la ruta necesita, sin `user_id`). */
export interface InboxListRow {
  id: number;
  kind: string;
  refId: number | null;
  title: string;
  body: string;
  route: string | null;
  destinationType: string;
  destinationSection: string | null;
  whatsappText: string | null;
  shownAt: Date;
  readAt: Date | null;
}

/** Una página de la bandeja y el cursor de la siguiente (null si no hay más). */
export interface InboxPage {
  rows: InboxListRow[];
  nextBefore: string | null;
}

/** Datos del regalo que acompañan a un aviso `aura_gift`. */
export interface InboxGiftInfo {
  amount: number;
  giverKind: GiftGiverKind;
  giverUserId: number;
  giverFirstName: string | null;
  giverLastInitial: string | null;
  status: "vigente" | "anulado";
  /** Causa de la anulación (#28, #37). Null si está vigente o es un dato viejo. */
  voidCause: GiftVoidCause | null;
  reason: GiftReason;
  /**
   * ME-01 y #38: quien dio hoy esta oculto o no tiene nombre. Con `true` el
   * nombre y la inicial ya vienen en null y la ruta no pide la foto.
   */
  anonymous: boolean;
}

export class InboxService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Guarda en la bandeja el aviso que acaba de salir de la cola. Idempotente:
   * si ya existe la fila de ese `pending_notification_id` no hace nada.
   *
   * Barrido cross-tenant: copia el `tenant_id` de la fila de la cola (que ya
   * nació con el correcto, T-175-03), no hay `ctx`.
   */
  async recordFromQueue(row: InboxQueueRow): Promise<void> {
    try {
      /* tenant-safe: barrido cron cross-tenant — el tenant_id se copia de la fila de la cola, que ya nació con el gimnasio correcto (T-175-03) */
      await this.db
        .insert(schema.memberNotifications)
        .values(
          tenantValues(
            { tenantId: row.tenantId },
            {
              userId: row.userId,
              pendingNotificationId: row.id,
              dedupeKey: null,
              kind: inboxKindFor({
                inboxKind: row.inboxKind,
                category: row.templateCategory,
              }),
              refId: row.inboxRefId,
              title: row.title,
              body: row.body,
              route: row.route,
              destinationType: row.destinationType,
              destinationSection: row.destinationSection,
              whatsappText: row.whatsappText,
              shownAt: new Date(),
            },
          ),
        )
        // Si el UNIQUE ya existe se reasigna `id` a sí mismo: no cambia nada.
        .onDuplicateKeyUpdate({ set: { id: sql`id` } });
    } catch (err: unknown) {
      this.log.warn(
        { err, pendingNotificationId: row.id },
        "No se pudo guardar el aviso en la bandeja",
      );
    }
  }

  /**
   * Guarda un aviso de quien no tiene push, desde la hora programada. El
   * `dedupeKey` es obligatorio: sin él un reintento del job duplicaría el
   * aviso. Si la clave ya existe para esa persona no hace nada.
   */
  async recordDirect(
    ctx: TenantContext,
    input: InboxDirectInput,
  ): Promise<void> {
    try {
      await this.db
        .insert(schema.memberNotifications)
        .values(
          tenantValues(ctx, {
            userId: input.userId,
            pendingNotificationId: null,
            dedupeKey: input.dedupeKey,
            kind: inboxKindFor({ inboxKind: input.kind, category: null }),
            refId: input.refId ?? null,
            title: input.title,
            body: input.body,
            route: input.route,
            destinationType: input.destinationType,
            destinationSection: input.destinationSection,
            whatsappText: input.whatsappText,
            shownAt: input.shownAt,
          }),
        )
        .onDuplicateKeyUpdate({ set: { id: sql`id` } });
    } catch (err: unknown) {
      // Sin textos en el log: solo quién y de qué tipo.
      this.log.warn(
        { err, userId: input.userId, kind: input.kind },
        "No se pudo guardar el aviso directo en la bandeja",
      );
    }
  }

  /**
   * Marca como leído el aviso que salió de una fila de la cola, cuando la
   * persona abre la push. Exige que sea del usuario del token (T-215-12-02).
   *
   * Pre-scope, igual que `recordOpened`: la ruta solo recibe el id de la cola,
   * sin `ctx`.
   */
  async markReadByPending(
    pendingNotificationId: number,
    userId: number,
  ): Promise<void> {
    try {
      /* tenant-safe: pre-scope — pendingNotificationId es la PK de la cola y se exige que la fila sea del usuario autenticado (userId), igual que recordOpened (T-175-03) */
      await this.db
        .update(schema.memberNotifications)
        .set({ readAt: new Date() })
        .where(
          and(
            sql`/* tenant-safe: pre-scope — pendingNotificationId es la PK de la cola y se exige que la fila sea del usuario autenticado (userId), igual que recordOpened (T-175-03) */ ${schema.memberNotifications.pendingNotificationId} = ${pendingNotificationId}`,
            eq(schema.memberNotifications.userId, userId),
            isNull(schema.memberNotifications.readAt),
          ),
        );
    } catch (err: unknown) {
      this.log.warn(
        { err, pendingNotificationId, userId },
        "No se pudo marcar leído el aviso de la bandeja",
      );
    }
  }

  /**
   * Borra los avisos de más de 90 días de TODOS los gimnasios y devuelve
   * cuántos borró. Barrido cron cross-tenant, igual que
   * `purgeOldNotifications`: solo filtra por fecha y no lee ni expone nada.
   */
  async purgeOld(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - INBOX_RETENTION_DAYS * DAY_MS);

    // LO-04: de a lotes, para que el primer barrido tras un atraso no borre
    // todo en una sola sentencia. Si quedan más, el próximo tick sigue.
    let deletedCount = 0;
    for (let batch = 0; batch < INBOX_PURGE_MAX_BATCHES; batch += 1) {
      /* tenant-safe: barrido cron genuinamente cross-tenant — purga la bandeja de TODOS los gimnasios por fecha, igual que purgeOldNotifications (T-175-03) */
      const result = await this.db
        .delete(schema.memberNotifications)
        .where(
          and(
            sql`/* tenant-safe: barrido cron genuinamente cross-tenant — purga la bandeja de TODOS los gimnasios por fecha, igual que purgeOldNotifications (T-175-03) */ 1 = 1`,
            lt(schema.memberNotifications.shownAt, cutoff),
          ),
        )
        .limit(INBOX_PURGE_BATCH);
      const deleted = result[0].affectedRows ?? 0;
      deletedCount += deleted;
      if (deleted < INBOX_PURGE_BATCH) break;
    }

    if (deletedCount > 0) {
      this.log.info({ deletedCount }, "Purgados avisos viejos de la bandeja");
    }
    return deletedCount;
  }

  /**
   * Página de avisos de la persona, del más nuevo al más viejo. Solo los ya
   * visibles (`shown_at <= NOW()`). Se pagina por `(shown_at, id)`: `before` es
   * el `nextBefore` de la página anterior; un cursor inválido se ignora y se
   * devuelve la primera página.
   */
  async listForUser(
    ctx: TenantContext,
    userId: number,
    opts: { before?: string; limit: number },
  ): Promise<InboxPage> {
    const cursor =
      opts.before !== undefined ? parseInboxCursor(opts.before) : null;
    const shownAt = cursor ? new Date(cursor.shownAtMs) : null;

    const found = await this.db
      .select({
        id: schema.memberNotifications.id,
        kind: schema.memberNotifications.kind,
        refId: schema.memberNotifications.refId,
        title: schema.memberNotifications.title,
        body: schema.memberNotifications.body,
        route: schema.memberNotifications.route,
        destinationType: schema.memberNotifications.destinationType,
        destinationSection: schema.memberNotifications.destinationSection,
        whatsappText: schema.memberNotifications.whatsappText,
        shownAt: schema.memberNotifications.shownAt,
        readAt: schema.memberNotifications.readAt,
      })
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.userId, userId),
          lte(schema.memberNotifications.shownAt, sql`NOW()`),
          cursor && shownAt
            ? or(
                lt(schema.memberNotifications.shownAt, shownAt),
                and(
                  eq(schema.memberNotifications.shownAt, shownAt),
                  lt(schema.memberNotifications.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(schema.memberNotifications.shownAt),
        desc(schema.memberNotifications.id),
      )
      .limit(opts.limit + 1);

    const hasMore = found.length > opts.limit;
    const rows = hasMore ? found.slice(0, opts.limit) : found;
    const last = rows[rows.length - 1];
    return {
      rows,
      nextBefore:
        hasMore && last ? formatInboxCursor(last.shownAt, last.id) : null,
    };
  }

  /**
   * Datos de los regalos recibidos por `receiverUserId`, por id de regalo, en
   * UNA consulta con quien dio unido. Del dador solo salen el nombre de pila y
   * la inicial del apellido. Filtrar por el receptor es una segunda defensa: un
   * aviso nunca puede traer un regalo de otra persona. Un regalo que no existe
   * (o no es de esa persona) no aparece en el mapa.
   */
  async giftInfoFor(
    ctx: TenantContext,
    receiverUserId: number,
    giftIds: readonly number[],
  ): Promise<Map<number, InboxGiftInfo>> {
    const result = new Map<number, InboxGiftInfo>();
    if (giftIds.length === 0) return result;

    const rows = await this.db
      .select({
        id: schema.auraGifts.id,
        amount: schema.auraGifts.amount,
        giverKind: schema.auraGifts.giverKind,
        giverUserId: schema.auraGifts.giverUserId,
        status: schema.auraGifts.status,
        voidCause: schema.auraGifts.voidCause,
        reason: schema.auraGifts.reason,
        giverFirstName: schema.users.firstName,
        giverLastInitial: sql<string | null>`LEFT(${schema.users.lastName}, 1)`,
      })
      .from(schema.auraGifts)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.auraGifts.giverUserId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.auraGifts, ctx),
          eq(schema.auraGifts.receiverUserId, receiverUserId),
          inArray(schema.auraGifts.id, [...giftIds]),
        ),
      );

    const hidden = await hiddenCommunityUserIds(
      this.db,
      ctx,
      rows
        .filter((row) => row.giverKind === "alumno")
        .map((r) => r.giverUserId),
    );

    for (const row of rows) {
      const anonymous = isAnonymousGiver({
        giverKind: row.giverKind,
        giverFirstName: row.giverFirstName,
        giverLastInitial: null,
        reason: row.reason,
        giverHidden: hidden.has(row.giverUserId),
      });
      result.set(row.id, {
        amount: row.amount,
        giverKind: row.giverKind,
        giverUserId: row.giverUserId,
        giverFirstName: anonymous ? null : row.giverFirstName,
        giverLastInitial:
          row.giverKind === "profe" || anonymous ? null : row.giverLastInitial,
        status: row.status,
        voidCause: row.status === "anulado" ? row.voidCause : null,
        reason: row.reason,
        anonymous,
      });
    }
    return result;
  }

  /** Cantidad de avisos visibles y sin leer de la persona. */
  async unreadCount(ctx: TenantContext, userId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.userId, userId),
          lte(schema.memberNotifications.shownAt, sql`NOW()`),
          isNull(schema.memberNotifications.readAt),
        ),
      );
    return Number(row?.count ?? 0);
  }

  /**
   * Marca leído un aviso propio. Devuelve false si no existe o es de otra
   * persona (la ruta responde 404 sin revelar cuál de las dos). Marcar dos veces
   * responde igual: no se exige `read_at IS NULL` y el SELECT previo evita
   * depender de `affectedRows` (FOUND_ROWS cuenta encontradas, no cambiadas).
   */
  async markRead(
    ctx: TenantContext,
    userId: number,
    id: number,
  ): Promise<boolean> {
    const [own] = await this.db
      .select({ id: schema.memberNotifications.id })
      .from(schema.memberNotifications)
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.id, id),
          eq(schema.memberNotifications.userId, userId),
        ),
      )
      .limit(1);
    if (!own) return false;

    await this.db
      .update(schema.memberNotifications)
      .set({
        readAt: sql`COALESCE(${schema.memberNotifications.readAt}, NOW())`,
      })
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.id, id),
          eq(schema.memberNotifications.userId, userId),
        ),
      );
    return true;
  }

  /** Marca leídos todos los avisos visibles y sin leer de la persona. */
  async markAllRead(ctx: TenantContext, userId: number): Promise<void> {
    await this.db
      .update(schema.memberNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.userId, userId),
          lte(schema.memberNotifications.shownAt, sql`NOW()`),
          isNull(schema.memberNotifications.readAt),
        ),
      );
  }
}
