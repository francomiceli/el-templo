/**
 * Attendance API Routes
 *
 * Two route plugins:
 * - attendanceAdminRoutes: Admin endpoint for member attendance history.
 * - attendanceMemberRoutes: Member-facing endpoints for QR check-in
 *   and attendance history.
 */

import { and, eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";
import * as schema from "../../db/schema";
import { AttendanceService } from "./service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { EnrollmentService } from "../programs/enrollment-service";
import { handleServiceError } from "../shared/error-handler";
import { appBranchName } from "../shared/app-branch-name";
import {
  memberAttendanceHistorySchema,
  memberCheckInSchema,
  memberHistorySchema,
  forceCheckInSchema,
  slotAttendanceSchema,
  slotCheckInSchema,
  removeCheckInSchema,
} from "./schemas";

import { ATTENDANCE_ROLES, CHECKIN_ROSTER_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";
import { DEFAULT_TENANT_TIMEZONE } from "../shared/date-utils";
import { AuraGiftService } from "../aura/gift-service";
import { requireBranchAccess } from "../shared/branch-access";
import { isModuleEnabled } from "../shared/module-flags";
import { auraAwardedForReference, earnedAuraForUser } from "../aura/earned";

// =============================================================================
// Admin Routes (registered at /api/admin/attendance)
// =============================================================================

export const attendanceAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  // Fase 215 (D-15): estado del regalo del profe en el panel de asistencia.
  const giftService = new AuraGiftService(fastify);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    undefined,
    enrollmentService,
  );
  const attendanceService = new AttendanceService(
    fastify.db,
    fastify.log,
    subscriptionService,
    auraService,
  );

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   *
   * Phase 110 (Rule 3 — Plan 06 blocker): attach country scope here so
   * requireBranchAccess preHandlers can read request.scope. Module hook
   * order is consistent with finance/reports/analytics/members.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ATTENDANCE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET /member/:userId — Member's attendance history (admin view)
  fastify.get<{
    Params: { userId: number };
    Querystring: { page?: number; limit?: number };
  }>(
    "/member/:userId",
    { schema: memberAttendanceHistorySchema },
    async (request) => {
      const ctx = assertTenant(request.scope, "attendance.memberHistory");
      const { page = 1, limit = 20 } = request.query;
      const result = await attendanceService.getMemberAttendance(
        ctx,
        request.params.userId,
        page,
        limit,
      );
      return { ...result, page, limit };
    },
  );

  // POST /force — Force check-in (admin/coach override, legacy endpoint)
  fastify.post<{
    Body: { memberId: number; branchId: number; reason: string };
  }>(
    "/force",
    {
      schema: forceCheckInSchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "attendance.forceCheckIn");
        const record = await attendanceService.forceCheckIn(
          ctx,
          request.body,
          request.user.userId,
        );
        return reply.code(201).send(record);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "force check-in");
      }
    },
  );

  // GET /slot/:scheduleId/:date — Slot attendance view
  fastify.get<{
    Params: { scheduleId: number; date: string };
  }>(
    "/slot/:scheduleId/:date",
    { schema: slotAttendanceSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "attendance.slotAttendance");
        // El registro del día es dato de salud: sólo coach + admin/dueño lo ven.
        // El resto de ATTENDANCE_ROLES (gestión/recepción) recibe checkIn: null.
        const includeCheckIns = (
          CHECKIN_ROSTER_ROLES as readonly string[]
        ).includes(request.user.role);
        const result = await attendanceService.getSlotAttendance(
          ctx,
          request.params.scheduleId,
          request.params.date,
          { includeCheckIns },
        );

        // Fase 215 (D-15): solo quien da el regalo de profe consulta regalos
        // (profes, admin de sede, admin o con el permiso por persona, ver
        // `aura/coach-gift-givers.ts`). Para el resto del staff
        // `coachGiftAmount` y `gift` van en null.
        let coachGiftAmount: number | null = null;
        let byMember:
          | Awaited<
              ReturnType<typeof giftService.coachGiftStatesForSlot>
            >["byMember"]
          | null = null;
        const giftViewer = {
          userId: request.user.userId,
          scope: request.scope,
        };
        if (await giftService.canGiveCoachGifts(ctx, giftViewer)) {
          const [slot] = await fastify.db
            .select({
              branchId: schema.schedules.branchId,
              timezone: schema.branches.timezone,
            })
            .from(schema.schedules)
            .innerJoin(
              schema.branches,
              and(
                tenantWhere(schema.branches, ctx),
                eq(schema.branches.id, schema.schedules.branchId),
              ),
            )
            .where(
              and(
                tenantWhere(schema.schedules, ctx),
                eq(schema.schedules.id, request.params.scheduleId),
              ),
            )
            .limit(1);
          if (slot) {
            const gifts = await giftService.coachGiftStatesForSlot(
              ctx,
              giftViewer,
              {
                scheduleId: request.params.scheduleId,
                date: request.params.date,
                branchId: slot.branchId,
                timezone: slot.timezone ?? DEFAULT_TENANT_TIMEZONE,
                members: result.members.map((member) => ({
                  memberId: member.memberId,
                  attendanceId: member.attendanceId,
                })),
              },
            );
            coachGiftAmount = gifts.coachGiftAmount;
            byMember = gifts.byMember;
          }
        }

        return {
          ...result,
          coachGiftAmount,
          members: result.members.map((member) => ({
            ...member,
            gift: byMember?.get(member.memberId) ?? null,
          })),
        };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "slot attendance");
      }
    },
  );

  // POST /slot/:scheduleId/:date/check-in — Coach manual check-in from slot
  fastify.post<{
    Params: { scheduleId: number; date: string };
    Body: { memberId: number; reason?: string };
  }>(
    "/slot/:scheduleId/:date/check-in",
    { schema: slotCheckInSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "attendance.coachCheckIn");
        const result = await attendanceService.coachCheckIn(
          ctx,
          request.params.scheduleId,
          request.params.date,
          request.body.memberId,
          request.body.reason,
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "slot check-in");
      }
    },
  );

  // DELETE /:attendanceId — Remove check-in (coach undo)
  fastify.delete<{
    Params: { attendanceId: number };
  }>(
    "/:attendanceId",
    { schema: removeCheckInSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "attendance.removeCheckIn");
        const result = await attendanceService.removeCheckIn(
          request.params.attendanceId,
          ctx,
          request.user.userId,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "remove check-in");
      }
    },
  );
};

// =============================================================================
// Member Routes (registered at /api/members/attendance)
// =============================================================================

export const attendanceMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    undefined,
    enrollmentService,
  );
  const attendanceService = new AttendanceService(
    fastify.db,
    fastify.log,
    subscriptionService,
    auraService,
  );

  /**
   * Guard: require authentication (any role) on all routes in this plugin.
   *
   * Fase 173 (D-02, plan 173-07): `attachCountryScope` resuelve `request.scope`
   * (incluido `tenantId`) para el check-in y el historial propios del socio —
   * sin esto `assertTenant(request.scope, …)` explotaría contra `undefined`.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
  });

  // POST /check-in — Member QR check-in
  fastify.post<{ Body: { qrToken: string } }>(
    "/check-in",
    { schema: memberCheckInSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "attendance.memberCheckIn");
        const record = await attendanceService.checkIn(
          ctx,
          request.user.userId,
          request.body.qrToken,
        );
        // Fase 214 (D-40, D-56): lo que ESTA asistencia acreditó de Aura, leído
        // del ledger y no del rol. Por el tope del día (D-64) puede ser menos
        // de 5. null si no acreditó (p. ej. auto-registro del profe) o el
        // módulo está apagado. El check-in ya quedó registrado: la lectura del
        // Aura nunca lo rompe.
        let auraAwarded: number | null = null;
        let auraTotal: number | null = null;
        try {
          if (
            await isModuleEnabled(
              ctx.tenantId,
              "templo-gamification",
              fastify.db,
            )
          ) {
            const awarded = await auraAwardedForReference(
              fastify.db,
              ctx,
              request.user.userId,
              "attendance",
              "attendance",
              record.id,
            );
            if (awarded > 0) {
              auraAwarded = awarded;
              auraTotal = await earnedAuraForUser(
                fastify.db,
                ctx,
                request.user.userId,
              );
            }
          }
        } catch (auraErr: unknown) {
          auraAwarded = null;
          auraTotal = null;
          request.log.warn(
            { err: auraErr },
            "No se pudo leer el Aura del check-in",
          );
        }
        // Compat app: nombre largo para el regex baked del front (handler
        // member; el service es compartido con force/coach check-in del admin).
        return reply.code(201).send({
          ...record,
          branchName: appBranchName(record.branchName, ctx.tenantId),
          auraAwarded,
          auraTotal,
        });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "member check-in");
      }
    },
  );

  // GET /history — Member's own attendance history
  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    "/history",
    { schema: memberHistorySchema },
    async (request) => {
      const ctx = assertTenant(request.scope, "attendance.memberOwnHistory");
      const { page = 1, limit = 20 } = request.query;
      const result = await attendanceService.getMemberAttendance(
        ctx,
        request.user.userId,
        page,
        limit,
      );
      // Compat app: nombre largo por registro (getMemberAttendance es
      // compartido con el admin -- se transforma solo en este handler member).
      return {
        ...result,
        records: result.records.map((r) => ({
          ...r,
          branchName: appBranchName(r.branchName, ctx.tenantId),
        })),
        page,
        limit,
      };
    },
  );
};
