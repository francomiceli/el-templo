import { FastifyPluginAsync } from "fastify";
import { eq, sql, and, or, gte, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
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
import { isKairos } from "./pipeline/utils/kairos";
import { AuraService } from "../aura/service";
import { StreakService } from "../streaks";
import { ProgramsService } from "../programs/service";
import { NotificationService } from "../notifications/service";

/**
 * Map individual level to level group for session generation
 */
function levelToLevelGroup(level: string): LevelGroup {
  switch (level) {
    // Phase 129 (D-02): kairos reuses the alfa_delta group. The default already
    // returns alfa_delta, but the explicit case prevents silent misrouting if
    // the default ever changes.
    case "kairos":
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
 * Build the ordered list of candidate dayIds to try for a member on a given
 * week/day, most-specific first. The caller resolves the first candidate that
 * has an approved session.
 *
 * Fallback chain for a goal-plan member (Phase 83 GP-{type} views):
 *   1. GP-{type}-W{week}-{day}-{level}   curated goal-plan session
 *   2. GP-{type}-W{week}-{day}-alfa      (only when level is kairos)
 *   3. W{week}-{day}-{level}             Foundation (templo) session
 *   4. W{week}-{day}-alfa               (only when level is kairos)
 *
 * Goal-plan libraries are authored up to a fixed week while /daily and /weekly
 * index by calendar week, so once the calendar passes the last authored week a
 * goal-plan member has no curated session. Rather than 404, they fall back to
 * the Foundation session for the same week/day/level — the same content that
 * presencial/Foundation members receive. This mirrors the kairos→alfa fallback.
 *
 * Foundation/templo members (buildAsTemplo, or a program with no goalPlanType)
 * only ever resolve to the templo W* dayId.
 */
function buildDayIdCandidates(
  buildAsTemplo: boolean,
  goalPlanType: string | null,
  week: number,
  dayName: string,
  effectiveLevel: string,
): string[] {
  const templo = (lvl: string): string => `W${week}-${dayName}-${lvl}`;
  const candidates: string[] = [];
  if (!buildAsTemplo && goalPlanType) {
    const gp = (lvl: string): string =>
      `GP-${goalPlanType}-W${week}-${dayName}-${lvl}`;
    candidates.push(gp(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(gp("alfa"));
    // Foundation fallback (see docblock).
    candidates.push(templo(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(templo("alfa"));
  } else {
    candidates.push(templo(effectiveLevel));
    if (effectiveLevel === "kairos") candidates.push(templo("alfa"));
  }
  return candidates;
}

/**
 * Convert DaySession to API response format
 */
function sessionToResponse(
  session: DaySession,
  formatDescriptions: Map<string, string>,
) {
  return {
    dayId: session.dayId,
    week: session.week,
    day: session.day,
    levelGroup: session.levelGroup,
    memberLevel: session.memberLevel,
    sessionMode: session.sessionMode || "regular",
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
        formatParams: block.formatParams ?? null,
        formatDescription:
          formatDescriptions.get(
            (block.format?.name || block.format) as string,
          ) ?? null,
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

// =============================================================================
// Phase 104 R7 + R8: view resolution + ownership gating for session endpoints
// =============================================================================
//
// Both `/sessions/daily` and `/sessions/weekly` need identical "which view does
// this user see, and are they allowed to see it?" logic. The helper below
// returns one of:
//   - { kind: "templo" } — build W* dayIds
//   - { kind: "program", enrollment } — build GP-{type}-* dayIds (or W* if
//     enrollment.goalPlanType is NULL, e.g. Foundation programs per Phase 83)
//   - { kind: "deny", status, message } — handler returns the matching HTTP
//     status with the Spanish message verbatim
//
// Spec mapping:
//   R7 — `view=templo` requires active presencial subscription; `view=program`
//        requires `currentProgramEnrollmentId` pointing at an active enrollment
//        owned by the user.
//   R8 — Default resolution (no `view` param): prefer current program if the
//        pointer is valid, else templo if presencial active, else first active
//        enrollment by id ASC, else 404.
type ResolveViewResult =
  | { kind: "templo" }
  | {
      kind: "program";
      enrollment: {
        id: number;
        programId: number;
        goalPlanType: string | null;
      };
    }
  | { kind: "deny"; status: 403 | 404; message: string };

async function resolveSessionView(
  db: MySql2Database<typeof schema>,
  userId: number,
  requested: "templo" | "program" | undefined,
): Promise<ResolveViewResult> {
  // 1. Active presencial subscription? Active OR paused both count — paused
  //    members retain plan access (consistent with rest of app per
  //    subscription state machine).
  const [presencialSub] = await db
    .select({ id: schema.subscriptions.id })
    .from(schema.subscriptions)
    .innerJoin(
      schema.subscriptionPlans,
      eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
    )
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        or(
          eq(schema.subscriptions.status, "active"),
          eq(schema.subscriptions.status, "paused"),
        ),
        eq(schema.subscriptionPlans.planCategory, "presencial"),
      ),
    )
    .limit(1);
  const hasPresencial = !!presencialSub;

  // 2. Read user's currentProgramEnrollmentId pointer (Phase 104 Plan 01).
  const [user] = await db
    .select({
      currentProgramEnrollmentId: schema.users.currentProgramEnrollmentId,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  async function loadEnrollment(enrollmentId: number) {
    const [row] = await db
      .select({
        id: schema.programEnrollments.id,
        userId: schema.programEnrollments.userId,
        programId: schema.programEnrollments.programId,
        status: schema.programEnrollments.status,
        goalPlanType: schema.programs.goalPlanType,
      })
      .from(schema.programEnrollments)
      .innerJoin(
        schema.programs,
        eq(schema.programs.id, schema.programEnrollments.programId),
      )
      .where(eq(schema.programEnrollments.id, enrollmentId))
      .limit(1);
    return row ?? null;
  }

  if (requested === "templo") {
    if (!hasPresencial) {
      return {
        kind: "deny",
        status: 403,
        message:
          "Necesitas un plan presencial activo para ver las sesiones del Templo",
      };
    }
    return { kind: "templo" };
  }

  if (requested === "program") {
    if (!user || user.currentProgramEnrollmentId === null) {
      return {
        kind: "deny",
        status: 404,
        message: "No tenes un programa activo seleccionado",
      };
    }
    const enrollment = await loadEnrollment(user.currentProgramEnrollmentId);
    if (
      !enrollment ||
      enrollment.userId !== userId ||
      enrollment.status !== "active"
    ) {
      return {
        kind: "deny",
        status: 403,
        message:
          "Necesitas estar inscripto en un programa para ver estas sesiones",
      };
    }
    return {
      kind: "program",
      enrollment: {
        id: enrollment.id,
        programId: enrollment.programId,
        goalPlanType: enrollment.goalPlanType,
      },
    };
  }

  // No `view` param — derive default per R8.
  if (
    user?.currentProgramEnrollmentId !== null &&
    user?.currentProgramEnrollmentId !== undefined
  ) {
    const enrollment = await loadEnrollment(user.currentProgramEnrollmentId);
    if (
      enrollment &&
      enrollment.userId === userId &&
      enrollment.status === "active"
    ) {
      return {
        kind: "program",
        enrollment: {
          id: enrollment.id,
          programId: enrollment.programId,
          goalPlanType: enrollment.goalPlanType,
        },
      };
    }
    // Pointer is stale — fall through to templo or first enrollment.
  }
  if (hasPresencial) return { kind: "templo" };

  // Last resort: first active enrollment by id ASC (SPEC R10 heuristic).
  const [firstEnrollment] = await db
    .select({
      id: schema.programEnrollments.id,
      programId: schema.programEnrollments.programId,
      goalPlanType: schema.programs.goalPlanType,
    })
    .from(schema.programEnrollments)
    .innerJoin(
      schema.programs,
      eq(schema.programs.id, schema.programEnrollments.programId),
    )
    .where(
      and(
        eq(schema.programEnrollments.userId, userId),
        eq(schema.programEnrollments.status, "active"),
      ),
    )
    .orderBy(schema.programEnrollments.id)
    .limit(1);

  if (firstEnrollment) {
    return {
      kind: "program",
      enrollment: firstEnrollment,
    };
  }

  return {
    kind: "deny",
    status: 404,
    message: "No hay vista disponible para tu cuenta",
  };
}

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  const sessionService = new SessionGeneratorService(fastify.db);
  const auraService = new AuraService(fastify.db);
  const streakService = new StreakService(fastify.db, auraService, fastify.log);
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

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      // 2. Extract memberLevel — honor optional ?level= override (member can
      // train at any level; users.level itself is only changed by a coach).
      const memberLevel = (levelOverride ?? user.level) as ExerciseLevel;

      // 3. Phase 104 R7+R8: resolve view + ownership gate (mirrors /weekly).
      const viewResult = await resolveSessionView(
        fastify.db,
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
          // WR-04 / D-03: kairos inherits Alfa, so on ROM days a kairos member
          // reads the alfa ROM variant (not delta). Mapping non-alfa→delta
          // would hand kairos a full delta ROM session, breaking the "kairos
          // always trains ultra-simple" promise.
          effectiveLevel =
            memberLevel === "alfa" || isKairos(memberLevel) ? "alfa" : "delta";
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
        ...sessionToResponse(session, formatDescriptions),
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

      // 1. Get member's level from database
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      // 2. Extract memberLevel — honor optional ?level= override.
      const memberLevel = (levelOverride ?? user.level) as ExerciseLevel;

      // 3. Phase 104 R7+R8: resolve which view to serve and gate access.
      const viewResult = await resolveSessionView(
        fastify.db,
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
        const effectiveLevel = isRomDay
          ? memberLevel === "alfa" || isKairos(memberLevel)
            ? "alfa"
            : "delta"
          : memberLevel;
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
          ? sessionToResponse(session, formatDescriptions)
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
        .where(eq(schema.users.id, userId));

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
        await streakService.updateStreak(userId);
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
