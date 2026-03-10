/**
 * Scheduling Service
 *
 * Business logic for activities CRUD, schedule management, booking lifecycle
 * (reserve, cancel, waitlist auto-promote, capacity enforcement, weekly limit,
 * overdue block), and holiday management.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, asc, inArray } from "drizzle-orm";
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
  ActivityRecord,
  ScheduleSlot,
  WeeklySlotView,
  BookingRecord,
  BookingStatus,
  HolidayRecord,
  SlotDetailView,
  SlotMemberView,
  SlotMemberStatus,
  DayOfWeek,
} from "./types";

/**
 * Error thrown for invalid operations.
 */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/**
 * Error thrown when a requested resource is not found.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

/**
 * Error thrown for conflict states (e.g., duplicate booking).
 */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class SchedulingService {
  private paymentService: PaymentService;
  private subscriptionService: SubscriptionService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.paymentService = new PaymentService(db, log);
    this.subscriptionService = new SubscriptionService(db, log);
  }

  // ─── Activities ───────────────────────────────────────────────────────────

  /**
   * Create a new activity.
   */
  async createActivity(
    name: string,
    description?: string,
  ): Promise<ActivityRecord> {
    const result = await this.db.insert(schema.activities).values({
      name,
      description: description ?? null,
    });

    const id = Number(result[0].insertId);
    const activity = await this.getActivity(id);
    if (!activity) throw new Error("Failed to retrieve newly created activity");
    return activity;
  }

  /**
   * List all active activities.
   */
  async listActivities(): Promise<ActivityRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.isActive, true))
      .orderBy(schema.activities.name);

    return rows.map((r) => this.mapActivityRow(r));
  }

  /**
   * Update an existing activity.
   */
  async updateActivity(
    id: number,
    data: { name?: string; description?: string; isActive?: boolean },
  ): Promise<ActivityRecord> {
    const existing = await this.getActivity(id);
    if (!existing) throw new NotFoundError("Actividad no encontrada");

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.activities)
        .set(updateData)
        .where(eq(schema.activities.id, id));
    }

    const updated = await this.getActivity(id);
    if (!updated) throw new Error("Failed to retrieve updated activity");
    return updated;
  }

  /**
   * Get a single activity by ID.
   */
  async getActivity(id: number): Promise<ActivityRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, id));

    if (!row) return null;
    return this.mapActivityRow(row);
  }

  // ─── Schedules ────────────────────────────────────────────────────────────

  /**
   * Create a schedule slot.
   * Validates branch (not virtual), activity, and prevents duplicates.
   */
  async createSchedule(
    branchId: number,
    activityId: number,
    dayOfWeek: DayOfWeek,
    startTime: string,
    endTime: string,
  ): Promise<ScheduleSlot> {
    // Validate branch
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        name: schema.branches.name,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    if (!branch) throw new NotFoundError("Sede no encontrada");
    if (branch.isVirtual) {
      throw new BadRequestError(
        "No se pueden crear horarios para una sede virtual",
      );
    }

    // Validate activity
    const activity = await this.getActivity(activityId);
    if (!activity) throw new NotFoundError("Actividad no encontrada");

    // Check for duplicate (same branch + day + startTime)
    const [existing] = await this.db
      .select({ id: schema.schedules.id })
      .from(schema.schedules)
      .where(
        and(
          eq(schema.schedules.branchId, branchId),
          eq(schema.schedules.dayOfWeek, dayOfWeek),
          eq(schema.schedules.startTime, startTime),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        "Ya existe un horario para esta sede, dia y hora",
      );
    }

    const result = await this.db.insert(schema.schedules).values({
      branchId,
      activityId,
      dayOfWeek,
      startTime,
      endTime,
    });

    const id = Number(result[0].insertId);
    const slot = await this.getScheduleSlot(id);
    if (!slot) throw new Error("Failed to retrieve newly created schedule");
    return slot;
  }

  /**
   * Get the weekly grid for a branch with booking counts and holiday info.
   * weekStartDate is a Monday ISO date (YYYY-MM-DD).
   */
  async getWeeklyGrid(
    branchId: number,
    weekStartDate: string,
  ): Promise<{ slots: WeeklySlotView[]; holidays: HolidayRecord[] }> {
    // Get branch for capacity and country
    const [branch] = await this.db
      .select({
        maxCapacity: schema.branches.maxCapacity,
        country: schema.branches.country,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    if (!branch) throw new NotFoundError("Sede no encontrada");

    const maxCapacity = branch.maxCapacity;

    // Get all active schedules for this branch
    const scheduleRows = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
        branchName: schema.branches.name,
        activityId: schema.schedules.activityId,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        isActive: schema.schedules.isActive,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.schedules.branchId, branchId),
          eq(schema.schedules.isActive, true),
        ),
      )
      .orderBy(schema.schedules.dayOfWeek, schema.schedules.startTime);

    // Get holidays for the week
    const weekEnd = addDays(weekStartDate, 5); // Saturday
    const holidaysInWeek = await this.getHolidaysForWeek(
      branch.country,
      weekStartDate,
    );
    const holidayDates = new Set(holidaysInWeek.map((h) => h.date));

    // Query unconfirmed attendance for the whole week (one query)
    const unconfirmedRows = await this.db
      .select({
        attDate: sql<string>`DATE(${schema.attendance.checkedInAt})`,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.branchId, branchId),
          sql`DATE(${schema.attendance.checkedInAt}) BETWEEN ${weekStartDate} AND ${weekEnd}`,
          eq(schema.attendance.status, "registrado"),
        ),
      )
      .groupBy(sql`DATE(${schema.attendance.checkedInAt})`);

    const unconfirmedByDate = new Map<string, number>();
    for (const row of unconfirmedRows) {
      unconfirmedByDate.set(String(row.attDate), Number(row.cnt));
    }

    // Batch-fetch confirmed booking counts (single GROUP BY instead of N+1)
    const scheduleIds = scheduleRows.map((r) => r.id);
    const bookingCountMap = new Map<string, number>();

    if (scheduleIds.length > 0) {
      const bookingCounts = await this.db
        .select({
          scheduleId: schema.bookings.scheduleId,
          bookingDate: schema.bookings.bookingDate,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.bookings)
        .where(
          and(
            inArray(schema.bookings.scheduleId, scheduleIds),
            eq(schema.bookings.status, "confirmed"),
          ),
        )
        .groupBy(schema.bookings.scheduleId, schema.bookings.bookingDate);

      for (const row of bookingCounts) {
        bookingCountMap.set(
          `${row.scheduleId}-${row.bookingDate}`,
          Number(row.count),
        );
      }
    }

    // Build slot views using the pre-fetched counts
    const slots: WeeklySlotView[] = [];

    for (const row of scheduleRows) {
      // Calculate the actual date for this slot in the given week
      // weekStartDate is Monday (day 1), so offset = dayOfWeek - 1
      const slotDate = addDays(weekStartDate, row.dayOfWeek - 1);
      const bookedCount = bookingCountMap.get(`${row.id}-${slotDate}`) ?? 0;

      slots.push({
        id: row.id,
        branchId: row.branchId,
        branchName: row.branchName,
        activityId: row.activityId,
        activityName: row.activityName,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        isActive: row.isActive,
        bookedCount,
        maxCapacity,
        isFull: bookedCount >= maxCapacity,
        isHoliday: holidayDates.has(slotDate),
        unconfirmedAttendance: unconfirmedByDate.get(slotDate) ?? 0,
      });
    }

    return { slots, holidays: holidaysInWeek };
  }

  /**
   * Get slot detail with all bookings for a specific date.
   */
  async getSlotDetail(
    scheduleId: number,
    date: string,
  ): Promise<SlotDetailView> {
    const slot = await this.getScheduleSlot(scheduleId);
    if (!slot) throw new NotFoundError("Horario no encontrado");

    // Get branch capacity
    const [branch] = await this.db
      .select({ maxCapacity: schema.branches.maxCapacity })
      .from(schema.branches)
      .where(eq(schema.branches.id, slot.branchId));

    const maxCapacity = branch?.maxCapacity ?? 22;

    // Get all bookings (not cancelled) for this slot + date
    const bookingRows = await this.db
      .select({
        id: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        scheduleId: schema.bookings.scheduleId,
        bookingDate: schema.bookings.bookingDate,
        status: schema.bookings.status,
        waitlistPosition: schema.bookings.waitlistPosition,
        bookedAt: schema.bookings.bookedAt,
        cancelledAt: schema.bookings.cancelledAt,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
        ),
      )
      .orderBy(schema.bookings.bookedAt);

    const bookings: BookingRecord[] = bookingRows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      memberName: [r.memberFirstName, r.memberLastName]
        .filter(Boolean)
        .join(" "),
      scheduleId: r.scheduleId,
      activityName: slot.activityName,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      bookingDate: r.bookingDate,
      status: r.status as BookingStatus,
      waitlistPosition: r.waitlistPosition,
      bookedAt: r.bookedAt.toISOString(),
      cancelledAt: r.cancelledAt?.toISOString() ?? null,
    }));

    // Query attendance records for this branch + date
    const attendanceRows = await this.db
      .select({
        id: schema.attendance.id,
        memberId: schema.attendance.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .where(
        and(
          eq(schema.attendance.branchId, slot.branchId),
          sql`DATE(${schema.attendance.checkedInAt}) = ${date}`,
        ),
      );

    // Build attendance lookup by memberId
    const attendanceByMember = new Map<
      number,
      { id: number; status: string; memberName: string }
    >();
    for (const a of attendanceRows) {
      attendanceByMember.set(a.memberId, {
        id: a.id,
        status: a.status,
        memberName: [a.memberFirstName, a.memberLastName]
          .filter(Boolean)
          .join(" "),
      });
    }

    // Build unified members list
    const members: SlotMemberView[] = [];
    const seenMemberIds = new Set<number>();

    // Process bookings first (confirmed/waitlist only)
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      seenMemberIds.add(b.memberId);
      const att = attendanceByMember.get(b.memberId);

      let memberStatus: SlotMemberStatus = "reservado";
      let attendanceId: number | null = null;

      if (att) {
        attendanceId = att.id;
        memberStatus =
          att.status === "confirmado" ? "confirmado" : "qr_escaneado";
      }

      members.push({
        memberId: b.memberId,
        memberName: b.memberName,
        bookingId: b.id,
        attendanceId,
        status: memberStatus,
        bookingStatus: b.status,
      });
    }

    // Add walk-in attendance records (not in bookings)
    for (const a of attendanceRows) {
      if (seenMemberIds.has(a.memberId)) continue;
      members.push({
        memberId: a.memberId,
        memberName: [a.memberFirstName, a.memberLastName]
          .filter(Boolean)
          .join(" "),
        bookingId: null,
        attendanceId: a.id,
        status: a.status === "confirmado" ? "confirmado" : "qr_escaneado",
        bookingStatus: null,
      });
    }

    return {
      schedule: slot,
      date,
      bookings,
      members,
      maxCapacity,
    };
  }

  /**
   * Toggle a schedule slot active/inactive.
   */
  async toggleSchedule(
    scheduleId: number,
    isActive: boolean,
  ): Promise<ScheduleSlot> {
    const existing = await this.getScheduleSlot(scheduleId);
    if (!existing) throw new NotFoundError("Horario no encontrado");

    await this.db
      .update(schema.schedules)
      .set({ isActive })
      .where(eq(schema.schedules.id, scheduleId));

    const updated = await this.getScheduleSlot(scheduleId);
    if (!updated) throw new Error("Failed to retrieve updated schedule");
    return updated;
  }

  /**
   * Delete a schedule slot. Fails if it has confirmed bookings.
   */
  async deleteSchedule(scheduleId: number): Promise<void> {
    const slot = await this.getScheduleSlot(scheduleId);
    if (!slot) throw new NotFoundError("Horario no encontrado");

    // Check for active bookings
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.status, "confirmed"),
        ),
      );
    if (Number(result?.count ?? 0) > 0) {
      throw new BadRequestError(
        "No se puede eliminar un horario con reservas confirmadas. Desactivalo primero.",
      );
    }

    await this.db
      .delete(schema.bookings)
      .where(eq(schema.bookings.scheduleId, scheduleId));
    await this.db
      .delete(schema.schedules)
      .where(eq(schema.schedules.id, scheduleId));

    this.log.info({ scheduleId }, "Schedule deleted");
  }

  /**
   * Seed default schedules for a branch.
   * Creates 8 weekday slots (7-10, 17-20) for regular class
   * + 2 Saturday ROM slots (8, 9) if romEnabled.
   */
  async seedDefaultSchedules(branchId: number): Promise<number> {
    // Validate branch
    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        isVirtual: schema.branches.isVirtual,
        romEnabled: schema.branches.romEnabled,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    if (!branch) throw new NotFoundError("Sede no encontrada");
    if (branch.isVirtual) {
      throw new BadRequestError(
        "No se pueden crear horarios para una sede virtual",
      );
    }

    // Get or create "Sesion Grupal" activity
    let [regularActivity] = await this.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.name, "Sesion Grupal"))
      .limit(1);

    if (!regularActivity) {
      const result = await this.db.insert(schema.activities).values({
        name: "Sesion Grupal",
        description: "Clase grupal de entrenamiento funcional",
      });
      regularActivity = { id: Number(result[0].insertId) };
    }

    // Weekday time slots
    const weekdayHours = [
      "07:00",
      "08:00",
      "09:00",
      "10:00",
      "17:00",
      "18:00",
      "19:00",
      "20:00",
    ];
    let created = 0;

    // Monday through Friday (1-5)
    for (let day = 1; day <= 5; day++) {
      for (const startTime of weekdayHours) {
        const endHour = String(
          parseInt(startTime.split(":")[0], 10) + 1,
        ).padStart(2, "0");
        const endTime = `${endHour}:00`;

        // Skip if already exists
        const [existing] = await this.db
          .select({ id: schema.schedules.id })
          .from(schema.schedules)
          .where(
            and(
              eq(schema.schedules.branchId, branchId),
              eq(schema.schedules.dayOfWeek, day),
              eq(schema.schedules.startTime, startTime),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(schema.schedules).values({
            branchId,
            activityId: regularActivity.id,
            dayOfWeek: day,
            startTime,
            endTime,
          });
          created++;
        }
      }
    }

    // Saturday ROM slots (day 6) if romEnabled
    if (branch.romEnabled) {
      let [romActivity] = await this.db
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(eq(schema.activities.name, "ROM"))
        .limit(1);

      if (!romActivity) {
        const result = await this.db.insert(schema.activities).values({
          name: "ROM",
          description: "Range of Movement - Movilidad y flexibilidad",
        });
        romActivity = { id: Number(result[0].insertId) };
      }

      const romHours = ["08:00", "09:00"];
      for (const startTime of romHours) {
        const endHour = String(
          parseInt(startTime.split(":")[0], 10) + 1,
        ).padStart(2, "0");
        const endTime = `${endHour}:00`;

        const [existing] = await this.db
          .select({ id: schema.schedules.id })
          .from(schema.schedules)
          .where(
            and(
              eq(schema.schedules.branchId, branchId),
              eq(schema.schedules.dayOfWeek, 6),
              eq(schema.schedules.startTime, startTime),
            ),
          )
          .limit(1);

        if (!existing) {
          await this.db.insert(schema.schedules).values({
            branchId,
            activityId: romActivity.id,
            dayOfWeek: 6,
            startTime,
            endTime,
          });
          created++;
        }
      }
    }

    this.log.info({ branchId, created }, "Default schedules seeded");
    return created;
  }

  // ─── Bookings ─────────────────────────────────────────────────────────────

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
      if (duplicate.status === "confirmed" || duplicate.status === "waitlist") {
        throw new ConflictError("Ya tenes una reserva en este horario");
      }
    }

    // 9. Check capacity
    const confirmedCount = await this.countConfirmedBookings(scheduleId, date);
    const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

    let status: "confirmed" | "waitlist" = "confirmed";
    let waitlistPosition: number | null = null;

    if (confirmedCount >= maxCapacity) {
      status = "waitlist";
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
            eq(schema.bookings.status, "waitlist"),
          ),
        );
      waitlistPosition = (Number(maxPos?.maxPos) ?? 0) + 1;
    }

    // 10. Insert booking
    // If there's a cancelled duplicate, delete it first to avoid unique constraint
    if (
      duplicate &&
      (duplicate.status === "cancelled" || duplicate.status === "no_show")
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

    // 2. Validate booking is confirmed or waitlist
    if (bookingRow.status !== "confirmed" && bookingRow.status !== "waitlist") {
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

    const wasCancelled = bookingRow.status;

    // 4. Update status to cancelled
    await this.db
      .update(schema.bookings)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        waitlistPosition: null,
      })
      .where(eq(schema.bookings.id, bookingId));

    // 5. If cancelled booking was confirmed, promote waitlist
    if (wasCancelled === "confirmed") {
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
          sql`${schema.bookings.status} IN ('confirmed', 'waitlist')`,
        ),
      )
      .orderBy(schema.bookings.bookingDate, schema.schedules.startTime);

    return rows.map((r) => this.mapBookingRow(r));
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
      if (duplicate.status === "confirmed" || duplicate.status === "waitlist") {
        throw new ConflictError(
          "El miembro ya tiene una reserva en este horario",
        );
      }
      // Remove cancelled/no_show duplicate
      if (duplicate.status === "cancelled" || duplicate.status === "no_show") {
        await this.db
          .delete(schema.bookings)
          .where(eq(schema.bookings.id, duplicate.id));
      }
    }

    // Check capacity
    const confirmedCount = await this.countConfirmedBookings(scheduleId, date);
    const maxCapacity = await this.getBranchCapacity(scheduleRow.branchId);

    let status: "confirmed" | "waitlist" = "confirmed";
    let waitlistPosition: number | null = null;

    if (confirmedCount >= maxCapacity) {
      status = "waitlist";
      const [maxPos] = await this.db
        .select({
          maxPos: sql<number>`COALESCE(MAX(${schema.bookings.waitlistPosition}), 0)`,
        })
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.scheduleId, scheduleId),
            eq(schema.bookings.bookingDate, date),
            eq(schema.bookings.status, "waitlist"),
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

    if (bookingRow.status === "confirmed" || bookingRow.status === "waitlist") {
      const wasConfirmed = bookingRow.status === "confirmed";

      await this.db
        .update(schema.bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          waitlistPosition: null,
        })
        .where(eq(schema.bookings.id, bookingId));

      if (wasConfirmed) {
        await this.promoteWaitlist(
          bookingRow.scheduleId,
          bookingRow.bookingDate,
        );
      }
    }

    this.log.info({ bookingId }, "Admin removed booking");
  }

  // ─── Holidays ─────────────────────────────────────────────────────────────

  /**
   * Add a holiday. Auto-cancels all confirmed+waitlist bookings for
   * branches in that country on that date.
   */
  async addHoliday(
    country: string,
    date: string,
    name: string,
  ): Promise<HolidayRecord> {
    const result = await this.db.insert(schema.holidays).values({
      country,
      date,
      name,
    });

    const holidayId = Number(result[0].insertId);

    // Auto-cancel bookings at branches in this country on this date
    // Find all branches in this country
    const countryBranches = await this.db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.country, country));

    if (countryBranches.length > 0) {
      const branchIds = countryBranches.map((b) => b.id);

      // Find schedules at these branches
      const countrySchedules = await this.db
        .select({ id: schema.schedules.id })
        .from(schema.schedules)
        .where(inArray(schema.schedules.branchId, branchIds));

      if (countrySchedules.length > 0) {
        const scheduleIds = countrySchedules.map((s) => s.id);

        // Cancel all confirmed and waitlist bookings for these schedules on this date
        await this.db
          .update(schema.bookings)
          .set({
            status: "cancelled",
            cancelledAt: new Date(),
            waitlistPosition: null,
          })
          .where(
            and(
              inArray(schema.bookings.scheduleId, scheduleIds),
              eq(schema.bookings.bookingDate, date),
              sql`${schema.bookings.status} IN ('confirmed', 'waitlist')`,
            ),
          );
      }
    }

    this.log.info({ country, date, name, holidayId }, "Holiday added");

    return {
      id: holidayId,
      country,
      date,
      name,
    };
  }

  /**
   * Remove a holiday (does NOT restore cancelled bookings).
   */
  async removeHoliday(id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.holidays.id })
      .from(schema.holidays)
      .where(eq(schema.holidays.id, id));

    if (!existing) throw new NotFoundError("Feriado no encontrado");

    await this.db.delete(schema.holidays).where(eq(schema.holidays.id, id));

    this.log.info({ holidayId: id }, "Holiday removed");
  }

  /**
   * List holidays filtered by country and/or year.
   */
  async listHolidays(
    country?: string,
    year?: number,
  ): Promise<HolidayRecord[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (country) {
      conditions.push(eq(schema.holidays.country, country));
    }
    if (year) {
      conditions.push(sql`YEAR(${schema.holidays.date}) = ${year}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select({
        id: schema.holidays.id,
        country: schema.holidays.country,
        date: schema.holidays.date,
        name: schema.holidays.name,
      })
      .from(schema.holidays)
      .where(whereClause)
      .orderBy(schema.holidays.date);

    return rows;
  }

  /**
   * Get holidays for a week (Mon-Sat) for a given country.
   */
  async getHolidaysForWeek(
    country: string,
    weekStartDate: string,
  ): Promise<HolidayRecord[]> {
    const weekEnd = addDays(weekStartDate, 5);

    const rows = await this.db
      .select({
        id: schema.holidays.id,
        country: schema.holidays.country,
        date: schema.holidays.date,
        name: schema.holidays.name,
      })
      .from(schema.holidays)
      .where(
        and(
          eq(schema.holidays.country, country),
          sql`${schema.holidays.date} >= ${weekStartDate}`,
          sql`${schema.holidays.date} <= ${weekEnd}`,
        ),
      )
      .orderBy(schema.holidays.date);

    return rows;
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
          eq(schema.bookings.status, "waitlist"),
        ),
      )
      .orderBy(asc(schema.bookings.waitlistPosition))
      .limit(1);

    if (!first) return;

    // Promote to confirmed
    await this.db
      .update(schema.bookings)
      .set({ status: "confirmed", waitlistPosition: null })
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
          eq(schema.bookings.status, "waitlist"),
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
   * Count confirmed bookings for a schedule+date.
   */
  private async countConfirmedBookings(
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
          eq(schema.bookings.status, "confirmed"),
        ),
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Count a member's confirmed bookings in a Mon-Sat range.
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
          eq(schema.bookings.status, "confirmed"),
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
   * Get a schedule slot with joins (for public response).
   */
  private async getScheduleSlot(
    scheduleId: number,
  ): Promise<ScheduleSlot | null> {
    const [row] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
        branchName: schema.branches.name,
        activityId: schema.schedules.activityId,
        activityName: schema.activities.name,
        dayOfWeek: schema.schedules.dayOfWeek,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        isActive: schema.schedules.isActive,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(eq(schema.schedules.id, scheduleId));

    if (!row) return null;
    return {
      id: row.id,
      branchId: row.branchId,
      branchName: row.branchName,
      activityId: row.activityId,
      activityName: row.activityName,
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
   * Map a raw activity row to ActivityRecord.
   */
  private mapActivityRow(
    row: typeof schema.activities.$inferSelect,
  ): ActivityRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
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
