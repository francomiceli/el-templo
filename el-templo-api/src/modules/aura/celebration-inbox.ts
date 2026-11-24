// Module: aura — celebration-inbox (2026-11-20, pedido de Franco con la comunidad en vivo)
//
// La Aura que se celebra en pantalla al abrir Mi Templo ("+5 de Aura" por la
// foto de perfil, una racha, un programa terminado...) también queda en la
// bandeja de Notificaciones. Antes se mostraba una vez y no quedaba en ningún
// lado.
//
// Reglas:
//  - Entra lo mismo que la celebración (`getCelebration`): Aura ganada, monto
//    positivo, sin las fuentes con celebración propia (asistencia,
//    estiramiento, bloque libre). Los +5 de cada clase NO entran: llenarían la
//    bandeja todos los días.
//  - Quedan afuera las fuentes que YA dejan su propio aviso en la bandeja, para
//    no duplicar: los regalos (`social`, `gift-push.ts`) y la antigüedad
//    (`tenure_milestone`, `jobs/tenure-milestones.ts`).
//  - Solo aviso en la bandeja, sin push: la celebración en pantalla ya avisa.
//  - Se guarda al consultar la celebración (ahí está el `ctx` del gimnasio; el
//    ledger se escribe desde muchos lugares sin él). Un aviso por fila del
//    ledger: la clave `a:aura:<id del ledger>` hace que consultar dos veces no
//    duplique nada.
//  - Nace sin leer y el `ack` de la celebración lo marca leído (ya lo vio en
//    pantalla): la campanita no avisa dos veces lo mismo.
//  - Sin marca (primera consulta) no se guarda nada: el historial no se celebra
//    ni se manda a la bandeja.
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { and, desc, eq, gt, isNull, lte, notInArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { inboxDedupeKey } from "../notifications/inbox-rules";
import { InboxService } from "../notifications/inbox-service";
import { CELEBRATION_EXCLUDED_SOURCES } from "./celebration-service";
import { earnedRowsFilter } from "./earned";
import { GIFT_ROUTE } from "./gift-rules";
import { auraMovementLabel } from "./movement-labels";
import type { AuraSourceType } from "./types";

type Db = FastifyInstance["db"];

/** Tipo de aviso de la bandeja para la Aura celebrada. */
export const AURA_INBOX_KIND = "aura";

/** Fuentes que no van a la bandeja por esta vía (las celebradas aparte o con aviso propio). */
export const AURA_INBOX_EXCLUDED_SOURCES: readonly AuraSourceType[] = [
  ...CELEBRATION_EXCLUDED_SOURCES,
  "social",
  "tenure_milestone",
];

/** Tope de avisos por consulta: lo normal es 1 a 3; el resto entra en la próxima. */
export const AURA_INBOX_BATCH = 50;

/** Título y cuerpo del aviso: "Sumaste 5 de Aura" / "Foto de perfil". */
export function auraInboxText(
  amount: number,
  label: string,
): { title: string; body: string } {
  return { title: `Sumaste ${amount} de Aura`, body: label };
}

/**
 * Guarda en la bandeja la Aura pendiente de celebrar que todavía no tiene
 * aviso. Nunca lanza: si algo falla, la celebración sigue igual y se reintenta
 * en la próxima consulta.
 */
export async function recordCelebrationInbox(
  db: Db,
  log: FastifyBaseLogger,
  ctx: TenantContext,
  userId: number,
): Promise<void> {
  try {
    const [profile] = await db
      .select({ mark: schema.memberProfiles.auraCelebratedUntilId })
      .from(schema.memberProfiles)
      .where(
        and(
          tenantWhere(schema.memberProfiles, ctx),
          eq(schema.memberProfiles.userId, userId),
        ),
      )
      .limit(1);
    const mark = profile?.mark ?? null;
    if (mark === null) return;

    const rows = await db
      .select({
        id: schema.auraTransactions.id,
        amount: schema.auraTransactions.amount,
        sourceType: schema.auraTransactions.sourceType,
        referenceType: schema.auraTransactions.referenceType,
        referenceId: schema.auraTransactions.referenceId,
        createdAt: schema.auraTransactions.createdAt,
      })
      .from(schema.auraTransactions)
      .where(
        and(
          tenantWhere(schema.auraTransactions, ctx),
          eq(schema.auraTransactions.userId, userId),
          gt(schema.auraTransactions.id, mark),
          gt(schema.auraTransactions.amount, 0),
          earnedRowsFilter(),
          notInArray(schema.auraTransactions.sourceType, [
            ...AURA_INBOX_EXCLUDED_SOURCES,
          ]),
        ),
      )
      .orderBy(desc(schema.auraTransactions.id))
      .limit(AURA_INBOX_BATCH);

    const inbox = new InboxService(db, log);
    for (const row of rows) {
      const { title, body } = auraInboxText(
        row.amount,
        auraMovementLabel(row.sourceType, row.referenceType, row.referenceId),
      );
      await inbox.recordDirect(ctx, {
        userId,
        kind: AURA_INBOX_KIND,
        refId: row.id,
        dedupeKey: inboxDedupeKey({
          source: "adhoc",
          category: AURA_INBOX_KIND,
          inboxKind: AURA_INBOX_KIND,
          inboxRefId: row.id,
          shownAt: row.createdAt,
          title,
          body,
        }),
        title,
        body,
        route: GIFT_ROUTE,
        destinationType: "app_section",
        destinationSection: null,
        whatsappText: null,
        // Ordena por cuándo se ganó, no por cuándo se abrió la app.
        shownAt: row.createdAt,
      });
    }
  } catch (err: unknown) {
    log.warn(
      { err: err instanceof Error ? err.message : err, userId },
      "No se pudo guardar la Aura celebrada en la bandeja",
    );
  }
}

/**
 * Marca leídos los avisos de Aura hasta `upToId` (id del ledger): la persona ya
 * los vio en la celebración. Nunca lanza.
 */
export async function markCelebrationInboxRead(
  db: Db,
  log: FastifyBaseLogger,
  ctx: TenantContext,
  userId: number,
  upToId: number,
): Promise<void> {
  try {
    await db
      .update(schema.memberNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          tenantWhere(schema.memberNotifications, ctx),
          eq(schema.memberNotifications.userId, userId),
          eq(schema.memberNotifications.kind, AURA_INBOX_KIND),
          lte(schema.memberNotifications.refId, upToId),
          isNull(schema.memberNotifications.readAt),
        ),
      );
  } catch (err: unknown) {
    log.warn(
      { err: err instanceof Error ? err.message : err, userId },
      "No se pudo marcar leída la Aura celebrada en la bandeja",
    );
  }
}
