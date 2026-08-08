/**
 * Attendance Service
 *
 * Business logic for QR token validation, member check-in
 * (with subscription/branch/class-tracking enforcement),
 * force check-in override, and attendance queries.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, sql, desc, inArray, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { BadRequestError } from "../shared/errors";
import {
  getWeekRange,
  todayInTz,
  buildClassDateTime,
  computeSeniority,
  type MemberSeniority,
} from "../shared/date-utils";
import { validateQrToken } from "../shared/qr-token";
import { memberCoveredUntilSql } from "../shared/covered-until";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import {
  milestoneInWindow,
  toUtcDateStr,
} from "../shared/tenure-milestones";
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
  // Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra las 2 lecturas de
  // `users` (rol del escaneador, sede del socio para el chequeo single-branch)
  // y se propaga a `coachSelfScan`, `getRecordById` y `recordPresencialSession`.
  async checkIn(
    ctx: TenantContext,
    memberId: number,
    qrToken: string,
  ): Promise<AttendanceRecord> {
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

    // Coach self-scan branch (D-Q2). A user with role 'coach' uses the member
    // check-in flow to register their OWN attendance, validated against their
    // assigned branch(es) in user_branches. This is operational attendance for
    // the coach — independent of rating attribution (which comes from the
    // weekly roster, D-Q1) — and bypasses ALL member enforcement (subscription,
    // plan multiBranch, weekly limit, monthly budget, matching booking) and AURA
    // (kept off so the coach's AURA balance stays clean). The one-per-day guard
    // still applies.
    const [scanningUser] = await this.db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, memberId)));

    if (scanningUser?.role === "coach") {
      return this.coachSelfScan(ctx, memberId, branchId, tz);
    }

    // Compute tz-aware "today" for the booking lookup + one-per-day math.
    const now = new Date();
    const todayStr = todayInTz(tz, now);

    // Find today's bookings up-front (read-only, no race concern) to resolve
    // `isSpecial` for the activity (schedules → activities), so the subscription
    // routing below (Fase 161, GATE-02) can pick the right sub (pase vs
    // presencial/online) to validate the budget AND decrement. The "no matching
    // booking" error is thrown at its ORIGINAL position (after the
    // subscription/budget/one-per-day checks) so error ordering is preserved.
    const windowMs = 20 * 60 * 1000;

    const bookingsInRange = await this.db
      .select({
        id: schema.bookings.id,
        scheduleId: schema.bookings.scheduleId,
        startTime: schema.schedules.startTime,
        activityName: schema.activities.name,
        isSpecial: schema.activities.isSpecial,
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

    // Route consumption to the sub matching the activity's category. When there
    // is no matching booking (yet), default to a regular (non-especial) activity;
    // the hard "no booking" block below still rejects the check-in.
    const isSpecialActivity = matchingBooking?.isSpecial ?? false;

    // Check subscription for this activity's category (auto-expire catches
    // expired subs, returns null = hard block).
    const subscription =
      await this.subscriptionService.pickSubscriptionForActivity(
        memberId,
        isSpecialActivity,
      );
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
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, memberId)),
        );

      if (memberRow && memberRow.branchId !== branchId) {
        throw new BadRequestError(
          "Tu plan solo permite asistir a tu sede asignada",
        );
      }
    }

    // Weekly limit check: count attendance this Mon-Sun week. Las ESPECIALES
    // (pase Aura) quedan fuera en ambos sentidos — no gastan el cupo semanal
    // del plan regular ni se les aplica ese límite (su presupuesto es el del
    // pase) — espejo del criterio de fase 161 en BookingService.
    if (
      !isSpecialActivity &&
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

    // One check-in per day, per activity category (fast-path guard;
    // authoritative check inside transaction). Una asistencia a una ESPECIAL
    // (pase Aura) no bloquea el check-in de la clase regular del mismo día ni
    // al revés: solo cuentan asistencias del mismo tipo. Asistencias sin
    // schedule (force check-in, self-scan, wellhub) cuentan como regulares.
    const [alreadyCheckedIn] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .leftJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .leftJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) = ${todayStr}`,
          sql`COALESCE(${schema.activities.isSpecial}, false) = ${isSpecialActivity}`,
        ),
      )
      .limit(1);

    if (alreadyCheckedIn) {
      throw new BadRequestError("Ya registraste asistencia hoy");
    }

    // Require a matching booking for today at this branch (original error position).
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
      // Igual que el fast-path: la regla diaria es por categoría de
      // actividad (especial vs regular).
      const [existingToday] = await tx
        .select({ id: schema.attendance.id })
        .from(schema.attendance)
        .leftJoin(
          schema.schedules,
          eq(schema.schedules.id, schema.attendance.scheduleId),
        )
        .leftJoin(
          schema.activities,
          eq(schema.activities.id, schema.schedules.activityId),
        )
        .where(
          and(
            eq(schema.attendance.memberId, memberId),
            eq(schema.attendance.sessionDate, todayStr),
            sql`COALESCE(${schema.activities.isSpecial}, false) = ${isSpecialActivity}`,
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
    await this.recordPresencialSession(ctx, {
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

    return this.getRecordById(ctx, recordId);
  }

  /**
   * Coach QR self-scan (D-Q2).
   *
   * Records the coach's OWN attendance after validating that the QR's branch is
   * one the coach is assigned to (user_branches). Skips ALL member enforcement
   * (subscription/plan/budget/booking) and awards NO AURA — this is operational
   * attendance for the coach, not member-program credit. Independent of rating
   * attribution (the roster owns that, D-Q1): does NOT touch coach_ratings or
   * class_coach_assignments. Keeps the one-per-day guard.
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra `user_branches` — es
   * una de las dos anclas que ADO-07 protege.
   */
  private async coachSelfScan(
    ctx: TenantContext,
    coachId: number,
    branchId: number,
    tz: string,
  ): Promise<AttendanceRecord> {
    // Validate the coach is assigned to the QR's branch (T-143-10:
    // elevation-of-privilege — a coach must not self-scan in a branch they are
    // not assigned to).
    const [assignment] = await this.db
      .select({ id: schema.userBranches.id })
      .from(schema.userBranches)
      .where(
        and(
          tenantWhere(schema.userBranches, ctx),
          eq(schema.userBranches.userId, coachId),
          eq(schema.userBranches.branchId, branchId),
        ),
      )
      .limit(1);

    if (!assignment) {
      throw new BadRequestError("No estas asignado a esta sede");
    }

    const now = new Date();
    const todayStr = todayInTz(tz, now);

    // One-per-day guard (T-143-12). Compare against sessionDate (logical class
    // date), consistent with the member path's authoritative check.
    const recordId = await this.db.transaction(async (tx) => {
      const [existingToday] = await tx
        .select({ id: schema.attendance.id })
        .from(schema.attendance)
        .where(
          and(
            eq(schema.attendance.memberId, coachId),
            eq(schema.attendance.sessionDate, todayStr),
          ),
        )
        .limit(1);

      if (existingToday) {
        throw new BadRequestError("Ya registraste asistencia hoy");
      }

      const result = await tx.insert(schema.attendance).values({
        memberId: coachId,
        branchId,
        sessionDate: todayStr,
        status: "confirmado",
        source: "qr",
        checkedInAt: now,
      });

      return Number(result[0].insertId);
    });

    this.log.info(
      { coachId, branchId, sessionDate: todayStr },
      "Coach QR self-scan recorded",
    );

    return this.getRecordById(ctx, recordId);
  }

  /**
   * Force check-in by admin/coach.
   *
   * Bypasses all enforcement (subscription, overdue, weekly, monthly).
   * Creates attendance with source="manual" and status="confirmado".
   * Awards 10 AURA immediately. Still decrements classesRemaining to keep budget accurate.
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, se propaga a
   * `recordPresencialSession` y `getRecordById` (no hay lectura propia de
   * `users` en este método).
   */
  async forceCheckIn(
    ctx: TenantContext,
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

    // Still decrement classesRemaining if applicable.
    // Fase 161 (GATE-02): forceCheckIn no tiene contexto de actividad
    // (scheduleId null), así que rutea a la sub NO-especial (presencial/online),
    // preservando el comportamiento previo (pick(false) ≡ el singular para
    // socios sin pase).
    const subscription =
      await this.subscriptionService.pickSubscriptionForActivity(
        memberId,
        false,
      );
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
    await this.recordPresencialSession(ctx, {
      memberId,
      branchId,
      checkedInAt: new Date(),
      dateStr: todayStr,
    });

    this.log.info(
      { memberId, branchId, reason, adminId, attendanceId: recordId },
      "Force check-in recorded",
    );

    return this.getRecordById(ctx, recordId);
  }

  // ─── Slot Attendance Methods ──────────────────────────────────────────────

  /**
   * Get attendance for a specific schedule slot on a given date.
   * Returns members with booking + attendance status, including walk-in QR scans.
   *
   * Fase 173 (D-02): `ctx` es el PRIMER parámetro y llega desde
   * `assertTenant(request.scope, "attendance.slotAttendance")`. Solo scopea
   * la lectura de `subscriptions` que hace `memberCoveredUntilSql` — el resto
   * de las tablas de este método (`bookings`, `attendance`, `users`,
   * `member_profiles`, …) se migra en su propia fase (D-02, plan 173-14).
   */
  async getSlotAttendance(
    ctx: TenantContext,
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
      segment: string | null;
      // Phase 136 D-05/D-06: tenure label computed on the fly from
      // users.createdAt — surfaced only in Horarios. Null when createdAt
      // is missing (defensive).
      seniority: MemberSeniority | null;
      // Active/paused subscription end date (YYYY-MM-DD) for the Vencimiento
      // countdown pill. Null when no active/paused subscription.
      endDate: string | null;
      // Aniversario de permanencia: frase lista para mostrar ("Cumple 1 año en
      // El Templo") cuando el alumno cruza un hito entre su clase anterior y
      // ésta. Null si no cae ningún hito en la ventana. Ver tenure-milestones.
      anniversaryLabel: string | null;
    }>;
  }> {
    // Fecha de cobertura para el pill "Venc" (bug Joaquim Mas 2026-07-07).
    // Implementación única compartida — ver shared/covered-until.ts.
    const endDateExpr = memberCoveredUntilSql(ctx);

    // Get all bookings for this slot+date
    const bookingRows = await this.db
      .select({
        bookingId: schema.bookings.id,
        memberId: schema.bookings.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        bookingStatus: schema.bookings.status,
        segment: schema.memberProfiles.segment,
        createdAt: schema.users.createdAt,
        endDate: endDateExpr,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.bookings.memberId),
        ),
      )
      .leftJoin(
        schema.memberProfiles,
        and(
          tenantWhere(schema.memberProfiles, ctx),
          eq(schema.memberProfiles.userId, schema.bookings.memberId),
        ),
      )
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
        segment: schema.memberProfiles.segment,
        createdAt: schema.users.createdAt,
        endDate: endDateExpr,
      })
      .from(schema.attendance)
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.attendance.memberId),
        ),
      )
      .leftJoin(
        schema.memberProfiles,
        and(
          tenantWhere(schema.memberProfiles, ctx),
          eq(schema.memberProfiles.userId, schema.attendance.memberId),
        ),
      )
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
        segment: string | null;
        seniority: MemberSeniority | null;
        endDate: string | null;
        anniversaryLabel: string | null;
      }
    >();

    // createdAt por miembro, para calcular el aniversario luego de conocer su
    // asistencia previa (no se expone en el resultado).
    const createdAtByMember = new Map<number, Date | string | null>();

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
        segment: b.segment ?? null,
        seniority: computeSeniority(b.createdAt),
        endDate: b.endDate ?? null,
        anniversaryLabel: null,
      });
      createdAtByMember.set(b.memberId, b.createdAt);
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
          segment: a.segment ?? null,
          seniority: computeSeniority(a.createdAt),
          endDate: a.endDate ?? null,
          anniversaryLabel: null,
        });
      }
      createdAtByMember.set(a.memberId, a.createdAt);
    }

    // ─── Aniversario de permanencia (Fase aniversarios) ─────────────────────
    // La línea "Cumple X en El Templo" aparece cuando un hito cae en la ventana
    // entre la clase ANTERIOR del alumno (exclusiva) y ésta (inclusiva). Así se
    // muestra el día justo, o en la próxima clase si el día exacto cayó en
    // falta, y exactamente una vez. La ventana arranca en createdAt cuando no
    // hay asistencia previa registrada.
    const memberIds = Array.from(memberMap.keys());
    if (memberIds.length > 0) {
      const prevRows = await this.db
        .select({
          memberId: schema.attendance.memberId,
          lastDate: sql<string>`MAX(${schema.attendance.sessionDate})`,
        })
        .from(schema.attendance)
        .where(
          and(
            inArray(schema.attendance.memberId, memberIds),
            lt(schema.attendance.sessionDate, date),
          ),
        )
        .groupBy(schema.attendance.memberId);
      const prevByMember = new Map(prevRows.map((r) => [r.memberId, r.lastDate]));

      for (const [memberId, entry] of memberMap) {
        const createdAt = createdAtByMember.get(memberId);
        const createdStr = toUtcDateStr(createdAt);
        if (createdStr === null) continue;
        const windowStart = prevByMember.get(memberId) ?? createdStr;
        const milestone = milestoneInWindow(createdAt, windowStart, date);
        if (milestone !== null) {
          entry.anniversaryLabel = `Cumple ${milestone.label} en El Templo`;
        }
      }
    }

    return { members: Array.from(memberMap.values()) };
  }

  /**
   * Coach manual check-in from a schedule slot.
   * Validates membership and returns subscription status warnings alongside
   * the created attendance record. Always allows check-in (coach override).
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, se propaga a
   * `recordPresencialSession` y `getRecordById` (no hay lectura propia de
   * `users` en este método).
   */
  async coachCheckIn(
    ctx: TenantContext,
    scheduleId: number,
    date: string,
    memberId: number,
    reason?: string,
  ): Promise<{
    attendance: AttendanceRecord;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    // Get schedule to find branchId + resolve whether the activity is special
    // (Fase 161, GATE-02: rutea el consumo al pase vs presencial/online).
    const [schedule] = await this.db
      .select({
        branchId: schema.schedules.branchId,
        isSpecial: schema.activities.isSpecial,
      })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(eq(schema.schedules.id, scheduleId));

    if (!schedule) {
      throw new BadRequestError("Horario no encontrado");
    }

    // One check-in per day guard, per activity category: una asistencia a una
    // ESPECIAL (pase Aura) no bloquea la de la clase regular del mismo día ni
    // al revés. Asistencias sin schedule cuentan como regulares.
    // Compare against sessionDate (the logical class date), NOT
    // DATE(checkedInAt) which is the INSERT timestamp in server TZ.
    // Retroactive coach check-ins write session_date to the past while
    // checked_in_at lands today, so DATE(checkedInAt) generates false
    // positives that block legitimate check-ins on other dates.
    const [existingToday] = await this.db
      .select({ id: schema.attendance.id })
      .from(schema.attendance)
      .leftJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .leftJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          eq(schema.attendance.sessionDate, date),
          sql`COALESCE(${schema.activities.isSpecial}, false) = ${schedule.isSpecial}`,
        ),
      )
      .limit(1);

    if (existingToday) {
      throw new BadRequestError(
        "El miembro ya tiene asistencia registrada en esta fecha",
      );
    }

    // Check subscription status for warnings (don't block).
    // Fase 161 (GATE-02): rutea a la sub del pase si la actividad es especial.
    const subscription =
      await this.subscriptionService.pickSubscriptionForActivity(
        memberId,
        schedule.isSpecial,
      );
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
    await this.recordPresencialSession(ctx, {
      memberId,
      branchId: schedule.branchId,
      checkedInAt: new Date(),
      dateStr: date,
    });

    this.log.info(
      { memberId, scheduleId, date, recordId, warnings },
      "Coach check-in recorded",
    );

    const record = await this.getRecordById(ctx, recordId);
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

    // Restore classesRemaining +1.
    // Fase 161 (GATE-02): restaurar la clase a la sub correcta según si la
    // actividad era especial. scheduleId null (force check-in) → regular.
    const isSpecialActivity = await this.isSpecialSchedule(
      attRecord.scheduleId,
    );
    const subscription =
      await this.subscriptionService.pickSubscriptionForActivity(
        attRecord.memberId,
        isSpecialActivity,
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
   * Fase 161 (GATE-02): resuelve si la actividad de un scheduleId es especial
   * (activities.is_special) para rutear el consumo a la sub correcta. Devuelve
   * false si scheduleId es null o el horario no existe (defensivo: regular).
   */
  private async isSpecialSchedule(scheduleId: number | null): Promise<boolean> {
    if (scheduleId === null) return false;
    const [row] = await this.db
      .select({ isSpecial: schema.activities.isSpecial })
      .from(schema.schedules)
      .innerJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(eq(schema.schedules.id, scheduleId))
      .limit(1);
    return row?.isSpecial ?? false;
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
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra la lectura de `users`.
   */
  private async recordPresencialSession(
    ctx: TenantContext,
    input: {
      memberId: number;
      branchId: number;
      checkedInAt: Date;
      dateStr: string;
    },
  ): Promise<void> {
    try {
      const [user] = await this.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, input.memberId)),
        );
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
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
   */
  async listAttendance(
    ctx: TenantContext,
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
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.attendance.memberId),
        ),
      )
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
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, se propaga a `listAttendance`.
   */
  async getMemberAttendance(
    ctx: TenantContext,
    memberId: number,
    page: number,
    limit: number,
  ): Promise<{ records: AttendanceRecord[]; total: number }> {
    return this.listAttendance(ctx, { memberId, page, limit });
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Get a single attendance record by ID with joins.
   *
   * Fase 173 (D-02, plan 173-07): `ctx` PRIMERO, filtra el join a `users`.
   */
  private async getRecordById(
    ctx: TenantContext,
    recordId: number,
  ): Promise<AttendanceRecord> {
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
      .innerJoin(
        schema.users,
        and(
          tenantWhere(schema.users, ctx),
          eq(schema.users.id, schema.attendance.memberId),
        ),
      )
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

    // Solo asistencias a actividades regulares: las especiales (pase Aura)
    // no consumen el cupo semanal del plan (espejo de countWeeklyBookings).
    // Asistencias sin schedule cuentan como regulares.
    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .leftJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.attendance.scheduleId),
      )
      .leftJoin(
        schema.activities,
        eq(schema.activities.id, schema.schedules.activityId),
      )
      .where(
        and(
          eq(schema.attendance.memberId, memberId),
          sql`DATE(${schema.attendance.checkedInAt}) >= ${monday}`,
          sql`DATE(${schema.attendance.checkedInAt}) <= ${saturday}`,
          sql`COALESCE(${schema.activities.isSpecial}, false) = false`,
        ),
      );

    return Number(result?.count ?? 0);
  }
}
