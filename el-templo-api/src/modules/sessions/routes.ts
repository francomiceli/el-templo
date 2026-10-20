import { FastifyPluginAsync } from "fastify";
import { eq, sql, and, gte, lte } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SessionGeneratorService } from "./service";
import { ADMIN_ROLES } from "../shared/permissions";
import {
  DAY_NAME_TO_NUMBER,
  parseDayId,
  isTrainingLevel,
} from "../shared/training-constants";
// Phase 164: the week/day anchor moved to shared/week-dates.ts so the branch TV
// resolves "today's session" with the exact same arithmetic as /sessions/daily.
import { dateToWeekNumber, dateToDayName } from "../shared/week-dates";
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
import type { ExerciseLevel } from "./types";
import {
  buildDayIdCandidates,
  effectiveLevelForDay,
  resolveSessionView,
} from "./session-view";
import { sessionToResponse } from "./session-response";
import { AuraService } from "../aura/service";
import { StreakService } from "../streaks";
import { ProgramsService } from "../programs/service";
import { NotificationService } from "../notifications/service";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionGeneratorService(fastify.db);
  const auraService = new AuraService(fastify.db);
  const streakService = new StreakService(fastify.db, fastify.log);
  const programsService = new ProgramsService(fastify.db, fastify.log);
  const notificationService = new NotificationService(fastify.db, fastify.log);

  // Load format descriptions once at startup (small, static table)
  const formatRows = await fastify.db
    .select({
      name: schema.formats.name,
      description: schema.formats.description,
    })
    .from(schema.formats);
  const formatDescriptions = new Map<string, string>(
    formatRows
      .filter((r) => r.description !== null)
      .map((r) => [r.name, r.description!]),
  );

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
      const { date, level: levelOverride } = request.query;
      const { userId } = request.user;

      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia fila
      // del socio autenticado (attachCountryScope + assertTenant) — D-09:
      // esta ruta member-facing NO recibe su caso de aislamiento en esta
      // fase (dueño: fase de sessions, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.daily");

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      // 2. Extract memberLevel — honor optional ?level= override (member can
      // train at any level; users.level itself is only changed by a coach).
      const memberLevel = (levelOverride ?? user.level) as ExerciseLevel;

      // 3. Phase 104 R7+R8: resolve view + ownership gate (mirrors /weekly).
      const viewResult = await resolveSessionView(
        fastify.db,
        ctx,
        userId,
        request.query.view,
      );
      if (viewResult.kind === "deny") {
        return reply
          .status(viewResult.status)
          .send({ error: viewResult.message });
      }
      const buildAsTemplo =
        viewResult.kind === "templo" ||
        (viewResult.kind === "program" &&
          viewResult.enrollment.goalPlanType === null);
      const goalPlanType =
        viewResult.kind === "program"
          ? viewResult.enrollment.goalPlanType
          : null;

      // 4. Derive week number from the requested date
      const week = dateToWeekNumber(date);

      // 5. Convert date to day of week
      const dayName = dateToDayName(date);

      // Skip Sundays (domingo) - no sessions
      if (dayName === "domingo") {
        return reply
          .status(400)
          .send({ error: "No hay sesiones los domingos" });
      }

      // 6. Check if this day is a ROM day and map level accordingly (per D-29)
      const dayNumber = DAY_NAME_TO_NUMBER[dayName];
      let effectiveLevel: string = memberLevel;
      if (dayNumber) {
        const [dayModeRow] = await fastify.db
          .select()
          .from(schema.dayModes)
          .where(eq(schema.dayModes.dayOfWeek, dayNumber));
        if (dayModeRow?.sessionMode === "rom") {
          // WR-04 / D-03: kairos inherits Alfa on ROM days (ver
          // effectiveLevelForDay).
          effectiveLevel = effectiveLevelForDay(memberLevel, true);
        }
      }

      // 7. Build the ordered dayId candidates for this view (Phase 104 R7 +
      // Foundation fallback + KAIROS→alfa fallback). See buildDayIdCandidates.
      const candidates = buildDayIdCandidates(
        buildAsTemplo,
        goalPlanType,
        week,
        dayName,
        effectiveLevel,
      );

      // 8. Check DB for approved sessions only (no auto-generation for members).
      // Batch-fetch all candidates in one query and take the first that exists,
      // honoring candidate order (curated goal-plan > Foundation fallback).
      const found = await sessionService.getSessionsByDayIds(candidates, true);
      const session = candidates.map((id) => found.get(id)).find(Boolean);
      if (!session) {
        return reply.status(404).send({
          error: "Sesion no disponible",
          message: "La sesion para este dia aun no ha sido aprobada",
        });
      }

      // Phase 104 R8: include `view` alongside session payload (sibling shape).
      return {
        ...sessionToResponse(session, formatDescriptions, {
          hideAlternativeBlocks: true,
        }),
        view: viewResult.kind,
      };
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
      const { weekStart, level: levelOverride } = request.query;
      const { userId } = request.user;

      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia fila
      // del socio autenticado (attachCountryScope + assertTenant) — D-09:
      // esta ruta member-facing NO recibe su caso de aislamiento en esta
      // fase (dueño: fase de sessions, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.weekly");

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      // 2. Extract memberLevel — honor optional ?level= override.
      const memberLevel = (levelOverride ?? user.level) as ExerciseLevel;

      // 3. Phase 104 R7+R8: resolve which view to serve and gate access.
      const viewResult = await resolveSessionView(
        fastify.db,
        ctx,
        userId,
        request.query.view,
      );
      if (viewResult.kind === "deny") {
        return reply
          .status(viewResult.status)
          .send({ error: viewResult.message });
      }
      // Foundation programs (goalPlanType=null per Phase 83 D-08) build
      // templo-style W* dayIds. Templo view obviously also builds W*.
      const buildAsTemplo =
        viewResult.kind === "templo" ||
        (viewResult.kind === "program" &&
          viewResult.enrollment.goalPlanType === null);
      const goalPlanType =
        viewResult.kind === "program"
          ? viewResult.enrollment.goalPlanType
          : null;

      // 4. Derive week number from the requested weekStart date
      const week = dateToWeekNumber(weekStart);

      // 5. Generate dates for the week (Mon-Sun)
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

      // 6. Load day modes for ROM level mapping (per D-29)
      const dayModeRows = await fastify.db.select().from(schema.dayModes);
      const romDayNumbers = new Set(
        dayModeRows
          .filter((r) => r.sessionMode === "rom")
          .map((r) => r.dayOfWeek),
      );

      // 7. Build dayId candidates per training day (Phase 104 R7 + Foundation
      // fallback + KAIROS→alfa fallback). See buildDayIdCandidates. ROM days
      // map non-alfa levels to delta (per D-29). Candidates are stored per date
      // so the assembly step can pick the first approved session without
      // recomputing the level/dayId logic.
      const candidatesByDate = new Map<string, string[]>();
      const dayIds: string[] = [];
      for (const date of weekDates) {
        const dayName = dateToDayName(date);
        if (dayName === "domingo") continue;
        const dayNum = DAY_NAME_TO_NUMBER[dayName];
        const isRomDay = dayNum ? romDayNumbers.has(dayNum) : false;
        // WR-04 / D-03: kairos inherits Alfa → alfa ROM variant on ROM days.
        const effectiveLevel = effectiveLevelForDay(memberLevel, isRomDay);
        const candidates = buildDayIdCandidates(
          buildAsTemplo,
          goalPlanType,
          week,
          dayName,
          effectiveLevel,
        );
        candidatesByDate.set(date, candidates);
        dayIds.push(...candidates);
      }

      // Batch fetch all approved sessions (single query instead of N+1)
      const batchSessions = await sessionService.getSessionsByDayIds(
        dayIds,
        true,
      );

      const sessionsMap: Record<string, unknown> = {};
      for (const date of weekDates) {
        // No candidates → domingo / non-training day.
        const candidates = candidatesByDate.get(date);
        if (!candidates) {
          sessionsMap[date] = null;
          continue;
        }
        // First candidate with an approved session wins (curated goal-plan >
        // Foundation fallback > kairos→alfa fallback, per buildDayIdCandidates).
        const session = candidates
          .map((id) => batchSessions.get(id))
          .find(Boolean);
        sessionsMap[date] = session
          ? sessionToResponse(session, formatDescriptions, {
              hideAlternativeBlocks: true,
            })
          : null;
      }

      // 7. Fetch completed dates for this week
      const lastDate = weekDates[weekDates.length - 1];
      const completedRows = await fastify.db
        .select({ date: schema.completedSessions.date })
        .from(schema.completedSessions)
        .where(
          and(
            eq(schema.completedSessions.userId, userId),
            gte(schema.completedSessions.date, weekStart),
            lte(schema.completedSessions.date, lastDate),
          ),
        );
      const completedDates = completedRows.map((r) => r.date);

      // Phase 104 R8: echo resolved view in response so client knows what was served.
      return {
        sessions: sessionsMap,
        completedDates,
        view: viewResult.kind,
      };
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
      if (!(ADMIN_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { week, day, levelGroup } = request.body;

      // WR-03 / IN-03: memberLevel is now a declared (optional) body property
      // including kairos — no cast needed. When omitted, derive from levelGroup.
      const memberLevel: ExerciseLevel =
        request.body.memberLevel ??
        (levelGroup === "alfa_delta"
          ? "delta"
          : levelGroup === "sigma"
            ? "sigma"
            : "omega");

      // Check if already exists in cache
      const dayId = `W${week}-${day}-${memberLevel}`;
      const existing = await sessionService.getSessionByDayId(dayId);
      if (existing) {
        return sessionToResponse(existing, formatDescriptions);
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

      return sessionToResponse(session, formatDescriptions);
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
        return reply.status(404).send({ error: "Sesion no encontrada" });
      }

      return sessionToResponse(session, formatDescriptions);
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

      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia fila
      // del socio autenticado (attachCountryScope + assertTenant) — D-09:
      // esta ruta member-facing NO recibe su caso de aislamiento en esta
      // fase (dueño: fase de sessions, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "sessions.complete");

      // Parse and validate the level the session was played at (last dayId
      // segment). Independent of users.level so members can train at any level.
      const sessionLevel = parseDayId(dayId).level;
      if (!isTrainingLevel(sessionLevel)) {
        return reply
          .status(400)
          .send({ error: "dayId invalido: nivel no reconocido" });
      }

      // Get user's branchId
      const [user] = await fastify.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
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

      const completedAt = new Date();
      const startedAtDate = new Date(startedAt);
      // Duration in seconds, server-computed. Clamped at 0 to absorb client/
      // server clock skew (previously observed as -1s rows).
      const durationSec = Math.max(
        0,
        Math.floor((completedAt.getTime() - startedAtDate.getTime()) / 1000),
      );

      if (existing) {
        // Update existing record
        await fastify.db
          .update(schema.completedSessions)
          .set({
            date,
            startedAt: startedAtDate,
            completedAt,
            duration: durationSec,
            rpe,
            notes,
            blocksCompleted,
            exercisesCompleted: exercisesCompleted ?? null,
            sessionLevel,
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
            startedAt: startedAtDate,
            completedAt,
            duration: durationSec,
            rpe,
            notes,
            blocksCompleted,
            exercisesCompleted: exercisesCompleted ?? null,
            sessionLevel,
          });
        completedSessionId = result.insertId;
      }

      // Query total days trained (unique dates with completed sessions)
      const [countResult] = await fastify.db
        .select({ count: sql<number>`COUNT(DISTINCT date)` })
        .from(schema.completedSessions)
        .where(eq(schema.completedSessions.userId, userId));

      // Award 10 AURA for session completion (D-11)
      try {
        await auraService.award({
          userId,
          sourceType: "training_completion",
          referenceType: "completed_session",
          referenceId: completedSessionId,
        });
      } catch (auraErr: unknown) {
        request.log.warn(
          { err: auraErr, userId, dayId },
          "AURA award failed for session completion",
        );
      }

      // Update streak (D-03)
      try {
        await streakService.updateStreak(ctx, userId);
      } catch (streakErr: unknown) {
        request.log.warn(
          { err: streakErr, userId },
          "Streak update failed after session completion",
        );
      }

      // Update program enrollment progress (per D-04)
      try {
        await programsService.recordSessionForProgram(userId, auraService);
      } catch (progErr: unknown) {
        request.log.warn(
          { err: progErr, userId },
          "Program session recording failed after session completion",
        );
      }

      // Queue post-session soreness reminder (per D-05: 2h after session completion)
      try {
        const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await notificationService.queueNotification({
          userId,
          templateKey: "post_session_soreness",
          scheduledAt: twoHoursLater,
        });
      } catch (notifErr: unknown) {
        request.log.warn(
          { err: notifErr, userId },
          "Post-session soreness notification queueing failed (graceful degradation)",
        );
      }

      return {
        success: true,
        completedSessionId,
        totalDaysTrained: countResult?.count ?? 1,
      };
    },
  );
};
