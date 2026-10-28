// Módulo: marketing — rutas de los reportes de atribución (fase 195, plan 10).
//
//   GET /api/admin/reports/attribution                → embudo por canal/campaña/sede
//                                                        + estado de las integraciones
//   GET /api/admin/reports/attribution/search-console → último período de Search Console
//
// Solo owner/admin (`ADMIN_ROLES`): el embudo trae facturación y gasto
// publicitario. El alcance de sede y de país sigue el patrón de
// `modules/reports/routes.ts` (`requireBranchAccess` + `enforceBranchScope` +
// `attachCountryScope`); el tenant sale SIEMPRE de `request.scope`.
import type { FastifyPluginAsync } from "fastify";
import { handleServiceError } from "../shared/error-handler";
import { ADMIN_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import {
  enforceBranchScope,
  requireBranchAccess,
} from "../shared/branch-access";
import { AttributionReportService } from "./report-service";
import { getMeasurementIntegrations } from "./integrations-status";
import {
  attributionReportSchema,
  searchConsoleReportSchema,
} from "./report-schemas";

interface FunnelQuery {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  country?: "AR" | "ES";
}

export const attributionReportRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new AttributionReportService(fastify.db, fastify.log);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.get<{ Querystring: FunnelQuery }>(
    "/",
    {
      schema: attributionReportSchema,
      preHandler: [
        requireBranchAccess({ from: "query.branchId", optional: true }),
        enforceBranchScope({ from: "query.branchId" }),
      ],
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "reports.attribution");
        const { dateFrom, dateTo, branchId, country } = request.query;
        if (dateFrom > dateTo) {
          return reply.code(400).send({
            error: "Rango inválido",
            message: "dateFrom no puede ser posterior a dateTo",
          });
        }
        const funnel = await service.getFunnel(ctx, {
          dateFrom,
          dateTo,
          branchId,
          // Owner: ve todos los países salvo que pida uno (?country=). Admin:
          // CERRADO a su país, el query se ignora (mismo criterio que finance).
          country: request.scope.isOwner
            ? country
            : (request.scope.country ?? undefined),
        });
        // Estado de las integraciones de medición (config de la API, igual
        // para todos los gimnasios): solo booleanos y nombres de secrets.
        return { ...funnel, integrations: getMeasurementIntegrations() };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get attribution report");
      }
    },
  );

  fastify.get(
    "/search-console",
    { schema: searchConsoleReportSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(
          request.scope,
          "reports.attribution-search-console",
        );
        return await service.getSearchConsole(ctx);
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get attribution search console report",
        );
      }
    },
  );
};
