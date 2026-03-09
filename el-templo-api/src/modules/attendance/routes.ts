/**
 * Attendance API Routes
 *
 * Two route plugins:
 * - attendanceAdminRoutes: Admin/coach endpoints for QR generation,
 *   batch confirmation, manual check-in, and attendance queries.
 * - attendanceMemberRoutes: Member-facing endpoints for QR check-in
 *   and attendance history.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AttendanceService, BadRequestError, NotFoundError } from "./service";
import type { AttendanceStatus } from "./types";
import {
  generateQrSchema,
  todayAttendanceSchema,
  batchConfirmSchema,
  manualCheckInSchema,
  listAttendanceSchema,
  memberAttendanceHistorySchema,
  memberCheckInSchema,
  memberHistorySchema,
} from "./schemas";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

// =============================================================================
// Admin Routes (registered at /api/admin/attendance)
// =============================================================================

export const attendanceAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const attendanceService = new AttendanceService(fastify.db, fastify.log);

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // GET /qr/:branchId — Generate QR token for a branch
  fastify.get<{ Params: { branchId: number } }>(
    "/qr/:branchId",
    { schema: generateQrSchema },
    async (request, reply) => {
      const { branchId } = request.params;

      // Validate branch exists and is not virtual
      const [branch] = await fastify.db
        .select({
          id: schema.branches.id,
          name: schema.branches.name,
          isVirtual: schema.branches.isVirtual,
          isActive: schema.branches.isActive,
        })
        .from(schema.branches)
        .where(eq(schema.branches.id, branchId));

      if (!branch) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Sede no encontrada",
        });
      }

      if (branch.isVirtual) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "No se puede generar QR para una sede virtual",
        });
      }

      const token = attendanceService.generateQrToken(branchId);

      return {
        token,
        branchId: branch.id,
        branchName: branch.name,
      };
    },
  );

  // GET /today?branchId=X — Get today's attendance for batch confirm
  fastify.get<{ Querystring: { branchId: number } }>(
    "/today",
    { schema: todayAttendanceSchema },
    async (request) => {
      const records = await attendanceService.getTodayByBranch(
        request.query.branchId,
      );
      return { records };
    },
  );

  // POST /confirm — Batch confirm attendance
  fastify.post<{ Body: { attendanceIds: number[] } }>(
    "/confirm",
    { schema: batchConfirmSchema },
    async (request) => {
      const confirmed = await attendanceService.batchConfirm(
        request.body.attendanceIds,
      );
      return { confirmed };
    },
  );

  // POST /manual — Manual check-in by coach
  fastify.post<{ Body: { memberId: number; branchId: number } }>(
    "/manual",
    { schema: manualCheckInSchema },
    async (request, reply) => {
      try {
        const record = await attendanceService.manualCheckIn(
          request.body.memberId,
          request.body.branchId,
          request.user.userId,
        );
        return reply.code(201).send(record);
      } catch (err: unknown) {
        if (err instanceof BadRequestError) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: err.message });
        }
        request.log.error({ err }, "Error during manual check-in");
        return reply.code(500).send({
          error: "Server Error",
          message: "Error al registrar asistencia manual",
        });
      }
    },
  );

  // GET / — List attendance with filters
  fastify.get<{
    Querystring: {
      branchId?: number;
      date?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: AttendanceStatus;
      page?: number;
      limit?: number;
    };
  }>("/", { schema: listAttendanceSchema }, async (request) => {
    const {
      branchId,
      date,
      dateFrom,
      dateTo,
      status,
      page = 1,
      limit = 20,
    } = request.query;

    const result = await attendanceService.listAttendance({
      branchId,
      date,
      dateFrom,
      dateTo,
      status,
      page,
      limit,
    });

    return { ...result, page, limit };
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
};

// =============================================================================
// Member Routes (registered at /api/members/attendance)
// =============================================================================

export const attendanceMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const attendanceService = new AttendanceService(fastify.db, fastify.log);

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
        if (err instanceof BadRequestError) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: err.message });
        }
        request.log.error({ err }, "Error during member check-in");
        return reply.code(500).send({
          error: "Server Error",
          message: "Error al registrar asistencia",
        });
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
