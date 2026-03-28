/**
 * Attendance API Routes
 *
 * Two route plugins:
 * - attendanceAdminRoutes: Admin endpoint for member attendance history.
 * - attendanceMemberRoutes: Member-facing endpoints for QR check-in
 *   and attendance history.
 */

import { FastifyPluginAsync } from "fastify";
import { AttendanceService } from "./service";
import { PaymentService } from "../payments/service";
import { SubscriptionService } from "../subscriptions/service";
import { AuraService } from "../aura/service";
import { handleServiceError } from "../shared/error-handler";
import {
  memberAttendanceHistorySchema,
  memberCheckInSchema,
  memberHistorySchema,
  forceCheckInSchema,
  slotAttendanceSchema,
  slotCheckInSchema,
  removeCheckInSchema,
} from "./schemas";

import { ATTENDANCE_ROLES } from "../shared/permissions";

// =============================================================================
// Admin Routes (registered at /api/admin/attendance)
// =============================================================================

export const attendanceAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const attendanceService = new AttendanceService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
    auraService,
  );

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ATTENDANCE_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // GET /member/:userId — Member's attendance history (admin view)
  fastify.get<{
    Params: { userId: number };
    Querystring: { page?: number; limit?: number };
  }>(
    "/member/:userId",
    { schema: memberAttendanceHistorySchema },
    async (request) => {
      const { page = 1, limit = 20 } = request.query;
      const result = await attendanceService.getMemberAttendance(
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
  }>("/force", { schema: forceCheckInSchema }, async (request, reply) => {
    try {
      const record = await attendanceService.forceCheckIn(
        request.body,
        request.user.userId,
      );
      return reply.code(201).send(record);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "force check-in");
    }
  });

  // GET /slot/:scheduleId/:date — Slot attendance view
  fastify.get<{
    Params: { scheduleId: number; date: string };
  }>(
    "/slot/:scheduleId/:date",
    { schema: slotAttendanceSchema },
    async (request, reply) => {
      try {
        const result = await attendanceService.getSlotAttendance(
          request.params.scheduleId,
          request.params.date,
        );
        return result;
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
        const result = await attendanceService.coachCheckIn(
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
        const result = await attendanceService.removeCheckIn(
          request.params.attendanceId,
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
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const attendanceService = new AttendanceService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
    auraService,
  );

  /**
   * Guard: require authentication (any role) on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  // POST /check-in — Member QR check-in
  fastify.post<{ Body: { qrToken: string } }>(
    "/check-in",
    { schema: memberCheckInSchema },
    async (request, reply) => {
      try {
        const record = await attendanceService.checkIn(
          request.user.userId,
          request.body.qrToken,
        );
        return reply.code(201).send(record);
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
      const { page = 1, limit = 20 } = request.query;
      const result = await attendanceService.getMemberAttendance(
        request.user.userId,
        page,
        limit,
      );
      return { ...result, page, limit };
    },
  );
};
