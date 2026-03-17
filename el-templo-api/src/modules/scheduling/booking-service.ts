/**
 * Booking Service
 *
 * Booking lifecycle: reserve, cancel, waitlist auto-promote,
 * capacity enforcement, weekly limit, overdue block, fixed-day/budget enforcement,
 * grace period check, admin add/remove.
 * Extracted from SchedulingService for single-responsibility.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, asc } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import {
  addDays,
  getWeekRange,
  buildClassDateTime,
} from "../shared/date-utils";
import type {
  BookingRecord,
  BookingStatus,
  AttendanceWeekRecord,
} from "./types";
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../shared/errors";

export class BookingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService,
  ) {}

  /**
   * Reserve a spot for a member.
   *
   * Validates: schedule active, date within current week, not past,
   * day matches schedule, not a holiday, active subscription, not overdue,
   * weekly limit, no duplicate, capacity (waitlist if full).
   */
  async reserve(
    memberId: number,
    scheduleId: number,
    date: string,
  ): Promise<BookingRecord> {
    // 1. Validate schedule exists and is active
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");
    if (!scheduleRow.isActive) {
      throw new BadRequestError("Este horario no esta activo");
    }

    // 2. Validate date is within current week (Mon-Sat) and not in the past
    const { monday, saturday } = getWeekRange(new Date());
    if (date < monday || date > saturday) {
      throw new BadRequestError(
        "Solo podes reservar dentro de la semana actual",
      );
    }

    if (!this.isWithinBookingWindow(scheduleRow.startTime, date)) {
      throw new BadRequestError("Este horario ya paso");
    }

    // 3. Validate date matches schedule's dayOfWeek
    const dateObj = new Date(date + "T12:00:00Z"); // Noon UTC to avoid timezone shifts
    const dateDay = dateObj.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const isoDayOfWeek = dateDay === 0 ? 7 : dateDay; // Convert to ISO (1=Mon, 7=Sun)
    if (isoDayOfWeek !== scheduleRow.dayOfWeek) {
      throw new BadRequestError("La fecha no corresponde al dia del horario");
    }

    // 4. Check holiday
    const [branch] = await this.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, scheduleRow.branchId));

    if (branch) {
      const [holiday] = await this.db
        .select({ id: schema.holidays.id })
        .from(schema.holidays)
        .where(
          and(
            eq(schema.holidays.country, branch.country),
            eq(schema.holidays.date, date),
          ),
        )
        .limit(1);

      if (holiday) {
        throw new BadRequestError("Este dia esta cancelado por feriado");
      }
    }

    // 5. Check active subscription
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) {
      throw new BadRequestError("No tenes una suscripcion activa");
    }

    // 6. Check overdue
    const balance = await this.paymentService.getMemberBalance(memberId);
    if (balance?.isOverdue) {
      throw new BadRequestError("Tu suscripcion tiene un pago pendiente");
    }

    // 6b. Monthly budget check: if classesRemaining is tracked and exhausted
    if (
      subscription.classesRemaining !== null &&
      subscription.classesRemaining <= 0
    ) {
      throw new BadRequestError(
        "Agotaste tus clases del periodo. No podes reservar mas clases.",
      );
    }

    // 7. Check weekly booking count
    const classesPerWeek = await this.getMemberClassesPerWeek(memberId);
    if (classesPerWeek !== null) {
      const weeklyCount = await this.countWeeklyBookings(
        memberId,
        monday,
        saturday,
      );
      if (weeklyCount >= classesPerWeek) {
        throw new BadRequestError(
          `Alcanzaste tu limite semanal (${weeklyCount}/${classesPerWeek})`,
        );
      }
    }

    // 8. Check no duplicate booking
    const [duplicate] = await this.db
      .select({ id: schema.bookings.id, status: schema.bookings.status })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
        ),
      )
      .limit(1);

    if (duplicate) {
      if (
        duplicate.status === "reservado" ||
        duplicate.status === "qr_escaneado" ||
        duplicate.status === "confirmado" ||
        duplicate.status === "lista_espera"
      ) {
        throw new ConflictError("Ya tenes una reserva en este horario");
      }
    }

    // 8b. One booking per day (any schedule on same date)
    const [sameDayBooking] = await this.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera')`,
        ),
      )
      .limit(1);

    if (sameDayBooking) {
      throw new ConflictError(
        "Ya tenes una reserva para este dia. Cancela la existente primero.",
      );
    }

    // 9. Check capacity
    const activeCount = await this.countActiveBookings(scheduleId, date);
    const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

    let status: "reservado" | "lista_espera" = "reservado";
    let waitlistPosition: number | null = null;

    if (activeCount >= maxCapacity) {
      status = "lista_espera";
      // Get max waitlist position
      const [maxPos] = await this.db
        .select({
          maxPos: sql<number>`COALESCE(MAX(${schema.bookings.waitlistPosition}), 0)`,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.scheduleId, scheduleId),
            eq(schema.bookings.bookingDate, date),
            eq(schema.bookings.status, "lista_espera"),
          ),
        );
      waitlistPosition = (Number(maxPos?.maxPos) ?? 0) + 1;
    }

    // 10. Insert booking
    // If there's a cancelled duplicate, delete it first to avoid unique constraint
    if (
      duplicate &&
      (duplicate.status === "cancelado" || duplicate.status === "no_show")
    ) {
      await this.db
        .delete(schema.bookings)
        .where(eq(schema.bookings.id, duplicate.id));
    }

    const result = await this.db.insert(schema.bookings).values({
      memberId,
      scheduleId,
      bookingDate: date,
      status,
      waitlistPosition,
    });

    const bookingId = Number(result[0].insertId);
    const booking = await this.getBookingRecord(bookingId);
    if (!booking) throw new Error("Failed to retrieve newly created booking");

    this.log.info(
      { memberId, scheduleId, date, status, bookingId },
      "Booking created",
    );

    return booking;
  }

  /**
   * Cancel a booking.
   * Validates ownership, status, and cancellation window.
   * Auto-promotes waitlist if the cancelled booking was confirmed.
   */
  async cancel(memberId: number, bookingId: number): Promise<BookingRecord> {
    // 1. Validate booking exists and belongs to member
    const [bookingRow] = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        scheduleId: schema.bookings.scheduleId,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));

    if (!bookingRow) throw new NotFoundError("Reserva no encontrada");
    if (bookingRow.memberId !== memberId) {
      throw new BadRequestError("Esta reserva no te pertenece");
    }

    // 2. Validate booking is in an active state
    const activeStatuses = [
      "reservado",
      "qr_escaneado",
      "confirmado",
      "lista_espera",
    ];
    if (!activeStatuses.includes(bookingRow.status)) {
      throw new BadRequestError("Esta reserva ya fue cancelada");
    }

    // 3. Validate cancellation window (at least 20 min before class)
    const scheduleRow = await this.getScheduleSlotRaw(bookingRow.scheduleId);
    if (
      scheduleRow &&
      !this.isWithinCancelWindow(scheduleRow.startTime, bookingRow.bookingDate)
    ) {
      throw new BadRequestError(
        "No se puede cancelar menos de 20 minutos antes",
      );
    }

    const previousStatus = bookingRow.status;

    // 4. Update status to cancelado
    await this.db
      .update(schema.bookings)
      .set({
        status: "cancelado",
        cancelledAt: new Date(),
        waitlistPosition: null,
      })
      .where(eq(schema.bookings.id, bookingId));

    // 5. If cancelled booking occupied a slot, promote waitlist
    const slotOccupyingStatuses = ["reservado", "qr_escaneado", "confirmado"];
    if (slotOccupyingStatuses.includes(previousStatus)) {
      await this.promoteWaitlist(bookingRow.scheduleId, bookingRow.bookingDate);
    }

    const updated = await this.getBookingRecord(bookingId);
    if (!updated) throw new Error("Failed to retrieve cancelled booking");

    this.log.info(
      { memberId, bookingId, scheduleId: bookingRow.scheduleId },
      "Booking cancelled",
    );

    return updated;
  }

  /**
   * Get a member's bookings for a given week.
   */
  async getMyBookings(
    memberId: number,
    weekStartDate: string,
  ): Promise<BookingRecord[]> {
    const weekEnd = addDays(weekStartDate, 5); // Saturday

    const rows = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        scheduleId: schema.bookings.scheduleId,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
        waitlistPosition: schema.bookings.waitlistPosition,
        bookedAt: schema.bookings.bookedAt,
        cancelledAt: schema.bookings.cancelledAt,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          sql`${schema.bookings.bookingDate} >= ${weekStartDate}`,
          sql`${schema.bookings.bookingDate} <= ${weekEnd}`,
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera', 'no_show')`,
        ),
      )
      .orderBy(schema.bookings.bookingDate, schema.schedules.startTime);

    return rows.map((r) => this.mapBookingRow(r));
  }

  /**
   * Get a member's attendance records for a given week (schedule-linked only).
   */
  async getMyWeeklyAttendance(
    memberId: number,
    weekStartDate: string,
  ): Promise<AttendanceWeekRecord[]> {
    const weekEnd = addDays(weekStartDate, 6); // through Saturday end

    const rows = await this.db
      .select({
        id: schema.attendance.id,
        scheduleId: schema.attendance.scheduleId,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        checkedInAt: schema.attendance.checkedInAt,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) >= ${weekStartDate}`,
          sql`DATE(${schema.attendance.checkedInAt}) <= ${weekEnd}`,
        ),
      )
      .orderBy(schema.attendance.checkedInAt);

    return rows.map((r) => ({
      id: r.id,
      scheduleId: r.scheduleId as number,
      activityName: r.activityName,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      checkedInAt:
        r.checkedInAt instanceof Date
          ? r.checkedInAt.toISOString()
          : String(r.checkedInAt),
      status: r.status as "confirmado",
    }));
  }

  /**
   * Admin add booking (skip subscription/overdue checks, enforce capacity).
   */
  async adminAddBooking(
    scheduleId: number,
    memberId: number,
    date: string,
  ): Promise<BookingRecord> {
    // Validate schedule
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // Check no duplicate
    const [duplicate] = await this.db
      .select({ id: schema.bookings.id, status: schema.bookings.status })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
        ),
      )
      .limit(1);

    if (duplicate) {
      if (
        duplicate.status === "reservado" ||
        duplicate.status === "qr_escaneado" ||
        duplicate.status === "confirmado" ||
        duplicate.status === "lista_espera"
      ) {
        throw new ConflictError(
          "El miembro ya tiene una reserva en este horario",
        );
      }
      // Remove cancelado/no_show duplicate
      if (duplicate.status === "cancelado" || duplicate.status === "no_show") {
        await this.db
          .delete(schema.bookings)
          .where(eq(schema.bookings.id, duplicate.id));
      }
    }

    // Check capacity
    const activeCount = await this.countActiveBookings(scheduleId, date);
    const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

    let status: "reservado" | "lista_espera" = "reservado";
    let waitlistPosition: number | null = null;

    if (activeCount >= maxCapacity) {
      status = "lista_espera";
      const [maxPos] = await this.db
        .select({
          maxPos: sql<number>`COALESCE(MAX(${schema.bookings.waitlistPosition}), 0)`,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.scheduleId, scheduleId),
            eq(schema.bookings.bookingDate, date),
            eq(schema.bookings.status, "lista_espera"),
          ),
        );
      waitlistPosition = (Number(maxPos?.maxPos) ?? 0) + 1;
    }

    const result = await this.db.insert(schema.bookings).values({
      memberId,
      scheduleId,
      bookingDate: date,
      status,
      waitlistPosition,
    });

    const bookingId = Number(result[0].insertId);
    const booking = await this.getBookingRecord(bookingId);
    if (!booking) throw new Error("Failed to retrieve admin booking");

    this.log.info(
      { memberId, scheduleId, date, status, bookingId },
      "Admin booking created",
    );

    return booking;
  }

  /**
   * Admin remove booking (no time restriction, triggers waitlist promotion).
   */
  async adminRemoveBooking(bookingId: number): Promise<void> {
    const [bookingRow] = await this.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));

    if (!bookingRow) throw new NotFoundError("Reserva no encontrada");

    const activeStatuses = [
      "reservado",
      "qr_escaneado",
      "confirmado",
      "lista_espera",
    ];
    if (activeStatuses.includes(bookingRow.status)) {
      const slotOccupying = ["reservado", "qr_escaneado", "confirmado"];
      const wasOccupying = slotOccupying.includes(bookingRow.status);

      await this.db
        .update(schema.bookings)
        .set({
          status: "cancelado",
          cancelledAt: new Date(),
          waitlistPosition: null,
        })
        .where(eq(schema.bookings.id, bookingId));

      if (wasOccupying) {
        await this.promoteWaitlist(
          bookingRow.scheduleId,
          bookingRow.bookingDate,
        );
      }
    }

    this.log.info({ bookingId }, "Admin removed booking");
  }

  // ─── Fixed-Plan Booking Generation ─────────────────────────────────────

  /**
   * Generate bookings for a fixed-plan subscription across its entire period.
   * Creates one booking per matching dayOfWeek date from startDate to endDate,
   * skipping holidays. Stub for Task 1; full implementation in Task 2.
   */
  async generateFixedBookings(
    subscriptionId: number,
    memberId: number,
    scheduleIds: number[],
    startDate: string,
    endDate: string,
    branchId: number,
  ): Promise<{ totalGenerated: number; holidaysSkipped: number }> {
    // Full implementation in Task 2
    return { totalGenerated: 0, holidaysSkipped: 0 };
  }

  /**
   * Cancel all future bookings for a subscription's schedule slot IDs.
   * Stub for Task 1; full implementation in Task 2.
   */
  async cancelFutureBookings(subscriptionId: number): Promise<void> {
    // Full implementation in Task 2
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Check if now is within booking window (up to 5 min before class).
   */
  private isWithinBookingWindow(
    scheduleStartTime: string,
    bookingDate: string,
  ): boolean {
    const now = new Date();
    const classTime = buildClassDateTime(bookingDate, scheduleStartTime);
    // Allow booking up to 5 minutes before class
    const cutoff = new Date(classTime.getTime() - 5 * 60 * 1000);
    return now <= cutoff;
  }

  /**
   * Check if now is within cancellation window (at least 20 min before class).
   */
  private isWithinCancelWindow(
    scheduleStartTime: string,
    bookingDate: string,
  ): boolean {
    const now = new Date();
    const classTime = buildClassDateTime(bookingDate, scheduleStartTime);
    // Allow cancellation up to 20 minutes before class
    const cutoff = new Date(classTime.getTime() - 20 * 60 * 1000);
    return now <= cutoff;
  }

  /**
   * Promote first waitlisted booking to confirmed and reorder positions.
   */
  private async promoteWaitlist(
    scheduleId: number,
    bookingDate: string,
  ): Promise<void> {
    // Find the first waitlisted booking (lowest position)
    const [first] = await this.db
      .select({
        id: schema.bookings.id,
        waitlistPosition: schema.bookings.waitlistPosition,
      })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, bookingDate),
          eq(schema.bookings.status, "lista_espera"),
        ),
      )
      .orderBy(asc(schema.bookings.waitlistPosition))
      .limit(1);

    if (!first) return;

    // Promote to reservado
    await this.db
      .update(schema.bookings)
      .set({ status: "reservado", waitlistPosition: null })
      .where(eq(schema.bookings.id, first.id));

    // Reorder remaining waitlist positions
    const remaining = await this.db
      .select({
        id: schema.bookings.id,
        waitlistPosition: schema.bookings.waitlistPosition,
      })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, bookingDate),
          eq(schema.bookings.status, "lista_espera"),
        ),
      )
      .orderBy(asc(schema.bookings.waitlistPosition));

    for (let i = 0; i < remaining.length; i++) {
      await this.db
        .update(schema.bookings)
        .set({ waitlistPosition: i + 1 })
        .where(eq(schema.bookings.id, remaining[i].id));
    }

    this.log.info(
      { scheduleId, bookingDate, promotedBookingId: first.id },
      "Waitlist member promoted",
    );
  }

  /**
   * Count active (slot-occupying) bookings for a schedule+date.
   * Includes reservado, qr_escaneado, and confirmado.
   */
  private async countActiveBookings(
    scheduleId: number,
    date: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
        ),
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Count a member's active bookings in a Mon-Sat range.
   */
  private async countWeeklyBookings(
    memberId: number,
    monday: string,
    saturday: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          sql`${schema.bookings.bookingDate} >= ${monday}`,
          sql`${schema.bookings.bookingDate} <= ${saturday}`,
        ),
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Get the classesPerWeek limit for a member's active subscription plan.
   * Returns null if unlimited.
   */
  private async getMemberClassesPerWeek(
    memberId: number,
  ): Promise<number | null> {
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) return null;

    const [plan] = await this.db
      .select({ classesPerWeek: schema.subscriptionPlans.classesPerWeek })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId));

    return plan?.classesPerWeek ?? null;
  }

  /**
   * Get a branch's maxCapacity.
   */
  private async getBranchCapacity(branchId: number): Promise<number> {
    const [branch] = await this.db
      .select({ maxCapacity: schema.branches.maxCapacity })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    return branch?.maxCapacity ?? 22;
  }

  /**
   * Get a raw schedule row (for internal use, without joins).
   */
  private async getScheduleSlotRaw(scheduleId: number): Promise<{
    id: number;
    branchId: number;
    activityId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  } | null> {
    const [row] = await this.db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.id, scheduleId));

    if (!row) return null;
    return {
      id: row.id,
      branchId: row.branchId,
      activityId: row.activityId,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      isActive: row.isActive,
    };
  }

  /**
   * Get a booking record with joins (for response).
   */
  private async getBookingRecord(
    bookingId: number,
  ): Promise<BookingRecord | null> {
    const [row] = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        scheduleId: schema.bookings.scheduleId,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
        waitlistPosition: schema.bookings.waitlistPosition,
        bookedAt: schema.bookings.bookedAt,
        cancelledAt: schema.bookings.cancelledAt,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(eq(schema.bookings.id, bookingId));

    if (!row) return null;
    return this.mapBookingRow(row);
  }

  /**
   * Map a raw booking join row to BookingRecord.
   */
  private mapBookingRow(row: {
    id: number;
    memberId: number;
    memberFirstName: string | null;
    memberLastName: string | null;
    scheduleId: number;
    activityName: string;
    dayOfWeek: number;
    startTime: string;
    bookingDate: string;
    status: string;
    waitlistPosition: number | null;
    bookedAt: Date;
    cancelledAt: Date | null;
  }): BookingRecord {
    return {
      id: row.id,
      memberId: row.memberId,
      memberName: [row.memberFirstName, row.memberLastName]
        .filter(Boolean)
        .join(" "),
      scheduleId: row.scheduleId,
      activityName: row.activityName,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      bookingDate: row.bookingDate,
      status: row.status as BookingStatus,
      waitlistPosition: row.waitlistPosition,
      bookedAt: row.bookedAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }
}
