// Module: scheduling — especial-trial-service (2026-09-29, yoga de Moreno).
//
// "Probá una clase gratis": un ALUMNO con plan presencial activo que toca un
// horario de una línea de pase especial (hoy Yoga) sin tener el pase puede
// tomar UNA clase de prueba gratis. El servidor le asigna un pase de $0
// (`plan_category='especial'`, `is_trial=1`, misma línea) y le reserva ese
// turno en el mismo request. Después es el flujo normal de pases.
//
// NO ES la Sesión de Prueba del embudo (`is_trial` de BOOKINGS,
// trials-service): eso sigue igual para los leads freemium. Acá `is_trial` es
// la columna del PLAN y solo sirve para (a) ocultarlo del catálogo de la app y
// (b) que el servidor identifique cuál es el plan de prueba de cada línea.
//
// Molde: `partner-week-service.ts` `activateAndReserve` (member action →
// `assignPlan` a $0 bonificada → `bookingService.reserve`). Diferencias:
//  - el `end_date` del pase se recorta al vencimiento del presencial
//    (`assignPlan` con `endDateOverride`), así la fecha de cobertura del
//    alumno (`deriveCoveredUntil`) no se mueve;
//  - si la reserva falla se DESHACE la asignación (partner-week deja la
//    suscripción; acá dejarla gastaría la única prueba del alumno sin clase).
//
// Reglas (todas server-side, el plan de prueba NUNCA viene del cliente):
//  1. presencial (`plan_category='presencial'`) ACTIVO (no pausado) y vigente
//     hoy;
//  2. nunca tuvo una suscripción (cualquier estado) a un plan especial de la
//     misma línea — ni la prueba ni uno pago;
//  3. existe el plan de prueba de la línea (activo, precio 0, mismo país).
//  Fecha de la clase: entre hoy y hoy+6 (tz de la sede) y <= vencimiento del
//  presencial.

import { and, eq, isNull, or, gte, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { addDays, todayInTz } from "../shared/date-utils";
import { emitOccupancyChange } from "../shared/occupancy-events";
import type { SubscriptionService } from "../subscriptions/service";
import type { BookingService } from "./booking-service";
import type { BookingRecord } from "./types";
import {
  normalizeSpecialLine,
  sameSpecialLine,
  specialLineCondition,
  specialLineLabel,
} from "./special-line";

type DbInstance = MySql2Database<typeof schema>;

/** La prueba dura 7 días: la clase puede ser desde hoy hasta hoy + 6. */
export const ESPECIAL_TRIAL_MAX_DAYS_AHEAD = 6;

const PRUEBA_MOTIVO = "Clase de prueba de Yoga (autoasignada)";

export interface ActivateEspecialTrialInput {
  scheduleId: number;
  date: string; // YYYY-MM-DD
}

/** Presencial activo y vigente hoy: `endDate` null = sin vencimiento. */
interface ActivePresencial {
  endDate: string | null;
}

/**
 * Presencial activo (no pausado) del socio que cubre `today`. Si hubiera más
 * de uno (no debería) se toma el de vencimiento más lejano (null = sin
 * vencimiento gana).
 */
async function findActivePresencial(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  today: string,
): Promise<ActivePresencial | null> {
  const rows = await db
    .select({ endDate: schema.subscriptions.endDate })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active"),
        eq(schema.subscriptionPlans.planCategory, "presencial"),
        lte(schema.subscriptions.startDate, today),
        or(
          isNull(schema.subscriptions.endDate),
          gte(schema.subscriptions.endDate, today),
        ),
      ),
    );
  if (rows.length === 0) return null;
  if (rows.some((r) => r.endDate === null)) return { endDate: null };
  const latest = rows.reduce(
    (max, r) => ((r.endDate as string) > max ? (r.endDate as string) : max),
    rows[0].endDate as string,
  );
  return { endDate: latest };
}

/** ¿El socio tuvo ALGUNA vez (cualquier estado) un pase especial de la línea? */
async function hadPassOfLine(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  line: string | null,
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptionPlans.planCategory, "especial"),
        specialLineCondition(schema.subscriptionPlans.specialLine, line),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Plan de prueba de una línea: activo, no archivado, especial, misma línea,
 * `is_trial=1`, precio 0, del país de la sede. Nunca sale del cliente.
 */
async function findTrialPlanForLine(
  db: DbInstance,
  ctx: TenantContext,
  line: string,
  country: string,
): Promise<{ id: number } | null> {
  const [plan] = await db
    .select({ id: schema.subscriptionPlans.id })
    .from(schema.subscriptionPlans)
    .where(
      and(
        tenantWhere(schema.subscriptionPlans, ctx),
        eq(schema.subscriptionPlans.planCategory, "especial"),
        specialLineCondition(schema.subscriptionPlans.specialLine, line),
        eq(schema.subscriptionPlans.isTrial, true),
        eq(schema.subscriptionPlans.priceRegular, 0),
        eq(schema.subscriptionPlans.priceZero, 0),
        eq(schema.subscriptionPlans.isActive, true),
        eq(schema.subscriptionPlans.isArchived, false),
        eq(schema.subscriptionPlans.country, country),
      ),
    )
    .limit(1);
  return plan ?? null;
}

/**
 * Líneas de pase especial donde el socio puede tomar la clase de prueba
 * gratis (campo `trialLines` de `GET /me/especial-pass`). Reglas 1-3 del
 * docblock del archivo; la línea NULL (Aura) nunca ofrece prueba.
 */
export async function getEspecialTrialLines(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<string[]> {
  const [user] = await db
    .select({
      country: schema.branches.country,
      timezone: schema.branches.timezone,
    })
    .from(schema.users)
    .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
    .limit(1);
  if (!user) return [];

  // Líneas con plan de prueba (una entrada por línea, sin distinguir mayúsculas).
  const trialPlans = await db
    .select({ specialLine: schema.subscriptionPlans.specialLine })
    .from(schema.subscriptionPlans)
    .where(
      and(
        tenantWhere(schema.subscriptionPlans, ctx),
        eq(schema.subscriptionPlans.planCategory, "especial"),
        eq(schema.subscriptionPlans.isTrial, true),
        eq(schema.subscriptionPlans.priceRegular, 0),
        eq(schema.subscriptionPlans.priceZero, 0),
        eq(schema.subscriptionPlans.isActive, true),
        eq(schema.subscriptionPlans.isArchived, false),
        eq(schema.subscriptionPlans.country, user.country),
      ),
    );
  const lines: string[] = [];
  for (const p of trialPlans) {
    const line = normalizeSpecialLine(p.specialLine);
    if (line !== null && !lines.some((l) => sameSpecialLine(l, line))) {
      lines.push(line);
    }
  }
  if (lines.length === 0) return [];

  const today = todayInTz(user.timezone);
  if (!(await findActivePresencial(db, ctx, userId, today))) return [];

  const eligible: string[] = [];
  for (const line of lines) {
    if (!(await hadPassOfLine(db, ctx, userId, line))) eligible.push(line);
  }
  return eligible;
}

export class EspecialTrialService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    private readonly subscriptionService: SubscriptionService,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Asigna el pase de prueba de la línea del horario Y reserva la clase, en
   * un solo request. Todas las guardas corren ANTES de tocar la base. Si la
   * reserva falla (o el turno está lleno y quedaría en lista de espera) la
   * suscripción recién creada se elimina: el alumno conserva su prueba.
   *
   * ROLLBACK: `assignPlan` maneja su PROPIA transacción (no acepta `tx`
   * externo, ver el docblock de partner-week), así que no se puede envolver
   * "asignar + reservar" en una sola. La compensación es un DELETE de la fila
   * de la suscripción (no un cancel: una sub cancelada seguiría contando como
   * "ya tuvo un pase de la línea" y le quemaría la prueba). En ese punto la
   * sub no tiene nada colgado: precio 0 = sin transacción ni saldo, el plan
   * no vincula programas y sin reserva no hay bookings. Solo queda la fila de
   * auditoría `plan_assigned` (audit_log es de solo escritura) que además
   * queda contada en el log con el `subscriptionId` eliminado.
   */
  async activateAndReserve(
    ctx: TenantContext,
    userId: number,
    input: ActivateEspecialTrialInput,
  ): Promise<BookingRecord> {
    // 1. Socio.
    const [user] = await this.db
      .select({ deletedAt: schema.users.deletedAt })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);
    if (!user || user.deletedAt) {
      throw new NotFoundError("Alumno no encontrado");
    }

    // 2. Horario → actividad especial y su línea (server-side, nunca del body).
    const [slot] = await this.db
      .select({
        branchId: schema.schedules.branchId,
        isActive: schema.schedules.isActive,
        inactiveReason: schema.schedules.inactiveReason,
        isSpecial: schema.activities.isSpecial,
        specialLine: schema.activities.specialLine,
        timezone: schema.branches.timezone,
        country: schema.branches.country,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(
        and(
          tenantWhere(schema.schedules, ctx),
          eq(schema.schedules.id, input.scheduleId),
        ),
      )
      .limit(1);
    if (!slot) {
      throw new NotFoundError("Horario no encontrado");
    }
    const line = normalizeSpecialLine(slot.specialLine);
    if (!slot.isSpecial || line === null) {
      throw new ConflictError("Esta clase no tiene clase de prueba gratis");
    }
    if (!slot.isActive) {
      throw new BadRequestError(
        slot.inactiveReason ?? "Este horario no esta activo",
      );
    }
    const label = specialLineLabel(line);

    // 3. Plan de prueba de la línea.
    const trialPlan = await findTrialPlanForLine(
      this.db,
      ctx,
      line,
      slot.country,
    );
    if (!trialPlan) {
      throw new ConflictError(`${label} no ofrece clase de prueba gratis`);
    }

    // 4. Elegibilidad: presencial activo + nunca tuvo un pase de la línea.
    const today = todayInTz(slot.timezone);
    const presencial = await findActivePresencial(
      this.db,
      ctx,
      userId,
      today,
    );
    if (!presencial) {
      throw new ConflictError(
        "Necesitás un plan presencial activo para probar una clase gratis",
      );
    }
    if (await hadPassOfLine(this.db, ctx, userId, line)) {
      throw new ConflictError(
        `Ya usaste tu clase de prueba o ya tuviste un pase de ${label}`,
      );
    }

    // 5. Fecha: hoy..hoy+6 y dentro de la vigencia del presencial.
    const lastTrialDay = addDays(today, ESPECIAL_TRIAL_MAX_DAYS_AHEAD);
    if (input.date < today || input.date > lastTrialDay) {
      throw new ConflictError(
        "La clase de prueba tiene que ser dentro de los próximos 7 días",
      );
    }
    if (presencial.endDate !== null && input.date > presencial.endDate) {
      throw new ConflictError("Tu plan vence antes de esa clase");
    }

    // 6. Asignación a $0 (mismo camino que partner-week). El pase vence a los
    //    7 días o cuando vence el presencial, lo que ocurra primero: nunca
    //    extiende la cobertura del alumno.
    const endDate =
      presencial.endDate !== null && presencial.endDate < lastTrialDay
        ? presencial.endDate
        : lastTrialDay;
    const subscription = await this.subscriptionService.assignPlan(
      ctx,
      userId,
      {
        planId: trialPlan.id,
        branchId: slot.branchId,
        startDate: today,
        endDateOverride: endDate,
        priceTypeApplied: "zero",
        paymentMethod: "cash", // valor neutro; pricePaid=0 no registra cobro
        priceOverrideAmount: 0, // → membership_kind='bonificada'
        priceOverrideReason: PRUEBA_MOTIVO,
      },
      userId, // self-assignment
    );

    // 7. Reserva. Cualquier falla (o lista de espera) deshace la asignación.
    let booking: BookingRecord;
    try {
      booking = await this.bookingService.reserve(
        ctx,
        userId,
        input.scheduleId,
        input.date,
      );
      if (booking.status !== "reservado") {
        // Turno lleno: reserve() lo dejó en lista de espera. Una prueba en
        // lista de espera no sirve (el pase vence en días): se quita la fila.
        await this.db
          .delete(schema.bookings)
          .where(
            and(
              tenantWhere(schema.bookings, ctx),
              eq(schema.bookings.id, booking.id),
              eq(schema.bookings.status, "lista_espera"),
            ),
          );
        emitOccupancyChange({
          scheduleId: input.scheduleId,
          date: input.date,
        });
        throw new ConflictError(
          "Ese turno está completo. Probá con otro horario",
        );
      }
    } catch (err: unknown) {
      await this.discardSubscription(ctx, userId, subscription.id, err);
      throw err;
    }

    this.log.info(
      { userId, subscriptionId: subscription.id, bookingId: booking.id, line },
      "especial-trial: clase de prueba asignada y reservada",
    );
    return booking;
  }

  /** Compensación: borra la sub de prueba recién creada (ver docblock arriba). */
  private async discardSubscription(
    ctx: TenantContext,
    userId: number,
    subscriptionId: number,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.db
        .delete(schema.subscriptions)
        .where(
          and(
            tenantWhere(schema.subscriptions, ctx),
            eq(schema.subscriptions.id, subscriptionId),
            eq(schema.subscriptions.userId, userId),
          ),
        );
      this.log.warn(
        {
          userId,
          subscriptionId,
          cause: cause instanceof Error ? cause.message : String(cause),
        },
        "especial-trial: la reserva falló — se eliminó la suscripción de prueba recién creada",
      );
    } catch (delErr: unknown) {
      // No enmascarar el error original de la reserva: queda una sub de
      // prueba huérfana que hay que limpiar a mano.
      this.log.error(
        {
          userId,
          subscriptionId,
          err: delErr instanceof Error ? delErr.message : String(delErr),
        },
        "especial-trial: NO se pudo eliminar la suscripción de prueba tras una reserva fallida — limpiar a mano",
      );
    }
  }
}
