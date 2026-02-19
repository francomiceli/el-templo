import { FastifyPluginAsync } from "fastify";
import { eq, sql, and } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SessionGeneratorService } from "./service";
import { SpomService } from "../spom/service";
import { DAY_OF_WEEK_MAP } from "../shared/training-constants";
import { assembleVideoUrl } from "../shared/video-url";
import {
  getDailySessionSchema,
  generateSessionSchema,
  getSessionByIdSchema,
  getWeeklySessionsSchema,
  completeSessionSchema,
  dailySessionResponse,
  weeklySessionsResponse,
  generateSessionResponse,
  sessionWithNotFound,
  completeSessionResponse,
  type GetDailySessionInput,
  type GenerateSessionInput,
  type GetSessionByIdParams,
  type GetWeeklySessionsInput,
  type CompleteSessionInput,
} from "./schemas";
import type { LevelGroup, DaySession, ExerciseLevel } from "./types";

/**
 * Map individual level to level group for session generation
 */
function levelToLevelGroup(level: string): LevelGroup {
  switch (level) {
    case "alfa":
    case "delta":
      return "alfa_delta";
    case "sigma":
      return "sigma";
    case "omega":
    case "spartan":
      return "omega";
    default:
      return "alfa_delta";
  }
}

/**
 * Map date to Spanish day name
 */
function dateToDayName(date: string): string {
  const d = new Date(date + "T00:00:00");
  return DAY_OF_WEEK_MAP[d.getDay()] || "domingo";
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
    blocks: session.blocks.map((block, idx) => {
      // Separate main exercises from mobility
      const mainExercises = block.exercises.filter(
        (ex) => ex.exerciseType !== "mobility",
      );
      const mobilityEx = block.exercises.find(
        (ex) => ex.exerciseType === "mobility",
      );

      return {
        blockId: block.blockId,
        role: block.role,
        route: block.route,
        pattern: block.pattern,
        intensity: block.intensity,
        repsBudget: block.repsBudget,
        format: block.format?.name || block.format,
        sortOrder: idx,
        exercises: mainExercises.map((ex, exIdx) => ({
          exerciseId: ex.exerciseId,
          exerciseName: ex.name,
          contraction: ex.contraction,
          reps: ex.reps,
          repsMax: ex.repsMax ?? null,
          seconds: ex.seconds,
          secondsMax: ex.secondsMax ?? null,
          increment: ex.increment ?? null,
          rest: ex.rest,
          notes: ex.notes,
          videoUrl: assembleVideoUrl(ex.videoUrl),
          sortOrder: exIdx,
        })),
        mobilityExercise: mobilityEx
          ? {
              exerciseId: mobilityEx.exerciseId,
              exerciseName: mobilityEx.name,
              contraction: mobilityEx.contraction,
              reps: mobilityEx.reps,
              repsMax: mobilityEx.repsMax ?? null,
              seconds: mobilityEx.seconds,
              secondsMax: mobilityEx.secondsMax ?? null,
              increment: mobilityEx.increment ?? null,
              rest: mobilityEx.rest,
              notes: mobilityEx.notes,
              videoUrl: assembleVideoUrl(mobilityEx.videoUrl),
            }
          : null,
      };
    }),
  };
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionGeneratorService(fastify.db);
  const spomService = new SpomService(fastify.db);

  // GET /sessions/daily - Get member's session for a date
  fastify.get<{ Querystring: GetDailySessionInput }>(
    "/daily",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getDailySessionSchema,
        response: dailySessionResponse,
      },
    },
    async (request, reply) => {
      const { date } = request.query;
      const { userId } = request.user;

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // 2. Extract memberLevel and compute levelGroup
      const memberLevel = user.level as ExerciseLevel;

      // 3. Get current SPOM week
      const week = await spomService.getCurrentWeek();

      // 4. Convert date to day of week
      const dayName = dateToDayName(date);

      // Skip Sundays (domingo) - no sessions
      if (dayName === "domingo") {
        return reply.status(400).send({ error: "No sessions on Sunday" });
      }

      // 5. Build dayId with memberLevel
      const dayId = `W${week}-${dayName}-${memberLevel}`;

      // 6. Check DB for approved session only (no auto-generation for members)
      const session = await sessionService.getSessionByDayId(dayId, true); // requireApproved=true
      if (!session) {
        return reply.status(404).send({
          error: "Sesion no disponible",
          message: "La sesion para este dia aun no ha sido aprobada",
        });
      }

      return sessionToResponse(session);
    },
  );

  // GET /sessions/weekly - Get member's sessions for a full week
  fastify.get<{ Querystring: GetWeeklySessionsInput }>(
    "/weekly",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getWeeklySessionsSchema,
        response: weeklySessionsResponse,
      },
    },
    async (request, reply) => {
      const { weekStart } = request.query;
      const { userId } = request.user;

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // 2. Extract memberLevel
      const memberLevel = user.level as ExerciseLevel;

      // 3. Get current SPOM week
      const week = await spomService.getCurrentWeek();

      // 4. Generate dates for the week (Mon-Sun)
      const monday = new Date(weekStart + "T00:00:00");
      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        weekDates.push(`${year}-${month}-${day}`);
      }

      // 5. Build dayIds for all training days and batch fetch
      const dateToDay = new Map<string, string>();
      const dayIds: string[] = [];
      for (const date of weekDates) {
        const dayName = dateToDayName(date);
        dateToDay.set(date, dayName);
        if (dayName !== "domingo") {
          dayIds.push(`W${week}-${dayName}-${memberLevel}`);
        }
      }

      // Batch fetch all approved sessions (single query instead of N+1)
      const batchSessions = await sessionService.getSessionsByDayIds(
        dayIds,
        true,
      );

      const sessionsMap: Record<
        string,
        ReturnType<typeof sessionToResponse> | null
      > = {};
      for (const date of weekDates) {
        const dayName = dateToDay.get(date)!;
        if (dayName === "domingo") {
          sessionsMap[date] = null;
          continue;
        }
        const dayId = `W${week}-${dayName}-${memberLevel}`;
        const session = batchSessions.get(dayId);
        sessionsMap[date] = session ? sessionToResponse(session) : null;
      }

      return { sessions: sessionsMap };
    },
  );

  // POST /sessions/generate - Admin: generate specific session
  fastify.post<{ Body: GenerateSessionInput }>(
    "/generate",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...generateSessionSchema,
        response: generateSessionResponse,
      },
    },
    async (request, reply) => {
      // Check admin role
      if (!["admin", "superadmin"].includes(request.user.role)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { week, day, levelGroup } = request.body;

      // Extract optional memberLevel from request body, or derive from levelGroup
      const body = request.body as GenerateSessionInput & {
        memberLevel?: ExerciseLevel;
      };
      const memberLevel =
        body.memberLevel ??
        ((levelGroup === "alfa_delta"
          ? "delta"
          : levelGroup === "sigma"
            ? "sigma"
            : "omega") as ExerciseLevel);

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
    },
  );

  // GET /sessions/:id - Get session by ID with full details
  fastify.get<{ Params: GetSessionByIdParams }>(
    "/:id",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...getSessionByIdSchema,
        response: sessionWithNotFound,
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const session = await sessionService.getSessionWithDetails(id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      return sessionToResponse(session);
    },
  );

  // POST /sessions/complete - Record completed session (upsert by dayId+userId)
  fastify.post<{ Body: CompleteSessionInput }>(
    "/complete",
    {
      onRequest: [fastify.authenticate],
      schema: {
        ...completeSessionSchema,
        response: completeSessionResponse,
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const {
        dayId,
        date,
        startedAt,
        rpe,
        notes,
        blocksCompleted,
        exercisesCompleted,
      } = request.body;

      // Get user's branchId
      const [user] = await fastify.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      // Check if completion already exists for this user+dayId (upsert)
      const [existing] = await fastify.db
        .select({ id: schema.completedSessions.id })
        .from(schema.completedSessions)
        .where(
          and(
            eq(schema.completedSessions.userId, userId),
            eq(schema.completedSessions.dayId, dayId),
          ),
        );

      let completedSessionId: number;

      if (existing) {
        // Update existing record
        await fastify.db
          .update(schema.completedSessions)
          .set({
            date,
            startedAt: new Date(startedAt),
            completedAt: new Date(),
            rpe,
            notes,
            blocksCompleted,
            exercisesCompleted: exercisesCompleted ?? null,
          })
          .where(eq(schema.completedSessions.id, existing.id));
        completedSessionId = existing.id;
      } else {
        // Insert new record
        const [result] = await fastify.db
          .insert(schema.completedSessions)
          .values({
            userId,
            dayId,
            date,
            branchId: user.branchId,
            startedAt: new Date(startedAt),
            completedAt: new Date(),
            rpe,
            notes,
            blocksCompleted,
            exercisesCompleted: exercisesCompleted ?? null,
          });
        completedSessionId = result.insertId;
      }

      // Query total days trained (unique dates with completed sessions)
      const [countResult] = await fastify.db
        .select({ count: sql<number>`COUNT(DISTINCT date)` })
        .from(schema.completedSessions)
        .where(eq(schema.completedSessions.userId, userId));

      return {
        success: true,
        completedSessionId,
        totalDaysTrained: countResult?.count ?? 1,
      };
    },
  );
};
