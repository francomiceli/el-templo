/**
 * WhatsApp Admin API Routes
 *
 * Admin-facing endpoints for managing WhatsApp conversations from el-templo-admin.
 * Registered at /api/admin/whatsapp
 *
 * TODO: Implement each route handler. See modules/attendance/routes.ts for patterns.
 */

import { FastifyPluginAsync } from "fastify";
import { WhatsAppService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import {
  listConversationsSchema,
  getConversationSchema,
  sendMessageSchema,
  takeoverSchema,
  resumeBotSchema,
} from "./schemas";
import type { ConversationStatus, ClientState, MessageType } from "./types";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

export const whatsappAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new WhatsAppService(fastify.db, fastify.log);

  /**
   * Guard: require admin/coach role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // GET /conversations — List conversations with filters
  fastify.get<{
    Querystring: {
      status?: string;
      clientState?: string;
      search?: string;
      page?: number;
      limit?: number;
    };
  }>(
    "/conversations",
    { schema: listConversationsSchema },
    async (request, reply) => {
      const {
        status,
        clientState,
        search,
        page = 1,
        limit = 20,
      } = request.query;
      try {
        return await service.listConversations({
          status: status as ConversationStatus | undefined,
          clientState: clientState as ClientState | undefined,
          search,
          page,
          limit,
        });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "whatsapp.listConversations",
        );
      }
    },
  );

  // GET /conversations/:id — Get conversation detail with messages
  fastify.get<{
    Params: { id: number };
    Querystring: { messagePage?: number; messageLimit?: number };
  }>(
    "/conversations/:id",
    { schema: getConversationSchema },
    async (request, reply) => {
      const { messagePage = 1, messageLimit = 50 } = request.query;
      try {
        return await service.getConversation(
          request.params.id,
          messagePage,
          messageLimit,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "whatsapp.getConversation");
      }
    },
  );

  // POST /conversations/:id/send — Admin sends a message
  fastify.post<{
    Params: { id: number };
    Body: { content: string; messageType?: string };
  }>(
    "/conversations/:id/send",
    { schema: sendMessageSchema },
    async (request, reply) => {
      try {
        const result = await service.sendMessage(
          request.params.id,
          request.user.userId,
          {
            content: request.body.content,
            messageType: (request.body.messageType ?? "text") as MessageType,
          },
        );
        return reply.code(201).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "whatsapp.sendMessage");
      }
    },
  );

  // PUT /conversations/:id/takeover — Human takeover
  fastify.put<{ Params: { id: number } }>(
    "/conversations/:id/takeover",
    { schema: takeoverSchema },
    async (request, reply) => {
      try {
        return await service.takeover(request.params.id, request.user.userId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "whatsapp.takeover");
      }
    },
  );

  // PUT /conversations/:id/resume — Resume bot
  fastify.put<{ Params: { id: number } }>(
    "/conversations/:id/resume",
    { schema: resumeBotSchema },
    async (request, reply) => {
      try {
        return await service.resumeBot(request.params.id);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "whatsapp.resumeBot");
      }
    },
  );
};
