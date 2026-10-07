// Módulo: referrals — vínculo de descuento que nace al COMPRAR (Fase 194-14, D-05 / D-13 / D-26c)
//
// El invitado no tiene fila en `referrals` mientras usa sus accesos gratis (D-26b):
// el vínculo de descuento se crea, directamente `qualified`, cuando compra su primer
// plan pago que admite descuento, a nombre del invitador de la invitación MÁS
// RECIENTE dentro de la ventana de compra tardía (D-13). Este archivo concentra las
// piezas que el árbitro de descuentos (`subscriptions/discount-arbiter.ts`)
// necesita, para que ni `subscriptions/service.ts` ni `invitation-service.ts`
// engorden (lección de 194-32):
//
//  1. `findLinkableInvitation`: ¿hay una invitación que dé vínculo a este pagador?
//  2. `materializeInvitationLink`: crea la fila de `referrals` (idempotente).
//  (El aviso al invitador, `notifyReferralLinkActivated` / `notifyInviterLinkActivated`,
//  vive en `invitation-link-notifications.ts`: importa `NotificationService` y
//  metería este archivo, que usa el árbitro, en el ciclo de importaciones, ME-02.)
//
// AISLAMIENTO: toda query lleva `tenantWhere` / `tenantValues`. El `tenant_id` sale
// del `ctx` del servidor, nunca del body.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import {
  tenantValues,
  tenantWhere,
  type TenantContext,
} from "../shared/tenant";
import { referralCopyVariant } from "./ab-variant";
import type { InvitationExecutor } from "./invitation-rules";
import { isDuplicateKeyError } from "./duplicate-key";

type DbInstance = MySql2Database<typeof schema>;

/** La invitación que va a dar vínculo al pagador cuando cobre (D-05). */
export interface InvitationLinkToMaterialize {
  invitationId: number;
  inviterId: number;
  channel: "self_service" | "assisted";
}

/**
 * Invitación `active` MÁS RECIENTE del pagador que todavía da vínculo, o `null`.
 *
 * Reglas:
 *  - D-26c: si el pagador YA tiene fila en `referrals` como referido (en cualquier
 *    estado), se conserva esa fila y NO se ofrece una segunda → `null`.
 *  - D-13: `access_expires_on + lateWindowDays >= hoy` (hoy = día calendario de la
 *    sede del pagador). La suma de fechas vive en SQL (DATE), nunca en JS.
 *
 * `lateWindowDays` sale de `getInvitationSettings` (lo lee el árbitro una sola vez).
 */
export async function findLinkableInvitation(
  exec: InvitationExecutor,
  ctx: TenantContext,
  payerId: number,
  lateWindowDays: number,
): Promise<InvitationLinkToMaterialize | null> {
  const [existing] = await exec
    .select({ id: schema.referrals.id })
    .from(schema.referrals)
    .where(
      and(
        tenantWhere(schema.referrals, ctx),
        eq(schema.referrals.referredId, payerId),
      ),
    )
    .limit(1);
  if (existing) return null;

  const timezone = await loadPayerTimezone(exec, ctx, payerId);
  if (timezone === null) return null;
  const today = todayInTz(timezone);
  const windowDays = Math.max(0, Math.trunc(lateWindowDays));

  const [invitation] = await exec
    .select({
      id: schema.invitations.id,
      inviterId: schema.invitations.inviterId,
      channel: schema.invitations.channel,
    })
    .from(schema.invitations)
    .where(
      and(
        tenantWhere(schema.invitations, ctx),
        eq(schema.invitations.invitedUserId, payerId),
        eq(schema.invitations.status, "active"),
        sql`DATE_ADD(${schema.invitations.accessExpiresOn}, INTERVAL ${windowDays} DAY) >= ${today}`,
      ),
    )
    .orderBy(desc(schema.invitations.activatedAt), desc(schema.invitations.id))
    .limit(1);
  if (!invitation) return null;

  return {
    invitationId: invitation.id,
    inviterId: invitation.inviterId,
    channel: invitation.channel,
  };
}

/** Zona horaria de la sede actual del pagador (null si no existe o está borrado). */
async function loadPayerTimezone(
  exec: InvitationExecutor,
  ctx: TenantContext,
  payerId: number,
): Promise<string | null> {
  const [row] = await exec
    .select({ timezone: schema.branches.timezone })
    .from(schema.users)
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.users.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, payerId),
        isNull(schema.users.deletedAt),
      ),
    )
    .limit(1);
  return row?.timezone ?? null;
}

/**
 * Crea el vínculo de descuento del pagador con el invitador de la invitación (D-05):
 * `referrals` `qualified` (canal de la invitación, `copy_variant` del invitador,
 * `qualified_at` AHORA) + espejo `users.referred_by`. Corre dentro de la tx del cobro.
 *
 * Idempotente ante el UNIQUE de `referred_id` (carrera entre dos cobros, o un vínculo
 * que apareció entre `findLinkableInvitation` y acá): no lanza, no duplica, deja un
 * `warn` y devuelve `false`. `true` = esta llamada creó la fila.
 */
export async function materializeInvitationLink(
  exec: InvitationExecutor,
  ctx: TenantContext,
  log: FastifyBaseLogger,
  link: InvitationLinkToMaterialize,
  payerId: number,
): Promise<boolean> {
  try {
    await exec.insert(schema.referrals).values(
      tenantValues(ctx, {
        referrerId: link.inviterId,
        referredId: payerId,
        status: "qualified" as const,
        attributionChannel: link.channel,
        qualifiedAt: new Date(),
        copyVariant: referralCopyVariant(link.inviterId),
      }),
    );
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      log.warn(
        { payerId, inviterId: link.inviterId, invitationId: link.invitationId },
        "invitaciones: el pagador ya tenía vínculo, se conserva (D-26c)",
      );
      return false;
    }
    throw err;
  }

  // Espejo desnormalizado, igual que las demás vías de atribución: el vínculo
  // canónico vive en `referrals`, esto alimenta los listados.
  await exec
    .update(schema.users)
    .set({ referredBy: link.inviterId })
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, payerId)));

  log.info(
    { payerId, inviterId: link.inviterId, invitationId: link.invitationId },
    "invitaciones: vínculo de descuento creado al comprar (D-05)",
  );
  return true;
}
