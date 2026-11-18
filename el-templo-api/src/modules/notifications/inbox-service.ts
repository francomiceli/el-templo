/**
 * InboxService — escritura de la bandeja de avisos (fase 215, D-17 y D-18).
 *
 * La bandeja (`member_notifications`) guarda una copia de cada aviso personal
 * que la app manda, durante 90 días (la cola `pending_notifications` se purga
 * a las 24 h). Este servicio solo ESCRIBE; las lecturas las suma el plan 14.
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
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantValues, type TenantContext } from "../shared/tenant";
import { INBOX_RETENTION_DAYS, inboxKindFor } from "./inbox-rules";

type DbInstance = MySql2Database<typeof schema>;

const DAY_MS = 24 * 60 * 60 * 1000;

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

    /* tenant-safe: barrido cron genuinamente cross-tenant — purga la bandeja de TODOS los gimnasios por fecha, igual que purgeOldNotifications (T-175-03) */
    const result = await this.db
      .delete(schema.memberNotifications)
      .where(
        and(
          sql`/* tenant-safe: barrido cron genuinamente cross-tenant — purga la bandeja de TODOS los gimnasios por fecha, igual que purgeOldNotifications (T-175-03) */ 1 = 1`,
          lt(schema.memberNotifications.shownAt, cutoff),
        ),
      );

    const deletedCount = result[0].affectedRows ?? 0;
    if (deletedCount > 0) {
      this.log.info({ deletedCount }, "Purgados avisos viejos de la bandeja");
    }
    return deletedCount;
  }
}
