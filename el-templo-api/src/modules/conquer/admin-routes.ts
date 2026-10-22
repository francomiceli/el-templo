// Módulo: conquer — rutas de admin (Fase 201 D-08, D-12)
//
// Registradas con `moduleScope(app, "templo-training", ..., { prefix:
// "/api/admin/conquer" })`. Un único guard de plugin en `onRequest` (NO en
// `preHandler`: con preHandler un rol sin permiso con body inválido recibiría
// 400 en vez de 403) resuelto SOLO con `canManageConquer` (T-201-12).
import type {
  FastifyBaseLogger,
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";
import { attachCountryScope } from "../shared/country-scope";
import { AppError } from "../shared/errors";
import { handleServiceError } from "../shared/error-handler";
import { assertTenant } from "../shared/tenant";
import {
  activateMember,
  updateMember,
  type UpdateMemberPatch,
} from "./activation-service";
import { countUnlockRequests, listUnlockRequests } from "./member-service";
import { canManageConquer } from "./permissions";
import type { Level } from "./rules";
import {
  activateMemberSchema,
  unlockRequestsCountResponseSchema,
  unlockRequestsResponseSchema,
  updateMemberSchema,
} from "./schemas";

/**
 * Errores de negocio de Conquer: `{ error, code }` para que el app ramifique
 * (los mensajes ya vienen en español). Lo que no trae `code` o no es AppError
 * sigue el camino común.
 */
function sendConquerError(
  err: unknown,
  reply: FastifyReply,
  log: FastifyBaseLogger,
  context: string,
): void {
  if (reply.sent) return;
  if (err instanceof AppError && err.code) {
    reply.code(err.statusCode).send({ error: err.message, code: err.code });
    return;
  }
  handleServiceError(err, reply, log, context);
}

interface ActivateBody {
  userId: number;
  level: Level;
  daysCount: number;
  coachUserId?: number | null;
}

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

  // POST /members — owner/admin activa a un alumno (§7.2, S12-1).
  fastify.post<{ Body: ActivateBody }>(
    "/members",
    { schema: activateMemberSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.members-create");
        // Fase 201 D-08: el actor sale SIEMPRE del token, nunca del body.
        const view = await activateMember(
          fastify.db,
          ctx,
          { userId: request.user.userId, role: request.user.role },
          request.body,
          request.log,
        );
        return reply.code(201).send(view);
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.members-create",
        );
      }
    },
  );

  // PUT /members/:userId — edita nivel, días, incrementos y coach (§4.2).
  fastify.put<{ Params: { userId: number }; Body: UpdateMemberPatch }>(
    "/members/:userId",
    { schema: updateMemberSchema },
    async (request, reply) => {
      try {
        const ctx = assertTenant(request.scope, "conquer.admin.members-update");
        return await updateMember(
          fastify.db,
          ctx,
          { userId: request.user.userId, role: request.user.role },
          request.params.userId,
          request.body,
          request.log,
        );
      } catch (err: unknown) {
        sendConquerError(
          err,
          reply,
          request.log,
          "conquer.admin.members-update",
        );
      }
    },
  );
};
