/**
 * Booking Service
 *
 * Booking lifecycle: reserve, cancel, waitlist auto-promote,
 * capacity enforcement, weekly limit, fixed-day/budget enforcement,
 * grace period check, admin add/remove.
 * Extracted from SchedulingService for single-responsibility.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, asc, gte, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { SubscriptionService } from "../subscriptions/service";
import { NotificationService } from "../notifications/service";
import {
  addDays,
  getWeekRange,
  buildClassDateTime,
  todayInTz,
  toDateString,
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

/**
 * Member self-booking window: today .. today + N days (branch-local).
 * Trials (Phase 119, D-05) use a longer window so a freemium can pick a
 * trial date up to a month out without affecting members' tighter window.
 */
const MEMBER_BOOKING_WINDOW_DAYS = 2;
const TRIAL_BOOKING_WINDOW_DAYS = 30;

export class BookingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private subscriptionService: SubscriptionService,
    private notificationService: NotificationService,
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
      // Surface the admin-provided reason when present, fallback to the
      // generic message so existing callers/tests stay backward-compatible.
      throw new BadRequestError(
        scheduleRow.inactiveReason ?? "Este horario no esta activo",
      );
    }

    // 2-4. Validate the booking date against the +2 day member window plus the
    //      not-past, dayOfWeek and holiday checks. Trials use the same checks
    //      with a 30-day window (see validateTrialBookingDate / D-05).
    await this.assertDateWithinWindow(
      scheduleRow,
      date,
      MEMBER_BOOKING_WINDOW_DAYS,
    );

    // 5. Check active subscription
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) {
      throw new BadRequestError("No tenes una suscripcion activa");
    }

    // Phase 110 REQ-8: Load actor role to support the staff multi-branch bypass
    // at the bonus check below. Single SELECT, indexed on users.id (PK).
    // (Existing SELECT at booking-service.ts:86-89 was NOT reusable — it queries
    // schema.branches keyed by scheduleRow.branchId, not schema.users keyed by
    // memberId. Different table + different key → projection cannot be merged.)
    const [actor] = await this.db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, memberId))
      .limit(1);
    // Safe fallback: missing user row treated as member so the existing 400
    // still triggers downstream (defense — no silent staff bypass on data gap).
    const actorRole: string = actor?.role ?? "member";

    // Cross-country guard: a member's subscription is bound to one country
    // (AR or ES today). Reservations on a sede in a different country are
    // rejected outright — even with multi_branch the member can only roam
    // within their own country. Staff bypass for the same reason as the
    // multi-branch check below: an admin/coach using the member app to
    // entrenar may legitimately train across regions.
    const [branch] = await this.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, scheduleRow.branchId));
    if (actorRole === "member" && branch) {
      const [subBranch] = await this.db
        .select({ country: schema.branches.country })
        .from(schema.branches)
        .where(eq(schema.branches.id, subscription.branchId));
      if (subBranch && subBranch.country !== branch.country) {
        throw new BadRequestError("No podes reservar en sedes de otro pais");
      }
    }

    // 5b. Monthly budget check: if classesRemaining is tracked and exhausted
    if (
      subscription.classesRemaining !== null &&
      subscription.classesRemaining <= 0
    ) {
      throw new BadRequestError(
        "Agotaste tus clases del periodo. No podes reservar mas clases.",
      );
    }

    // 6. Classify booking (fixed plans only): fixed re-book vs bonus.
    //    A bonus is a member-initiated reservation on a schedule that is NOT
    //    part of their fixed subscription_schedules. Fixed plans get 2 bonuses
    //    per 30-day window from subscription.startDate.
    const plan = await this.subscriptionService.getPlanById(
      subscription.planId,
    );
    const isFixedPlan = plan?.bookingMode === "fixed";
    let isBonus = false;

    if (isFixedPlan) {
      const fixedScheduleIds = await this.getFixedScheduleIdsForSubscription(
        subscription.id,
      );
      isBonus = !fixedScheduleIds.has(scheduleId);

      if (isBonus) {
        // Multi-branch check: bonuses on a different branch require plan.multiBranch.
        // Phase 110 REQ-8: staff (role !== 'member') bypass this check entirely —
        // staff using the member app to entrenar pueden reservar en cualquier sede
        // sin necesidad de plan multiBranch. Role check goes first so staff
        // short-circuits out before the plan flag is even evaluated.
        if (
          actorRole === "member" &&
          scheduleRow.branchId !== subscription.branchId &&
          !plan?.multiBranch
        ) {
          throw new BadRequestError(
            "No podes reservar clases bonus en otra sucursal con tu plan actual",
          );
        }

        // Bonus cap: 2 per 30-day window from subscription.startDate
        const { limit, periodStart, periodEnd } = this.computeBonusUsageWindow(
          subscription.startDate,
        );
        const usedCount = await this.countBonusBookings(
          memberId,
          subscription.id,
          periodStart,
          periodEnd,
        );
        if (usedCount >= limit) {
          throw new ConflictError(
            `Alcanzaste el limite de ${limit} clases bonus en este periodo. Se renueva el ${periodEnd}.`,
          );
        }
      }
    }

    // 7. Check weekly booking count — applies to flexible plans and to fixed-slot
    //    re-bookings. Bonus bookings on fixed plans bypass this limit (they are
    //    explicitly extra, over the fixed schedule).
    if (!isBonus) {
      const classesPerWeek = await this.getMemberClassesPerWeek(memberId);
      if (classesPerWeek !== null) {
        const { monday, saturday } = getWeekRange(
          new Date(date + "T12:00:00Z"),
        );
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

    // 9. Check capacity + insert in transaction to prevent overbooking
    const bookingId = await this.db.transaction(async (tx) => {
      const activeCount = await this.countActiveBookings(scheduleId, date, tx);
      const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

      let status: "reservado" | "lista_espera" = "reservado";
      let waitlistPosition: number | null = null;

      if (activeCount >= maxCapacity) {
        status = "lista_espera";
        const [maxPos] = await tx
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

      // If there's a cancelled duplicate, delete it first to avoid unique constraint
      if (
        duplicate &&
        (duplicate.status === "cancelado" || duplicate.status === "no_show")
      ) {
        await tx
          .delete(schema.bookings)
          .where(eq(schema.bookings.id, duplicate.id));
      }

      const result = await tx.insert(schema.bookings).values({
        memberId,
        scheduleId,
        bookingDate: date,
        status,
        waitlistPosition,
      });

      return Number(result[0].insertId);
    });
    const booking = await this.getBookingRecord(bookingId);
    if (!booking) throw new Error("Failed to retrieve newly created booking");

    this.log.info(
      { memberId, scheduleId, date, status: booking.status, bookingId },
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
        isTrial: schema.bookings.isTrial,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));

    if (!bookingRow) throw new NotFoundError("Reserva no encontrada");
    if (bookingRow.memberId !== memberId) {
      throw new BadRequestError("Esta reserva no te pertenece");
    }

    // Phase 119 (D-03): trial bookings are one-per-lifetime and cannot be
    // cancelled from the member app — there's no re-reserve affordance, so
    // allowing a cancel would strand the freemium with no trial and no way back.
    if (bookingRow.isTrial) {
      throw new BadRequestError(
        "La sesión de prueba no se puede cancelar desde la app",
      );
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
      !this.isWithinCancelWindow(
        scheduleRow.startTime,
        bookingRow.bookingDate,
        scheduleRow.branchTimezone,
      )
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
        isTrial: schema.bookings.isTrial,
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
   * Returns warnings for subscription issues without blocking.
   */
  async adminAddBooking(
    scheduleId: number,
    memberId: number,
    date: string,
  ): Promise<{ booking: BookingRecord; warnings: string[] }> {
    const warnings: string[] = [];

    // Validate schedule
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // Check subscription status for warnings (don't block)
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) {
      warnings.push("Sin suscripcion activa");
    } else {
      if (
        subscription.classesRemaining !== null &&
        subscription.classesRemaining <= 0
      ) {
        warnings.push("Clases del periodo agotadas");
      }

      // Weekly limit warning
      const classesPerWeek = await this.getMemberClassesPerWeek(memberId);
      if (classesPerWeek !== null) {
        const { monday, saturday } = getWeekRange(
          new Date(date + "T12:00:00Z"),
        );
        const weeklyCount = await this.countWeeklyBookings(
          memberId,
          monday,
          saturday,
        );
        if (weeklyCount >= classesPerWeek) {
          warnings.push(
            `Limite semanal alcanzado (${weeklyCount}/${classesPerWeek})`,
          );
        }
      }
    }

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
      { memberId, scheduleId, date, status, bookingId, warnings },
      "Admin booking created",
    );

    return { booking, warnings };
  }

  /**
   * Admin remove booking (no time restriction, triggers waitlist promotion).
   *
   * "no_show" is treated as cancellable so an admin can undo a no-show
   * trial booking and free the alumno to be reassigned to another trial
   * (trials-service.ts excludes status='cancelado' from the one-trial-
   * per-lifetime guard). no_show bookings don't occupy a slot, so we
   * never promote the waitlist for them.
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
      "no_show",
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

  /**
   * Cancel all upcoming bookings for a schedule that haven't been checked in
   * yet. Used when an admin deactivates a slot — instead of leaving members
   * with reservations to a slot that won't run, we free their reservation so
   * they can re-book elsewhere.
   *
   * Cancels both regular reservations and waitlist entries for dates >= today.
   * Already-checked-in bookings (qr_escaneado, confirmado) are intentionally
   * left untouched: those members already attended and the historical record
   * should stay accurate.
   *
   * Does NOT promote waitlist — the whole slot is closed, so there's no
   * spot to promote into.
   */
  async cancelAllFutureBookingsForSchedule(
    scheduleId: number,
  ): Promise<number> {
    // "Today" is computed in the slot's branch timezone so a slot in BCN
    // doesn't accidentally touch tomorrow's class because the server clock
    // already crossed midnight UTC.
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) return 0;
    const today = todayInTz(scheduleRow.branchTimezone);

    const result = await this.db
      .update(schema.bookings)
      .set({
        status: "cancelado",
        cancelledAt: new Date(),
        waitlistPosition: null,
      })
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          gte(schema.bookings.bookingDate, today),
          inArray(schema.bookings.status, ["reservado", "lista_espera"]),
        ),
      );

    const affected = Number(result[0].affectedRows ?? 0);
    if (affected > 0) {
      this.log.info(
        { scheduleId, affected },
        "Cancelled future bookings for deactivated slot",
      );
    }
    return affected;
  }

  /**
   * Preview the impact of deleting a schedule from a given date forward.
   *
   * Returns affected booking counts split by plan type without performing
   * any writes — used to populate the admin confirmation dialog. Mirrors
   * the same join used by `cancelBookingsFromDateAndGrantCredits` so the
   * preview number matches what actually gets cancelled.
   */
  async previewScheduleDeletion(
    scheduleId: number,
    fromDate: string,
  ): Promise<{
    cancelledBookings: number;
    affectedFixedMembers: number;
    affectedFlexibleMembers: number;
    creditsToGrant: number;
    sampleMembers: Array<{
      memberName: string;
      planType: "fixed" | "flexible";
    }>;
  }> {
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // Bookings that would be cancelled (active reservations + waitlist).
    // Already-checked-in (qr_escaneado, confirmado) and prior cancellations
    // are excluded so the preview matches the actual cancellation scope.
    const candidateBookings = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        bookingDate: schema.bookings.bookingDate,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          gte(schema.bookings.bookingDate, fromDate),
          inArray(schema.bookings.status, ["reservado", "lista_espera"]),
        ),
      );

    if (candidateBookings.length === 0) {
      return {
        cancelledBookings: 0,
        affectedFixedMembers: 0,
        affectedFlexibleMembers: 0,
        creditsToGrant: 0,
        sampleMembers: [],
      };
    }

    // Fixed-plan hits: one row per booking that resolves to a fixed-plan
    // subscription anchored to this schedule.
    const fixedHits = await this.db
      .select({
        bookingId: schema.bookings.id,
        memberId: schema.bookings.memberId,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.subscriptionSchedules,
        eq(schema.subscriptionSchedules.scheduleId, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.subscriptions,
        and(
          eq(
            schema.subscriptions.id,
            schema.subscriptionSchedules.subscriptionId,
          ),
          eq(schema.subscriptions.userId, schema.bookings.memberId),
          sql`${schema.bookings.bookingDate} >= ${schema.subscriptions.startDate}`,
          sql`${schema.bookings.bookingDate} <= COALESCE(${schema.subscriptions.endDate}, '9999-12-31')`,
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ),
      )
      .innerJoin(
        schema.subscriptionPlans,
        and(
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
          eq(schema.subscriptionPlans.bookingMode, "fixed"),
        ),
      )
      .where(
        inArray(
          schema.bookings.id,
          candidateBookings.map((b) => b.id),
        ),
      );

    const fixedBookingIds = new Set(fixedHits.map((r) => r.bookingId));
    const fixedMemberIds = new Set(fixedHits.map((r) => r.memberId));
    const flexibleMemberIds = new Set<number>();
    for (const b of candidateBookings) {
      if (!fixedBookingIds.has(b.id)) flexibleMemberIds.add(b.memberId);
    }

    const sampleMembers: Array<{
      memberName: string;
      planType: "fixed" | "flexible";
    }> = [];
    const seenMembers = new Set<number>();
    for (const b of candidateBookings) {
      if (seenMembers.has(b.memberId)) continue;
      seenMembers.add(b.memberId);
      sampleMembers.push({
        memberName: [b.memberFirstName, b.memberLastName]
          .filter(Boolean)
          .join(" "),
        planType: fixedMemberIds.has(b.memberId) ? "fixed" : "flexible",
      });
      if (sampleMembers.length >= 10) break;
    }

    return {
      cancelledBookings: candidateBookings.length,
      affectedFixedMembers: fixedMemberIds.size,
      affectedFlexibleMembers: flexibleMemberIds.size,
      creditsToGrant: fixedHits.length,
      sampleMembers,
    };
  }

  /**
   * Cancel future bookings for a schedule starting at `fromDate` (inclusive)
   * and grant replacement credits to fixed-plan members affected.
   *
   * Used by the admin "Eliminar horario" flow. History (bookings before
   * fromDate, plus already-checked-in bookings on/after fromDate) is left
   * untouched so attendance reports stay accurate.
   *
   * Credit policy: each cancelled booking belonging to an active fixed-plan
   * subscription anchored to this schedule grants +1 to that subscription's
   * `replacementCredits`. Flexible-plan bookings aren't credited because
   * `classesRemaining` is decremented at check-in (not at booking) and these
   * bookings never reached check-in.
   */
  async cancelBookingsFromDateAndGrantCredits(
    scheduleId: number,
    fromDate: string,
  ): Promise<{
    cancelledBookings: number;
    affectedFixedMembers: number;
    creditsGranted: number;
  }> {
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    const toCancel = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        bookingDate: schema.bookings.bookingDate,
      })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          gte(schema.bookings.bookingDate, fromDate),
          inArray(schema.bookings.status, ["reservado", "lista_espera"]),
        ),
      );

    if (toCancel.length === 0) {
      return {
        cancelledBookings: 0,
        affectedFixedMembers: 0,
        creditsGranted: 0,
      };
    }

    // Resolve fixed-plan subscriptions before mutating bookings — once
    // status flips to 'cancelado' the join would still match, but pulling
    // the data first keeps the credit grant deterministic and easier to
    // audit if the cancellation update fails partway.
    const fixedHits = await this.db
      .select({
        bookingId: schema.bookings.id,
        subscriptionId: schema.subscriptions.id,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.subscriptionSchedules,
        eq(schema.subscriptionSchedules.scheduleId, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.subscriptions,
        and(
          eq(
            schema.subscriptions.id,
            schema.subscriptionSchedules.subscriptionId,
          ),
          eq(schema.subscriptions.userId, schema.bookings.memberId),
          sql`${schema.bookings.bookingDate} >= ${schema.subscriptions.startDate}`,
          sql`${schema.bookings.bookingDate} <= COALESCE(${schema.subscriptions.endDate}, '9999-12-31')`,
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ),
      )
      .innerJoin(
        schema.subscriptionPlans,
        and(
          eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
          eq(schema.subscriptionPlans.bookingMode, "fixed"),
        ),
      )
      .where(
        inArray(
          schema.bookings.id,
          toCancel.map((b) => b.id),
        ),
      );

    const creditsPerSub = new Map<number, number>();
    for (const row of fixedHits) {
      creditsPerSub.set(
        row.subscriptionId,
        (creditsPerSub.get(row.subscriptionId) ?? 0) + 1,
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.bookings)
        .set({
          status: "cancelado",
          cancelledAt: new Date(),
          waitlistPosition: null,
        })
        .where(
          inArray(
            schema.bookings.id,
            toCancel.map((b) => b.id),
          ),
        );

      for (const [subId, count] of creditsPerSub) {
        await tx
          .update(schema.subscriptions)
          .set({
            replacementCredits: sql`COALESCE(${schema.subscriptions.replacementCredits}, 0) + ${count}`,
          })
          .where(eq(schema.subscriptions.id, subId));
      }
    });

    const creditsGranted = Array.from(creditsPerSub.values()).reduce(
      (a, b) => a + b,
      0,
    );

    this.log.info(
      {
        scheduleId,
        fromDate,
        cancelledBookings: toCancel.length,
        affectedFixedMembers: creditsPerSub.size,
        creditsGranted,
      },
      "Schedule deletion: cancelled future bookings + granted replacement credits",
    );

    return {
      cancelledBookings: toCancel.length,
      affectedFixedMembers: creditsPerSub.size,
      creditsGranted,
    };
  }

  /**
   * Restore bookings that were cancelled as part of a slot deactivation.
   *
   * Filter: only bookings cancelled at-or-after `deactivatedAt` are
   * restored — that excludes member-initiated cancellations and per-booking
   * admin removals that happened before the closure. Past dates are
   * skipped (the class already happened, restoring is meaningless).
   *
   * All restored rows go back as `reservado`. Original waitlist position
   * is not preserved: anyone over capacity will simply make the slot
   * over-booked, and admins/members will see the inflation. In practice
   * the slot was deactivated specifically because nobody else could book
   * during the closure, so the post-restore state matches the
   * pre-closure state.
   */
  async restoreCancelledBookingsForSchedule(
    scheduleId: number,
    deactivatedAt: Date,
  ): Promise<number> {
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) return 0;
    const today = todayInTz(scheduleRow.branchTimezone);

    const result = await this.db
      .update(schema.bookings)
      .set({
        status: "reservado",
        cancelledAt: null,
        waitlistPosition: null,
      })
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.status, "cancelado"),
          gte(schema.bookings.cancelledAt, deactivatedAt),
          gte(schema.bookings.bookingDate, today),
        ),
      );

    const affected = Number(result[0].affectedRows ?? 0);
    if (affected > 0) {
      this.log.info(
        { scheduleId, affected, deactivatedAt },
        "Restored bookings cancelled by slot deactivation",
      );
    }
    return affected;
  }

  /**
   * Find the next date (from `fromDate` or today) where this schedule has
   * available capacity (active bookings < branch.maxCapacity), respecting
   * holidays and the slot's dayOfWeek. Searches up to `maxWeeksAhead` weeks
   * before giving up.
   *
   * Returns null if:
   *  - schedule is inactive
   *  - no date with capacity found within the search window
   *
   * Used by the admin UI when the picker shows a slot full this week but the
   * admin still wants to anchor a fixed-plan member to it starting later.
   */
  async findNextAvailableDate(
    scheduleId: number,
    fromDate?: string,
    maxWeeksAhead = 12,
  ): Promise<string | null> {
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");
    if (!scheduleRow.isActive) return null;

    const start = fromDate ?? todayInTz(scheduleRow.branchTimezone);
    const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

    // Branch country for holiday lookup
    const [branch] = await this.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, scheduleRow.branchId));
    const country = branch?.country ?? "AR";

    // Compute first occurrence of the slot's dayOfWeek on or after `start`.
    // schema dayOfWeek: 1=Mon..7=Sun (ISO).
    const startDate = new Date(start + "T00:00:00Z");
    const startDow = startDate.getUTCDay() === 0 ? 7 : startDate.getUTCDay();
    const offset = (scheduleRow.dayOfWeek - startDow + 7) % 7;
    let cursor = addDays(start, offset);

    // Load holidays for the country in the search window
    const windowEnd = addDays(cursor, maxWeeksAhead * 7);
    const hols = await this.db
      .select({ date: schema.holidays.date })
      .from(schema.holidays)
      .where(
        and(
          eq(schema.holidays.country, country),
          gte(schema.holidays.date, cursor),
          sql`${schema.holidays.date} <= ${windowEnd}`,
        ),
      );
    const holidaySet = new Set(hols.map((h) => h.date));

    for (let i = 0; i < maxWeeksAhead; i++) {
      if (!holidaySet.has(cursor)) {
        const count = await this.countActiveBookings(scheduleId, cursor);
        if (count < maxCapacity) return cursor;
      }
      cursor = addDays(cursor, 7);
    }

    return null;
  }

  // ─── Fixed-Plan Booking Generation ─────────────────────────────────────

  /**
   * Generate bookings for a fixed-plan subscription across its entire period.
   * Creates one booking per matching dayOfWeek date from startDate to endDate,
   * skipping holidays.
   *
   * `perScheduleStartDate` lets the admin defer a single slot's first
   * booking past the global startDate when the slot is full earlier weeks.
   * The picker uses this to anchor a member to a slot that is at capacity
   * this week but free in a later week.
   */
  async generateFixedBookings(
    subscriptionId: number,
    memberId: number,
    scheduleIds: number[],
    startDate: string,
    endDate: string,
    branchId: number,
    perScheduleStartDate?: Record<number, string>,
  ): Promise<{ totalGenerated: number; holidaysSkipped: number }> {
    // Project branchId too: multi-branch fixed anchors mean each slot may live
    // in a different sede, and capacity must be looked up per the slot's own
    // branch — not the subscription's anchor branch.
    const scheduleRows = await this.db
      .select({
        id: schema.schedules.id,
        dayOfWeek: schema.schedules.dayOfWeek,
        branchId: schema.schedules.branchId,
      })
      .from(schema.schedules)
      .where(inArray(schema.schedules.id, scheduleIds));

    // Holidays are scoped by country. The validateAnchorSet helper in
    // SubscriptionService guarantees that every anchor branch is in the same
    // country as the subscription's anchor branch, so a single country lookup
    // (via the sub's branchId) is correct for the whole anchor set.
    const [branch] = await this.db
      .select({ country: schema.branches.country })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    const country = branch?.country ?? "AR";

    // Fetch all holidays in the date range for this country
    const holidayRows = await this.db
      .select({ date: schema.holidays.date })
      .from(schema.holidays)
      .where(
        and(
          eq(schema.holidays.country, country),
          sql`${schema.holidays.date} >= ${startDate}`,
          sql`${schema.holidays.date} <= ${endDate}`,
        ),
      );
    const holidayDates = new Set(holidayRows.map((h) => h.date));

    let totalGenerated = 0;
    let holidaysSkipped = 0;

    // For each schedule, generate all matching dates
    for (const sched of scheduleRows) {
      // Find the first date >= effectiveStart that matches this dayOfWeek.
      // effectiveStart can be deferred per-slot when the admin picked a slot
      // that is full this week and chose to start booking it on a later date.
      const slotStart = perScheduleStartDate?.[sched.id] ?? startDate;
      const start = new Date(slotStart + "T12:00:00Z");
      const end = new Date(endDate + "T12:00:00Z");

      const current = new Date(start);
      // Adjust to the first matching day
      const currentDay = current.getUTCDay(); // 0=Sun
      const targetIso = sched.dayOfWeek; // 1=Mon..6=Sat
      const targetJs = targetIso === 7 ? 0 : targetIso; // Convert ISO to JS day
      let diff = targetJs - currentDay;
      if (diff < 0) diff += 7;
      current.setUTCDate(current.getUTCDate() + diff);

      while (current <= end) {
        const dateStr = toDateString(current);

        if (holidayDates.has(dateStr)) {
          holidaysSkipped++;
        } else {
          // Check if booking already exists. Pull the status too so we can
          // distinguish between a live booking (skip) and a stale `cancelado`
          // row (reactivate). Without the reactivation branch, plan changes
          // and renewals that re-use the same scheduleIds silently lose the
          // alumno's slot — the unique index `idx_bookings_member_schedule_date`
          // collides and the new booking is never created. Same shape of bug
          // that populateBookings had with INSERT IGNORE.
          const [existing] = await this.db
            .select({ id: schema.bookings.id, status: schema.bookings.status })
            .from(schema.bookings)
            .where(
              and(
                eq(schema.bookings.memberId, memberId),
                eq(schema.bookings.scheduleId, sched.id),
                eq(schema.bookings.bookingDate, dateStr),
              ),
            )
            .limit(1);

          if (existing && existing.status === "cancelado") {
            // Reactivate stale cancelado so the alumno gets a usable booking.
            // Capacity is intentionally not re-checked: the admin's fixed
            // assignment trumps the slot cap (consistent with populateBookings
            // and migration 0122). May push the slot 1-over capacity if a
            // waitlister was already promoted into this seat.
            await this.db
              .update(schema.bookings)
              .set({
                status: "reservado",
                cancelledAt: null,
                waitlistPosition: null,
              })
              .where(eq(schema.bookings.id, existing.id));
            totalGenerated++;
          } else if (!existing) {
            // Check capacity for waitlist — capacity is per the slot's own
            // branch (multi-branch anchors may span sedes with different
            // capacities).
            const activeCount = await this.countActiveBookings(
              sched.id,
              dateStr,
            );
            const maxCapacity = await this.getBranchCapacity(sched.branchId);

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
                    eq(schema.bookings.scheduleId, sched.id),
                    eq(schema.bookings.bookingDate, dateStr),
                    eq(schema.bookings.status, "lista_espera"),
                  ),
                );
              waitlistPosition = (Number(maxPos?.maxPos) ?? 0) + 1;
            }

            await this.db.insert(schema.bookings).values({
              memberId,
              scheduleId: sched.id,
              bookingDate: dateStr,
              status,
              waitlistPosition,
            });
            totalGenerated++;
          }
          // else: existing booking with active status (reservado/lista_espera/
          // qr_escaneado/confirmado/no_show) — leave as-is.
        }

        // Move to next week
        current.setUTCDate(current.getUTCDate() + 7);
      }
    }

    this.log.info(
      { subscriptionId, memberId, totalGenerated, holidaysSkipped },
      "Fixed bookings generated",
    );

    return { totalGenerated, holidaysSkipped };
  }

  /**
   * Cancel all future bookings for a subscription's schedule slot IDs.
   * Preserves past bookings (historical records).
   */
  async cancelFutureBookings(subscriptionId: number): Promise<void> {
    // Get schedule IDs from subscription_schedules
    const subSchedules = await this.db
      .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
      .from(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subscriptionId));

    if (subSchedules.length === 0) return;

    const scheduleIds = subSchedules.map((s) => s.scheduleId);

    // Get the memberId from the subscription
    const [sub] = await this.db
      .select({ userId: schema.subscriptions.userId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subscriptionId));

    if (!sub) return;

    const today = new Date().toISOString().split("T")[0];

    // Cancel bookings from today onward — classes haven't started yet,
    // so if a sub is pausing/cancelling/changing today, today's reservation
    // is part of "future" from the member's perspective.
    await this.db
      .update(schema.bookings)
      .set({
        status: "cancelado",
        cancelledAt: new Date(),
        waitlistPosition: null,
      })
      .where(
        and(
          eq(schema.bookings.memberId, sub.userId),
          inArray(schema.bookings.scheduleId, scheduleIds),
          sql`${schema.bookings.bookingDate} >= ${today}`,
          sql`${schema.bookings.status} IN ('reservado', 'lista_espera')`,
        ),
      );

    this.log.info(
      { subscriptionId, scheduleIds, memberId: sub.userId },
      "Future bookings cancelled",
    );
  }

  /**
   * Phase 119 (D-05): validate a trial booking date against the 30-day window.
   *
   * Public so TrialService.reserveTrialSelfService can reuse the SAME date
   * validation (not-past, dayOfWeek, holiday) as member reservations without
   * duplicating the logic — but with a 30-day window instead of +2 days and
   * WITHOUT the subscription check (a freemium has no subscription; that's why
   * reserve-trial is a separate path, not /reserve).
   *
   * Loads the schedule row (timezone + dayOfWeek + branch) and delegates to
   * the shared assertDateWithinWindow helper. Throws NotFoundError if the slot
   * doesn't exist and BadRequestError for any invalid date.
   */
  async validateTrialBookingDate(
    scheduleId: number,
    date: string,
  ): Promise<number> {
    const scheduleRow = await this.getScheduleSlotRaw(scheduleId);
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");
    if (!scheduleRow.isActive) {
      throw new BadRequestError(
        scheduleRow.inactiveReason ?? "Este horario no esta activo",
      );
    }
    await this.assertDateWithinWindow(
      scheduleRow,
      date,
      TRIAL_BOOKING_WINDOW_DAYS,
    );
    // Phase 119 (CR-01): return the schedule's branch so the self-service trial
    // path can assert it matches the chosen branch (cross-sede coherence). The
    // admin bookTrial path guards this independently via user.branchId.
    return scheduleRow.branchId;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Shared date-window validation for member reservations (+2d) and trials
   * (+30d). Runs four checks in order, all branch-timezone aware:
   *   - date within [today, today + windowDays]
   *   - the slot hasn't already passed today (isWithinBookingWindow)
   *   - the date's dayOfWeek matches the schedule's dayOfWeek
   *   - the date is not a holiday in the branch's country
   * The subscription check is intentionally NOT here — callers add it as needed.
   */
  private async assertDateWithinWindow(
    scheduleRow: {
      branchId: number;
      branchTimezone: string;
      startTime: string;
      dayOfWeek: number;
    },
    date: string,
    windowDays: number,
  ): Promise<void> {
    // "today" is evaluated in the branch's timezone so BCN and AR members each
    // see their own day boundary.
    const tz = scheduleRow.branchTimezone;
    const today = todayInTz(tz);
    const maxDate = addDays(today, windowDays);
    if (date < today || date > maxDate) {
      throw new BadRequestError(
        `Solo podes reservar desde hoy hasta ${windowDays} dias en adelante`,
      );
    }

    if (!this.isWithinBookingWindow(scheduleRow.startTime, date, tz)) {
      throw new BadRequestError("Este horario ya paso");
    }

    // dayOfWeek match (noon UTC to avoid timezone shifts)
    const dateObj = new Date(date + "T12:00:00Z");
    const dateDay = dateObj.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const isoDayOfWeek = dateDay === 0 ? 7 : dateDay; // Convert to ISO (1=Mon, 7=Sun)
    if (isoDayOfWeek !== scheduleRow.dayOfWeek) {
      throw new BadRequestError("La fecha no corresponde al dia del horario");
    }

    // Holiday check
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
  }

  /**
   * Check if now is within booking window (up to 5 min before class).
   * `tz` is the branch's IANA timezone — required for DST-correct cutoffs
   * across branches in different regions.
   */
  private isWithinBookingWindow(
    scheduleStartTime: string,
    bookingDate: string,
    tz: string,
  ): boolean {
    const now = new Date();
    const classTime = buildClassDateTime(bookingDate, scheduleStartTime, tz);
    const cutoff = new Date(classTime.getTime() - 5 * 60 * 1000);
    return now <= cutoff;
  }

  /**
   * Check if now is within cancellation window (at least 20 min before class).
   */
  private isWithinCancelWindow(
    scheduleStartTime: string,
    bookingDate: string,
    tz: string,
  ): boolean {
    const now = new Date();
    const classTime = buildClassDateTime(bookingDate, scheduleStartTime, tz);
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
    const promoted = await this.db.transaction(async (tx) => {
      // Find the first waitlisted booking (lowest position)
      const [first] = await tx
        .select({
          id: schema.bookings.id,
          memberId: schema.bookings.memberId,
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

      if (!first) return null;

      // Promote to reservado
      await tx
        .update(schema.bookings)
        .set({ status: "reservado", waitlistPosition: null })
        .where(eq(schema.bookings.id, first.id));

      // Reorder remaining waitlist positions
      const remaining = await tx
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
        await tx
          .update(schema.bookings)
          .set({ waitlistPosition: i + 1 })
          .where(eq(schema.bookings.id, remaining[i].id));
      }

      this.log.info(
        { scheduleId, bookingDate, promotedBookingId: first.id },
        "Waitlist member promoted",
      );

      return { bookingId: first.id, memberId: first.memberId };
    });

    // Notify the promoted member outside the transaction so a notification
    // failure never rolls back the promotion itself.
    if (promoted) {
      try {
        await this.notificationService.queueNotification({
          userId: promoted.memberId,
          templateKey: "waitlist_promoted",
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        this.log.error(
          { err: message, ...promoted, scheduleId, bookingDate },
          "Failed to queue waitlist promotion notification",
        );
      }
    }
  }

  /**
   * Count active (slot-occupying) bookings for a schedule+date.
   * Includes reservado, qr_escaneado, and confirmado.
   */
  private async countActiveBookings(
    scheduleId: number,
    date: string,
    db?: MySql2Database<typeof schema>,
  ): Promise<number> {
    const q = db ?? this.db;
    const [result] = await q
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          // Phase 102: trial bookings do NOT consume schedule capacity.
          eq(schema.bookings.isTrial, false),
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
   * Return the set of scheduleIds that are the fixed slots of a subscription.
   */
  private async getFixedScheduleIdsForSubscription(
    subscriptionId: number,
  ): Promise<Set<number>> {
    const rows = await this.db
      .select({ scheduleId: schema.subscriptionSchedules.scheduleId })
      .from(schema.subscriptionSchedules)
      .where(eq(schema.subscriptionSchedules.subscriptionId, subscriptionId));
    return new Set(rows.map((r) => r.scheduleId));
  }

  /**
   * Compute the current 30-day bonus period anchored on subscription.startDate.
   * periodStart/periodEnd are YYYY-MM-DD, inclusive of periodStart and exclusive
   * of periodEnd (i.e. periodEnd is the start of the NEXT period).
   */
  private computeBonusUsageWindow(subscriptionStartDate: string): {
    used: number;
    limit: number;
    periodStart: string;
    periodEnd: string;
  } {
    const BONUS_LIMIT = 2;
    const BONUS_PERIOD_DAYS = 30;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const start = new Date(subscriptionStartDate + "T00:00:00Z");
    const msSinceStart = today.getTime() - start.getTime();
    const daysSinceStart = Math.floor(msSinceStart / (1000 * 60 * 60 * 24));
    const periodIndex = Math.max(
      0,
      Math.floor(daysSinceStart / BONUS_PERIOD_DAYS),
    );

    const periodStartDate = new Date(start);
    periodStartDate.setUTCDate(
      periodStartDate.getUTCDate() + periodIndex * BONUS_PERIOD_DAYS,
    );
    const periodEndDate = new Date(periodStartDate);
    periodEndDate.setUTCDate(periodEndDate.getUTCDate() + BONUS_PERIOD_DAYS);

    return {
      used: 0, // filled in by caller
      limit: BONUS_LIMIT,
      periodStart: periodStartDate.toISOString().split("T")[0],
      periodEnd: periodEndDate.toISOString().split("T")[0],
    };
  }

  /**
   * Count active bonus bookings (scheduleId not in fixed schedules) for a
   * member's subscription within [periodStart, periodEnd).
   */
  private async countBonusBookings(
    memberId: number,
    subscriptionId: number,
    periodStart: string,
    periodEnd: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera')`,
          sql`${schema.bookings.bookingDate} >= ${periodStart}`,
          sql`${schema.bookings.bookingDate} < ${periodEnd}`,
          sql`${schema.bookings.scheduleId} NOT IN (
            SELECT schedule_id FROM subscription_schedules
            WHERE subscription_id = ${subscriptionId}
          )`,
        ),
      );
    return Number(result?.count ?? 0);
  }

  /**
   * Public: return the member's current bonus-class usage for their active
   * subscription. Returns { applicable: false } when the mechanic doesn't
   * apply (no active subscription, or plan is not fixed).
   */
  async getBonusUsage(memberId: number): Promise<{
    applicable: boolean;
    used?: number;
    limit?: number;
    periodStart?: string;
    periodEnd?: string;
  }> {
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) return { applicable: false };

    const plan = await this.subscriptionService.getPlanById(
      subscription.planId,
    );
    if (plan?.bookingMode !== "fixed") return { applicable: false };

    const window = this.computeBonusUsageWindow(subscription.startDate);
    const used = await this.countBonusBookings(
      memberId,
      subscription.id,
      window.periodStart,
      window.periodEnd,
    );
    return {
      applicable: true,
      used,
      limit: window.limit,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
    };
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
   * Get a raw schedule row joined with its branch timezone.
   * Timezone is loaded here so callers can validate booking/cancel windows
   * in the branch's local time without a second query.
   */
  private async getScheduleSlotRaw(scheduleId: number): Promise<{
    id: number;
    branchId: number;
    branchTimezone: string;
    activityId: number;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
    inactiveReason: string | null;
  } | null> {
    const [row] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
        branchTimezone: schema.branches.timezone,
        activityId: schema.schedules.activityId,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        isActive: schema.schedules.isActive,
        inactiveReason: schema.schedules.inactiveReason,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .where(eq(schema.schedules.id, scheduleId));

    if (!row) return null;
    return row;
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
        isTrial: schema.bookings.isTrial,
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
    isTrial: boolean;
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
      isTrial: row.isTrial,
    };
  }
}
