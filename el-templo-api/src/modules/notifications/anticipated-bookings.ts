/**
 * Predicado compartido "reserva anticipada para hoy" (fix recordatorio de
 * clase, 2026-09-24, decisión de Franco).
 *
 * QUÉ ES "ANTICIPADA"
 * --------------------
 * Un booking VIGENTE (reservado/qr_escaneado/confirmado — mismos 3 estados
 * que `has_booking_today` en `notifications/rules.ts` y que el roster del
 * día) para HOY, en la timezone de LA SEDE DE LA CLASE (no la del proceso,
 * no necesariamente la sede "de casa" del socio — un socio puede reservar en
 * otra sede), cuyo `bookedAt` (momento de creación de la fila, columna
 * `booked_at`) es ANTERIOR a la medianoche del día de la clase en esa misma
 * timezone. Una reserva hecha el mismo día de la clase NO cuenta como
 * anticipada.
 *
 * POR QUÉ LAS RESERVAS DE PLANES FIJOS CUENTAN COMO ANTICIPADAS (verificado)
 * ----------------------------------------------------------------------------
 * `BookingService.generateFixedBookings` (scheduling/booking-service.ts)
 * inserta TODAS las filas de una suscripción de plan fijo de una sola vez,
 * para todo el rango startDate..endDate, en el momento en que se genera la
 * suscripción (alta, renovación, o edición de horarios) — no una por una el
 * día anterior a cada clase. `bookedAt` (default `now()` en el INSERT) queda
 * entonces fechado semanas o meses antes del día de cada clase individual,
 * así que TODAS esas reservas son "anticipadas" bajo esta regla. Es el
 * comportamiento correcto pedido por Franco: un socio de plan fijo sabe que
 * va a esa clase desde que armó su horario, no recién ese día.
 *
 * DOS CONSUMIDORES, UN SOLO PREDICADO (DRY)
 * -------------------------------------------
 * 1. `runMorningEnergyForTenantTz` (jobs/notification-cron.ts) excluye de
 *    `morning_energy` a todo socio con una reserva anticipada hoy (aunque su
 *    clase sea a la tarde y el recordatorio de clase todavía no haya salido).
 * 2. El job `class_reminder` (mismo archivo) itera estas filas para decidir a
 *    quién y cuándo mandarle el recordatorio (30/60 min antes según turno).
 *
 * Sin este módulo, cada consumidor reimplementaría el mismo JOIN + el mismo
 * corte de medianoche-por-sede — el riesgo real es que diverjan silenciosamente
 * (ej. uno usa la tz del socio, el otro la de la clase) y un socio termine
 * recibiendo las DOS notificaciones el mismo día, exactamente lo que Franco
 * pidió evitar.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import * as s from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";

/**
 * Estados de booking "vigente" — idénticos a `has_booking_today`
 * (notifications/rules.ts) y al roster del día: cancelado, lista de espera y
 * ausente no cuentan.
 */
export const LIVE_BOOKING_STATUSES = [
  "reservado",
  "qr_escaneado",
  "confirmado",
] as const;

export interface AnticipatedBooking {
  bookingId: number;
  userId: number;
  scheduleId: number;
  bookingDate: string; // YYYY-MM-DD, en la tz de branchTimezone
  startTime: string; // HH:MM
  branchTimezone: string;
  bookedAt: Date;
}

/**
 * true si una reserva ya existente (bookedAt) se hizo ANTES de la medianoche
 * del día de la clase (bookingDate), en la timezone de la sede de esa clase.
 * Pura: sin `db`, testeable con fechas fijas.
 */
export function isAnticipatedBooking(
  bookedAt: Date,
  bookingDate: string,
  branchTimezone: string,
): boolean {
  const midnightOfClassDay = buildClassDateTime(
    bookingDate,
    "00:00",
    branchTimezone,
  );
  return bookedAt.getTime() < midnightOfClassDay.getTime();
}

/**
 * Reservas anticipadas para "hoy" de un tenant completo, resolviendo "hoy"
 * FILA POR FILA con la timezone de la sede de esa clase (no una tz global de
 * barrido) — así un socio que reserva una clase en una sede de otro huso
 * horario igual queda bien clasificado.
 *
 * Acotado a `booking_date` en un rango de ±1 día del reloj del proceso: ningún
 * huso horario real difiere de UTC por más de 24 h, así que ninguna fila "de
 * hoy" en ninguna sede queda afuera del rango — y esto evita escanear meses de
 * reservas de plan fijo ya generadas a futuro (`generateFixedBookings`).
 */
export async function anticipatedBookingsToday(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<AnticipatedBooking[]> {
  const rangeStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const rangeEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      bookingId: s.bookings.id,
      userId: s.bookings.memberId,
      scheduleId: s.bookings.scheduleId,
      bookingDate: s.bookings.bookingDate,
      bookedAt: s.bookings.bookedAt,
      startTime: s.schedules.startTime,
      branchTimezone: s.branches.timezone,
    })
    .from(s.bookings)
    .innerJoin(s.schedules, eq(s.schedules.id, s.bookings.scheduleId))
    .innerJoin(s.branches, eq(s.branches.id, s.schedules.branchId))
    .where(
      and(
        tenantWhere(s.bookings, ctx),
        inArray(s.bookings.status, [...LIVE_BOOKING_STATUSES]),
        gte(s.bookings.bookingDate, rangeStart),
        lte(s.bookings.bookingDate, rangeEnd),
      ),
    );

  const result: AnticipatedBooking[] = [];
  for (const row of rows) {
    const todayForThisBranch = todayInTz(row.branchTimezone, now);
    if (row.bookingDate !== todayForThisBranch) continue;
    if (!isAnticipatedBooking(row.bookedAt, row.bookingDate, row.branchTimezone)) {
      continue;
    }
    result.push(row);
  }
  return result;
}
