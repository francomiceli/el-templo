/**
 * Analytics API Routes
 *
 * Admin-only GET endpoints for KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 * All endpoints accept branchId, dateFrom, dateTo query params.
 */

import { FastifyPluginAsync } from "fastify";
import { AnalyticsService } from "./service";
import { AttendanceMetricsService } from "./attendance-metrics-service";
import { EngagementService } from "./engagement-service";
import { handleServiceError } from "../shared/error-handler";
import type { AnalyticsFilters } from "./types";
import {
  kpiSchema,
  memberAnalyticsSchema,
  attendanceAnalyticsSchema,
  financialAnalyticsSchema,
  uniqueMembersSchema,
  checkInAdoptionSchema,
  engagementSchema,
} from "./schemas";

import {
  ADMIN_ROLES,
  ANALYTICS_OPERATIONAL_ROLES,
} from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Per-route guard for the admin-only analytics endpoints (KPI, members,
 * financial). The plugin-wide onRequest hook only gates access to the
 * operational set (gestion + admin + owner); these routes additionally
 * require ADMIN_ROLES so gestion cannot reach financial/member analytics.
 */
const requireAdminAnalytics = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
    return reply.code(403).send({
      error: "Acceso denegado",
      message: "Acceso de administrador requerido",
    });
  }
};

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  const analyticsService = new AnalyticsService(fastify.db, fastify.log);
  const attendanceMetricsService = new AttendanceMetricsService(
    fastify.db,
    fastify.log,
  );
  const engagementService = new EngagementService(fastify.db, fastify.log);

  /**
   * Guard: authenticate + gate to the operational analytics set (gestion +
   * admin + owner) and attach country scope. Admin-only endpoints (KPI,
   * members, financial) layer `requireAdminAnalytics` on top via preHandler.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(ANALYTICS_OPERATIONAL_ROLES as readonly string[]).includes(
        request.user.role,
      )
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET / — KPI stats
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/",
    {
      schema: kpiSchema,
      preHandler: [
        requireAdminAnalytics,
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result = await analyticsService.getKpis(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get KPIs");
      }
    },
  );

  // GET /members — member analytics
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/members",
    {
      schema: memberAnalyticsSchema,
      preHandler: [
        requireAdminAnalytics,
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result = await analyticsService.getMemberAnalytics(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get member analytics");
      }
    },
  );

  // GET /attendance — attendance analytics
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/attendance",
    {
      schema: attendanceAnalyticsSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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
    {
      schema: financialAnalyticsSchema,
      preHandler: [
        requireAdminAnalytics,
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
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

  // GET /attendance/unique-members — únicos 7/14/30 (Phase 117 D-11)
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/attendance/unique-members",
    {
      schema: uniqueMembersSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result = await attendanceMetricsService.uniqueMembers(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get unique members");
      }
    },
  );

  // GET /attendance/checkin-adoption — ratio de check-in por sede (Phase 117 D-13)
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/attendance/checkin-adoption",
    {
      schema: checkInAdoptionSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const result =
          await attendanceMetricsService.checkInAdoptionByBranch(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get check-in adoption");
      }
    },
  );

  // GET /engagement — conteo de activos por segmento + worklist en_riesgo/ghost
  // (Phase 117 D-12). Reutiliza segmentation (member_profiles.segment), no
  // recalcula. PII (phone) gated por el onRequest hook (ANALYTICS_OPERATIONAL_ROLES:
  // gestion contacta a los socios en riesgo) + scope por sede/país.
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/engagement",
    {
      schema: engagementSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
      ],
    },
    async (request, reply) => {
      try {
        const filters: AnalyticsFilters = {
          branchId: request.query.branchId,
          country: request.scope.country ?? undefined,
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
        };
        const [counts, nominalList] = await Promise.all([
          engagementService.countActiveBySegment(filters),
          engagementService.getEngagementNominalList(filters),
        ]);
        return { counts, nominalList };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get engagement");
      }
    },
  );
};
