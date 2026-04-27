/**
 * Schedule Service
 *
 * Business logic for schedule management: CRUD, weekly grid with
 * booking counts and holiday overlays, slot detail, seed defaults.
 *
 * Booking lifecycle extracted to BookingService.
 * Activity CRUD extracted to ActivityService.
 * Holiday management extracted to HolidayService.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, inArray, gte, lte } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { addDays } from "../shared/date-utils";
import type {
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
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
} from "../shared/errors";
import { HolidayService } from "./holiday-service";

export class SchedulingService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private holidayService: HolidayService,
  ) {}

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
    const [activity] = await this.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.id, activityId));

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
  ): Promise<{
    slots: WeeklySlotView[];
    holidays: HolidayRecord[];
    branchTimezone: string;
  }> {
    // Get branch for capacity, country, and timezone (passed back to clients
    // so they can render class times in the branch's local time).
    const [branch] = await this.db
      .select({
        maxCapacity: schema.branches.maxCapacity,
        country: schema.branches.country,
        timezone: schema.branches.timezone,
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

    // Get holidays for the week. weekRangeEnd covers the full Mon-Sun span
    // used by the bookings query below; the holiday helper still gets the
    // start since it computes its own range internally.
    const weekRangeEnd = addDays(weekStartDate, 6); // Sunday inclusive
    const holidaysInWeek = await this.holidayService.getHolidaysForWeek(
      branch.country,
      weekStartDate,
    );
    const holidayDates = new Set(holidaysInWeek.map((h) => h.date));

    // Batch-fetch confirmed booking counts (single GROUP BY instead of N+1).
    // Phase 102-06: compute bookedCount (non-trials, drives capacity) and
    // trialCount (trials walking in, displayed separately) in one query —
    // a conditional COUNT lets us keep the single round-trip.
    //
    // The bookingDate filter is essential: without it MySQL scans every
    // historical booking for the branch's schedules, which timed out
    // (>10s) in production once the table grew. With the range bound the
    // result set is at most ~slots × 7 rows.
    const scheduleIds = scheduleRows.map((r) => r.id);
    const bookingCountMap = new Map<
      string,
      { bookedCount: number; trialCount: number }
    >();

    if (scheduleIds.length > 0) {
      const bookingCounts = await this.db
        .select({
          scheduleId: schema.bookings.scheduleId,
          bookingDate: schema.bookings.bookingDate,
          bookedCount: sql<number>`SUM(CASE WHEN ${schema.bookings.isTrial} = FALSE THEN 1 ELSE 0 END)`,
          trialCount: sql<number>`SUM(CASE WHEN ${schema.bookings.isTrial} = TRUE THEN 1 ELSE 0 END)`,
        })
        .from(schema.bookings)
        .where(
          and(
            inArray(schema.bookings.scheduleId, scheduleIds),
            gte(schema.bookings.bookingDate, weekStartDate),
            lte(schema.bookings.bookingDate, weekRangeEnd),
            sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
          ),
        )
        .groupBy(schema.bookings.scheduleId, schema.bookings.bookingDate);

      for (const row of bookingCounts) {
        bookingCountMap.set(`${row.scheduleId}-${row.bookingDate}`, {
          bookedCount: Number(row.bookedCount ?? 0),
          trialCount: Number(row.trialCount ?? 0),
        });
      }
    }

    // Build slot views using the pre-fetched counts
    const slots: WeeklySlotView[] = [];

    for (const row of scheduleRows) {
      // Calculate the actual date for this slot in the given week
      // weekStartDate is Monday (day 1), so offset = dayOfWeek - 1
      const slotDate = addDays(weekStartDate, row.dayOfWeek - 1);
      const counts = bookingCountMap.get(`${row.id}-${slotDate}`) ?? {
        bookedCount: 0,
        trialCount: 0,
      };

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
        bookedCount: counts.bookedCount,
        trialCount: counts.trialCount,
        maxCapacity,
        isFull: counts.bookedCount >= maxCapacity,
        isHoliday: holidayDates.has(slotDate),
        unconfirmedAttendance: 0,
      });
    }

    return {
      slots,
      holidays: holidaysInWeek,
      branchTimezone: branch.timezone,
    };
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

    // Get all bookings (not cancelled) for this slot + date.
    // Phase 102: trials are returned alongside regular bookings — the admin
    // UI splits them visually using `isTrial`. This is NOT a capacity query.
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
        isTrial: schema.bookings.isTrial,
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
      isTrial: r.isTrial,
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
      if (b.status === "cancelado") continue;
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
   * Change the activity assigned to a schedule slot (e.g. Calistenia → Combos).
   *
   * Existing bookings for this slot are intentionally left intact — the
   * admin intent is to rebrand the recurring slot, not kick members out.
   * Members see the new activity name on their next view via the join
   * to activities in read queries.
   */
  async updateScheduleActivity(
    scheduleId: number,
    activityId: number,
  ): Promise<ScheduleSlot> {
    const existing = await this.getScheduleSlot(scheduleId);
    if (!existing) throw new NotFoundError("Horario no encontrado");

    const [activity] = await this.db
      .select({
        id: schema.activities.id,
        isActive: schema.activities.isActive,
      })
      .from(schema.activities)
      .where(eq(schema.activities.id, activityId));
    if (!activity) throw new NotFoundError("Actividad no encontrada");
    if (!activity.isActive) {
      throw new BadRequestError("La actividad esta desactivada");
    }

    await this.db
      .update(schema.schedules)
      .set({ activityId })
      .where(eq(schema.schedules.id, scheduleId));

    this.log.info(
      { scheduleId, activityId },
      "Schedule activity updated (bookings retained)",
    );

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
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado')`,
        ),
      );
    if (Number(result?.count ?? 0) > 0) {
      throw new BadRequestError(
        "No se puede eliminar un horario con reservas activas. Desactivalo primero.",
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

    // Get or create "Calistenia" activity
    let [regularActivity] = await this.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.name, "Calistenia"))
      .limit(1);

    if (!regularActivity) {
      const result = await this.db.insert(schema.activities).values({
        name: "Calistenia",
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

  // ─── Private Helpers ──────────────────────────────────────────────────────

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
}
