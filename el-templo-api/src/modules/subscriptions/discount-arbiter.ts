// Módulo: subscriptions — ÁRBITRO de descuentos de un cobro (Fase 194-14, D-08 / D-21)
//
// Único lugar donde se decide el descuento POR INVITACIÓN de un cobro y quién gana
// cuando compiten varios descuentos. Hasta la 194, AURA, partner y referido se
// SUMABAN en 3 de las 4 charge-paths (componían unos sobre otros). D-08/D-21: se
// aplica UNO, el de mayor MONTO (no %: con el tope en dinero D-10c, una invitación
// del 10% puede valer menos que un AURA del 10%).
//
// QUÉ COMPITE / QUÉ EXCLUYE / QUÉ NO COMPITE
// ------------------------------------------
//   COMPITEN (gana el mayor MONTO)   AURA, partner (fase 179) e invitación.
//   EXCLUYENTES (sin invitación)     boarding pass (D-26a) y precio personalizado
//                                    con motivo en ESTE cobro, `override` (D-20): el
//                                    precio ya es el final. También el prorrateo de
//                                    fin de mes (se excluye como hoy).
//   NO COMPITEN                      base heredada de renovación, promo code y
//                                    precio Zero como lista: no son un descuento
//                                    porcentual sobre la lista.
//
// ORDEN QUE LAS CHARGE-PATHS (194-15..18) DEBEN RESPETAR
// ------------------------------------------------------
//   1. Candidatos core ANTES del filter de pricing: `resolveInvitationDiscountCandidate`
//      y el candidato de partner (`partnerCompetitor`).
//   2. `core = pickCoreCompetitor(partner, invitation)` y al filter viaja
//      `competingDiscountAmount = core?.amount ?? null`. AURA solo gana si su monto es
//      ESTRICTAMENTE mayor (empate -> gana el core y NO se gastan puntos).
//   3. DESPUÉS del filter: `applyArbiterResult({ priceAfterFilter, auraApplied, core })`.
//      Si AURA aplicó, ningún core descuenta; si no, descuenta el ganador core. Con un
//      beneficio exclusivo del módulo (boarding pass, `resolved.exclusive`) el llamador
//      pasa `core: null`.
//   4. Si el candidato de invitación trae `linkToMaterialize` y el cobro efectivamente
//      cobra (pricePaid > 0), el llamador crea el vínculo (`materializeInvitationLink`)
//      aunque la invitación haya perdido la comparación de ESTE cobro: el vínculo
//      alimenta los cobros siguientes (D-05).
//
// REGISTRO (`referral_credits`): `percent` guarda el % NOMINAL (`nominalAmount` sale de
// `floor(base * pct / 100)`) y `amount` el monto RECORTADO por el tope en dinero.
//
// Preview y cobro usan la MISMA función (paridad preview<->cobro): el candidato es
// solo lectura y simula la cualificación del vínculo `pending` y el vínculo que nace al
// comprar, igual que el preview de hoy.
//
// AISLAMIENTO: toda query pasa por `ctx` (`findLinkableInvitation`, el cómputo del %,
// `getDiscountCapAmount`); el `tenant_id` sale del servidor.
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  findLinkableInvitation,
  type InvitationLinkToMaterialize,
} from "../referrals/invitation-link";
import {
  getDiscountCapAmount,
  getInvitationSettings,
} from "../referrals/invitation-settings";
import type { ReferralService } from "../referrals/service";
import type { TenantContext } from "../shared/tenant";
import { planAllowsInvitationDiscount, type PlanDetail } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** Dependencias inyectadas: el árbitro se prueba sin armar el SubscriptionService. */
export interface DiscountArbiterDeps {
  db: DbInstance;
  log: FastifyBaseLogger;
  referralService: ReferralService;
}

/** Datos del plan que el árbitro necesita (subconjunto de `PlanDetail`). */
export type ArbiterPlan = Pick<
  PlanDetail,
  "planCategory" | "isTrial" | "allowsInvitationDiscount" | "country"
>;

/** Descuento por invitación que se ofrece a ESTE cobro (D-08/D-09/D-10c). */
export interface InvitationDiscountCandidate {
  /** % total del pagador (lado invitado + lado invitador, con tope D-09). Puede ser 0 si solo hay vínculo por crear. */
  percent: number;
  /** `floor(base * percent / 100)`, antes del tope en dinero. */
  nominalAmount: number;
  /** Monto efectivo: `min(nominalAmount, tope por país)`; sin tope = nominal. */
  amount: number;
  /** El tope en dinero recortó el descuento. */
  capApplied: boolean;
  /** Vínculo que nace al comprar (D-05); `null` si ya existe o no hay invitación. */
  linkToMaterialize: InvitationLinkToMaterialize | null;
}

export interface InvitationCandidateInput {
  userId: number;
  plan: ArbiterPlan;
  /** Precio de lista del cobro (antes de cualquier descuento). */
  basePrice: number;
  /** Gestión cargó un precio personalizado con motivo en ESTE cobro (D-20). */
  isPriceOverride: boolean;
  /** El cobro usa boarding pass (D-26a). */
  boardingPassApplied: boolean;
  /** Alta prorrateada a fin de mes: el proporcional ya es el precio final. */
  prorateToMonthEnd: boolean | undefined;
}

/** Competidor core ganador (partner o invitación) con su monto. */
export interface CoreCompetitor {
  kind: "partner" | "invitation";
  amount: number;
}

/** Partner tal como compite: % del vínculo y su monto sobre la lista. */
export interface PartnerCompetitorInput {
  percent: number;
  amount: number;
}

/** Monto de un descuento porcentual sobre `basePrice` (misma fórmula que el cobro). */
export function discountAmountOf(basePrice: number, percent: number): number {
  return Math.floor(basePrice * (percent / 100));
}

/** Aplica el tope en dinero (D-10c): `cap === null` = sin tope. */
export function capInvitationAmount(
  nominalAmount: number,
  cap: number | null,
): { amount: number; capApplied: boolean } {
  if (cap === null || nominalAmount <= cap) {
    return { amount: nominalAmount, capApplied: false };
  }
  return { amount: cap, capApplied: true };
}

/** Los 4 gates de plan/precio que cierran el descuento por invitación antes de leer nada. */
function invitationGatesClosed(input: InvitationCandidateInput): boolean {
  return (
    // D-10b: flag del plan + piso duro (especial, paquete, is_trial).
    !planAllowsInvitationDiscount(input.plan) ||
    // El proporcional de fin de mes ya es el precio final (como hoy).
    input.prorateToMonthEnd === true ||
    // D-20: precio personalizado = precio final.
    input.isPriceOverride ||
    // D-26a: el boarding pass excluye el descuento por invitación en ese cobro.
    input.boardingPassApplied ||
    // Pitfall 5: gate de cobro pago.
    input.basePrice <= 0
  );
}

/**
 * Candidato de descuento por invitación de un cobro, o `null` si algún gate cierra
 * (D-10b / prorrateo / D-20 / D-26a / base > 0) o no hay nada que descontar NI vínculo
 * por crear. Solo lectura: no cualifica ni crea vínculos.
 *
 * El % sale de `ReferralService.computeInvitationDiscountPercent` (por lado, tope D-09)
 * simulando (a) la cualificación del vínculo `pending` y (b) el vínculo que nace al
 * comprar si el pagador tiene una invitación vigente (D-05/D-13). Si el pagador ya
 * tiene fila en `referrals` se conserva y no se ofrece una segunda (D-26c).
 */
export async function resolveInvitationDiscountCandidate(
  deps: DiscountArbiterDeps,
  ctx: TenantContext,
  input: InvitationCandidateInput,
): Promise<InvitationDiscountCandidate | null> {
  if (invitationGatesClosed(input)) return null;

  const { db, log, referralService } = deps;
  const settings = await getInvitationSettings(db, ctx, log);
  const link = await findLinkableInvitation(
    db,
    ctx,
    input.userId,
    settings.latePurchaseWindowDays,
  );

  const percent = await referralService.computeInvitationDiscountPercent(
    ctx,
    input.userId,
    {
      simulatePendingQualification: true,
      ...(link ? { simulateInvitationLink: { inviterId: link.inviterId } } : {}),
    },
  );
  // Sin % y sin vínculo por crear no hay nada que ofrecer ni materializar.
  if (percent <= 0 && link === null) return null;

  const nominalAmount = discountAmountOf(input.basePrice, percent);
  const cap = await getDiscountCapAmount(db, ctx, input.plan.country);
  const { amount, capApplied } = capInvitationAmount(nominalAmount, cap);

  return { percent, nominalAmount, amount, capApplied, linkToMaterialize: link };
}

/**
 * Descuento de partner tal como compite (D-21): su % sobre la lista del cobro. El
 * candidato (`resolvePartnerDiscountCandidate`) sigue siendo del servicio de partners.
 */
export function partnerCompetitor(
  candidate: { percent: number } | null,
  basePrice: number,
): PartnerCompetitorInput | null {
  if (candidate === null) return null;
  return {
    percent: candidate.percent,
    amount: discountAmountOf(basePrice, candidate.percent),
  };
}

/**
 * Ganador core entre partner e invitación por MONTO (D-21). Empate -> invitación.
 * Una invitación sin monto (solo vínculo por crear, o tope que lo dejó en 0) no
 * compite. Pura.
 */
export function pickCoreCompetitor(
  partner: PartnerCompetitorInput | null,
  invitation: InvitationDiscountCandidate | null,
): CoreCompetitor | null {
  const invitationCompetes = invitation !== null && invitation.amount > 0;
  if (partner === null) {
    return invitationCompetes
      ? { kind: "invitation", amount: invitation.amount }
      : null;
  }
  if (invitationCompetes && invitation.amount >= partner.amount) {
    return { kind: "invitation", amount: invitation.amount };
  }
  return { kind: "partner", amount: partner.amount };
}

/** Resultado de aplicar el árbitro sobre el precio post-filter. */
export interface ArbiterResult {
  invitationAmount: number;
  partnerAmount: number;
  finalPrice: number;
}

/**
 * Aplica el ganador core sobre el precio que dejó el filter. Si AURA aplicó, el filter
 * ya bajó el precio y ningún core descuenta (D-08/D-21). Si no, el precio post-filter
 * (= lista, el core solo participa sin override/prorrateo/boarding) pierde el monto del
 * ganador. Nunca baja de 0. Pura.
 */
export function applyArbiterResult(params: {
  priceAfterFilter: number;
  auraApplied: boolean;
  core: CoreCompetitor | null;
}): ArbiterResult {
  const { priceAfterFilter, auraApplied, core } = params;
  if (auraApplied || core === null) {
    return {
      invitationAmount: 0,
      partnerAmount: 0,
      finalPrice: priceAfterFilter,
    };
  }
  const amount = Math.min(core.amount, priceAfterFilter);
  return {
    invitationAmount: core.kind === "invitation" ? amount : 0,
    partnerAmount: core.kind === "partner" ? amount : 0,
    finalPrice: priceAfterFilter - amount,
  };
}
