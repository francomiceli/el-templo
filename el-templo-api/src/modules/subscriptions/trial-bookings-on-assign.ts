// SP pendiente al cargar la primera membresía (2026-10-01, caso Sofía Santana).
//
// Un lead en 'prueba' puede tener su Sesión de Prueba agendada para dentro de
// varios días. Si gestión le carga la membresía ANTES de esa fecha, la SP
// quedaba como prueba: ocupaba cupo de SP, mandaba el recordatorio de "tu
// sesión de prueba" y en la grilla figuraba como SP aunque ya es socia.
//
// Al asignar un plan presencial ya vigente, cada SP pendiente dentro del
// período del plan se resuelve:
//   - convertida → reserva normal del plan (`is_trial = false`), conserva su
//     lugar. Plan flexible: siempre, salvo que ya tenga otra clase ese día.
//     Plan fijo: solo si es uno de sus horarios fijos.
//   - cancelada  → cuando el plan no la cubre (fijo en otro horario) o ya
//     tiene otra clase ese día.
//   - sin cambios ('kept') → el plan todavía no arrancó (programado): la SP
//     sigue siendo prueba, pero gestión queda avisada.
// SP anteriores al inicio del plan o posteriores a su fin no se tocan (son
// pruebas genuinas fuera de la membresía).
//
// Corre DESPUÉS del commit de assignPlan: para entonces recomputeUserStatus
// ya registró la conversión del lead (necesita una reserva `is_trial = 1`),
// y las reservas de turnos fijos ya están creadas. Cada cambio deja una fila
// en audit_log, que es el rastro de que esa reserva fue una SP.

import type { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, gte, inArray, ne } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { auditLog } from "../shared/audit-log";
import { deletePendingTrialReminders } from "../scheduling/trial-reminder";
import { categoryGroup } from "./types";
import type { TrialBookingChange } from "./types";

type Db = MySql2Database<typeof schema>;

const PENDING_STATUSES = ["reservado", "lista_espera"] as const;
const OTHER_DAY_BOOKING_STATUSES = [
  "reservado",
  "lista_espera",
  "qr_escaneado",
  "confirmado",
] as const;

export async function resolvePendingTrialBookings(
  db: Db,
  ctx: TenantContext,
  params: {
    userId: number;
    subscriptionId: number;
    actorId: number;
    /** "Hoy" YYYY-MM-DD, el mismo criterio que usa assignPlan. */
    today: string;
  },
): Promise<TrialBookingChange[]> {
  const { userId, subscriptionId, actorId, today } = params;

  const [sub] = await db
    .select({
      status: schema.subscriptions.status,
      startDate: schema.subscriptions.startDate,
      endDate: schema.subscriptions.endDate,
      planCategory: schema.subscriptionPlans.planCategory,
      bookingMode: schema.subscriptionPlans.bookingMode,
    })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      and(
        tenantWhere(schema.subscriptionPlans, ctx),
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.subscriptions, ctx),
        eq(schema.subscriptions.id, subscriptionId),
      ),
    );
  // Solo membresías presenciales: un pase especial u online no cubre la SP.
  if (!sub || categoryGroup(sub.planCategory) !== "presencial") return [];

  const trials = await db
    .select({
      bookingId: schema.bookings.id,
      scheduleId: schema.bookings.scheduleId,
      date: schema.bookings.bookingDate,
      startTime: schema.schedules.startTime,
      activityName: schema.activities.name,
      branchName: schema.branches.name,
    })
    .from(schema.bookings)
    .innerJoin(
      schema.schedules,
      and(
        tenantWhere(schema.schedules, ctx),
        eq(schema.schedules.id, schema.bookings.scheduleId),
      ),
    )
    .innerJoin(
      schema.activities,
      and(
        tenantWhere(schema.activities, ctx),
        eq(schema.activities.id, schema.schedules.activityId),
      ),
    )
    .innerJoin(
      schema.branches,
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.id, schema.schedules.branchId),
      ),
    )
    .where(
      and(
        tenantWhere(schema.bookings, ctx),
        eq(schema.bookings.memberId, userId),
        eq(schema.bookings.isTrial, true),
        inArray(schema.bookings.status, [...PENDING_STATUSES]),
        gte(schema.bookings.bookingDate, today),
      ),
    );

  const inPlanWindow = trials.filter(
    (t) =>
      t.date >= sub.startDate &&
      (sub.endDate === null || t.date <= sub.endDate),
  );
  if (inPlanWindow.length === 0) return [];

  const describe = (t: (typeof trials)[number]) => ({
    bookingId: t.bookingId,
    date: t.date,
    startTime: t.startTime,
    activityName: t.activityName,
    branchName: t.branchName,
  });

  // La conversión del lead (users.converted_at, recomputeUserStatus) exige
  // una reserva `is_trial = 1`. Si todavía no se registró — plan programado
  // que no arrancó, o el CURDATE() de MySQL todavía no llegó al startDate —
  // la SP no se toca: sacarle `is_trial` perdería la conversión para
  // siempre. Solo se avisa.
  const [lead] = await db
    .select({ convertedAt: schema.users.convertedAt })
    .from(schema.users)
    .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
  const conversionRecorded = lead?.convertedAt != null;

  if (sub.status !== "active" || sub.startDate > today || !conversionRecorded) {
    return inPlanWindow.map((t) => ({
      ...describe(t),
      outcome: "kept" as const,
      reason: "El plan todavía no arrancó: la sesión sigue como prueba.",
    }));
  }

  const anchorIds =
    sub.bookingMode === "fixed"
      ? new Set(
          (
            await db
              .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
              .from(schema.subscriptionSchedules)
              .where(
                and(
                  tenantWhere(schema.subscriptionSchedules, ctx),
                  eq(
                    schema.subscriptionSchedules.subscriptionId,
                    subscriptionId,
                  ),
                ),
              )
          ).map((r) => r.scheduleId),
        )
      : null;

  const changes: TrialBookingChange[] = [];
  for (const t of inPlanWindow) {
    let reason: string | null = null;
    if (anchorIds && !anchorIds.has(t.scheduleId)) {
      reason = "Su plan fijo no incluye ese horario.";
    } else if (!anchorIds) {
      // Flexible: una clase por día. Las reservas de turnos fijos no aplican.
      const [otherSameDay] = await db
        .select({ id: schema.bookings.id })
        .from(schema.bookings)
        .where(
          and(
            tenantWhere(schema.bookings, ctx),
            eq(schema.bookings.memberId, userId),
            eq(schema.bookings.bookingDate, t.date),
            eq(schema.bookings.isTrial, false),
            ne(schema.bookings.id, t.bookingId),
            inArray(schema.bookings.status, [...OTHER_DAY_BOOKING_STATUSES]),
          ),
        )
        .limit(1);
      if (otherSameDay) reason = "Ya tiene otra clase reservada ese día.";
    }
    changes.push({
      ...describe(t),
      outcome: reason ? "cancelled" : "converted",
      reason,
    });
  }

  await db.transaction(async (tx) => {
    for (const c of changes) {
      if (c.outcome === "converted") {
        await tx
          .update(schema.bookings)
          .set({ isTrial: false })
          .where(
            and(
              tenantWhere(schema.bookings, ctx),
              eq(schema.bookings.id, c.bookingId),
            ),
          );
      } else {
        await tx
          .update(schema.bookings)
          .set({
            status: "cancelado",
            cancelledAt: new Date(),
            waitlistPosition: null,
          })
          .where(
            and(
              tenantWhere(schema.bookings, ctx),
              eq(schema.bookings.id, c.bookingId),
            ),
          );
      }
      await auditLog.write(ctx, tx, {
        actorId,
        action:
          c.outcome === "converted"
            ? "trial_booking_converted"
            : "trial_booking_cancelled",
        targetKind: "booking",
        targetId: c.bookingId,
        payload: {
          bookingId: c.bookingId,
          subscriptionId,
          userId,
          date: c.date,
          startTime: c.startTime,
          reason: c.reason,
        },
      });
    }
  });

  // El recordatorio "tu sesión de prueba es mañana" ya no corresponde.
  await deletePendingTrialReminders(db, ctx, userId);

  return changes;
}
