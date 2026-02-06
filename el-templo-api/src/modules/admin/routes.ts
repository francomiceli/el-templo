import { FastifyPluginAsync } from 'fastify';
import { AdminSessionService } from './service';
import {
  getSessionsSchema,
  sessionIdSchema,
  bulkApproveSchema,
  getWeekSummarySchema,
  generateWeekSchema,
  getBlockPoolSchema,
  swapBlockSchema,
} from './schemas';

const ADMIN_ROLES = ['coach', 'admin', 'superadmin'];

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const adminService = new AdminSessionService(fastify.db);

  // Role check hook for all routes
  fastify.addHook('onRequest', async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.status(403).send({ error: 'Acceso de administrador requerido' });
    }
  });

  // GET /admin/sessions - List sessions with filters
  fastify.get('/sessions', { schema: getSessionsSchema }, async (request) => {
    const filter = request.query as any;
    return adminService.getSessions(filter);
  });

  // GET /admin/sessions/pending-count - Get pending session count
  fastify.get('/sessions/pending-count', async () => {
    const count = await adminService.getPendingCount();
    return { count };
  });

  // GET /admin/sessions/coverage - Get weeks coverage info for alert display
  fastify.get('/sessions/coverage', async () => {
    return adminService.getApprovedWeeksCoverage();
  });

  // GET /admin/sessions/:id - Get session details
  fastify.get<{ Params: { id: number } }>('/sessions/:id', {
    schema: sessionIdSchema,
  }, async (request, reply) => {
    const session = await adminService.getSessionWithDetails(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: 'Sesion no encontrada' });
    }
    return session;
  });

  // POST /admin/sessions/:id/approve - Approve session
  fastify.post<{ Params: { id: number } }>('/sessions/:id/approve', {
    schema: sessionIdSchema,
  }, async (request, reply) => {
    const success = await adminService.approveSession(
      request.params.id,
      request.user.userId
    );
    if (!success) {
      return reply.status(404).send({ error: 'Sesion no encontrada' });
    }
    return { success: true };
  });

  // POST /admin/sessions/:id/revert - Revert approved session to pending
  fastify.post<{ Params: { id: number } }>('/sessions/:id/revert', {
    schema: sessionIdSchema,
  }, async (request, reply) => {
    const success = await adminService.revertSession(request.params.id);
    if (!success) {
      return reply.status(404).send({ error: 'Sesion no encontrada' });
    }
    return { success: true };
  });

  // POST /admin/sessions/bulk-approve - Approve multiple sessions
  fastify.post<{ Body: { ids: number[] } }>('/sessions/bulk-approve', {
    schema: bulkApproveSchema,
  }, async (request) => {
    const count = await adminService.bulkApprove(
      request.body.ids,
      request.user.userId
    );
    return { success: true, approvedCount: count };
  });

  // GET /admin/weeks/:week/summary - Get week generation status
  fastify.get<{ Params: { week: number } }>('/weeks/:week/summary', {
    schema: getWeekSummarySchema,
  }, async (request) => {
    return adminService.getWeekSummary(request.params.week);
  });

  // POST /admin/generate - Generate sessions for a week
  fastify.post<{
    Body: {
      week: number;
      days?: string[];
      levelGroups?: string[];
      regenerate?: boolean;
    };
  }>('/generate', {
    schema: generateWeekSchema,
  }, async (request) => {
    const result = await adminService.generateWeek(request.body.week, {
      days: request.body.days,
      levelGroups: request.body.levelGroups,
      regenerate: request.body.regenerate,
    });
    return result;
  });

  // GET /admin/blocks/pool - Get pool of blocks from approved sessions
  fastify.get<{
    Querystring: { route: string; memberLevel: string; excludeSessionId?: number; excludeBlockId?: number };
  }>('/blocks/pool', {
    schema: getBlockPoolSchema,
  }, async (request) => {
    return adminService.getBlockPool(
      request.query.route,
      request.query.memberLevel,
      request.query.excludeSessionId,
      request.query.excludeBlockId
    );
  });

  // POST /admin/sessions/:sessionId/blocks/:blockId/swap - Swap block with pool block
  fastify.post<{
    Params: { sessionId: number; blockId: number };
    Body: { sourceBlockId: number };
  }>('/sessions/:sessionId/blocks/:blockId/swap', {
    schema: swapBlockSchema,
  }, async (request, reply) => {
    const success = await adminService.swapBlock(
      request.params.sessionId,
      request.params.blockId,
      request.body.sourceBlockId
    );
    if (!success) {
      return reply.status(404).send({ error: 'Bloque no encontrado o sesion fuente no aprobada' });
    }
    return { success: true };
  });
};
