import { FastifyPluginAsync } from 'fastify';
import { eq, and, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { AdminSessionService } from './service';
import { AdminEditService } from './edit-service';
import {
  getSessionsSchema,
  sessionIdSchema,
  bulkApproveSchema,
  getWeekSummarySchema,
  generateWeekSchema,
  getBlockPoolSchema,
  swapBlockSchema,
  getExercisePoolSchema,
  swapExerciseSchema,
  updatePrescriptionSchema,
  changeFormatSchema,
  addExerciseSchema,
  removeExerciseSchema,
  resetSessionSchema,
  getCompatibleFormatsSchema,
  getPreviewSchema,
} from './schemas';

const ADMIN_ROLES = ['coach', 'admin', 'superadmin'];

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const adminService = new AdminSessionService(fastify.db);
  const editService = new AdminEditService(fastify.db);

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

  // ==========================================================================
  // Session Editing Routes (Phase 15-03)
  // ==========================================================================

  // GET /admin/exercises/pool - Get exercise pool for swap
  fastify.get<{
    Querystring: { route: string; contraction?: string; blockId: number; pattern?: string };
  }>('/exercises/pool', {
    schema: getExercisePoolSchema,
  }, async (request, reply) => {
    const { route, contraction, blockId, pattern: queryPattern } = request.query;

    // Look up block to get context (role, pattern, sessionId)
    const [block] = await fastify.db
      .select()
      .from(schema.sessionBlocks)
      .where(eq(schema.sessionBlocks.id, blockId));

    if (!block) {
      return reply.status(404).send({ error: 'Bloque no encontrado' });
    }

    // Get existing exercise IDs in the block to exclude from pool
    const prescriptions = await fastify.db
      .select({ exerciseId: schema.sessionPrescriptions.exerciseId })
      .from(schema.sessionPrescriptions)
      .where(eq(schema.sessionPrescriptions.blockId, blockId));

    const excludeExerciseIds = prescriptions.map(p => p.exerciseId);

    // Look up pattern2 from SPOM rules (session week + block route)
    let pattern2: string | null = null;
    const [session] = await fastify.db
      .select({ week: schema.sessions.week })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, block.sessionId));

    if (session) {
      const [routeRow] = await fastify.db
        .select({ id: schema.routes.id })
        .from(schema.routes)
        .where(eq(schema.routes.code, route));

      if (routeRow) {
        const [spomRule] = await fastify.db
          .select({ pattern2: schema.spomRules.pattern2 })
          .from(schema.spomRules)
          .where(and(
            eq(schema.spomRules.week, session.week),
            eq(schema.spomRules.routeId, routeRow.id)
          ));

        if (spomRule) {
          pattern2 = spomRule.pattern2 ?? null;
        }
      }
    }

    return editService.getExercisePool({
      blockId,
      contraction,
      route,
      pattern: queryPattern || block.pattern,
      pattern2,
      blockRole: block.role,
      excludeExerciseIds,
    });
  });

  // POST /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/swap - Swap exercise
  fastify.post<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
    Body: { newExerciseId: number };
  }>('/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId/swap', {
    schema: swapExerciseSchema,
  }, async (request, reply) => {
    try {
      const result = await editService.swapExercise({
        sessionId: request.params.sessionId,
        blockId: request.params.blockId,
        oldPrescriptionId: request.params.prescriptionId,
        newExerciseId: request.body.newExerciseId,
        userId: request.user.userId,
      });
      return result;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Recurso no encontrado' });
    }
  });

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId - Update prescription
  fastify.patch<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
    Body: { reps?: number; seconds?: number; rest?: number; notes?: string | null };
  }>('/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId', {
    schema: updatePrescriptionSchema,
  }, async (request, reply) => {
    try {
      const result = await editService.updatePrescription({
        sessionId: request.params.sessionId,
        blockId: request.params.blockId,
        prescriptionId: request.params.prescriptionId,
        fields: request.body,
        userId: request.user.userId,
      });
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Error al actualizar prescripcion' });
    }
  });

  // PATCH /admin/sessions/:sessionId/blocks/:blockId/format - Change block format
  fastify.patch<{
    Params: { sessionId: number; blockId: number };
    Body: { formatId: number; formatName: string };
  }>('/sessions/:sessionId/blocks/:blockId/format', {
    schema: changeFormatSchema,
  }, async (request, reply) => {
    try {
      const result = await editService.changeBlockFormat({
        sessionId: request.params.sessionId,
        blockId: request.params.blockId,
        newFormatId: request.body.formatId,
        newFormatName: request.body.formatName,
        userId: request.user.userId,
      });
      return result;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Recurso no encontrado' });
    }
  });

  // POST /admin/sessions/:sessionId/blocks/:blockId/exercises - Add exercise to block
  fastify.post<{
    Params: { sessionId: number; blockId: number };
    Body: { exerciseId: number };
  }>('/sessions/:sessionId/blocks/:blockId/exercises', {
    schema: addExerciseSchema,
  }, async (request, reply) => {
    try {
      const result = await editService.addExercise({
        sessionId: request.params.sessionId,
        blockId: request.params.blockId,
        exerciseId: request.body.exerciseId,
        userId: request.user.userId,
      });
      return result;
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Recurso no encontrado' });
    }
  });

  // DELETE /admin/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId - Remove exercise
  fastify.delete<{
    Params: { sessionId: number; blockId: number; prescriptionId: number };
  }>('/sessions/:sessionId/blocks/:blockId/exercises/:prescriptionId', {
    schema: removeExerciseSchema,
  }, async (request, reply) => {
    try {
      await editService.removeExercise({
        sessionId: request.params.sessionId,
        blockId: request.params.blockId,
        prescriptionId: request.params.prescriptionId,
        userId: request.user.userId,
      });
      return { success: true };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Recurso no encontrado' });
    }
  });

  // POST /admin/sessions/:id/reset - Reset session to algorithm snapshot
  fastify.post<{
    Params: { id: number };
  }>('/sessions/:id/reset', {
    schema: resetSessionSchema,
  }, async (request, reply) => {
    try {
      await editService.resetToAlgorithm({
        sessionId: request.params.id,
        userId: request.user.userId,
      });
      return { success: true };
    } catch (err: any) {
      if (err.message?.includes('snapshot')) {
        return reply.status(400).send({ error: 'No hay snapshot disponible para esta sesion' });
      }
      return reply.status(404).send({ error: err.message || 'Recurso no encontrado' });
    }
  });

  // GET /admin/formats/compatible - Get compatible formats for block
  fastify.get<{
    Querystring: { blockRole: string; level: string; intensity: number };
  }>('/formats/compatible', {
    schema: getCompatibleFormatsSchema,
  }, async (request) => {
    return editService.getCompatibleFormats({
      blockRole: request.query.blockRole,
      level: request.query.level,
      intensity: request.query.intensity,
    });
  });

  // GET /admin/sessions/:id/preview - Get member preview data
  fastify.get<{
    Params: { id: number };
    Querystring: { memberLevel?: string };
  }>('/sessions/:id/preview', {
    schema: getPreviewSchema,
  }, async (request, reply) => {
    const { id } = request.params;
    const { memberLevel } = request.query;

    // Get the base session
    const baseSession = await adminService.getSessionWithDetails(id);
    if (!baseSession) {
      return reply.status(404).send({ error: 'Sesion no encontrada' });
    }

    // If memberLevel is provided and differs from current session,
    // find the session for that level (same week/day)
    let sessionData = baseSession;
    if (memberLevel) {
      const currentLevel = baseSession.dayId.split('-').pop() || '';
      if (memberLevel !== currentLevel) {
        // Build target dayId: W{week}-{day}-{memberLevel}
        const parts = baseSession.dayId.split('-');
        parts[parts.length - 1] = memberLevel;
        const targetDayId = parts.join('-');

        const [targetSession] = await fastify.db
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(eq(schema.sessions.dayId, targetDayId));

        if (targetSession) {
          const targetData = await adminService.getSessionWithDetails(targetSession.id);
          if (targetData) {
            sessionData = targetData;
          }
        }
      }
    }

    // Transform to preview format
    const preview = {
      sessionId: sessionData.id,
      dayId: sessionData.dayId,
      week: sessionData.week,
      day: sessionData.day,
      levelGroup: sessionData.levelGroup,
      memberLevel: sessionData.memberLevel,
      status: sessionData.status,
      blocks: sessionData.blocks.map((block: any) => ({
        name: block.role,
        format: block.formatName,
        intensity: block.intensity,
        repsBudget: block.repsBudget,
        exercises: block.exercises.map((ex: any) => ({
          name: ex.exerciseName,
          prescription: ex.seconds > 0
            ? `${ex.seconds} segundos`
            : ex.reps > 0
              ? `${ex.reps} reps`
              : 'Sin prescripcion',
          rest: ex.rest > 0 ? `${ex.rest}s descanso` : 'Sin descanso',
          notes: ex.notes || null,
        })),
      })),
    };

    return preview;
  });
};
