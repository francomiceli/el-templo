import { FastifyPluginAsync } from 'fastify';
import { eq, gte, and, sql, count } from 'drizzle-orm';
import * as schema from '../../db/schema';
import {
  calculateStreak,
  checkEligibility,
  formatDateLabel,
  getLevelDisplayName,
  getGreekLetter,
} from './service';
import {
  progressionStatsResponseSchema,
  evaluationRequestResponseSchema,
  errorResponseSchema,
} from './schemas';

export const progressionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /progression/stats - Get member's progression data
  fastify.get('/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      response: {
        200: progressionStatsResponseSchema,
        404: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { userId } = request.user;

    // Get user level
    const [user] = await fastify.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Calculate date boundaries
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    const twoWeeksAgo = new Date(today);
    twoWeeksAgo.setDate(today.getDate() - 14);
    const fourWeeksAgo = new Date(today);
    fourWeeksAgo.setDate(today.getDate() - 28);

    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    const todayStr = today.toISOString().split('T')[0];

    // Parallel queries for performance
    const [
      totalResult,
      weekResult,
      avgRpeResult,
      rpeDataResult,
      allSessionsResult,
      pendingRequestResult,
      todaySessionResult,
    ] = await Promise.all([
      // Total sessions and unique days
      fastify.db
        .select({
          totalSessions: count(),
          totalDays: sql<number>`COUNT(DISTINCT date)`,
        })
        .from(schema.completedSessions)
        .where(eq(schema.completedSessions.userId, userId)),

      // Sessions in last 7 days
      fastify.db
        .select({ count: count() })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, sevenDaysAgoStr)
        )),

      // Average RPE for last 2 weeks (excluding null)
      fastify.db
        .select({
          avgRpe: sql<number | null>`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
        })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, twoWeeksAgoStr),
          sql`${schema.completedSessions.rpe} IS NOT NULL`
        )),

      // RPE data for chart (last 4 weeks)
      fastify.db
        .select({
          date: schema.completedSessions.date,
          rpe: schema.completedSessions.rpe,
        })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, fourWeeksAgoStr)
        ))
        .orderBy(schema.completedSessions.date),

      // All sessions for streak calculation (sorted by date desc)
      fastify.db
        .select({ date: schema.completedSessions.date })
        .from(schema.completedSessions)
        .where(eq(schema.completedSessions.userId, userId))
        .orderBy(sql`${schema.completedSessions.date} DESC`),

      // Check for pending evaluation request
      fastify.db
        .select({
          id: schema.evaluationRequests.id,
          requestedAt: schema.evaluationRequests.requestedAt,
        })
        .from(schema.evaluationRequests)
        .where(and(
          eq(schema.evaluationRequests.userId, userId),
          eq(schema.evaluationRequests.status, 'pending')
        )),

      // Today's completed session (if any)
      fastify.db
        .select({
          rpe: schema.completedSessions.rpe,
          notes: schema.completedSessions.notes,
          startedAt: schema.completedSessions.startedAt,
          completedAt: schema.completedSessions.completedAt,
        })
        .from(schema.completedSessions)
        .where(and(
          eq(schema.completedSessions.userId, userId),
          eq(schema.completedSessions.date, todayStr)
        )),
    ]);

    // Extract results
    const avgRpe = avgRpeResult[0]?.avgRpe ?? null;
    const eligible = checkEligibility(avgRpe);
    const currentStreak = calculateStreak(allSessionsResult);
    const pendingRequest = pendingRequestResult[0] ?? null;
    const todaySession = todaySessionResult[0] ?? null;

    // Build response
    return {
      level: {
        current: user.level,
        displayName: getLevelDisplayName(user.level),
        greekLetter: getGreekLetter(user.level),
      },
      stats: {
        totalSessions: Number(totalResult[0]?.totalSessions ?? 0),
        totalDaysTrained: Number(totalResult[0]?.totalDays ?? 0),
        sessionsThisWeek: Number(weekResult[0]?.count ?? 0),
        currentStreak,
      },
      rpeTrend: {
        labels: rpeDataResult.map(r => formatDateLabel(r.date)),
        data: rpeDataResult.map(r => r.rpe),
        averageRpe: avgRpe !== null ? Number(avgRpe) : 0,
      },
      evaluation: {
        eligible,
        averageRpeLast2Weeks: avgRpe !== null ? Number(avgRpe) : null,
        pendingRequest: !!pendingRequest,
        requestedAt: pendingRequest?.requestedAt?.toISOString() ?? null,
      },
      todaySession: todaySession ? {
        completed: true,
        rpe: todaySession.rpe,
        notes: todaySession.notes,
        durationMinutes: todaySession.startedAt && todaySession.completedAt
          ? Math.round((new Date(todaySession.completedAt).getTime() - new Date(todaySession.startedAt).getTime()) / 60000)
          : null,
      } : null,
    };
  });

  // POST /progression/request-evaluation - Submit evaluation request
  fastify.post('/request-evaluation', {
    onRequest: [fastify.authenticate],
    schema: {
      response: {
        200: evaluationRequestResponseSchema,
        400: errorResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { userId } = request.user;

    // Check for existing pending request
    const [existingRequest] = await fastify.db
      .select({ id: schema.evaluationRequests.id })
      .from(schema.evaluationRequests)
      .where(and(
        eq(schema.evaluationRequests.userId, userId),
        eq(schema.evaluationRequests.status, 'pending')
      ));

    if (existingRequest) {
      return reply.status(400).send({ error: 'Ya tienes una solicitud de evaluacion pendiente' });
    }

    // Calculate average RPE for last 2 weeks to verify eligibility
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split('T')[0];

    const [avgResult] = await fastify.db
      .select({
        avgRpe: sql<number | null>`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
      })
      .from(schema.completedSessions)
      .where(and(
        eq(schema.completedSessions.userId, userId),
        gte(schema.completedSessions.date, twoWeeksAgoStr),
        sql`${schema.completedSessions.rpe} IS NOT NULL`
      ));

    const avgRpe = avgResult?.avgRpe;
    if (!checkEligibility(avgRpe ?? null)) {
      return reply.status(400).send({ error: 'No cumples los requisitos para solicitar evaluacion (RPE promedio debe ser <= 6)' });
    }

    // Create evaluation request
    const [result] = await fastify.db.insert(schema.evaluationRequests).values({
      userId,
      averageRpeAtRequest: avgRpe !== null ? Math.round(Number(avgRpe)) : null,
    });

    return {
      success: true,
      requestId: result.insertId,
    };
  });
};
