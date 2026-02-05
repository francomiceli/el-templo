import { FastifyPluginAsync } from 'fastify';
import { AdminSessionService } from './service';
import {
  getSessionsSchema,
  sessionIdSchema,
  discardSchema,
  bulkApproveSchema,
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

  // POST /admin/sessions/:id/discard - Discard session with optional reason
  fastify.post<{ Params: { id: number }; Body: { reason?: string } }>('/sessions/:id/discard', {
    schema: discardSchema,
  }, async (request, reply) => {
    const success = await adminService.discardSession(
      request.params.id,
      request.user.userId,
      request.body?.reason
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

  // POST /admin/sessions/:id/restore - Restore discarded session to pending
  fastify.post<{ Params: { id: number } }>('/sessions/:id/restore', {
    schema: sessionIdSchema,
  }, async (request, reply) => {
    const success = await adminService.restoreFromDiscarded(request.params.id);
    if (!success) {
      return reply.status(404).send({ error: 'Sesion no encontrada o no esta descartada' });
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
};
