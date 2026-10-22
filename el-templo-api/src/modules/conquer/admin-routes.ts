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
import {
  activateMember,
  updateMember,
  type UpdateMemberPatch,
} from "./activation-service";
import { updateAlertStatus } from "./alerts-service";
import { getBoardAlert } from "./alert-view";
import { buildBoard } from "./board-service";
import { countUnlockRequests, listUnlockRequests } from "./member-service";
import { sendConquerError } from "./errors";
import { canManageConquer } from "./permissions";
import type { Level } from "./rules";
import {
  activateMemberSchema,
  boardSchema,
  unlockRequestsCountResponseSchema,
  unlockRequestsResponseSchema,
  updateAlertSchema,
  updateMemberSchema,
} from "./schemas";

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

  // GET /members — tablero con semáforo, en una sola request (§7.2, S12-7).
  fastify.get("/members", { schema: boardSchema }, async (request, reply) => {
    try {
      const ctx = assertTenant(request.scope, "conquer.admin.board");
      return await buildBoard(fastify.db, ctx);
    } catch (err: unknown) {
      sendConquerError(err, reply, request.log, "conquer.admin.board");
    }
  });

  // PATCH /alerts/:id — vista o resuelta (T-201-30, T-201-32).
  fastify.patch<{
    Params: { id: number };
    Body: { status: "vista" | "resuelta" };
  }>("/alerts/:id", { schema: updateAlertSchema }, async (request, reply) => {
    try {
      const ctx = assertTenant(request.scope, "conquer.admin.alert-update");
      // El actor sale SIEMPRE del token, nunca del body.
      await updateAlertStatus(
        fastify.db,
        ctx,
        { userId: request.user.userId },
        request.params.id,
        request.body.status,
      );
      return await getBoardAlert(fastify.db, ctx, request.params.id);
    } catch (err: unknown) {
      sendConquerError(err, reply, request.log, "conquer.admin.alert-update");
    }
  });

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
