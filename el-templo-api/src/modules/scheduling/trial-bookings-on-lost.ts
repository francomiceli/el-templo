// deploy: redeploy de la API tras CI rojo por tenancy en tests (hotfixes SP Perdida + lista de espera, paths-filter, 2026-11-24)
// SP por venir al marcar el lead como Perdido (2026-11-24, caso Malvina
// Lamenza).
//
// Gestión puede dar por perdida una Sesión de Prueba ANTES de que ocurra (ej.:
// "se lesionó el finde", avisado por WhatsApp). La reserva quedaba como
// `reservado`: ocupaba un lugar en la clase que nadie más podía tomar y el
// recordatorio de la SP seguía en cola.
//
// Al marcar Perdida se cancelan las SP del lead cuya clase todavía no empezó
// (hora de la sede). Las que ya pasaron no se tocan: su asistencia (o falta)
// es historia del reporte. Nada se restaura si el lead vuelve a "En
// seguimiento": gestión le agenda una SP nueva, que ya reabre el lead sola
// (`TrialsService.bookTrial`).
//
// La fila de la sesión cancelada SIGUE en el reporte de Sesiones de Prueba
// como "Perdida": el reporte incluye las reservas canceladas que tienen
// `trial_followups.lost_reason` (ver `ReportsService.fetchTrialSessionRawRows`)
// y no las cuenta como reagendas.

import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { auditLog } from "../shared/audit-log";
import { buildClassDateTime } from "../shared/date-utils";
import type { TxHandle } from "../finance/balance-service";

const PENDING_STATUSES = ["reservado", "lista_espera"] as const;

export interface CancelledTrialBooking {
  bookingId: number;
  date: string;
  startTime: string;
}

/**
 * Cancela las SP pendientes del lead cuya clase todavía no empezó. Corre
 * dentro de la transacción del caller (que marca la Perdida), así la
 * cancelación y el cambio de estado son atómicos. NO borra el recordatorio
 * pendiente: eso lo hace el caller después del commit
 * (`deletePendingTrialReminders`), igual que el resto de los flujos de SP.
 */
export async function cancelUpcomingTrialBookings(
  tx: TxHandle,
  ctx: TenantContext,
  params: { userId: number; actorId: number; now?: Date },
): Promise<CancelledTrialBooking[]> {
  const { userId, actorId } = params;
  const now = params.now ?? new Date();

  const pending = await tx
    .select({
      bookingId: schema.bookings.id,
      date: schema.bookings.bookingDate,
      startTime: schema.schedules.startTime,
      tz: schema.branches.timezone,
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
      ),
    );

  const upcoming = pending.filter(
    (b) => buildClassDateTime(b.date, b.startTime, b.tz) > now,
  );

  for (const b of upcoming) {
    await tx
      .update(schema.bookings)
      .set({ status: "cancelado", cancelledAt: now, waitlistPosition: null })
      .where(
        and(
          tenantWhere(schema.bookings, ctx),
          eq(schema.bookings.id, b.bookingId),
        ),
      );
    await auditLog.write(ctx, tx, {
      actorId,
      action: "trial_booking_cancelled",
      targetKind: "booking",
      targetId: b.bookingId,
      payload: {
        bookingId: b.bookingId,
        userId,
        date: b.date,
        startTime: b.startTime,
        reason: "Lead marcado como Perdido.",
      },
    });
  }

  return upcoming.map(({ bookingId, date, startTime }) => ({
    bookingId,
    date,
    startTime,
  }));
}
