// Módulo: subscriptions — efectos laterales del cobro de membresía (Fase 194, ME-01)
//
// Las 4 charge-paths (`assignPlan`, `changePlanNow`, `changePlanAfterCurrent`,
// `renewSubscription`) repiten la misma secuencia alrededor del cobro. Vive acá UNA
// vez para que agregar un efecto (otro descuento, otra notificación) sea tocar un
// solo lugar, y para que `service.ts` (8k líneas, deuda previa) no siga creciendo:
//
//   ANTES de abrir la tx   -> `qualifyLegacyLinkOnCharge`  (flip del vínculo `pending` heredado)
//   DENTRO de la tx        -> `materializeSettlementLink`  (vínculo del invitado, atómico con el cobro)
//   DESPUÉS del commit     -> `settleChargeSideEffects`    (aviso, crédito, comisión y consumo de partner)
//
// El ORDEN del post-commit importa y es el de siempre: aviso al invitador, crédito de
// referidos, cualificación + comisión del partner, consumo del beneficio del partner.
// Todo lo del post-commit es best-effort: el cobro ya ocurrió y un fallo acá jamás lo
// revierte (T-179-23).
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import { PartnerReferralService } from "../referral-partners/service";
import { materializeInvitationLink } from "../referrals/invitation-link";
import {
  notifyInviterLinkActivated,
  notifyReferralLinkActivated,
} from "../referrals/invitation-link-notifications";
import { ReferralService } from "../referrals/service";
import type { TenantContext } from "../shared/tenant";
import type { ChargeSettlement, SettlementColumns } from "./discount-arbiter";
import { planAllowsInvitationDiscount, type PlanDetail } from "./types";

type DbInstance = MySql2Database<typeof schema>;

export interface ChargeEffectsDeps {
  db: DbInstance;
  log: FastifyBaseLogger;
}

/** Candidato de descuento de partner resuelto ANTES del filter de pricing. */
type PartnerCandidate = { linkId: number; percent: number } | null;

/**
 * Flip pending→qualified del vínculo del que el payer es referido, SOLO cuando el
 * cargo efectivamente cobra (pricePaid>0 — D-20 mata el fantasma del mes 100%
 * bonificado). El precio ya NO depende de este flip (el candidato de invitación del
 * árbitro simula la cualificación antes de calcular).
 */
async function qualifyReferralOnCharge(
  deps: ChargeEffectsDeps,
  ctx: TenantContext,
  payerUserId: number,
  pricePaid: number,
): Promise<void> {
  if (pricePaid <= 0) return;
  const flipped = await new ReferralService(
    deps.db,
    deps.log,
  ).qualifyFirstPayment(ctx, payerUserId);

  // Solo el flip REAL (pending→qualified) notifica; un re-cobro devuelve null y no
  // re-notifica (VIS-02/D-31). La notificación va SIEMPRE al referidor, nunca al
  // referido. Best-effort (D-33): un fallo de la cola JAMÁS relanza ni rompe el cobro.
  if (!flipped) return;
  await notifyReferralLinkActivated(
    deps.db,
    deps.log,
    flipped.referrerId,
    flipped.referredFirstName,
  );
}

/**
 * Pre-cobro (antes de abrir la tx): flip del vínculo `pending` heredado en el primer
 * cobro pago, gateado por el flag del plan (los pases especiales, paquetes y planes
 * sin flag no cualifican) y por la alta/renovación prorrateada (el proporcional es el
 * precio final; el vínculo se cualifica en la primera renovación de mes completo).
 */
export async function qualifyLegacyLinkOnCharge(
  deps: ChargeEffectsDeps,
  ctx: TenantContext,
  params: {
    plan: PlanDetail;
    prorateToMonthEnd: boolean | undefined;
    userId: number;
    pricePaid: number;
  },
): Promise<void> {
  if (
    !planAllowsInvitationDiscount(params.plan) ||
    params.prorateToMonthEnd === true
  ) {
    return;
  }
  await qualifyReferralOnCharge(deps, ctx, params.userId, params.pricePaid);
}

/**
 * Fase 194 D-05/D-13 (T-194-53): crea el vínculo de descuento del invitado DENTRO de
 * la tx del cobro (si el cobro falla, no queda vínculo). Se crea aunque la invitación
 * haya perdido la comparación de este cobro: alimenta los siguientes. Devuelve el
 * invitador a avisar DESPUÉS del commit, o `null` si no nació vínculo.
 */
export async function materializeSettlementLink(
  deps: ChargeEffectsDeps,
  tx: TxHandle,
  ctx: TenantContext,
  settlement: ChargeSettlement,
  userId: number,
): Promise<number | null> {
  if (settlement.linkToMaterialize === null) return null;
  const created = await materializeInvitationLink(
    tx,
    ctx,
    deps.log,
    settlement.linkToMaterialize,
    userId,
  );
  return created ? settlement.linkToMaterialize.inviterId : null;
}

/**
 * Consume el beneficio de descuento de partner tras el cargo, con el candidato/ganador
 * ya resueltos ANTES del filter de pricing (D-09/D-10/D-20). Best-effort.
 *
 * - `won=true`: el descuento de partner efectivamente redujo `pricePaid` →
 *   `applied_reason='aplicado'` con el `percent`/`amount` ganadores.
 * - `won=false` pero el cargo cobró (`pricePaid>0`): el beneficio se consume IGUAL —
 *   la primera cuota ya pasó, aunque haya sido AURA o la invitación quien dio el
 *   descuento mayor → `applied_reason='perdio_vs_aura'`, `applied_percent=0` (D-20).
 * - `won=false` y `pricePaid<=0`: no se consume (un cargo 100% bonificado no gasta "la
 *   primera cuota" real del socio).
 * - Sin candidato: no-op.
 */
async function consumePartnerBenefitAfterCharge(
  deps: ChargeEffectsDeps,
  ctx: TenantContext,
  params: {
    userId: number;
    subscriptionId: number;
    pricePaid: number;
    candidate: PartnerCandidate;
    won: boolean;
    wonPercent: number | null;
    wonAmount: number | null;
  },
): Promise<void> {
  const {
    userId,
    subscriptionId,
    pricePaid,
    candidate,
    won,
    wonPercent,
    wonAmount,
  } = params;
  if (!candidate) return;
  if (!won && pricePaid <= 0) return;

  try {
    await new PartnerReferralService(
      deps.db,
      deps.log,
    ).consumePartnerBenefitOnCharge(
      ctx,
      userId,
      subscriptionId,
      won
        ? {
            percent: wonPercent ?? 0,
            amount: wonAmount ?? 0,
            reason: "aplicado" as const,
          }
        : { percent: 0, amount: 0, reason: "perdio_vs_aura" as const },
    );
  } catch (err: unknown) {
    deps.log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        userId,
        subscriptionId,
      },
      "partner: consumo del beneficio de descuento falló (best-effort, el cobro no se revierte)",
    );
  }
}

/**
 * Cualifica el vínculo de partner del payer y da de alta su comisión (D-11), cuando el
 * cargo efectivamente cobra (`pricePaid>0`). Dispara con CUALQUIER categoría de plan y
 * NO excluye el alta prorrateada: un alta prorrateada sigue siendo una venta real
 * (D-17). Best-effort: la comisión es contabilidad de negocio, nunca rompe un cobro ya
 * efectuado (T-179-23).
 */
async function qualifyPartnerOnCharge(
  deps: ChargeEffectsDeps,
  ctx: TenantContext,
  payerUserId: number,
  pricePaid: number,
  subscriptionId: number,
): Promise<void> {
  if (pricePaid <= 0) return;
  try {
    await new PartnerReferralService(deps.db, deps.log).qualifyAndCommission(
      ctx,
      payerUserId,
      subscriptionId,
    );
  } catch (err: unknown) {
    deps.log.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        payerUserId,
        subscriptionId,
      },
      "partner: cualificación/comisión falló (best-effort, el cobro no se revierte)",
    );
  }
}

/**
 * Post-commit del cobro, en el orden de siempre:
 *  1. aviso al invitador si nació el vínculo (D-05);
 *  2. registro auditable del descuento de invitación en `referral_credits` (AURA-01),
 *     no-op si el monto es 0: `percent` = % NOMINAL, `amount` = monto recortado por el
 *     tope en dinero (D-10c);
 *  3. cualificación + comisión del partner (D-11/D-17);
 *  4. consumo del beneficio de descuento del partner (D-09/D-10/D-20/D-21): `won` = el
 *     árbitro lo eligió.
 */
export async function settleChargeSideEffects(
  deps: ChargeEffectsDeps,
  ctx: TenantContext,
  params: {
    userId: number;
    subscriptionId: number;
    pricePaid: number;
    settlement: ChargeSettlement;
    partnerCandidate: PartnerCandidate;
    columns: SettlementColumns;
    /** Invitador a avisar, devuelto por `materializeSettlementLink` dentro de la tx. */
    linkedInviterId: number | null;
  },
): Promise<void> {
  const {
    userId,
    subscriptionId,
    pricePaid,
    settlement,
    partnerCandidate,
    columns,
    linkedInviterId,
  } = params;

  if (linkedInviterId !== null) {
    await notifyInviterLinkActivated(
      deps.db,
      deps.log,
      ctx,
      linkedInviterId,
      userId,
    );
  }

  if ((columns.referralDiscountAmount ?? 0) > 0) {
    await new ReferralService(deps.db, deps.log).recordReferralCredit(
      ctx,
      userId,
      subscriptionId,
      columns.referralDiscountPercent ?? 0,
      columns.referralDiscountAmount ?? 0,
    );
  }

  await qualifyPartnerOnCharge(deps, ctx, userId, pricePaid, subscriptionId);

  await consumePartnerBenefitAfterCharge(deps, ctx, {
    userId,
    subscriptionId,
    pricePaid,
    candidate: partnerCandidate,
    won: settlement.partnerWon,
    wonPercent: columns.partnerDiscountPercent,
    wonAmount: columns.partnerDiscountAmount,
  });
}
