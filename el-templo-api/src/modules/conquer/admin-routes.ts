// Módulo: conquer — rutas de admin (Fase 201 D-08, D-12)
//
// Registradas con `moduleScope(app, "templo-training", ..., { prefix:
// "/api/admin/conquer" })`. Un único guard de plugin en `onRequest` (NO en
// `preHandler`: con preHandler un rol sin permiso con body inválido recibiría
// 400 en vez de 403) resuelto SOLO con `canManageConquer` (T-201-12).
import type { FastifyPluginAsync } from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import { countUnlockRequests, listUnlockRequests } from "./member-service";
import { canManageConquer } from "./permissions";
import {
  unlockRequestsCountResponseSchema,
  unlockRequestsResponseSchema,
} from "./schemas";

export const conquerAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Guard único (D-08): autentica y exige owner/admin antes de cualquier handler.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    if (!canManageConquer(request.user)) {
      return reply.code(403).send({ error: "No tenés permiso para Conquer" });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET /requests — pedidos de desbloqueo, el más viejo primero (D-12).
  fastify.get(
    "/requests",
    { schema: { response: unlockRequestsResponseSchema } },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.requests");
        return { requests: await listUnlockRequests(fastify.db, ctx) };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "conquer.admin.requests");
      }
    },
  );

  // GET /requests/count — contador del badge del admin.
  fastify.get(
    "/requests/count",
    { schema: { response: unlockRequestsCountResponseSchema } },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.requests-count");
        return { count: await countUnlockRequests(fastify.db, ctx) };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "conquer.admin.requests-count",
        );
      }
    },
  );
};
