/**
 * Attendance Service
 *
 * Business logic for QR token validation, member check-in
 * (with subscription/branch/class-tracking enforcement),
 * force check-in override, and attendance queries.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import {
  getWeekRange,
  todayInTz,
  buildClassDateTime,
} from "../shared/date-utils";
import { validateQrToken } from "../shared/qr-token";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import type {
  AttendanceRecord,
  AttendanceListParams,
  AttendanceStatus,
  ForceCheckInInput,
} from "./types";

export class AttendanceService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private subscriptionService: SubscriptionService,
    private auraService: AuraService,
  ) {}

  // ─── Check-in Methods ──────────────────────────────────────────────────────

  /**
   * Member QR check-in.
   *
   * Validates QR token, checks subscription (expired = hard block),
   * overdue status, branch enforcement, weekly limit, monthly budget,
   * and one-per-day constraint. Creates attendance with status "confirmado"
   * and awards AURA immediately.
   */
  async checkIn(memberId: number, qrToken: string): Promise<AttendanceRecord> {
    // Validate QR token
    const qrPayload = validateQrToken(qrToken);
    if (!qrPayload) {
      throw new BadRequestError("Codigo QR invalido");
    }

    const branchId = qrPayload.branchId;

    // Resolve branch timezone for tz-aware "today" and check-in window math.
    const [branchRow] = await this.db
      .select({ timezone: schema.branches.timezone })
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId));

    if (!branchRow) {
      throw new BadRequestError("Sede invalida");
    }

    const tz = branchRow.timezone;

    // Check subscription (auto-expire catches expired subs, returns null = hard block)
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) {
      throw new BadRequestError("No tenes una suscripcion activa");
    }

    // Check branch enforcement for single-branch plans
    const [planRow] = await this.db
      .select({
        multiBranch: schema.subscriptionPlans.multiBranch,
        classesPerWeek: schema.subscriptionPlans.classesPerWeek,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId));

    if (planRow && !planRow.multiBranch) {
      const [memberRow] = await this.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, memberId));

      if (memberRow && memberRow.branchId !== branchId) {
        throw new BadRequestError(
          "Tu plan solo permite asistir a tu sede asignada",
        );
      }
    }

    // Weekly limit check: count attendance this Mon-Sun week
    if (
      planRow?.classesPerWeek !== null &&
      planRow?.classesPerWeek !== undefined
    ) {
      const weeklyCount = await this.countWeeklyAttendance(memberId);
      if (weeklyCount >= planRow.classesPerWeek) {
        throw new BadRequestError(
          `Alcanzaste tu limite semanal (${weeklyCount}/${planRow.classesPerWeek})`,
        );
      }
    }

    // Monthly budget check: if classesRemaining is tracked and exhausted
    if (
      subscription.classesRemaining !== null &&
      subscription.classesRemaining <= 0
    ) {
      throw new BadRequestError("Agotaste tus clases del periodo");
    }

    // One check-in per day (fast-path guard; authoritative check inside transaction)
    const now = new Date();
    const todayStr = todayInTz(tz, now);

    const [alreadyCheckedIn] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) = ${todayStr}`,
        ),
      )
      .limit(1);

    if (alreadyCheckedIn) {
      throw new BadRequestError("Ya registraste asistencia hoy");
    }

    // Find today's bookings before the transaction (read-only, no race concern)
    const windowMs = 20 * 60 * 1000;

    const bookingsInRange = await this.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
        startTime: schema.schedules.startTime,
        activityName: schema.activities.name,
      })
      .from(schema.bookings)
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
          eq(schema.bookings.bookingDate, todayStr),
          eq(schema.bookings.status, "reservado"),
          eq(schema.schedules.branchId, branchId),
        ),
      );

    const matchingBooking = bookingsInRange.find((b) => {
      const classTime = buildClassDateTime(todayStr, b.startTime, tz);
      return Math.abs(now.getTime() - classTime.getTime()) <= windowMs;
    });

    if (!matchingBooking) {
      if (bookingsInRange.length > 0) {
        const times = bookingsInRange
          .map((b) => b.startTime)
          .sort()
          .join(", ");
        throw new BadRequestError(
          `Tus clases de hoy son a las ${times}. Solo podes registrar asistencia entre 20 minutos antes y despues del inicio.`,
        );
      }
      throw new BadRequestError(
        "No tenes una clase reservada para hoy en esta sede",
      );
    }

    // Wrap duplicate check + insert + decrement in transaction
    const recordId = await this.db.transaction(async (tx) => {
      // Re-check one-per-day inside transaction.
      // Compare against sessionDate (the logical class date), NOT
      // DATE(checkedInAt) which is the INSERT timestamp in server TZ —
      // those diverge for retroactive coach check-ins and across
      // timezones, causing false positives that block legitimate
      // check-ins and false negatives that allow duplicates.
      const [existingToday] = await tx
        .select({ id: schema.attendance.id })
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.memberId, memberId),
            eq(schema.attendance.sessionDate, todayStr),
          ),
        )
        .limit(1);

      if (existingToday) {
        throw new BadRequestError("Ya registraste asistencia hoy");
      }

      // Insert attendance record
      const result = await tx.insert(schema.attendance).values({
        memberId,
        branchId,
        scheduleId: matchingBooking.scheduleId,
        sessionDate: todayStr,
        status: "confirmado",
        source: "qr",
        checkedInAt: now,
      });

      const id = Number(result[0].insertId);

      // Decrement classesRemaining if tracked
      if (
        subscription.classesRemaining !== null &&
        subscription.classesRemaining > 0
      ) {
        await tx
          .update(schema.subscriptions)
          .set({
            classesRemaining: sql`${schema.subscriptions.classesRemaining} - 1`,
          })
          .where(
            and(
              eq(schema.subscriptions.id, subscription.id),
              sql`${schema.subscriptions.classesRemaining} > 0`,
            ),
          );
      }

      // Update booking status to qr_escaneado
      await tx
        .update(schema.bookings)
        .set({ status: "qr_escaneado" })
        .where(eq(schema.bookings.id, matchingBooking.id));

      return id;
    });

    // Award AURA outside transaction (has its own transaction internally)
    await this.auraService.award({
      userId: memberId,
      sourceType: "attendance",
      referenceType: "attendance",
      referenceId: recordId,
      amount: 10,
      description: "Asistencia confirmada",
    });

    // Mirror the check-in as a completed_sessions row so presencial members
    // get credit for showing up — same way an online session completion does.
    // Marked with goal_plan_type='presencial' so it's distinguishable.
    // Outside the tx (mirrors AURA pattern): if it fails the check-in still wins.
    await this.recordPresencialSession({
      memberId,
      branchId,
      checkedInAt: now,
      dateStr: todayStr,
    });

    this.log.info(
      {
        memberId,
        bookingId: matchingBooking.id,
        scheduleId: matchingBooking.scheduleId,
      },
      "Booking confirmed on QR check-in",
    );

    return this.getRecordById(recordId);
  }

  /**
   * Force check-in by admin/coach.
   *
   * Bypasses all enforcement (subscription, overdue, weekly, monthly).
   * Creates attendance with source="manual" and status="confirmado".
   * Awards 10 AURA immediately. Still decrements classesRemaining to keep budget accurate.
   */
  async forceCheckIn(
    input: ForceCheckInInput,
    adminId: number,
  ): Promise<AttendanceRecord> {
    const { memberId, branchId, reason } = input;

    // Insert attendance record
    const todayStr = new Date().toISOString().split("T")[0];
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId,
      scheduleId: null,
      sessionDate: todayStr,
      status: "confirmado",
      source: "manual",
    });

    const recordId = Number(result[0].insertId);

    // Award AURA immediately on force check-in
    await this.auraService.award({
      userId: memberId,
      sourceType: "attendance",
      referenceType: "attendance",
      referenceId: recordId,
      amount: 10,
      description: "Asistencia confirmada (manual)",
    });

    // Still decrement classesRemaining if applicable
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (
      subscription &&
      subscription.classesRemaining !== null &&
      subscription.classesRemaining > 0
    ) {
      await this.db
        .update(schema.subscriptions)
        .set({
          classesRemaining: sql`${schema.subscriptions.classesRemaining} - 1`,
        })
        .where(
          and(
            eq(schema.subscriptions.id, subscription.id),
            sql`${schema.subscriptions.classesRemaining} > 0`,
          ),
        );
    }

    // Mirror as completed_sessions (presencial). See checkIn() for rationale.
    await this.recordPresencialSession({
      memberId,
      branchId,
      checkedInAt: new Date(),
      dateStr: todayStr,
    });

    this.log.info(
      { memberId, branchId, reason, adminId, attendanceId: recordId },
      "Force check-in recorded",
    );

    return this.getRecordById(recordId);
  }

  // ─── Slot Attendance Methods ──────────────────────────────────────────────

  /**
   * Get attendance for a specific schedule slot on a given date.
   * Returns members with booking + attendance status, including walk-in QR scans.
   */
  async getSlotAttendance(
    scheduleId: number,
    date: string,
  ): Promise<{
    members: Array<{
      memberId: number;
      memberName: string;
      bookingId: number | null;
      bookingStatus: string | null;
      attendanceId: number | null;
      checkedInAt: string | null;
      source: "qr" | "manual" | null;
    }>;
  }> {
    // Get all bookings for this slot+date
    const bookingRows = await this.db
      .select({
        bookingId: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        bookingStatus: schema.bookings.status,
      })
      .from(schema.bookings)
      .innerJoin(schema.users, eq(schema.users.id, schema.bookings.memberId))
      .where(
        and(
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado', 'confirmado', 'lista_espera')`,
        ),
      );

    // Get all attendance records for this slot+date
    const attendanceRows = await this.db
      .select({
        id: schema.attendance.id,
        memberId: schema.attendance.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        checkedInAt: schema.attendance.checkedInAt,
        source: schema.attendance.source,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .where(
        and(
          eq(schema.attendance.scheduleId, scheduleId),
          eq(schema.attendance.sessionDate, date),
        ),
      );

    // Merge: start with all booked members, overlay attendance
    const memberMap = new Map<
      number,
      {
        memberId: number;
        memberName: string;
        bookingId: number | null;
        bookingStatus: string | null;
        attendanceId: number | null;
        checkedInAt: string | null;
        source: "qr" | "manual" | null;
      }
    >();

    for (const b of bookingRows) {
      memberMap.set(b.memberId, {
        memberId: b.memberId,
        memberName: [b.memberFirstName, b.memberLastName]
          .filter(Boolean)
          .join(" "),
        bookingId: b.bookingId,
        bookingStatus: b.bookingStatus,
        attendanceId: null,
        checkedInAt: null,
        source: null,
      });
    }

    for (const a of attendanceRows) {
      const existing = memberMap.get(a.memberId);
      if (existing) {
        existing.attendanceId = a.id;
        existing.checkedInAt =
          a.checkedInAt instanceof Date
            ? a.checkedInAt.toISOString()
            : String(a.checkedInAt);
        existing.source = a.source as "qr" | "manual";
      } else {
        // Walk-in: attendance without booking
        memberMap.set(a.memberId, {
          memberId: a.memberId,
          memberName: [a.memberFirstName, a.memberLastName]
            .filter(Boolean)
            .join(" "),
          bookingId: null,
          bookingStatus: null,
          attendanceId: a.id,
          checkedInAt:
            a.checkedInAt instanceof Date
              ? a.checkedInAt.toISOString()
              : String(a.checkedInAt),
          source: a.source as "qr" | "manual",
        });
      }
    }

    return { members: Array.from(memberMap.values()) };
  }

  /**
   * Coach manual check-in from a schedule slot.
   * Validates membership and returns subscription status warnings alongside
   * the created attendance record. Always allows check-in (coach override).
   */
  async coachCheckIn(
    scheduleId: number,
    date: string,
    memberId: number,
    reason?: string,
  ): Promise<{
    attendance: AttendanceRecord;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Get schedule to find branchId
    const [schedule] = await this.db
      .select({ branchId: schema.schedules.branchId })
      .from(schema.schedules)
      .where(eq(schema.schedules.id, scheduleId));

    if (!schedule) {
      throw new BadRequestError("Horario no encontrado");
    }

    // One check-in per day guard.
    // Compare against sessionDate (the logical class date), NOT
    // DATE(checkedInAt) which is the INSERT timestamp in server TZ.
    // Retroactive coach check-ins write session_date to the past while
    // checked_in_at lands today, so DATE(checkedInAt) generates false
    // positives that block legitimate check-ins on other dates.
    const [existingToday] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          eq(schema.attendance.sessionDate, date),
        ),
      )
      .limit(1);

    if (existingToday) {
      throw new BadRequestError(
        "El miembro ya tiene asistencia registrada en esta fecha",
      );
    }

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
    }

    // Insert attendance record
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId: schedule.branchId,
      scheduleId,
      sessionDate: date,
      status: "confirmado",
      source: "manual",
    });

    const recordId = Number(result[0].insertId);

    // Award AURA immediately
    await this.auraService.award({
      userId: memberId,
      sourceType: "attendance",
      referenceType: "attendance",
      referenceId: recordId,
      amount: 10,
      description: reason
        ? `Asistencia manual: ${reason}`
        : "Asistencia confirmada (manual)",
    });

    // Decrement classesRemaining if tracked
    if (
      subscription &&
      subscription.classesRemaining !== null &&
      subscription.classesRemaining > 0
    ) {
      await this.db
        .update(schema.subscriptions)
        .set({
          classesRemaining: sql`${schema.subscriptions.classesRemaining} - 1`,
        })
        .where(
          and(
            eq(schema.subscriptions.id, subscription.id),
            sql`${schema.subscriptions.classesRemaining} > 0`,
          ),
        );
    }

    // Upsert booking so walk-in check-ins (no prior booking, or booking
    // cancelled/no_show/waitlisted) are reflected in bookedCount,
    // slot-occupancy analytics, and any other query that drives off the
    // bookings table. The unique index on (member_id, schedule_id,
    // booking_date) means at most one row exists per tuple, so ON
    // DUPLICATE KEY UPDATE handles every prior state atomically.
    await this.db.execute(sql`
      INSERT INTO bookings (member_id, schedule_id, booking_date, booking_status)
      VALUES (${memberId}, ${scheduleId}, ${date}, 'confirmado')
      ON DUPLICATE KEY UPDATE
        cancelled_at = NULL,
        waitlist_position = NULL,
        booking_status = 'confirmado'
    `);

    // Mirror as completed_sessions (presencial). See checkIn() for rationale.
    await this.recordPresencialSession({
      memberId,
      branchId: schedule.branchId,
      checkedInAt: new Date(),
      dateStr: date,
    });

    this.log.info(
      { memberId, scheduleId, date, recordId, warnings },
      "Coach check-in recorded",
    );

    const record = await this.getRecordById(recordId);
    return { attendance: record, warnings };
  }

  /**
   * Remove a check-in (coach undo). Deletes the attendance record,
   * restores classesRemaining, reverses AURA, and reverts booking status.
   */
  async removeCheckIn(attendanceId: number): Promise<{ removed: boolean }> {
    // Get the attendance record
    const [attRecord] = await this.db
      .select({
        id: schema.attendance.id,
        memberId: schema.attendance.memberId,
        scheduleId: schema.attendance.scheduleId,
        checkedInAt: schema.attendance.checkedInAt,
      })
      .from(schema.attendance)
      .where(eq(schema.attendance.id, attendanceId));

    if (!attRecord) {
      throw new BadRequestError("Registro de asistencia no encontrado");
    }

    // Delete the attendance record
    await this.db
      .delete(schema.attendance)
      .where(eq(schema.attendance.id, attendanceId));

    // Restore classesRemaining +1
    const subscription = await this.subscriptionService.getMemberSubscription(
      attRecord.memberId,
    );
    if (subscription && subscription.classesRemaining !== null) {
      await this.db
        .update(schema.subscriptions)
        .set({
          classesRemaining: sql`${schema.subscriptions.classesRemaining} + 1`,
        })
        .where(eq(schema.subscriptions.id, subscription.id));
    }

    // Reverse AURA: spend 10 AURA as a reversal
    try {
      await this.auraService.spend({
        userId: attRecord.memberId,
        amount: 10,
        description: `Reversa asistencia #${attendanceId}`,
        referenceType: "attendance_reversal",
      });
    } catch {
      // If insufficient balance, just log it -- don't block the undo
      this.log.warn(
        { attendanceId, memberId: attRecord.memberId },
        "Could not reverse AURA (insufficient balance)",
      );
    }

    // Compute the local date the check-in was filed under so we can
    // revert booking + drop the mirror completed_sessions row consistently.
    const dateStr =
      attRecord.checkedInAt instanceof Date
        ? attRecord.checkedInAt.toISOString().split("T")[0]
        : String(attRecord.checkedInAt).split("T")[0];

    // Revert booking status if applicable
    if (attRecord.scheduleId) {
      await this.db
        .update(schema.bookings)
        .set({ status: "reservado" })
        .where(
          and(
            eq(schema.bookings.memberId, attRecord.memberId),
            eq(schema.bookings.scheduleId, attRecord.scheduleId),
            eq(schema.bookings.bookingDate, dateStr),
            sql`${schema.bookings.status} IN ('qr_escaneado', 'confirmado')`,
          ),
        );
    }

    // Drop the presencial mirror so weekly counters stay honest.
    await this.db
      .delete(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, attRecord.memberId),
          eq(schema.completedSessions.date, dateStr),
          eq(schema.completedSessions.goalPlanType, "presencial"),
        ),
      );

    this.log.info(
      { attendanceId, memberId: attRecord.memberId },
      "Check-in removed (coach undo)",
    );

    return { removed: true };
  }

  /**
   * Insert a synthetic completed_sessions row that mirrors the attendance.
   * Marked goal_plan_type='presencial' so it can be filtered or distinguished
   * from real online/autonomous sessions. Best-effort: failures are logged
   * but do not bubble up (the check-in itself already succeeded).
   *
   * No AURA is awarded here — the check-in path already grants 10 AURA via
   * sourceType='attendance', and we don't want presencial members to get
   * double credit.
   */
  private async recordPresencialSession(input: {
    memberId: number;
    branchId: number;
    checkedInAt: Date;
    dateStr: string;
  }): Promise<void> {
    try {
      const [user] = await this.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(eq(schema.users.id, input.memberId));
      if (!user) return;

      // Presencial members do the full coached class — credit them with
      // every standard block. Deuteros defaults to DEUTEROS_1 only (not the
      // online DEUTEROS_1+DEUTEROS_2 split) since the coach picks one
      // accessory variant per session.
      await this.db.insert(schema.completedSessions).values({
        userId: input.memberId,
        branchId: input.branchId,
        dayId: `presencial-${input.dateStr}`,
        sessionLevel: user.level,
        date: input.dateStr,
        startedAt: input.checkedInAt,
        completedAt: input.checkedInAt,
        blocksCompleted: ["INITIUM", "NUCLEUS", "DEUTEROS_1", "ATHLOS"],
        goalPlanType: "presencial",
      });
    } catch (err) {
      this.log.error(
        { err, memberId: input.memberId, dateStr: input.dateStr },
        "Failed to mirror attendance as completed_sessions",
      );
    }
  }

  // ─── Query Methods ─────────────────────────────────────────────────────────

  /**
   * List attendance records with filters and pagination.
   */
  async listAttendance(
    params: AttendanceListParams,
  ): Promise<{ records: AttendanceRecord[]; total: number }> {
    const { branchId, date, dateFrom, dateTo, status, memberId, page, limit } =
      params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, branchId));
    }

    if (memberId !== undefined) {
      conditions.push(eq(schema.attendance.memberId, memberId));
    }

    if (date !== undefined) {
      conditions.push(sql`DATE(${schema.attendance.checkedInAt}) = ${date}`);
    }

    if (dateFrom !== undefined) {
      conditions.push(
        sql`DATE(${schema.attendance.checkedInAt}) >= ${dateFrom}`,
      );
    }

    if (dateTo !== undefined) {
      conditions.push(sql`DATE(${schema.attendance.checkedInAt}) <= ${dateTo}`);
    }

    if (status !== undefined) {
      conditions.push(eq(schema.attendance.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(whereClause);

    const total = Number(countResult?.count ?? 0);

    // Rows
    const rows = await this.db
      .select({
        id: schema.attendance.id,
        memberId: schema.attendance.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        branchId: schema.attendance.branchId,
        branchName: schema.branches.name,
        checkedInAt: schema.attendance.checkedInAt,
        status: schema.attendance.status,
        source: schema.attendance.source,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(whereClause)
      .orderBy(desc(schema.attendance.checkedInAt))
      .limit(limit)
      .offset(offset);

    return {
      records: rows.map((r) => this.mapAttendanceRow(r)),
      total,
    };
  }

  /**
   * Get a member's attendance history (paginated).
   */
  async getMemberAttendance(
    memberId: number,
    page: number,
    limit: number,
  ): Promise<{ records: AttendanceRecord[]; total: number }> {
    return this.listAttendance({ memberId, page, limit });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Get a single attendance record by ID with joins.
   */
  private async getRecordById(recordId: number): Promise<AttendanceRecord> {
    const [row] = await this.db
      .select({
        id: schema.attendance.id,
        memberId: schema.attendance.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        branchId: schema.attendance.branchId,
        branchName: schema.branches.name,
        checkedInAt: schema.attendance.checkedInAt,
        status: schema.attendance.status,
        source: schema.attendance.source,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(eq(schema.attendance.id, recordId));

    if (!row) {
      throw new Error(`Attendance record ${recordId} not found`);
    }

    return this.mapAttendanceRow(row);
  }

  /**
   * Map a raw attendance join row to AttendanceRecord.
   */
  private mapAttendanceRow(row: {
    id: number;
    memberId: number;
    memberFirstName: string | null;
    memberLastName: string | null;
    branchId: number;
    branchName: string;
    checkedInAt: Date;
    status: string;
    source: string;
  }): AttendanceRecord {
    return {
      id: row.id,
      memberId: row.memberId,
      memberName: [row.memberFirstName, row.memberLastName]
        .filter(Boolean)
        .join(" "),
      branchId: row.branchId,
      branchName: row.branchName,
      checkedInAt: row.checkedInAt.toISOString(),
      status: row.status as AttendanceStatus,
      source: row.source as "qr" | "manual",
    };
  }

  /**
   * Count this member's attendance records in the current Mon-Sat calendar week.
   * Uses getWeekRange (UTC-based) to match booking-service week boundaries.
   */
  private async countWeeklyAttendance(memberId: number): Promise<number> {
    const { monday, saturday } = getWeekRange(new Date());

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) >= ${monday}`,
          sql`DATE(${schema.attendance.checkedInAt}) <= ${saturday}`,
        ),
      );

    return Number(result?.count ?? 0);
  }
}
