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
import { RetentionService } from "./retention-service";
import { AdvancedFinanceService } from "./advanced-finance-service";
import { FunnelService } from "./funnel-service";
import { TicketService } from "./ticket-service";
import { ChurnService } from "./churn-service";
import { RenewalService } from "./renewal-service";
import { LtvService } from "./ltv-service";
import { FrequencyService } from "./frequency-service";
import { TrialFunnelService } from "./trial-funnel-service";
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
  retentionSchema,
  advancedFinanceSchema,
  funnelSchema,
  ticketSchema,
  churnSchema,
  renewalSchema,
  ltvSchema,
  frequencySchema,
  trialFunnelSchema,
} from "./schemas";
import type { FunnelEntryOrigin } from "./types";

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
  const retentionService = new RetentionService(fastify.db, fastify.log);
  const advancedFinanceService = new AdvancedFinanceService(
    fastify.db,
    fastify.log,
  );
  const funnelService = new FunnelService(fastify.db, fastify.log);
  const ticketService = new TicketService(fastify.db, fastify.log);
  const churnService = new ChurnService(fastify.db, fastify.log);
  const renewalService = new RenewalService(fastify.db, fastify.log);
  const ltvService = new LtvService(fastify.db, fastify.log);
  const frequencyService = new FrequencyService(fastify.db, fastify.log);
  const trialFunnelService = new TrialFunnelService(fastify.db, fastify.log);

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

  // GET /retention — retención por cohortes de ciclos de plan (Phase 118
  // D-04/D-05/D-06). SENSIBLE → ADMIN_ROLES-only vía requireAdminAnalytics (D-11);
  // gestion recibe 403. Filtrable por plan (planId). Scoped por sede/país.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      planId?: number;
    };
  }>(
    "/retention",
    {
      schema: retentionSchema,
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
          planId: request.query.planId,
        };
        const result = await retentionService.getRetention(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get retention");
      }
    },
  );

  // GET /advanced-finance — Caja vs Devengado prorrateado + ARPU, por moneda
  // (Phase 118 D-07/D-08). SENSIBLE → ADMIN_ROLES-only vía requireAdminAnalytics
  // (D-11); gestion recibe 403. Scoped por sede/país.
  fastify.get<{
    Querystring: { branchId?: number; dateFrom?: string; dateTo?: string };
  }>(
    "/advanced-finance",
    {
      schema: advancedFinanceSchema,
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
        const result = await advancedFinanceService.getAdvancedFinance(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get advanced finance");
      }
    },
  );

  // GET /ticket — ticket promedio por moneda desde subscriptions.price_paid
  // (Phase 120 Block 6, TICKET-01..04). SENSIBLE → ADMIN_ROLES-only vía
  // requireAdminAnalytics; gestion recibe 403. Scoped por sede/país
  // (financialTransactions.branchId).
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      planId?: number;
    };
  }>(
    "/ticket",
    {
      schema: ticketSchema,
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
          planId: request.query.planId,
        };
        const result = await ticketService.getTicket(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get ticket");
      }
    },
  );

  // GET /churn — churn de no renovación person-based por vencimiento de cohorte
  // (Phase 121 Block 1, CHURN-01..06). SENSIBLE → ADMIN_ROLES-only vía
  // requireAdminAnalytics; gestion recibe 403. Scoped por sede/país
  // (subscriptions.branchId). `window` (ventana de renovación, default 15) se
  // valida y acota en churnSchema (T-121-04) antes de llegar al servicio.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      window?: number;
      planId?: number;
    };
  }>(
    "/churn",
    {
      schema: churnSchema,
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
          window: request.query.window,
          planId: request.query.planId,
        };
        const result = await churnService.getChurn(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get churn");
      }
    },
  );

  // GET /renewal — tasa de renovación person-based sobre la MISMA cohorte de
  // vencimiento que churn (Phase 121 Block 2, RENOV-01..04). SENSIBLE →
  // ADMIN_ROLES-only vía requireAdminAnalytics; gestion recibe 403. Scoped por
  // sede/país (subscriptions.branchId). `window` (ventana de renovación, default
  // 15) se valida y acota en renewalSchema (T-121-08) antes de llegar al servicio.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      window?: number;
      planId?: number;
    };
  }>(
    "/renewal",
    {
      schema: renewalSchema,
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
          window: request.query.window,
          planId: request.query.planId,
        };
        const result = await renewalService.getRenewal(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get renewal");
      }
    },
  );

  // GET /ltv — LTV / vida del cliente, chained onto the SAME matured expiry cohort as
  // churn (Phase 122 Block 5, LTV-01..05). Headline = 1 ÷ churn (reusing ChurnService),
  // robust Kaplan-Meier survival median (active lives censored), monetary LTV from REAL
  // payments (projected + observed, never list price), all per-currency + opened by
  // branch/country/plan. SENSIBLE → ADMIN_ROLES-only vía requireAdminAnalytics; gestion
  // recibe 403. Scoped por sede/país (subscriptions.branchId cohort, users.branchId
  // money). `window` (ventana de renovación, default 15) se valida y acota en ltvSchema
  // (T-122-04) antes de llegar al servicio.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      window?: number;
      planId?: number;
    };
  }>(
    "/ltv",
    {
      schema: ltvSchema,
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
          window: request.query.window,
          planId: request.query.planId,
        };
        const result = await ltvService.getLtv(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get ltv");
      }
    },
  );

  // GET /funnel — funnel de conversión freemium → prueba → activo por cohorte
  // (Phase 118 D-01/D-03). SENSIBLE → ADMIN_ROLES-only vía requireAdminAnalytics
  // (D-11); gestion recibe 403. Scoped por sede/país (users.branchId).
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      entryOrigin?: FunnelEntryOrigin;
    };
  }>(
    "/funnel",
    {
      schema: funnelSchema,
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
          entryOrigin: request.query.entryOrigin,
        };
        const result = await funnelService.getFunnel(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get funnel");
      }
    },
  );

  // GET /frequency — frecuencia de asistencia por miembro (Phase 123 Block 4,
  // FREQ-01..04). Visits/week sobre las últimas 4 semanas rodantes (normalizado
  // para <4 sem), distribución por bandas (incl. activos con 0 visitas →
  // Inactivo), lista "enfriándose" (bajó ≥1 banda) con % de variación, adopción
  // de check-in por sede reutilizada (D-123-06), y breakdowns por
  // sucursal/país/duración/plan. SENSIBLE → ADMIN_ROLES-only vía
  // requireAdminAnalytics; gestion recibe 403 (D-123-14). Scoped por sede/país
  // (attendance.branchId / subscriptions.branchId). Sin `window`.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
    };
  }>(
    "/frequency",
    {
      schema: frequencySchema,
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
        const result = await frequencyService.getFrequency(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get frequency");
      }
    },
  );

  // GET /trial-funnel — funnel de sesiones de prueba reservó→asistió→compró
  // (Phase 123 Block 3, FUNNEL-01..05). Cohorte de leads NUEVOS (sin sub paga
  // previa) anclada por la fecha de la sesión agendada; asistió desde
  // bookings.status (D-123-07); compró = primera sub paga dentro de la ventana de
  // atribución (~21d, configurable vía `window`) que madura sola; tasas con
  // metricShape; breakdowns por sucursal/país/turno/plan-comprado. SENSIBLE →
  // ADMIN_ROLES-only vía requireAdminAnalytics; gestion recibe 403 (D-123-14).
  // Scoped por sede/país (schedules.branchId). `window` (ventana de atribución)
  // se valida y acota en trialFunnelSchema (T-123-08) antes de llegar al servicio.
  fastify.get<{
    Querystring: {
      branchId?: number;
      dateFrom?: string;
      dateTo?: string;
      window?: number;
    };
  }>(
    "/trial-funnel",
    {
      schema: trialFunnelSchema,
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
          window: request.query.window,
        };
        const result = await trialFunnelService.getTrialFunnel(filters);
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get trial funnel");
      }
    },
  );
};
