/**
 * Attendance Service
 *
 * Business logic for QR token validation, member check-in
 * (with subscription/overdue/branch/class-tracking enforcement),
 * force check-in override, and attendance queries.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import { getWeekRange } from "../shared/date-utils";
import { validateQrToken } from "../shared/qr-token";
import { PaymentService } from "../payments/service";
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
    private paymentService: PaymentService,
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

    // Check subscription (auto-expire catches expired subs, returns null = hard block)
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
    if (!subscription) {
      throw new BadRequestError("No tenes una suscripcion activa");
    }

    // Overdue check: block if subscription has no payment recorded
    const isPaid = await this.paymentService.isSubscriptionPaid(
      subscription.id,
    );
    if (!isPaid) {
      throw new BadRequestError(
        "Tu suscripcion tiene un pago pendiente. Acercate a recepcion para regularizar.",
      );
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

    // One check-in per day + insert in transaction to prevent double attendance
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Find today's bookings before the transaction (read-only, no race concern)
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const windowMinutes = 20;

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
      const [h, m] = b.startTime.split(":").map(Number);
      const classMinutes = h * 60 + m;
      return Math.abs(nowMinutes - classMinutes) <= windowMinutes;
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
      // Re-check one-per-day inside transaction
      const [existingToday] = await tx
        .select({ id: schema.attendance.id })
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.memberId, memberId),
            sql`DATE(${schema.attendance.checkedInAt}) = ${todayStr}`,
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

    // One check-in per day guard
    const [existingToday] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) = ${date}`,
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
      const isPaid = await this.paymentService.isSubscriptionPaid(
        subscription.id,
      );
      if (!isPaid) {
        warnings.push("Pago pendiente");
      }
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

    // If member has a booking for this slot+date, update it to confirmado
    const [booking] = await this.db
      .select({ id: schema.bookings.id })
      .from(schema.bookings)
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          eq(schema.bookings.scheduleId, scheduleId),
          eq(schema.bookings.bookingDate, date),
          sql`${schema.bookings.status} IN ('reservado', 'qr_escaneado')`,
        ),
      )
      .limit(1);

    if (booking) {
      await this.db
        .update(schema.bookings)
        .set({ status: "confirmado" })
        .where(eq(schema.bookings.id, booking.id));
    }

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

    // Revert booking status if applicable
    if (attRecord.scheduleId) {
      const dateStr =
        attRecord.checkedInAt instanceof Date
          ? attRecord.checkedInAt.toISOString().split("T")[0]
          : String(attRecord.checkedInAt).split("T")[0];

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

    this.log.info(
      { attendanceId, memberId: attRecord.memberId },
      "Check-in removed (coach undo)",
    );

    return { removed: true };
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
