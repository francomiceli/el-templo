/**
 * Attendance Service
 *
 * Business logic for QR token generation/validation, member check-in
 * (with subscription/overdue/branch enforcement), coach batch confirmation
 * with AURA awards, manual check-in, and attendance queries.
 */

import { createHmac } from "crypto";
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError, NotFoundError } from "../shared/errors";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import type {
  AttendanceRecord,
  AttendanceListParams,
  AttendanceStatus,
  QrPayload,
} from "./types";

export class AttendanceService {
  private paymentService: PaymentService;
  private subscriptionService: SubscriptionService;
  private auraService: AuraService;

  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {
    this.paymentService = new PaymentService(db, log);
    this.subscriptionService = new SubscriptionService(db, log);
    this.auraService = new AuraService(db);
  }

  // ─── QR Token Methods ──────────────────────────────────────────────────────

  /**
   * Generate an HMAC-SHA256 signed QR token for a branch.
   *
   * Token format: base64url(payload).base64url(signature)
   */
  generateQrToken(branchId: number): string {
    const payload: QrPayload = { branchId, type: "checkin" };
    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr).toString("base64url");

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is required for QR token generation");
    }

    const signature = createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");

    return `${payloadB64}.${signature}`;
  }

  /**
   * Validate an HMAC-SHA256 signed QR token.
   *
   * @returns The decoded payload, or null if invalid.
   */
  validateQrToken(token: string): QrPayload | null {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, providedSignature] = parts;

    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const expectedSignature = createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");

    if (providedSignature !== expectedSignature) return null;

    try {
      const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
      const payload = JSON.parse(payloadStr) as Record<string, unknown>;

      if (typeof payload.branchId !== "number" || payload.type !== "checkin") {
        return null;
      }

      return { branchId: payload.branchId, type: "checkin" };
    } catch {
      return null;
    }
  }

  // ─── Check-in Methods ──────────────────────────────────────────────────────

  /**
   * Member QR check-in.
   *
   * Validates QR token, checks subscription, overdue status, branch enforcement,
   * and one-per-day constraint. Creates attendance record with status "registrado".
   */
  async checkIn(memberId: number, qrToken: string): Promise<AttendanceRecord> {
    // Validate QR token
    const qrPayload = this.validateQrToken(qrToken);
    if (!qrPayload) {
      throw new BadRequestError("Codigo QR invalido");
    }

    const branchId = qrPayload.branchId;

    // Check active subscription
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
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
      .select({ multiBranch: schema.subscriptionPlans.multiBranch })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, subscription.planId));

    if (planRow && !planRow.multiBranch) {
      // Get member's assigned branch
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

    // Check one-per-day
    await this.checkOncePerDay(memberId);

    // Insert attendance record
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId,
      status: "registrado",
      source: "qr",
    });

    const recordId = Number(result[0].insertId);
    return this.getRecordById(recordId);
  }

  /**
   * Manual check-in by coach.
   *
   * Same subscription/overdue/one-per-day checks as QR check-in,
   * but NO branch enforcement (coach override). Auto-confirmed with
   * immediate AURA award.
   */
  async manualCheckIn(
    memberId: number,
    branchId: number,
    coachId: number,
  ): Promise<AttendanceRecord> {
    // Check active subscription
    const subscription =
      await this.subscriptionService.getMemberSubscription(memberId);
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

    // Check one-per-day
    await this.checkOncePerDay(memberId);

    // Insert auto-confirmed attendance record
    const result = await this.db.insert(schema.attendance).values({
      memberId,
      branchId,
      status: "confirmado",
      source: "manual",
      confirmedAt: new Date(),
    });

    const recordId = Number(result[0].insertId);

    // Award AURA immediately
    try {
      await this.auraService.award({
        userId: memberId,
        sourceType: "attendance",
        referenceType: "attendance",
        referenceId: recordId,
      });
    } catch (err: unknown) {
      // Log but don't fail — duplicate award is a graceful skip
      this.log.warn(
        { err, memberId, recordId },
        "AURA award failed during manual check-in",
      );
    }

    this.log.info(
      { memberId, branchId, coachId, recordId },
      "Manual check-in recorded",
    );

    return this.getRecordById(recordId);
  }

  // ─── Batch Confirm ─────────────────────────────────────────────────────────

  /**
   * Batch confirm attendance records. Changes status from "registrado" to
   * "confirmado" and awards AURA per confirmed record.
   *
   * @returns The number of records confirmed.
   */
  async batchConfirm(attendanceIds: number[]): Promise<number> {
    if (attendanceIds.length === 0) return 0;

    // Update all matching records
    const updateResult = await this.db
      .update(schema.attendance)
      .set({
        status: "confirmado",
        confirmedAt: new Date(),
      })
      .where(
        and(
          inArray(schema.attendance.id, attendanceIds),
          eq(schema.attendance.status, "registrado"),
        ),
      );

    const confirmedCount = updateResult[0].affectedRows;

    // Get the confirmed records to award AURA
    if (confirmedCount > 0) {
      const confirmedRecords = await this.db
        .select({
          id: schema.attendance.id,
          memberId: schema.attendance.memberId,
        })
        .from(schema.attendance)
        .where(
          and(
            inArray(schema.attendance.id, attendanceIds),
            eq(schema.attendance.status, "confirmado"),
          ),
        );

      for (const record of confirmedRecords) {
        try {
          await this.auraService.award({
            userId: record.memberId,
            sourceType: "attendance",
            referenceType: "attendance",
            referenceId: record.id,
          });
        } catch (err: unknown) {
          // Duplicate AURA award — skip gracefully
          this.log.warn(
            { err, memberId: record.memberId, attendanceId: record.id },
            "AURA award skipped (likely duplicate)",
          );
        }
      }
    }

    this.log.info(
      { attendanceIds, confirmedCount },
      "Batch attendance confirmed",
    );

    return confirmedCount;
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

  /**
   * Get today's attendance records for a branch (for batch confirm page).
   * No pagination — returns all.
   */
  async getTodayByBranch(branchId: number): Promise<AttendanceRecord[]> {
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
      .where(
        and(
          eq(schema.attendance.branchId, branchId),
          sql`DATE(${schema.attendance.checkedInAt}) = CURDATE()`,
        ),
      )
      .orderBy(desc(schema.attendance.checkedInAt));

    return rows.map((r) => this.mapAttendanceRow(r));
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
}
