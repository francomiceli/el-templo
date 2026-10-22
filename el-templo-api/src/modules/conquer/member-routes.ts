// Módulo: conquer — rutas del alumno (Fase 201 D-12, D-17)
//
// Registradas en `app.ts` con `moduleScope(app, "templo-training", ..., {
// prefix: "/api/members/conquer" })`: un gimnasio sin el módulo recibe 404.
// El `userId` sale SIEMPRE de `request.user`, nunca de body/query/params.
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import { getConquerState, requestUnlock } from "./member-service";
import { conquerStateResponseSchema, unlockRequestSchema } from "./schemas";

export const conquerMemberRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /state — bloqueado | pedido | activo (D-12). No exige plan (D-17).
  fastify.get(
    "/state",
    {
      onRequest: [fastify.authenticate],
      schema: { response: conquerStateResponseSchema },
    },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.state");
        return await getConquerState(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "conquer.member.state");
      }
    },
  );

  // POST /unlock-request — "Quiero desbloquearlo": un solo pedido (D-12).
  fastify.post(
    "/unlock-request",
    {
      onRequest: [fastify.authenticate],
      schema: unlockRequestSchema,
    },
    async (request, reply) => {
      try {
        await attachCountryScope(request, fastify.db);
        const ctx = assertTenant(request.scope, "conquer.member.unlock");
        return await requestUnlock(fastify.db, ctx, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "conquer.member.unlock");
      }
    },
  );
};
