// Module: aura — gift-member-routes (fase 215, plan 06)
//
// Rutas del alumno para regalar Aura, registradas en el módulo
// `templo-gamification` bajo `/api/members/aura`:
//   GET  /gifts/pending     regalos pendientes de la card y los dados hoy
//   GET  /gifts/candidates  las caras de una clase (`?attendanceId=`)
//   POST /gifts             da el regalo (+1 de Aura al receptor)
//
// Privacidad (D-08): ninguna ruta acepta un id de usuario. El `userId` sale
// SIEMPRE de `request.user`, y el receptor se elige por la asistencia que el
// servidor mismo ofreció en las caras. La respuesta no lleva apellido, teléfono,
// email ni ids de personas.
//
// Reglas: todas viven en `AuraGiftService` (plan 05) y se revalidan en cada
// pedido; la app no decide nada. Los rechazos salen por `sendGiftError`, que
// conserva el `code` (`REGALO_*`) para que la app elija el texto.
//
// Topes: por IP en `config.rateLimit` y por usuario en el `preHandler` (el Wi-Fi
// de la sede es compartido). El de candidatos frena que un alumno recorra clases
// para saber quién fue a cuáles.
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { RATE_LIMITS } from "../shared/rate-limits";
import { assertTenant } from "../shared/tenant";
import { sendGiftError } from "./gift-errors";
import {
  giftCandidatesSchema,
  giveGiftSchema,
  pendingGiftsSchema,
  type GiftCandidatesQuery,
  type GiveGiftBody,
} from "./gift-schemas";
import { AuraGiftService } from "./gift-service";

export const auraGiftMemberRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    await attachCountryScope(request, fastify.db);
  });

  const service = new AuraGiftService(fastify);

  // GET /gifts/pending — la card de hoy.
  fastify.get(
    "/gifts/pending",
    { schema: pendingGiftsSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.gifts.pending");
        return await service.listPending(ctx, request.user.userId);
      } catch (err: unknown) {
        sendGiftError(err, reply, request.log, "aura.gifts.pending");
      }
    },
  );

  // GET /gifts/candidates — las caras de la clase elegida.
  fastify.get<{ Querystring: GiftCandidatesQuery }>(
    "/gifts/candidates",
    {
      schema: giftCandidatesSchema,
      config: { rateLimit: RATE_LIMITS.giftCandidates },
      preHandler: fastify.rateLimit({
        ...RATE_LIMITS.giftCandidatesPerUser,
        keyGenerator: (request) => `gift-candidates:${request.user.userId}`,
      }),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.gifts.candidates");
        return await service.listCandidates(
          ctx,
          request.user.userId,
          request.query.attendanceId,
        );
      } catch (err: unknown) {
        sendGiftError(err, reply, request.log, "aura.gifts.candidates");
      }
    },
  );

  // POST /gifts — da el regalo. El 201 solo expone nombre de pila y motivo.
  fastify.post<{ Body: GiveGiftBody }>(
    "/gifts",
    {
      schema: giveGiftSchema,
      config: { rateLimit: RATE_LIMITS.giftGive },
      preHandler: fastify.rateLimit({
        ...RATE_LIMITS.giftGivePerUser,
        keyGenerator: (request) => `gift-give:${request.user.userId}`,
      }),
    },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "aura.gifts.give");
        const result = await service.giveMemberGift(
          ctx,
          request.user.userId,
          request.body,
        );
        return reply.code(201).send({
          receiverFirstName: result.receiverFirstName,
          reason: result.reason,
        });
      } catch (err: unknown) {
        sendGiftError(err, reply, request.log, "aura.gifts.give");
      }
    },
  );
};

export default auraGiftMemberRoutes;
