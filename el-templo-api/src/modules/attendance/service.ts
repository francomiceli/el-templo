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
import { validateQrToken } from "../shared/qr-token";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import { SettingsService } from "../settings/service";
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
    private settingsService: SettingsService,
  ) {}

  // ─── Check-in Methods ──────────────────────────────────────────────────────

  /**
   * Member QR check-in.
   *
   * Validates QR token, checks subscription (with grace period), overdue status,
   * branch enforcement, fixed-day enforcement, weekly limit, monthly budget,
   * and one-per-day constraint. Creates attendance record and decrements budget.
   */
  async checkIn(memberId: number, qrToken: string): Promise<AttendanceRecord> {
    // Validate QR token
    const qrPayload = validateQrToken(qrToken);
    if (!qrPayload) {
      throw new BadRequestError("Codigo QR invalido");
    }

    const branchId = qrPayload.branchId;

    // Check subscription with grace period support
    const subscription = await this.getSubscriptionWithGracePeriod(memberId);
    if (!subscription) {
      throw new BadRequestError("No tenes una suscripcion activa");
    }

    // Check overdue
    const balance = await this.paymentService.getMemberBalance(memberId);
    if (balance?.isOverdue) {
      throw new BadRequestError(
        "Tu suscripcion tiene un pago pendiente. Acercate a recepcion.",
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

    // Fixed-day check: if subscription has fixedDays, check today's ISO day
    const fixedDays = this.parseFixedDays(subscription.fixedDays);
    if (fixedDays !== null && fixedDays.length > 0) {
      const now = new Date();
      const jsDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon, ..., 7=Sun
      if (!fixedDays.includes(isoDay)) {
        throw new BadRequestError("Hoy no es un dia asignado de tu plan");
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

    // Check one-per-day
    await this.checkOncePerDay(memberId);

    // Find today's booking for this member to link
    const [todayBooking] = await this.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .where(
        and(
          eq(schema.bookings.memberId, memberId),
          sql`${schema.bookings.bookingDate} = CURDATE()`,
          eq(schema.bookings.status, "reservado"),
          eq(schema.schedules.branchId, branchId),
        ),
      )
      .limit(1);

    // Insert attendance record (with scheduleId if booking found)
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId,
      scheduleId: todayBooking?.scheduleId ?? null,
      status: "registrado",
      source: "qr",
    });

    const recordId = Number(result[0].insertId);

    // Decrement classesRemaining if tracked
    if (
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

    // Update booking status to qr_escaneado
    if (todayBooking) {
      await this.db
        .update(schema.bookings)
        .set({ status: "qr_escaneado" })
        .where(eq(schema.bookings.id, todayBooking.id));

      this.log.info(
        { memberId, bookingId: todayBooking.id },
        "Booking linked on QR check-in",
      );
    }

    return this.getRecordById(recordId);
  }

  /**
   * Force check-in by admin/coach.
   *
   * Bypasses all enforcement (subscription, overdue, weekly, monthly,
   * fixed day, grace period). Creates attendance with source="manual".
   * Still decrements classesRemaining to keep budget accurate.
   */
  async forceCheckIn(
    input: ForceCheckInInput,
    adminId: number,
  ): Promise<AttendanceRecord> {
    const { memberId, branchId, reason } = input;

    // Insert attendance record
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId,
      scheduleId: null,
      status: "registrado",
      source: "manual",
    });

    const recordId = Number(result[0].insertId);

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
        confirmedAt: schema.attendance.confirmedAt,
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
   * Check one-per-day constraint. Throws if member already checked in today.
   */
  private async checkOncePerDay(memberId: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) = CURDATE()`,
        ),
      )
      .limit(1);

    if (existing) {
      throw new BadRequestError("Ya registraste asistencia hoy");
    }
  }

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
        confirmedAt: schema.attendance.confirmedAt,
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
    confirmedAt: Date | null;
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
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      status: row.status as AttendanceStatus,
      source: row.source as "qr" | "manual",
    };
  }

  // ─── Grace Period & Enforcement Helpers ───────────────────────────────────

  /**
   * Get the member's subscription, with grace period awareness.
   *
   * The standard getMemberSubscription auto-expires subscriptions past their endDate.
   * This method intercepts before that happens:
   * - If subscription is active and not expired: returns it normally.
   * - If subscription endDate < today but within grace period: returns it (transparent access).
   * - If past grace period and graceCheckInsAfterExpiry === 0: returns it but increments counter (first warning).
   * - If past grace period and graceCheckInsAfterExpiry >= 1: hard block.
   *
   * Returns null when no subscription found (same as getMemberSubscription).
   */
  private async getSubscriptionWithGracePeriod(memberId: number): Promise<{
    id: number;
    planId: number;
    classesRemaining: number | null;
    fixedDays: unknown;
    graceCheckInsAfterExpiry: number;
    endDate: string | null;
  } | null> {
    // Get raw active/paused subscription WITHOUT auto-expire
    const [row] = await this.db
      .select({
        id: schema.subscriptions.id,
        planId: schema.subscriptions.planId,
        status: schema.subscriptions.status,
        endDate: schema.subscriptions.endDate,
        classesRemaining: schema.subscriptions.classesRemaining,
        fixedDays: schema.subscriptions.fixedDays,
        graceCheckInsAfterExpiry: schema.subscriptions.graceCheckInsAfterExpiry,
      })
      .from(schema.subscriptions)
      .where(
        and(
          eq(schema.subscriptions.userId, memberId),
          sql`${schema.subscriptions.status} IN ('active', 'paused')`,
        ),
      )
      .limit(1);

    if (!row) return null;

    // If no end date or subscription not expired, return as-is
    const today = new Date().toISOString().split("T")[0];
    if (!row.endDate || row.endDate >= today) {
      return row;
    }

    // Subscription is expired (endDate < today). Check grace period.
    const gracePeriodDays = await this.settingsService.getGracePeriodDays();

    const endDateObj = new Date(row.endDate + "T12:00:00Z");
    const todayObj = new Date(today + "T12:00:00Z");
    const daysSinceExpiry = Math.floor(
      (todayObj.getTime() - endDateObj.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceExpiry <= gracePeriodDays) {
      // Within grace period: allow silently (transparent)
      return row;
    }

    // Past grace period
    if (row.graceCheckInsAfterExpiry >= 1) {
      // Second+ check-in after grace: hard block
      throw new BadRequestError(
        "Suscripcion vencida — renovar. Consulta con tu coach.",
      );
    }

    // First check-in after grace period: allow but increment counter (warning)
    await this.db
      .update(schema.subscriptions)
      .set({ graceCheckInsAfterExpiry: 1 })
      .where(eq(schema.subscriptions.id, row.id));

    this.log.info(
      { memberId, subscriptionId: row.id, daysSinceExpiry },
      "First post-grace check-in — warning issued to admin",
    );

    return { ...row, graceCheckInsAfterExpiry: 1 };
  }

  /**
   * Count this member's attendance records in the current Mon-Sun calendar week.
   */
  private async countWeeklyAttendance(memberId: number): Promise<number> {
    // Calculate current week boundaries (Mon-Sun)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const mondayStr = monday.toISOString().split("T")[0];
    const sundayStr = sunday.toISOString().split("T")[0];

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) >= ${mondayStr}`,
          sql`DATE(${schema.attendance.checkedInAt}) <= ${sundayStr}`,
        ),
      );

    return Number(result?.count ?? 0);
  }

  /**
   * Parse fixedDays from JSON storage.
   * Returns typed number array or null.
   */
  private parseFixedDays(raw: unknown): number[] | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as number[];
      } catch {
        return null;
      }
    }
    if (Array.isArray(raw)) return raw as number[];
    return null;
  }
}
