// Módulo: referrals — conversión de la invitación a compra y gate de lead (Fase 194-13, D-18).
//
// `recomputeUserStatus` (subscriptions/service.ts) llama acá en cada mutación de
// suscripción. Este archivo concentra las dos piezas de D-18 para que el servicio
// de suscripciones (8k+ líneas) no engorde (lección de 194-32):
//
//  1. `invitationLeadGateSql`: fragmento SQL que EXTIENDE el gate de conversión de
//     lead de `recomputeUserStatus`. Hoy el lead "gana" cuando compra y tiene una
//     SP (`bookings.is_trial=1`); un invitado no tiene SP (sus reservas NO se
//     marcan `is_trial`, D-18/T-194-46: contaminaría cupo 3/turno, cadencia M1-M3
//     y reportes de SP), así que "tiene una invitación activada" también cuenta.
//
//  2. `attributeInvitationPurchase`: paso EXPLÍCITO posterior al UPDATE de
//     `users`. Cubre lo que el gate no puede: (a) el ex socio con `converted_at`
//     de antes (el gate exige `converted_at IS NULL`) y (b) atribuir la compra a la
//     invitación (`converted_at`/`converted_subscription_id`, D-13).
//
// AISLAMIENTO: toda query lleva el gimnasio (`tenantWhere` / `tenant_id` inline).
import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { getInvitationSettings } from "./invitation-settings";
import { paidMembershipInEffectSql } from "./invitation-purchase";
import type { InvitationExecutor } from "./invitation-rules";

type DbInstance = MySql2Database<typeof schema>;

/**
 * "Compró una membresía paga después de activar la invitación": invitación
 * `active` del usuario `u` cuya activación es anterior a una sub de membresía
 * vigente (no `is_trial`, D-03) con `price_paid > 0` (una bonificada de $0 no
 * convierte). Correlacionado por `u.id`/`u.tenant_id`: viaja dentro del UPDATE de
 * `recomputeUserStatus`, que acota por `u.tenant_id` inline en el mismo statement.
 */
function paidAfterInvitationSql(): SQL {
  /* tenant-safe: EXISTS correlacionado por u.id y u.tenant_id (un solo gimnasio); viaja dentro del UPDATE de recomputeUserStatus que acota por u.tenant_id inline. */
  return sql`EXISTS (
    SELECT 1 FROM invitations i
    WHERE i.invited_user_id = u.id
      AND i.tenant_id = u.tenant_id
      AND i.status = 'active'
      AND EXISTS (
        SELECT 1 FROM subscriptions s2
        WHERE s2.user_id = u.id
          AND s2.tenant_id = u.tenant_id
          AND ${paidMembershipInEffectSql("s2", sql`i.activated_at`)}
      )
  )`;
}

/**
 * Rama "invitación" del gate de LEAD (`lead_status`, `lead_status_source`,
 * `purchased_plan_id`): como la rama de SP pero respetando una marca MANUAL del
 * staff (`lead_status_source = 'manual'`, T-194-44).
 */
export function invitationLeadGateSql(): SQL {
  return sql`(COALESCE(u.lead_status_source, 'auto') <> 'manual' AND ${paidAfterInvitationSql()})`;
}

/**
 * Rama "invitación" del gate de `users.converted_at`: la fecha de conversión se
 * sella aunque el lead esté marcado a mano (la compra ocurrió igual), solo se
 * protege el ESTADO comercial en {@link invitationLeadGateSql}.
 */
export function invitationConvertedAtGateSql(): SQL {
  return paidAfterInvitationSql();
}

/** Sub paga encontrada para atribuir (la más reciente desde la activación). */
interface PaidSubscription {
  id: number;
  planId: number;
  /** La compra cae dentro de `access_expires_on` + ventana de compra tardía (D-13). */
  inWindow: boolean;
}

/**
 * Paso explícito de conversión de invitación (D-18), en la MISMA tx que el
 * recompute y DESPUÉS de su UPDATE:
 *
 *  - Sin invitación `active` sin convertir => no hace nada (una query barata).
 *  - Con una sub de membresía paga posterior a la activación:
 *      * dentro de `access_expires_on + latePurchaseWindowDays` => sella
 *        `invitations.converted_at` y `converted_subscription_id` (D-13/T-194-45).
 *        Fuera de la ventana NO se atribuye.
 *      * dentro o fuera de la ventana, y si el lead no está `ganado` ni marcado a
 *        mano => `ganado`/`auto` con el plan comprado (el ex socio con
 *        `converted_at` histórico no pasa por el gate del UPDATE).
 *
 * `settingsDb` es el pool (los settings se leen por fuera de la tx). El llamador
 * NO invoca esto con `ctx === null`: ese caso solo llega del cron de vencimiento,
 * que nunca crea una membresía paga (toda compra pasa por una charge-path con ctx).
 */
export async function attributeInvitationPurchase(
  tx: InvitationExecutor,
  settingsDb: DbInstance,
  ctx: TenantContext,
  userId: number,
  log: FastifyBaseLogger,
): Promise<void> {
  const [invitation] = await tx
    .select({
      id: schema.invitations.id,
    })
    .from(schema.invitations)
    .where(
      and(
        tenantWhere(schema.invitations, ctx),
        eq(schema.invitations.invitedUserId, userId),
        eq(schema.invitations.status, "active"),
        isNull(schema.invitations.convertedAt),
      ),
    )
    .orderBy(desc(schema.invitations.activatedAt), desc(schema.invitations.id))
    .limit(1);
  if (!invitation) return;

  // Los settings se leen una vez y solo si hay una invitación pendiente.
  const { latePurchaseWindowDays } = await getInvitationSettings(
    settingsDb,
    ctx,
    log,
  );
  const windowDays = Math.max(0, Math.trunc(latePurchaseWindowDays));

  const paid = await findLatestPaidSubscription(
    tx,
    ctx,
    userId,
    invitation.id,
    windowDays,
  );
  if (!paid) return;

  if (paid.inWindow) {
    await tx
      .update(schema.invitations)
      .set({ convertedAt: new Date(), convertedSubscriptionId: paid.id })
      .where(
        and(
          tenantWhere(schema.invitations, ctx),
          eq(schema.invitations.id, invitation.id),
          isNull(schema.invitations.convertedAt),
        ),
      );
    log.info(
      { invitationId: invitation.id, subscriptionId: paid.id, userId },
      "invitaciones: compra atribuida a la invitación",
    );
  }

  // Lead `ganado` con el plan comprado (nunca el plan Invitación: la sub es de
  // membresía real). No pisa una marca manual ni un lead que ya está ganado.
  await tx
    .update(schema.users)
    .set({
      leadStatus: "ganado",
      leadStatusSource: "auto",
      purchasedPlanId: paid.planId,
    })
    .where(
      and(
        tenantWhere(schema.users, ctx),
        eq(schema.users.id, userId),
        or(
          isNull(schema.users.leadStatus),
          ne(schema.users.leadStatus, "ganado"),
        ),
        or(
          isNull(schema.users.leadStatusSource),
          ne(schema.users.leadStatusSource, "manual"),
        ),
      ),
    );
}

/**
 * Membresía paga vigente más reciente creada desde la activación de la
 * invitación, con la marca de "dentro de la ventana de compra tardía". El
 * cálculo de fechas vive en SQL (`created_at` es TIMESTAMP, `access_expires_on`
 * es DATE): nunca matemática de Date en JS.
 */
async function findLatestPaidSubscription(
  tx: InvitationExecutor,
  ctx: TenantContext,
  userId: number,
  invitationId: number,
  windowDays: number,
): Promise<PaidSubscription | null> {
  const res = await tx.execute(sql`
    SELECT s2.id AS id,
           s2.plan_id AS planId,
           (DATE(s2.created_at) <= DATE_ADD(i.access_expires_on, INTERVAL ${windowDays} DAY)) AS inWindow
    FROM subscriptions s2
    JOIN invitations i ON i.id = ${invitationId} AND i.tenant_id = ${ctx.tenantId}
    WHERE s2.tenant_id = ${ctx.tenantId}
      AND s2.user_id = ${userId}
      AND ${paidMembershipInEffectSql("s2", sql`i.activated_at`)}
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  `);
  const row = (
    res as unknown as [
      Array<{ id: number; planId: number; inWindow: number | string }>,
    ]
  )[0]?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    planId: Number(row.planId),
    inWindow: Number(row.inWindow) === 1,
  };
}
