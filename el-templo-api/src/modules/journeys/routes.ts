/**
 * Journey API Routes
 *
 * Member endpoints for journey lifecycle (select, session, complete)
 * and admin endpoints for generation and member overview.
 */

import { FastifyPluginAsync } from "fastify";
import { eq, and, like, sql, desc } from "drizzle-orm";
import * as schema from "../../db/schema";
import { JourneyService } from "./service";
import { JOURNEY_METADATA, ALL_JOURNEY_TYPES } from "./constants";
import { assembleVideoUrl } from "../shared/video-url";
import type { JourneyType, JourneyDuration } from "./types";
import type { DaySession } from "../sessions/types";
import {
  getMetadataSchema,
  getActiveJourneySchema,
  selectJourneySchema,
  getArchivedJourneysSchema,
  getJourneySessionSchema,
  completeJourneySchema,
  generateJourneySessionsSchema,
  getAdminJourneyMembersSchema,
  getAdminJourneyMemberDetailSchema,
  type SelectJourneyInput,
  type GetJourneySessionInput,
  type CompleteJourneyInput,
  type GenerateJourneySessionsInput,
  type GetAdminJourneyMembersInput,
} from "./schemas";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

/**
 * Convert a journey DaySession to API response format.
 * Similar to sessionToResponse in sessions/routes.ts but journey-specific.
 */
function journeySessionToResponse(session: DaySession) {
  return {
    dayId: session.dayId,
    week: session.week,
    day: session.day,
    levelGroup: session.levelGroup,
    memberLevel: session.memberLevel,
    blockCount: session.blocks.length,
    blocks: session.blocks.map((block, idx) => {
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

export const journeyRoutes: FastifyPluginAsync = async (fastify) => {
  const journeyService = new JourneyService(fastify.db);

  // =========================================================================
  // Member Endpoints (require authentication)
  // =========================================================================

  // GET /journeys/metadata — Returns all journey types with metadata
  fastify.get(
    "/journeys/metadata",
    {
      onRequest: [fastify.authenticate],
      schema: getMetadataSchema,
    },
    async () => {
      return { journeys: JOURNEY_METADATA };
    },
  );

  // GET /journeys/active — Returns member's active journey or null
  fastify.get(
    "/journeys/active",
    {
      onRequest: [fastify.authenticate],
      schema: getActiveJourneySchema,
    },
    async (request) => {
      const journey = await journeyService.getActiveJourney(
        request.user.userId,
      );
      return { journey };
    },
  );

  // POST /journeys/select — Select a journey for the authenticated member
  fastify.post<{ Body: SelectJourneyInput }>(
    "/journeys/select",
    {
      onRequest: [fastify.authenticate],
      schema: selectJourneySchema,
    },
    async (request, reply) => {
      const { journeyType } = request.body;

      if (!ALL_JOURNEY_TYPES.includes(journeyType)) {
        return reply.status(400).send({
          error: `Tipo de journey invalido: ${journeyType}`,
        });
      }

      // Check if member already has this same journey active (idempotent)
      const existing = await journeyService.getActiveJourney(
        request.user.userId,
      );
      if (existing && existing.journeyType === journeyType) {
        return { journey: existing };
      }

      try {
        const journey = await journeyService.selectJourney(
          request.user.userId,
          journeyType,
        );
        return { journey };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error al seleccionar journey";
        request.log.error({ err, journeyType }, "Error selecting journey");
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /journeys/archived — Returns member's archived journey history
  fastify.get(
    "/journeys/archived",
    {
      onRequest: [fastify.authenticate],
      schema: getArchivedJourneysSchema,
    },
    async (request) => {
      const journeys = await journeyService.getArchivedJourneys(
        request.user.userId,
      );
      return { journeys };
    },
  );

  // GET /journeys/session — Returns journey session for member's active journey
  fastify.get<{ Querystring: GetJourneySessionInput }>(
    "/journeys/session",
    {
      onRequest: [fastify.authenticate],
      schema: getJourneySessionSchema,
    },
    async (request, reply) => {
      const { week, day, duration } = request.query;

      // Validate duration
      if (![20, 40, 60].includes(duration)) {
        return reply
          .status(400)
          .send({ error: "Duracion invalida. Opciones: 20, 40 o 60 minutos" });
      }

      try {
        const session = await journeyService.getJourneySession(
          request.user.userId,
          week,
          day,
          duration as JourneyDuration,
        );

        if (!session) {
          // Check if the issue is no active journey vs no session found
          const activeJourney = await journeyService.getActiveJourney(
            request.user.userId,
          );
          if (!activeJourney) {
            return reply.status(400).send({
              error: "No tienes un journey activo. Selecciona uno primero.",
            });
          }
          return reply.status(404).send({
            error: "Sesion de journey no encontrada para esta semana y dia",
          });
        }

        return journeySessionToResponse(session);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al obtener sesion de journey";
        request.log.error(
          { err, week, day, duration },
          "Error getting journey session",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // POST /journeys/complete — Records journey session completion
  fastify.post<{ Body: CompleteJourneyInput }>(
    "/journeys/complete",
    {
      onRequest: [fastify.authenticate],
      schema: completeJourneySchema,
    },
    async (request, reply) => {
      const { userId } = request.user;
      const {
        dayId,
        duration,
        date,
        startedAt,
        blocksCompleted,
        exercisesCompleted,
        rpe,
        notes,
      } = request.body;

      // Get user info
      const [user] = await fastify.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(400).send({ error: "Usuario no encontrado" });
      }

      // Get active journey
      const activeJourney = await journeyService.getActiveJourney(userId);
      if (!activeJourney) {
        return reply.status(400).send({
          error: "No tienes un journey activo",
        });
      }

      try {
        // Record completion in completed_sessions with journey metadata
        const [existing] = await fastify.db
          .select({ id: schema.completedSessions.id })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              eq(schema.completedSessions.dayId, dayId),
            ),
          );

        if (existing) {
          await fastify.db
            .update(schema.completedSessions)
            .set({
              date,
              startedAt: new Date(startedAt),
              completedAt: new Date(),
              rpe: rpe ?? null,
              notes: notes ?? null,
              blocksCompleted,
              exercisesCompleted: exercisesCompleted ?? null,
              journeyType: activeJourney.journeyType,
              duration,
            })
            .where(eq(schema.completedSessions.id, existing.id));
        } else {
          await fastify.db.insert(schema.completedSessions).values({
            userId,
            dayId,
            date,
            branchId: user.branchId,
            startedAt: new Date(startedAt),
            completedAt: new Date(),
            rpe: rpe ?? null,
            notes: notes ?? null,
            blocksCompleted,
            exercisesCompleted: exercisesCompleted ?? null,
            journeyType: activeJourney.journeyType,
            duration,
          });
        }

        // Advance semana for the specific duration
        await journeyService.advanceSemana(userId, duration as JourneyDuration);

        // Return updated progress
        const progress = await journeyService.getActiveJourney(userId);
        return { success: true, progress };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al completar sesion de journey";
        request.log.error(
          { err, dayId, duration },
          "Error completing journey session",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // Admin Endpoints (require admin/coach role)
  // =========================================================================

  // POST /admin/journeys/generate — Generate journey sessions
  fastify.post<{ Body: GenerateJourneySessionsInput }>(
    "/admin/journeys/generate",
    {
      onRequest: [fastify.authenticate],
      schema: generateJourneySessionsSchema,
    },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { week, journeyType, days, regenerate } = request.body;

      if (!ALL_JOURNEY_TYPES.includes(journeyType)) {
        return reply.status(400).send({
          error: `Tipo de journey invalido: ${journeyType}`,
        });
      }

      try {
        const result = await journeyService.generateJourneySessions(
          week,
          journeyType,
          { days, regenerate },
        );
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al generar sesiones de journey";
        request.log.error(
          { err, week, journeyType },
          "Error generating journey sessions",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/journeys/members — List members with journey status
  fastify.get<{ Querystring: GetAdminJourneyMembersInput }>(
    "/admin/journeys/members",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminJourneyMembersSchema,
    },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { search, journeyType, page = 1, limit = 20 } = request.query;
      const offset = (page - 1) * limit;

      try {
        // Build base query: members with optional active journey via left join
        // We query members (role=member) with their active journey info
        const conditions = [eq(schema.users.role, "member")];

        if (search) {
          // Search by name or email
          conditions.push(
            sql`(${schema.users.firstName} LIKE ${`%${search}%`} OR ${schema.users.lastName} LIKE ${`%${search}%`} OR ${schema.users.email} LIKE ${`%${search}%`})`,
          );
        }

        // Get total count
        const [countResult] = await fastify.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(schema.users)
          .where(and(...conditions));

        const total = countResult?.count ?? 0;

        // Get paginated members with left join to active journeys
        const members = await fastify.db
          .select({
            userId: schema.users.id,
            email: schema.users.email,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            level: schema.users.level,
            journeyType: schema.memberJourneys.journeyType,
            semana20: schema.memberJourneys.semana20,
            semana40: schema.memberJourneys.semana40,
            semana60: schema.memberJourneys.semana60,
            startedAt: schema.memberJourneys.startedAt,
          })
          .from(schema.users)
          .leftJoin(
            schema.memberJourneys,
            and(
              eq(schema.memberJourneys.userId, schema.users.id),
              eq(schema.memberJourneys.isActive, true),
            ),
          )
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(schema.users.firstName);

        // Apply journey type filter after join (filtering on left-joined data)
        let filteredMembers = members;
        if (journeyType) {
          filteredMembers = members.filter(
            (m) => m.journeyType === journeyType,
          );
        }

        // Map to response with journey name
        const journeyNameMap = new Map(
          JOURNEY_METADATA.map((j) => [j.type, j.name]),
        );

        const result = filteredMembers.map((m) => ({
          userId: m.userId,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          level: m.level,
          journeyType: m.journeyType,
          journeyName: m.journeyType
            ? (journeyNameMap.get(m.journeyType as JourneyType) ?? null)
            : null,
          semana20: m.semana20 ?? null,
          semana40: m.semana40 ?? null,
          semana60: m.semana60 ?? null,
          startedAt: m.startedAt ? m.startedAt.toISOString() : null,
        }));

        return { members: result, total };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error al obtener miembros";
        request.log.error({ err }, "Error fetching journey members");
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/journeys/members/:userId — Detailed journey info for a member
  fastify.get<{ Params: { userId: number } }>(
    "/admin/journeys/members/:userId",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminJourneyMemberDetailSchema,
    },
    async (request, reply) => {
      if (!ADMIN_ROLES.includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { userId } = request.params;

      // Verify user exists
      const [user] = await fastify.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      try {
        // Get active journey
        const active = await journeyService.getActiveJourney(userId);

        // Get archived journeys
        const archived = await journeyService.getArchivedJourneys(userId);

        // Get completed journey sessions
        const completions = await fastify.db
          .select({
            dayId: schema.completedSessions.dayId,
            date: schema.completedSessions.date,
            journeyType: schema.completedSessions.journeyType,
            duration: schema.completedSessions.duration,
            rpe: schema.completedSessions.rpe,
            blocksCompleted: schema.completedSessions.blocksCompleted,
            completedAt: schema.completedSessions.completedAt,
          })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              sql`${schema.completedSessions.journeyType} IS NOT NULL`,
            ),
          )
          .orderBy(desc(schema.completedSessions.completedAt))
          .limit(50);

        return {
          active,
          archived,
          completions: completions.map((c) => ({
            dayId: c.dayId,
            date: c.date,
            journeyType: c.journeyType,
            duration: c.duration,
            rpe: c.rpe,
            blocksCompleted: c.blocksCompleted as string[],
            completedAt: c.completedAt.toISOString(),
          })),
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al obtener detalle de miembro";
        request.log.error(
          { err, userId },
          "Error fetching member journey detail",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );
};
