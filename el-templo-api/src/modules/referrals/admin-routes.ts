/**
 * Referrals — admin routes (v5.5 follow-up, A/B copy test).
 *
 * Registrado en /api/admin/referrals. Superficie de LECTURA global (no
 * per-miembro; eso vive en /api/admin/members/:id/referrals) para el tab
 * "Referidos A/B" de Analíticas.
 *
 * Acceso: cualquier staff autenticado puede leer los resultados agregados —
 * mismo criterio staff-gated que settings/analytics (no expone datos de un socio
 * puntual, son conteos por variante). Los tokens de socio reciben 403.
 */

import { FastifyPluginAsync } from "fastify";
import { ReferralService } from "./service";
import { ANALYTICS_OPERATIONAL_ROLES } from "../shared/permissions";

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
  });

  // GET /api/admin/referrals/ab-results — números por variante (expuestos,
  // clics únicos, referidos creados/cualificados + tasas).
  fastify.get("/ab-results", async () => {
    return service.getAbTestResults();
  });
};
