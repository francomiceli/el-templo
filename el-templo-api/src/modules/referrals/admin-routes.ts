/**
 * Referrals — admin routes (v5.5 follow-up, A/B copy test).
 *
 * Registrado en /api/admin/referrals. Superficie de LECTURA agregada (no
 * per-miembro; eso vive en /api/admin/members/:id/referrals) para el tab
 * "Referidos A/B" de Analíticas.
 *
 * Acceso: cualquier staff autenticado puede leer los resultados agregados —
 * mismo criterio staff-gated que settings/analytics (no expone datos de un socio
 * puntual, son conteos por variante). Los tokens de socio reciben 403.
 *
 * Tenancy (T-175.1, decisión de Franco 2026-08-18): los números se ACOTAN al
 * gimnasio del request vía `assertTenant(request.scope, ...)`. Cada gimnasio ve
 * solo sus propias variantes — ya NO es una superficie cross-tenant global.
 */

import { FastifyPluginAsync } from "fastify";
import { ReferralService } from "./service";
import { ANALYTICS_OPERATIONAL_ROLES } from "../shared/permissions";
import { assertTenant } from "../shared/tenant";
import { attachCountryScope } from "../shared/country-scope";

export const referralAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  // Guard: autenticar + gate al set operativo de Analíticas (gestion+admin+owner),
  // el mismo que ya ve las tabs operativas donde vive "Referidos A/B". Coach y
  // recepción quedan afuera (403), igual que el resto de Analíticas.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(ANALYTICS_OPERATIONAL_ROLES as readonly string[]).includes(
        request.user.role,
      )
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "No tenés acceso a los resultados del A/B test",
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
};
