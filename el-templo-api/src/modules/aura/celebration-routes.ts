// Module: aura — celebration-routes (fase 215, #33)
//
// Celebración chica de Aura al abrir Mi Templo, registrada en el módulo
// `templo-gamification` bajo `/api/members/aura`:
//   GET  /celebration       lo que se sumó desde la última vez (ver el servicio)
//   POST /celebration/ack   mueve la marca de lo ya celebrado
//
// Privacidad: ninguna ruta acepta un id de usuario. El `userId` sale SIEMPRE de
// `request.user`. Staff y alumnos la reciben por igual (el detalle de Aura es
// de todos). Topes: por IP en `config.rateLimit` y por usuario en el `preHandler`.
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { RATE_LIMITS } from "../shared/rate-limits";
import { perUserRateLimit } from "../shared/per-user-rate-limit";
import { assertTenant } from "../shared/tenant";
import { ackCelebration, getCelebration } from "./celebration-service";
import {
  markCelebrationInboxRead,
  recordCelebrationInbox,
} from "./celebration-inbox";
import {
  celebrationAckSchema,
  celebrationSchema,
  type CelebrationAckBody,
} from "./celebration-schemas";

export const auraCelebrationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await attachCountryScope(request, fastify.db);
  });

  fastify.get(
    "/celebration",
    {
      schema: celebrationSchema,
      config: { rateLimit: RATE_LIMITS.auraCelebration },
      preHandler: perUserRateLimit(
        fastify,
        RATE_LIMITS.auraCelebrationPerUser,
        "aura-celebration",
      ),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.member.celebration");
        const userId = request.user.userId;
        const result = await getCelebration(fastify.db, ctx, userId);
        // Lo que se celebra en pantalla también queda en Notificaciones (sin push).
        if (result.count > 0) {
          await recordCelebrationInbox(fastify.db, request.log, ctx, userId);
        }
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "aura.member.celebration");
      }
    },
  );

  fastify.post<{ Body: CelebrationAckBody }>(
    "/celebration/ack",
    {
      schema: celebrationAckSchema,
      config: { rateLimit: RATE_LIMITS.auraCelebration },
      preHandler: perUserRateLimit(
        fastify,
        RATE_LIMITS.auraCelebrationPerUser,
        "aura-celebration-ack",
      ),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.member.celebration.ack");
        await ackCelebration(
          fastify.db,
          ctx,
          request.user.userId,
          request.body.upToId,
        );
        // Ya lo vio en pantalla: el aviso de la bandeja no cuenta como nuevo.
        await markCelebrationInboxRead(
          fastify.db,
          request.log,
          ctx,
          request.user.userId,
          request.body.upToId,
        );
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "aura.member.celebration.ack",
        );
      }
    },
  );
};

export default auraCelebrationRoutes;
