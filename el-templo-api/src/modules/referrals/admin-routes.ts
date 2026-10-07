/**
 * Referrals — admin routes (v5.5 follow-up, A/B copy test).
 *
 * Registrado en /api/admin/referrals. Superficie de LECTURA agregada (no
 * per-miembro; eso vive en /api/admin/members/:id/referrals) para el tab
 * "Referidos A/B" de Analíticas.
 *
 * Acceso: gestion/admin/owner (`REFERRAL_PROGRAM_REPORT_ROLES`). Coach, recepción,
 * admin_sede y los tokens de socio reciben 403.
 *
 * Fase 194-20: el plugin suma dos rutas del programa de Invitaciones, con el
 * MISMO gate (son agregados de todo el gimnasio, sin dimensión de sede, así que
 * `admin_sede` queda afuera):
 *   - GET /invitations/report  KPIs D-19 por mes de cohorte y moneda.
 *   - GET /invitations         bandeja de leads de invitación (D-18), con teléfono.
 *
 * Tenancy (T-175.1, decisión de Franco 2026-08-18): los números se ACOTAN al
 * gimnasio del request vía `assertTenant(request.scope, ...)`. Cada gimnasio ve
 * solo sus propias variantes — ya NO es una superficie cross-tenant global.
 */

import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { ReferralService } from "./service";
import { InvitationReportService } from "./invitation-report";
import { InvitationLeadList } from "./invitation-lead-list";
import {
  invitationLeadsQuerySchema,
  invitationReportQuerySchema,
  type InvitationLeadsQuery,
  type InvitationReportQuery,
} from "./invitation-schemas";
import { REFERRAL_PROGRAM_REPORT_ROLES } from "../shared/permissions";
import { ForbiddenError } from "../shared/errors";
import { assertTenant } from "../shared/tenant";
import { attachCountryScope, type CountryCode } from "../shared/country-scope";

/**
 * País al que se acota un reporte/listado de Invitaciones (Fase 194-20). El
 * owner ve todo el gimnasio (los montos ya salen separados por moneda); admin y
 * gestión solo ven las sedes de SU país, como en el resto de los reportes
 * (`request.scope.country`). Un admin/gestión sin país cargado es dato corrupto:
 * falla cerrado (403) en vez de ver los dos países.
 */
function countryScopeOf(request: FastifyRequest): CountryCode | undefined {
  if (request.scope.isOwner) return undefined;
  if (request.scope.country === null) {
    throw new ForbiddenError("Tu usuario no tiene un país asignado");
  }
  return request.scope.country;
}

export const referralAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  // Guard: autenticar + gate a REFERRAL_PROGRAM_REPORT_ROLES (gestion+admin+owner).
  // 2026-09-09: el gate se angostó acá mismo (antes usaba
  // ANALYTICS_OPERATIONAL_ROLES, que incluía `admin_sede`) porque el agregado es
  // de TODO el gimnasio, sin dimensión de sede, y ese rol solo debe ver la suya.
  // Fase 194-20: las rutas de Invitaciones tienen exactamente la misma necesidad,
  // así que heredan el gate sin ensancharlo. Coach y recepción quedan afuera (403).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(REFERRAL_PROGRAM_REPORT_ROLES as readonly string[]).includes(
        request.user.role,
      )
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés acceso a los reportes del programa de invitaciones",
      });
    }
    // T-175.1: resuelve `request.scope` (gimnasio del request) para que
    // `assertTenant` en el handler pueda acotar los números por tenant. Sin
    // esto, `request.scope` queda undefined y el handler tira 500. Mismo patrón
    // que el onRequest de analytics/routes.ts.
    await attachCountryScope(request, fastify.db);
  });

  // GET /api/admin/referrals/ab-results — números por variante (expuestos,
  // clics únicos, referidos creados/cualificados + tasas) del gimnasio.
  fastify.get("/ab-results", async (request) => {
    const ctx = assertTenant(request.scope, "referrals.ab-results");
    return service.getAbTestResults(ctx);
  });

  const reportService = new InvitationReportService(fastify.db);
  const leadList = new InvitationLeadList(fastify.db);

  // GET /api/admin/referrals/invitations/report — KPIs D-19: activadas,
  // conversiones y tasa por mes de cohorte, invitados activos y descuentos por
  // mes Y moneda. Se declara antes que `/invitations` por legibilidad (rutas
  // distintas para el router, no hay captura de parámetros).
  fastify.get<{ Querystring: InvitationReportQuery }>(
    "/invitations/report",
    { schema: { querystring: invitationReportQuerySchema } },
    async (request) => {
      const ctx = assertTenant(request.scope, "referrals.invitations.report");
      return reportService.getReport(ctx, {
        from: request.query.from,
        to: request.query.to,
        country: countryScopeOf(request),
      });
    },
  );

  // GET /api/admin/referrals/invitations — bandeja de leads de invitación (D-18):
  // una fila por invitación activa, etapa derivada en SQL y paginado exacto.
  fastify.get<{ Querystring: InvitationLeadsQuery }>(
    "/invitations",
    { schema: { querystring: invitationLeadsQuerySchema } },
    async (request) => {
      const ctx = assertTenant(request.scope, "referrals.invitations.list");
      return leadList.list(ctx, {
        ...request.query,
        country: countryScopeOf(request),
      });
    },
  );
};
