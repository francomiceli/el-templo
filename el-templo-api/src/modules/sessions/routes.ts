import { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { SessionGeneratorService } from './service';
import { SpomService } from '../spom/service';
import {
  getDailySessionSchema,
  generateSessionSchema,
  getSessionByIdSchema,
  getWeeklySessionsSchema,
  type GetDailySessionInput,
  type GenerateSessionInput,
  type GetSessionByIdParams,
  type GetWeeklySessionsInput,
} from './schemas';
import type { LevelGroup, DaySession, ExerciseLevel } from './types';

/**
 * Map individual level to level group for session generation
 */
function levelToLevelGroup(level: string): LevelGroup {
  switch (level) {
    case 'alfa':
    case 'delta':
      return 'alfa_delta';
    case 'sigma':
      return 'sigma';
    case 'omega':
    case 'spartan':
      return 'omega';
    default:
      return 'alfa_delta';
  }
}

/**
 * Map date to Spanish day name
 */
function dateToDayName(date: string): string {
  const dayMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const d = new Date(date + 'T00:00:00');
  return dayMap[d.getDay()];
}

/**
 * Convert DaySession to API response format
 */
function sessionToResponse(session: DaySession) {
  return {
    dayId: session.dayId,
    week: session.week,
    day: session.day,
    levelGroup: session.levelGroup,
    memberLevel: session.memberLevel,
    blockCount: session.blocks.length,
    blocks: session.blocks.map((block, idx) => ({
      blockId: block.blockId,
      role: block.role,
      route: block.route,
      pattern: block.pattern,
      intensity: block.intensity,
      repsBudget: block.repsBudget,
      format: block.format?.name || block.format,
      sortOrder: idx,
      exercises: block.exercises.map((ex, exIdx) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        contraction: ex.contraction,
        reps: ex.reps,
        seconds: ex.seconds,
        rest: ex.rest,
        notes: ex.notes,
        sortOrder: exIdx,
      })),
    })),
  };
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionGeneratorService(fastify.db);
  const spomService = new SpomService(fastify.db);

  // GET /sessions/daily - Get member's session for a date
  fastify.get<{ Querystring: GetDailySessionInput }>('/daily', {
    onRequest: [fastify.authenticate],
    schema: {
      ...getDailySessionSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            dayId: { type: 'string' },
            week: { type: 'integer' },
            day: { type: 'string' },
            levelGroup: { type: 'string' },
            memberLevel: { type: 'string' },
            blockCount: { type: 'integer' },
            blocks: { type: 'array' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { date } = request.query;
    const { userId } = request.user;

    // 1. Get member's level from database
    const [user] = await fastify.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // 2. Extract memberLevel and compute levelGroup
    const memberLevel = user.level as ExerciseLevel;
    const levelGroup = levelToLevelGroup(memberLevel);

    // 3. Get current SPOM week
    const week = await spomService.getCurrentWeek();

    // 4. Convert date to day of week
    const dayName = dateToDayName(date);

    // Skip Sundays (domingo) - no sessions
    if (dayName === 'domingo') {
      return reply.status(400).send({ error: 'No sessions on Sunday' });
    }

    // 5. Build dayId with memberLevel
    const dayId = `W${week}-${dayName}-${memberLevel}`;

    // 6. Check DB cache
    const cached = await sessionService.getSessionByDayId(dayId);
    if (cached) {
      return sessionToResponse(cached);
    }

    // 7. Generate and save
    const session = await sessionService.generateDailySession({
      week,
      day: dayName,
      levelGroup,
      memberLevel,
    });

    // 8. Save to database (explicit persistence)
    await sessionService.saveSession(session);

    return sessionToResponse(session);
  });

  // GET /sessions/weekly - Get member's sessions for a full week
  fastify.get<{ Querystring: GetWeeklySessionsInput }>('/weekly', {
    onRequest: [fastify.authenticate],
    schema: {
      ...getWeeklySessionsSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            sessions: {
              type: 'object',
              additionalProperties: {
                oneOf: [
                  { type: 'null' },
                  {
                    type: 'object',
                    properties: {
                      dayId: { type: 'string' },
                      week: { type: 'integer' },
                      day: { type: 'string' },
                      levelGroup: { type: 'string' },
                      memberLevel: { type: 'string' },
                      blockCount: { type: 'integer' },
                      blocks: { type: 'array' },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { weekStart } = request.query;
    const { userId } = request.user;

    // 1. Get member's level from database
    const [user] = await fastify.db
      .select({ level: schema.users.level })
      .from(schema.users)
      .where(eq(schema.users.id, userId));

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // 2. Extract memberLevel and compute levelGroup
    const memberLevel = user.level as ExerciseLevel;
    const levelGroup = levelToLevelGroup(memberLevel);

    // 3. Get current SPOM week
    const week = await spomService.getCurrentWeek();

    // 4. Generate dates for the week (Mon-Sun)
    const monday = new Date(weekStart + 'T00:00:00');
    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      weekDates.push(`${year}-${month}-${day}`);
    }

    // 5. Fetch/generate sessions for each day (skip Sunday)
    const sessionsMap: Record<string, ReturnType<typeof sessionToResponse> | null> = {};

    for (const date of weekDates) {
      const dayName = dateToDayName(date);

      // Skip Sunday
      if (dayName === 'domingo') {
        sessionsMap[date] = null;
        continue;
      }

      const dayId = `W${week}-${dayName}-${memberLevel}`;

      // Check cache first
      let session = await sessionService.getSessionByDayId(dayId);

      if (!session) {
        // Generate and save
        session = await sessionService.generateDailySession({
          week,
          day: dayName,
          levelGroup,
          memberLevel,
        });
        await sessionService.saveSession(session);
      }

      sessionsMap[date] = sessionToResponse(session);
    }

    return { sessions: sessionsMap };
  });

  // POST /sessions/generate - Admin: generate specific session
  fastify.post<{ Body: GenerateSessionInput }>('/generate', {
    onRequest: [fastify.authenticate],
    schema: {
      ...generateSessionSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            dayId: { type: 'string' },
            week: { type: 'integer' },
            day: { type: 'string' },
            levelGroup: { type: 'string' },
            memberLevel: { type: 'string' },
            blockCount: { type: 'integer' },
            blocks: { type: 'array' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Check admin role
    if (!['admin', 'superadmin'].includes(request.user.role)) {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    const { week, day, levelGroup } = request.body;

    // Extract optional memberLevel from request body, or derive from levelGroup
    const memberLevel = (request.body as any).memberLevel ??
      (levelGroup === 'alfa_delta' ? 'delta' : levelGroup === 'sigma' ? 'sigma' : 'omega') as ExerciseLevel;

    // Check if already exists in cache
    const dayId = `W${week}-${day}-${memberLevel}`;
    const existing = await sessionService.getSessionByDayId(dayId);
    if (existing) {
      return sessionToResponse(existing);
    }

    // Generate session
    const session = await sessionService.generateDailySession({
      week,
      day,
      levelGroup,
      memberLevel,
    });

    // Save to database (explicit persistence)
    await sessionService.saveSession(session);

    return sessionToResponse(session);
  });

  // GET /sessions/:id - Get session by ID with full details
  fastify.get<{ Params: GetSessionByIdParams }>('/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      ...getSessionByIdSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            dayId: { type: 'string' },
            week: { type: 'integer' },
            day: { type: 'string' },
            levelGroup: { type: 'string' },
            memberLevel: { type: 'string' },
            blockCount: { type: 'integer' },
            blocks: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const session = await sessionService.getSessionWithDetails(id);
    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return sessionToResponse(session);
  });
};
