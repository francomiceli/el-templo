// Module: scheduling — partner-week-service (fase 179, D-05/D-06/D-07/D-19).
//
// La mitad "free_pass" del beneficio de partner: un comercio/marca con código
// impreso regala una SEMANA de entrenamiento (7 días, 3 clases, precio 0) al
// socio que se registra con su código. A diferencia del descuento porcentual
// (`referral-partners/service.ts`, consumido en el momento del cobro), este
// beneficio se activa recién cuando el socio reserva su PRIMERA clase (D-06)
// — el registro sólo deja el beneficio "pendiente".
//
// POR QUÉ NO REUSA `is_trial=true` (anti-patrón prohibido, ver CONTEXT/PLAN):
// los trials de la fase 119 bypassean a propósito la capacidad de la grilla
// (`trials-service.ts:19-22`) — son una promesa de "probá gratis", no una
// membresía. La semana de partner ES una suscripción real (D-05: plan
// `paquete` de 7 días con `price_paid=0`, `membership_kind='bonificada'`) y su
// reserva tiene que competir por cupo como cualquier otra: usa
// `BookingService.reserve()` sin `isTrial`, no un camino aparte que la
// esconda de la grilla.
//
// POR QUÉ ACTIVAR + RESERVAR EN UN SOLO REQUEST (`activateAndReserve`): un
// endpoint que activara el plan y OTRO que reservara la clase dejarían una
// ventana de "semana consumida sin clase reservada" si el socio cierra la app
// entre los dos pasos — el beneficio se habría gastado (vínculo `consumed`)
// sin que el socio tenga nada reservado. Un solo método hace las dos cosas
// (ver el docblock de `activateAndReserve` para la decisión de
// transaccionalidad exacta, dado que `assignPlan` maneja su propia tx).
//
// QUÉ DECISIONES LO GOBIERNAN:
//  - D-05: semana = plan `paquete` de 7 días, 3 clases/semana, precio 0.
//  - D-06: se activa al reservar, no al registro (que sólo deja "pending").
//  - D-07: el vencimiento a 30 días se evalúa EN LECTURA contra
//    `benefit_expires_at` — prohibido un cron que lo materialice (CON-04).
//  - D-19: 3 clases/semana, mismo valor en AR y ES (el plan se busca por
//    país de la sede, no hardcodeado).

import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { tenantWhere } from "../shared/tenant";
import type { TenantCtx } from "../referral-partners/types";
import { PartnerReferralService } from "../referral-partners/service";
import type { SubscriptionService } from "../subscriptions/service";
import type { BookingService } from "./booking-service";
import { todayInTz } from "../shared/date-utils";
import { BLOCKING_SUBSCRIPTION_STATUSES } from "./trials-service";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Motivo de no-elegibilidad, en el mismo espíritu que `TrialEligibility`
 * (fase 119): la app decide qué mostrar según el `reason`, sin adivinar por
 * el status code.
 */
export type PartnerWeekIneligibleReason =
  | "sin_beneficio"
  | "expirado"
  | "consumido"
  | "con_plan_activo";

export type PartnerWeekEligibility =
  | { eligible: true; partnerName: string; expiresAt: Date }
  | { eligible: false; reason: PartnerWeekIneligibleReason };

export interface ActivatePartnerWeekInput {
  scheduleId: number;
  date: string; // YYYY-MM-DD
  branchId: number;
}

export interface ActivatePartnerWeekResult {
  subscriptionId: number;
  bookingId: number;
  endDate: string | null;
  classesRemaining: number | null;
}

export class PartnerWeekService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly subscriptionService: SubscriptionService,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * ¿Puede este socio activar su semana de regalo? Lectura pura, sin efectos
   * secundarios — la usan tanto `GET /partner-benefit` (para dibujar la
   * grilla) como el primer guard de `activateAndReserve` (revalidado, nunca
   * confiado del lado cliente).
   *
   * El vencimiento (D-07) se evalúa acá EN LECTURA contra
   * `benefit_expires_at > ahora`: el `benefit_status` puede seguir `pending`
   * en la fila (nada lo pasa a `expired` de forma automática — prohibido un
   * cron, CON-04) pero igual se reporta `expirado` si la fecha ya pasó.
   */
  async getPartnerWeekEligibility(userId: number): Promise<PartnerWeekEligibility> {
    /* tenant-safe: lectura por PK del propio usuario que llama — no hay
     * request.scope en esta ruta member (mismo patrón que
     * getTrialEligibility/consumePartnerBenefitOnCharge). */
    const [user] = await this.db
      .select({ tenantId: schema.users.tenantId, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user || user.deletedAt) {
      return { eligible: false, reason: "sin_beneficio" };
    }
    const ctx: TenantCtx = { tenantId: user.tenantId };

    const [link] = await this.db
      .select({
        benefitStatus: schema.partnerReferrals.benefitStatus,
        benefitExpiresAt: schema.partnerReferrals.benefitExpiresAt,
        partnerName: schema.referralPartners.name,
      })
      .from(schema.partnerReferrals)
      .innerJoin(
        schema.referralPartners,
        eq(schema.referralPartners.id, schema.partnerReferrals.partnerId),
      )
      .where(
        and(
          tenantWhere(schema.partnerReferrals, ctx),
          eq(schema.partnerReferrals.referredId, userId),
          eq(schema.partnerReferrals.benefitType, "free_pass"),
        ),
      )
      .limit(1);
    if (!link) {
      return { eligible: false, reason: "sin_beneficio" };
    }
    if (link.benefitStatus === "consumed") {
      return { eligible: false, reason: "consumido" };
    }
    if (link.benefitStatus === "expired" || link.benefitExpiresAt <= new Date()) {
      return { eligible: false, reason: "expirado" };
    }

    const blocking = await this.hasBlockingSubscription(ctx, userId);
    if (blocking) {
      return { eligible: false, reason: "con_plan_activo" };
    }

    return {
      eligible: true,
      partnerName: link.partnerName,
      expiresAt: link.benefitExpiresAt,
    };
  }

  /**
   * Activa la semana de regalo Y reserva la primera clase, en un solo
   * request (D-06).
   *
   * Todas las guardas corren ANTES de tocar la base (mismo patrón que
   * `reserveTrialSelfService`): 404 si el usuario o la sede no existen, 409
   * si el beneficio no está en condiciones de activarse o si el socio ya
   * tiene plan, 409 si la sede es virtual (la semana es presencial, D-05).
   *
   * DECISIÓN DE TRANSACCIONALIDAD (plan 179-08, tarea 1): `assignPlan`
   * maneja su PROPIA `db.transaction` internamente (no acepta un `tx`
   * externo) — envolver acá "assignPlan + booking + consumo" en una tx
   * propia habría exigido reimplementar la creación de la suscripción por
   * fuera de `assignPlan`, contra la instrucción explícita del plan de
   * REUSAR ese método (es el único camino canónico a
   * `membership_kind='bonificada'` vía `priceOverrideAmount=0`). Se sigue
   * entonces el fallback documentado: `assignPlan` corre y COMMITEA la
   * suscripción; recién después se intenta la reserva. Si la reserva falla,
   * el error se loguea con `log.error` (queda una suscripción activa sin
   * booking) y se PROPAGA sin revertir la suscripción — no es un
   * medio-estado silencioso: el socio ya tiene una suscripción real y activa
   * y puede reservar normalmente por `/reserve` sin pasar de nuevo por este
   * endpoint (un segundo intento acá mismo da 409 `con_plan_activo`, el
   * guard de abajo lo cubre). El consumo del beneficio (`benefit_status=
   * consumed`) sólo se hace DESPUÉS de que la reserva efectivamente exista,
   * así que nunca queda "semana consumida sin clase reservada" (el otro lado
   * de la garantía, el que si importa silenciarlo mal).
   */
  async activateAndReserve(
    userId: number,
    input: ActivatePartnerWeekInput,
  ): Promise<ActivatePartnerWeekResult> {
    /* tenant-safe: lectura por PK del propio usuario que llama (ver
     * getPartnerWeekEligibility arriba). */
    const [user] = await this.db
      .select({ tenantId: schema.users.tenantId, deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user || user.deletedAt) {
      throw new NotFoundError("Alumno no encontrado");
    }
    const ctx: TenantCtx = { tenantId: user.tenantId };

    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        isVirtual: schema.branches.isVirtual,
        country: schema.branches.country,
        timezone: schema.branches.timezone,
      })
      .from(schema.branches)
      .where(and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, input.branchId)))
      .limit(1);
    if (!branch) {
      throw new NotFoundError("Sede no encontrada");
    }
    if (branch.isVirtual) {
      throw new ConflictError(
        "La semana de regalo se activa en una sede física — elegí una sede presencial",
      );
    }

    const [link] = await this.db
      .select({
        linkId: schema.partnerReferrals.id,
        benefitStatus: schema.partnerReferrals.benefitStatus,
        benefitExpiresAt: schema.partnerReferrals.benefitExpiresAt,
        partnerName: schema.referralPartners.name,
        partnerCode: schema.referralPartners.code,
      })
      .from(schema.partnerReferrals)
      .innerJoin(
        schema.referralPartners,
        eq(schema.referralPartners.id, schema.partnerReferrals.partnerId),
      )
      .where(
        and(
          tenantWhere(schema.partnerReferrals, ctx),
          eq(schema.partnerReferrals.referredId, userId),
          eq(schema.partnerReferrals.benefitType, "free_pass"),
        ),
      )
      .limit(1);
    if (!link) {
      throw new ConflictError("No tenés un beneficio de semana de regalo pendiente");
    }
    if (link.benefitStatus === "consumed") {
      throw new ConflictError("Ya activaste tu semana de regalo");
    }
    if (link.benefitStatus === "expired" || link.benefitExpiresAt <= new Date()) {
      throw new ConflictError("Tu semana de regalo venció");
    }

    const blocking = await this.hasBlockingSubscription(ctx, userId);
    if (blocking) {
      throw new ConflictError(
        "Ya tenés una suscripción activa — no podés activar la semana de regalo",
      );
    }

    // D-19: plan `paquete` de 1 semana / 3 clases por semana del país de la
    // sede elegida. El `planId` NUNCA sale del body (T-179-32) — se busca
    // server-side, así el cliente no puede elegir qué plan se le asigna.
    const [plan] = await this.db
      .select({ id: schema.subscriptionPlans.id })
      .from(schema.subscriptionPlans)
      .where(
        and(
          tenantWhere(schema.subscriptionPlans, ctx),
          eq(schema.subscriptionPlans.planCategory, "paquete"),
          eq(schema.subscriptionPlans.durationDays, 7),
          eq(schema.subscriptionPlans.classesPerWeek, 3),
          eq(schema.subscriptionPlans.isActive, true),
          eq(schema.subscriptionPlans.isArchived, false),
          eq(schema.subscriptionPlans.country, branch.country),
        ),
      )
      .limit(1);
    if (!plan) {
      this.log.error(
        { tenantId: ctx.tenantId, country: branch.country },
        "partner-week: no existe un plan 'paquete' de 7 días / 3 clases por semana para el país de la sede — problema de configuración, no del socio",
      );
      throw new BadRequestError(
        `No hay un plan de semana de regalo configurado para ${branch.country}. Avisale a soporte.`,
      );
    }

    const startDate = todayInTz(branch.timezone);
    const subscription = await this.subscriptionService.assignPlan(
      userId,
      {
        planId: plan.id,
        branchId: input.branchId,
        startDate,
        priceTypeApplied: "zero",
        paymentMethod: "cash", // valor neutro; pricePaid=0 no registra cobro (mismo patrón que el promo de auth/routes.ts)
        priceOverrideAmount: 0, // único camino canónico a membership_kind='bonificada'
        priceOverrideReason: `Semana de regalo — partner ${link.partnerName} (${link.partnerCode})`,
      },
      userId, // self-assignment
    );

    let bookingId: number;
    try {
      const booking = await this.bookingService.reserve(
        userId,
        input.scheduleId,
        input.date,
      );
      bookingId = booking.id;
    } catch (err: unknown) {
      this.log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          userId,
          subscriptionId: subscription.id,
        },
        "partner-week: la suscripción de la semana de regalo se creó pero la reserva de la primera clase falló — queda una suscripción activa sin reserva, el socio puede reservar normalmente por /reserve",
      );
      throw err;
    }

    // Consumo del beneficio — DESPUÉS de que la reserva exista (ver docblock
    // de arriba). UPDATE guardado por `benefit_status='pending'`
    // (`consumePartnerBenefitOnCharge`, T-179-31): una segunda llamada
    // concurrente que haya pasado los guards de arriba no pisa esta fila.
    // `percent`/`amount` en 0: la semana gratis no es un descuento monetario
    // (ese es el eje `discount_percent`, D-09/D-10), es un plan a precio 0.
    await new PartnerReferralService(this.db, this.log).consumePartnerBenefitOnCharge(
      ctx,
      userId,
      subscription.id,
      { percent: 0, amount: 0, reason: "semana_activada" },
    );

    return {
      subscriptionId: subscription.id,
      bookingId,
      endDate: subscription.endDate,
      classesRemaining: subscription.classesRemaining,
    };
  }

  /**
   * Mismo criterio que `getTrialEligibility` (`BLOCKING_SUBSCRIPTION_STATUSES`,
   * reexportado de `trials-service.ts` — no una copia que pueda divergir): un
   * socio con una suscripción activa/pausada/programada ya es miembro, no
   * puede activar la semana de regalo encima. Acotado por `tenantWhere`
   * (CON-06): a diferencia de `getTrialEligibility` (todavía sin adoptar),
   * este servicio ya tiene el `ctx` a mano en los dos call sites.
   */
  private async hasBlockingSubscription(
    ctx: TenantCtx,
    userId: number,
  ): Promise<boolean> {
    const [blockingSub] = await this.db
      .select({ id: schema.subscriptions.id })
      .from(schema.subscriptions)
      .where(
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.userId, userId),
          inArray(schema.subscriptions.status, [...BLOCKING_SUBSCRIPTION_STATUSES]),
        ),
      )
      .limit(1);
    return !!blockingSub;
  }
}
