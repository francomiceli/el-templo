// Módulo: referrals — avisos al invitador cuando su descuento queda activo (Fase 194-14)
//
// Separado de `invitation-link.ts` a propósito (ME-02): acá se importa
// `NotificationService`, que arrastra comunicaciones y rutas de suscripciones. El
// árbitro de descuentos solo necesita `findLinkableInvitation`, así que el vínculo
// queda como hoja y este archivo lo consumen únicamente los call sites de cobro.
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotificationService } from "../notifications/service";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Aviso al invitador de que su descuento quedó activo. Best-effort (D-33): un fallo
 * de la cola JAMÁS relanza ni rompe el cobro. Lo comparten el flip `pending→qualified`
 * de la 157 (`qualifyReferralOnCharge`) y la materialización de este archivo.
 */
export async function notifyReferralLinkActivated(
  db: DbInstance,
  log: FastifyBaseLogger,
  referrerId: number,
  referredFirstName: string,
): Promise<void> {
  try {
    await new NotificationService(db, log).queueNotification({
      userId: referrerId,
      templateKey: "referral_link_activated",
      bodyOverride: `${referredFirstName} pagó su primer plan. Ya tenés tu descuento por invitación activo.`,
    });
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        referrerId,
      },
      "referral activation notification failed (best-effort)",
    );
  }
}

/**
 * Avisa al invitador tras materializar el vínculo (lo llama el call site de cobro
 * DESPUÉS del commit). Best-effort: si no puede leer el nombre del pagador, no avisa.
 */
export async function notifyInviterLinkActivated(
  db: DbInstance,
  log: FastifyBaseLogger,
  ctx: TenantContext,
  inviterId: number,
  payerId: number,
): Promise<void> {
  try {
    const [payer] = await db
      .select({ firstName: schema.users.firstName })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, payerId)))
      .limit(1);
    if (!payer) return;
    await notifyReferralLinkActivated(
      db,
      log,
      inviterId,
      payer.firstName ?? "",
    );
  } catch (err: unknown) {
    log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        inviterId,
        payerId,
      },
      "invitation link notification failed (best-effort)",
    );
  }
}
