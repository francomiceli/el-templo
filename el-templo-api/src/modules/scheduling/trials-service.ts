/**
 * Phase 102 + 103: TrialService
 *
 * Trial creation is split across two responsibilities:
 *
 *   1. Creating the user (status='prueba') is the job of the standard
 *      member-creation flow (members/service.ts createMember). This keeps
 *      DNI/dateOfBirth/gender validation in one place and avoids a second
 *      "lite create" code path that would drift over time.
 *
 *   2. Booking that user into a specific class slot is the job of this
 *      service: bookTrial({userId, scheduleId, bookingDate}).
 *
 * Eligibility for booking a trial:
 *   - users.status = 'prueba'
 *   - user.branch_id matches the slot's branch
 *   - user has no non-cancelled is_trial=true booking yet (one trial per
 *     lifetime — "0/1" badge becomes "1/1")
 *
 * Capacity: trials INTENTIONALLY bypass schedule capacity checks — the
 * schedule-capacity queries filter is_trial=false (see booking-service.ts
 * countActiveBookings and service.ts getWeeklyGrid).
 */

import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import type { CountryCode } from "../shared/country-scope";

export interface BookTrialInput {
  userId: number;
  scheduleId: number;
  bookingDate: string; // YYYY-MM-DD
}

export interface BookTrialResult {
  bookingId: number;
}

export interface EligibleTrialUser {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  dni: string | null;
}

export interface ListEligibleTrialsResult {
  users: EligibleTrialUser[];
}

/**
 * Phase 102-06: shift buckets for the coach-facing trial list.
 *   TM (turno mañana) — class start_time < 13:00
 *   TT (turno tarde)  — class start_time >= 13:00
 *   all               — no time filter
 */
export type TrialShift = "TM" | "TT" | "all";

export interface ListTrialsInput {
  date: string; // YYYY-MM-DD
  shift: TrialShift;
  country: CountryCode;
  branchId?: number;
}

export interface TrialListBranchGroup {
  branchId: number;
  branchName: string;
  trials: Array<{
    bookingId: number;
    userId: number;
    firstName: string;
    lastName: string;
    phone: string | null;
    scheduleId: number;
    startTime: string;
    endTime: string;
    activityName: string;
    status: string;
  }>;
}

export interface ListTrialsResult {
  date: string;
  shift: TrialShift;
  groups: TrialListBranchGroup[];
}

export class TrialService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Phase 103: Book an existing prueba user into a specific class slot.
   *
   * Replaces Phase 102's createTrial (user+booking in one shot). Now the
   * user must be created first via the standard /admin/members flow
   * (which defaults status='prueba'); this method only attaches a
   * trial booking.
   *
   * Validations (all run BEFORE the INSERT so we never leave dangling state):
   *   - schedule exists
   *   - user exists with status='prueba'
   *   - user.branch_id matches schedule.branch_id (prevents booking a
   *     prueba into another sede's class)
   *   - user has no non-cancelled is_trial=true booking yet (one per
   *     lifetime — admin can cancel an existing trial booking to free up
   *     the slot, mirroring the Phase 102-06 cancellation contract)
   */
  async bookTrial(input: BookTrialInput): Promise<BookTrialResult> {
    // 1. Validate schedule exists.
    const [scheduleRow] = await this.db
      .select({
        id: schema.schedules.id,
        branchId: schema.schedules.branchId,
      })
      .from(schema.schedules)
      .where(eq(schema.schedules.id, input.scheduleId));
    if (!scheduleRow) throw new NotFoundError("Horario no encontrado");

    // 2. Validate user exists and is in 'prueba' state.
    const [userRow] = await this.db
      .select({
        id: schema.users.id,
        status: schema.users.status,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, input.userId));
    if (!userRow) throw new NotFoundError("Alumno no encontrado");
    if (userRow.status !== "prueba") {
      throw new ConflictError(
        "El alumno no está en estado 'prueba' — no se puede reservar una sesión de prueba",
      );
    }

    // 3. Branch coherence: user's home branch must match the slot's branch.
    if (userRow.branchId !== scheduleRow.branchId) {
      throw new ConflictError(
        "El alumno pertenece a otra sede — solo puede reservar pruebas en su sede",
      );
    }

    // 4. One-trial-per-lifetime guard. Cancelled trials don't count so
    //    admin can cancel + re-book if the alumno reschedules.
    const [priorTrial] = await this.db
      .select({ bookingDate: schema.bookings.bookingDate })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, input.userId),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    if (priorTrial) {
      const [y, m, d] = priorTrial.bookingDate.split("-");
      throw new ConflictError(
        `El alumno ya tiene una sesión de prueba reservada para el ${d}/${m}/${y}`,
      );
    }

    // 5. Insert booking. There's a UNIQUE constraint on
    //    (member_id, schedule_id, booking_date) regardless of status, so a
    //    plain INSERT would 500 if the user previously cancelled a booking
    //    on this exact slot+date. We look for a cancelled row for this
    //    (user, slot, date) tuple and reactivate it; otherwise INSERT fresh.
    let bookingId: number;
    const [existingCancelled] = await this.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, input.userId),
          eq(schema.bookings.scheduleId, input.scheduleId),
          eq(schema.bookings.bookingDate, input.bookingDate),
        ),
      )
      .limit(1);

    if (existingCancelled) {
      await this.db
        .update(schema.bookings)
        .set({
          status: "reservado",
          isTrial: true,
          cancelledAt: null,
          waitlistPosition: null,
        })
        .where(eq(schema.bookings.id, existingCancelled.id));
      bookingId = existingCancelled.id;
    } else {
      const bookingInsert = await this.db.insert(schema.bookings).values({
        memberId: input.userId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
        status: "reservado",
        isTrial: true,
      });
      bookingId = Number(bookingInsert[0].insertId);
    }

    this.log.info(
      {
        userId: input.userId,
        bookingId,
        scheduleId: input.scheduleId,
        bookingDate: input.bookingDate,
      },
      "Trial booked",
    );

    return { bookingId };
  }

  /**
   * Phase 103: List users eligible to book a trial in the given branch.
   *
   * "Eligible" means:
   *   - users.status = 'prueba'
   *   - user.branch_id = branchId
   *   - no non-cancelled is_trial=true booking
   *
   * Used by the SlotDetailDialog inline trial picker so coaches can attach
   * a trial booking to an existing prueba alumno without re-creating one.
   * Sorted by created_at DESC so the most recently-created alumno (the
   * common case — admin just created them via /alumnos) appears first.
   */
  async listEligibleTrials(
    branchId: number,
  ): Promise<ListEligibleTrialsResult> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.status, "prueba"),
          eq(schema.users.branchId, branchId),
          sql`NOT EXISTS (
            SELECT 1 FROM bookings b
            WHERE b.member_id = users.id
              AND b.is_trial = 1
              AND b.booking_status != 'cancelado'
          )`,
        ),
      )
      .orderBy(desc(schema.users.createdAt));

    const users: EligibleTrialUser[] = rows.map((r) => ({
      id: r.id,
      firstName: r.firstName ?? "",
      lastName: r.lastName ?? "",
      phone: r.phone,
      dni: r.dni,
    }));

    return { users };
  }

  /**
   * Phase 102-06: list active trial bookings for a date, optionally
   * filtered to a single branch or shift (TM/TT), grouped by branch.
   *
   * Country scope: mirrors the members-list pattern — physical branches
   * in the caller's country plus virtual branches (which are cross-country).
   * Excludes cancelled trials so the coach shift-briefing matches reality.
   */
  async listTrials(input: ListTrialsInput): Promise<ListTrialsResult> {
    const conditions = [
      eq(schema.bookings.isTrial, true),
      eq(schema.bookings.bookingDate, input.date),
      ne(schema.bookings.status, "cancelado"),
    ];

    if (input.branchId !== undefined) {
      conditions.push(eq(schema.schedules.branchId, input.branchId));
    } else {
      // No explicit branch: apply country scope. Virtual branches are
      // cross-country and stay visible to staff of any country.
      const countryOrVirtual = or(
        eq(schema.branches.country, input.country),
        eq(schema.branches.isVirtual, true),
      );
      if (countryOrVirtual) conditions.push(countryOrVirtual);
    }

    // Shift: split at 13:00 local. The schedules.start_time is stored as
    // "HH:MM" / "HH:MM:SS" so a lexicographic compare works.
    if (input.shift === "TM") {
      conditions.push(sql`${schema.schedules.startTime} < '13:00'`);
    } else if (input.shift === "TT") {
      conditions.push(sql`${schema.schedules.startTime} >= '13:00'`);
    }

    const rows = await this.db
      .select({
        bookingId: schema.bookings.id,
        userId: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        scheduleId: schema.schedules.id,
        startTime: schema.schedules.startTime,
        endTime: schema.schedules.endTime,
        activityName: schema.activities.name,
        status: schema.bookings.status,
        branchId: schema.branches.id,
        branchName: schema.branches.name,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(and(...conditions))
      .orderBy(
        asc(schema.branches.name),
        asc(schema.schedules.startTime),
        asc(schema.users.firstName),
      );

    // Group by branch, preserving the already-sorted order.
    const groupsByBranch = new Map<number, TrialListBranchGroup>();
    for (const r of rows) {
      let group = groupsByBranch.get(r.branchId);
      if (!group) {
        group = { branchId: r.branchId, branchName: r.branchName, trials: [] };
        groupsByBranch.set(r.branchId, group);
      }
      group.trials.push({
        bookingId: r.bookingId,
        userId: r.userId,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        phone: r.phone,
        scheduleId: r.scheduleId,
        startTime: r.startTime,
        endTime: r.endTime,
        activityName: r.activityName,
        status: r.status,
      });
    }

    return {
      date: input.date,
      shift: input.shift,
      groups: Array.from(groupsByBranch.values()),
    };
  }
}
