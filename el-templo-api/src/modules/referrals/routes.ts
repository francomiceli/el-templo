/**
 * Referrals — member-facing routes (fase 158, milestone v5.5).
 *
 * Superficie de LECTURA del sistema de referidos. Sirve el `getReferralOverview`
 * del servicio (código lazy + descuento con desglose + vínculos con estado
 * derivado) al socio autenticado.
 *
 * IDOR (T-158-01): el userId SIEMPRE se deriva del token (`request.user`), nunca
 * de params/body — un socio solo puede leer sus propios vínculos.
 */

import { FastifyPluginAsync } from "fastify";
import { ReferralService } from "./service";

export const referralMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ReferralService(fastify.db, fastify.log);

  // GET /api/members/referrals — overview del socio autenticado.
  fastify.get("/", { onRequest: [fastify.authenticate] }, async (request) => {
    // Server-derived: nunca aceptar el userId del cliente (IDOR, T-158-01).
    const { userId } = request.user;
    return service.getReferralOverview(userId);
  });

  // POST /api/members/referrals/cta-click — A/B copy test: registra el tap en el
  // CTA "Compartir código" de la card. La variante se recomputa server-side desde
  // el token (IDOR, igual que arriba). Best-effort: un fallo del insert NO debe
  // romper la UX del socio, así que se swallowea y se responde 204 igual.
  fastify.post(
    "/cta-click",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { userId } = request.user;
      try {
        await service.recordCtaClick(userId);
      } catch (err: unknown) {
        request.log.warn(
          { err: err instanceof Error ? err.message : String(err), userId },
          "Referral CTA click tracking failed (graceful degradation)",
        );
      }
      return reply.code(204).send();
    },
  );
};
