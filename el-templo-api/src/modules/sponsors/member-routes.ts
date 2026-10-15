// Module: sponsors — member-routes (fase 199, plan 03).
//
// Feed de patrocinadores del socio y reporte de eventos (visto / toque /
// canje). Cualquier usuario autenticado (D-21: todos los socios los ven). El
// `userId` sale SIEMPRE del token, nunca de params/body (T-199-11). Las reglas
// de visibilidad (país, vigencia, plan activo) las aplica `SponsorsService`.

import { FastifyPluginAsync } from "fastify";
import { SponsorsService } from "./service";
import { SettingsService } from "../settings/service";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { handleServiceError } from "../shared/error-handler";
import {
  sponsorIdParamsSchema,
  sponsorEventSchema,
  memberSponsorsResponseSchema,
  successResponseSchema,
  type SponsorEventBody,
} from "./schemas";

export const sponsorsMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new SponsorsService(
    fastify.db,
    fastify.log,
    new SettingsService(fastify.db, fastify.log),
  );

  // GET / — marcas visibles para el socio (+ `canRedeem`)
  fastify.get(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: { response: memberSponsorsResponseSchema },
    },
    async (request, reply) => {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sponsors.member.list");

      try {
        return await service.listForMember(ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.member.list");
      }
    },
  );

  // POST /:id/event — seen / tapped / redeem (idempotente)
  fastify.post<{ Params: { id: number }; Body: SponsorEventBody }>(
    "/:id/event",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...sponsorIdParamsSchema,
        ...sponsorEventSchema,
        response: successResponseSchema,
      },
    },
    async (request, reply) => {
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sponsors.member.event");

      try {
        await service.recordEvent(
          ctx,
          request.user.userId,
          request.params.id,
          request.body.type,
        );
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "sponsors.member.event");
      }
    },
  );
};
