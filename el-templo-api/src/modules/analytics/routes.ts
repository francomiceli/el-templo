/**
 * Analytics API Routes
 *
 * Admin-only GET endpoints for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 * All endpoints accept branchId, dateFrom, dateTo query params.
 */

import { FastifyPluginAsync } from "fastify";
import { AnalyticsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import type { AnalyticsFilters } from "./types";
import {
  kpiSchema,
  memberAnalyticsSchema,
  attendanceAnalyticsSchema,
  financialAnalyticsSchema,
} from "./schemas";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  const analyticsService = new AnalyticsService(fastify.db, fastify.log);

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

  // GET / — KPI stats
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>("/", { schema: kpiSchema }, async (request, reply) => {
    try {
      const filters: AnalyticsFilters = {
        branchId: request.query.branchId,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
      };
      const result = await analyticsService.getKpis(filters);
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get KPIs");
    }
  });

  // GET /members — member analytics
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>("/members", { schema: memberAnalyticsSchema }, async (request, reply) => {
    try {
      const filters: AnalyticsFilters = {
        branchId: request.query.branchId,
        dateFrom: request.query.dateFrom,
        dateTo: request.query.dateTo,
      };
      const result = await analyticsService.getMemberAnalytics(filters);
      return result;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get member analytics");
    }
  });

  // GET /attendance — attendance analytics
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/attendance",
    { schema: attendanceAnalyticsSchema },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result = await analyticsService.getAttendanceAnalytics(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get attendance analytics");
      }
    },
  );

  // GET /financial — financial analytics
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/financial",
    { schema: financialAnalyticsSchema },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result = await analyticsService.getFinancialAnalytics(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get financial analytics");
      }
    },
  );
};
