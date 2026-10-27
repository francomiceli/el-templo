// Módulo: wellhub — evento de conversión Wellhub → socio (Fase 204: D-04, D-17, D-23).
//
// `recomputeUserStatus` (subscriptions/service.ts) llama acá en cada mutación de
// suscripción, junto a `attributeInvitationPurchase` (fase 194). NO hay un
// endpoint paralelo de "convertir": toda vía de cobro existente (AssignPlanDialog,
// Cobros alta/renovación, activación programada) converge en el recompute, así
// que ahí es donde se detecta el momento en que el estado pasa a `activo`
// (D-17: "reusa el alta de membresía o cobro existente").
//
// POR QUÉ UNA TABLA (`wellhub_conversions`) y no deducirlo de otro lado:
//  - una persona puede convertirse, vencer y volver a convertirse (convert →
//    lapse → reconvert): cada plan es un evento distinto;
//  - `audit_log` necesita un actor y acá el disparador es el sistema;
//  - `user_status_history` no guarda la suscripción, el plan ni la sede.
//
// D-23 (definición cerrada): el primer plan (cualquier precio) que deja `activo`
// a un usuario con `gympass_id` que tuvo actividad Wellhub (reserva o visita)
// desde la última vez que dejó de ser socio activo. Un visitante con estado
// `wellhub` califica de por sí (su actividad ES lo que lo creó).
//
// ATOMICIDAD: corre DENTRO de la tx de la suscripción: si el cobro hace
// rollback, la conversión también.
//
// NUNCA registra planes de prueba (`is_trial`): `membershipInEffectSql` ya los
// excluye, y además se pide `is_trial = 0` explícito en la query. Motivo: la
// compensación de la prueba especial (`scheduling/especial-trial-service.ts`,
// `discardSubscription`) borra FÍSICAMENTE la suscripción y `wellhub_conversions`
// tiene FK a `subscriptions` sin ON DELETE: una conversión apuntando a una
// prueba rompería ese borrado.
//
// SIN EMAIL: el acceso a la app es una acción explícita aparte (plan 09);
// `recomputeUserStatus` tiene 11 llamadores y esto corre antes del commit.
//
// AISLAMIENTO: toda query lleva el gimnasio (`tenantWhere` / `tenant_id` inline).
import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { membershipInEffectSql } from "../shared/membership";
import { tenantValues, tenantWhere, type TenantContext } from "../shared/tenant";
import {
  isWellhubAttendanceRawSql,
  isWellhubBookingRawSql,
} from "../shared/wellhub-sources";

type DbInstance = MySql2Database<typeof schema>;

/** Tipo de conversión: de dónde venía la persona al asociarse. */
export type WellhubConversionKind = "nuevo" | "ex_alumno" | "otro";

/**
 * ¿Tuvo actividad Wellhub desde la última vez que dejó de ser socio activo?
 * `left_at` = MAX(changed_at) de las transiciones con `from_status = 'activo'`;
 * sin esa transición (NULL) cualquier actividad cuenta. Actividad = reserva
 * Wellhub (alta o fecha de clase posterior), visita Wellhub (validada o a mano)
 * o solicitud `wellhub_bookings` no rechazada.
 */
async function hasWellhubActivitySinceLeftActivo(
  tx: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<boolean> {
  const res = await tx.execute(sql`
    SELECT (
      EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.tenant_id = ${ctx.tenantId}
          AND b.member_id = ${userId}
          AND ${isWellhubBookingRawSql("b")}
          AND (x.left_at IS NULL OR b.booked_at >= x.left_at OR b.booking_date >= DATE(x.left_at))
      )
      OR EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.tenant_id = ${ctx.tenantId}
          AND a.member_id = ${userId}
          AND ${isWellhubAttendanceRawSql("a")}
          AND (x.left_at IS NULL OR a.checked_in_at >= x.left_at)
      )
      OR EXISTS (
        SELECT 1 FROM wellhub_bookings wb
        WHERE wb.tenant_id = ${ctx.tenantId}
          AND wb.user_id = ${userId}
          AND wb.status <> 'rejected'
          AND (x.left_at IS NULL OR wb.created_at >= x.left_at)
      )
    ) AS hasActivity
    FROM (
      SELECT MAX(h.changed_at) AS left_at
      FROM user_status_history h
      WHERE h.tenant_id = ${ctx.tenantId}
        AND h.user_id = ${userId}
        AND h.from_status = 'activo'
    ) x
  `);
  const row = (
    res as unknown as [Array<{ hasActivity: number | string | null }>]
  )[0]?.[0];
  return Number(row?.hasActivity ?? 0) === 1;
}

/** Suscripción de membresía vigente más reciente (nunca de un plan de prueba). */
async function findNewestMembership(
  tx: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<{ id: number; planId: number; branchId: number } | null> {
  const res = await tx.execute(sql`
    SELECT s2.id AS id, s2.plan_id AS planId, s2.branch_id AS branchId
    FROM subscriptions s2
    JOIN subscription_plans p
      ON p.id = s2.plan_id
     AND p.tenant_id = ${ctx.tenantId}
     AND p.is_trial = 0
    WHERE s2.tenant_id = ${ctx.tenantId}
      AND s2.user_id = ${userId}
      AND ${membershipInEffectSql("s2")}
    ORDER BY s2.created_at DESC, s2.id DESC
    LIMIT 1
  `);
  const row = (
    res as unknown as [
      Array<{ id: number; planId: number; branchId: number }>,
    ]
  )[0]?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    planId: Number(row.planId),
    branchId: Number(row.branchId),
  };
}

/**
 * Registra el evento de conversión Wellhub → socio (D-04/D-17/D-23).
 *
 * Se llama con `statusBefore`/`statusAfter` del recompute, en la MISMA tx y
 * DESPUÉS del UPDATE de `users`. El llamador NO lo invoca con `ctx === null`
 * (solo el cron de vencimiento, que nunca crea una membresía).
 *
 * Idempotente: guarda de transición + chequeo de existencia + unique
 * `(tenant_id, user_id, subscription_id)` como red de seguridad. Sin
 * INSERT IGNORE (tragaría conflictos).
 */
export async function recordWellhubConversion(
  tx: DbInstance,
  ctx: TenantContext,
  userId: number,
  statusBefore: string | null,
  statusAfter: string | null,
  log: FastifyBaseLogger,
): Promise<void> {
  // 1. Guarda barata: solo la transición hacia `activo` cuenta (una renovación
  //    de un socio que ya es activo no registra nada).
  if (statusAfter !== "activo" || statusBefore === "activo") return;

  // 2. Sin gympass_id no hay vínculo con Wellhub.
  const [user] = await tx
    .select({ gympassId: schema.users.gympassId })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
  if (!user || user.gympassId === null) return;

  // 3. Actividad Wellhub desde que dejó de ser socio (el visitante `wellhub`
  //    califica de por sí).
  if (statusBefore !== "wellhub") {
    const hasActivity = await hasWellhubActivitySinceLeftActivo(
      tx,
      ctx,
      userId,
    );
    if (!hasActivity) return;
  }

  // 4. La suscripción que lo dejó activo (plan real, nunca de prueba).
  const subscription = await findNewestMembership(tx, ctx, userId);
  if (!subscription) {
    log.warn(
      { userId, statusBefore, statusAfter },
      "Conversión Wellhub: pasó a activo sin membresía vigente de plan real, no se registra",
    );
    return;
  }

  // 5. Idempotencia: una sola fila por (usuario, suscripción).
  const [existing] = await tx
    .select({ id: schema.wellhubConversions.id })
    .from(schema.wellhubConversions)
    .where(
      and(
        tenantWhere(schema.wellhubConversions, ctx),
        eq(schema.wellhubConversions.userId, userId),
        eq(schema.wellhubConversions.subscriptionId, subscription.id),
      ),
    )
    .limit(1);
  if (existing) return;

  // 6. Fecha local de la sede de la suscripción.
  const [branch] = await tx
    .select({ timezone: schema.branches.timezone })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, subscription.branchId),
      ),
    );
  const localDate = todayInTz(branch?.timezone ?? DEFAULT_TENANT_TIMEZONE);

  // 7. Tipo: visitante nuevo, ex-alumno que vuelve u otro origen.
  const kind: WellhubConversionKind =
    statusBefore === "wellhub"
      ? "nuevo"
      : statusBefore === "inactivo"
        ? "ex_alumno"
        : "otro";

  await tx.insert(schema.wellhubConversions).values(
    tenantValues(ctx, {
      userId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      branchId: subscription.branchId,
      fromStatus: statusBefore,
      kind,
      localDate,
    }),
  );

  log.info(
    {
      userId,
      subscriptionId: subscription.id,
      planId: subscription.planId,
      branchId: subscription.branchId,
      kind,
    },
    "Conversión Wellhub → socio registrada",
  );
}
