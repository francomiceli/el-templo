/**
 * Personalizadas API Routes
 *
 * Member endpoints for personalizada lifecycle (select, session, complete)
 * and admin endpoints for generation and member overview.
 */

import { FastifyPluginAsync } from "fastify";
import { eq, and, like, sql, desc } from "drizzle-orm";
import * as schema from "../../db/schema";
import { PersonalizadasService, SubscriptionRequiredError } from "./service";
import { AuraService } from "../aura/service";
import { PERSONALIZADA_METADATA, ALL_PERSONALIZADA_TYPES } from "./constants";
import { assembleVideoUrl } from "../shared/video-url";
import type { PersonalizadaType, PersonalizadaDuration } from "./types";
import type { DaySession } from "../sessions/types";
import {
  getPersonalizadaMetadataSchema,
  getActivePersonalizadaSchema,
  getArchivedPersonalizadasSchema,
  getPersonalizadaStatsSchema,
  getPersonalizadaSessionSchema,
  completePersonalizadaSchema,
  generatePersonalizadaSessionsSchema,
  getAdminPersonalizadaMembersSchema,
  getAdminPersonalizadaMemberDetailSchema,
  type GetPersonalizadaSessionInput,
  type CompletePersonalizadaInput,
  type GeneratePersonalizadaSessionsInput,
  type GetAdminPersonalizadaMembersInput,
} from "./schemas";

import { TRAINING_ROLES } from "../shared/permissions";

/**
 * Convert a personalizada DaySession to API response format.
 * Similar to sessionToResponse in sessions/routes.ts but personalizada-specific.
 */
function personalizadaSessionToResponse(session: DaySession) {
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

export const personalizadasRoutes: FastifyPluginAsync = async (fastify) => {
  const personalizadasService = new PersonalizadasService(fastify.db);
  const auraService = new AuraService(fastify.db);

  // =========================================================================
  // Member Endpoints (require authentication)
  // =========================================================================

  // GET /personalizadas/metadata — Returns all personalizada types with metadata
  fastify.get(
    "/personalizadas/metadata",
    {
      onRequest: [fastify.authenticate],
      schema: getPersonalizadaMetadataSchema,
    },
    async () => {
      return { personalizadas: PERSONALIZADA_METADATA };
    },
  );

  // GET /personalizadas/active — Returns member's active personalizada or null
  fastify.get(
    "/personalizadas/active",
    {
      onRequest: [fastify.authenticate],
      schema: getActivePersonalizadaSchema,
    },
    async (request) => {
      const personalizada = await personalizadasService.getActivePersonalizada(
        request.user.userId,
      );
      return { personalizada };
    },
  );

  // GET /personalizadas/archived — Returns member's archived personalizada history
  fastify.get(
    "/personalizadas/archived",
    {
      onRequest: [fastify.authenticate],
      schema: getArchivedPersonalizadasSchema,
    },
    async (request) => {
      const personalizadas =
        await personalizadasService.getArchivedPersonalizadas(
          request.user.userId,
        );
      return { personalizadas };
    },
  );

  // GET /personalizadas/stats — Returns cycle progress stats for member's active personalizada
  fastify.get(
    "/personalizadas/stats",
    {
      onRequest: [fastify.authenticate],
      schema: getPersonalizadaStatsSchema,
    },
    async (request) => {
      const stats = await personalizadasService.getCycleStats(
        request.user.userId,
      );
      return { stats };
    },
  );

  // GET /personalizadas/session — Returns personalizada session for member's active personalizada
  fastify.get<{ Querystring: GetPersonalizadaSessionInput }>(
    "/personalizadas/session",
    {
      onRequest: [fastify.authenticate],
      schema: getPersonalizadaSessionSchema,
    },
    async (request, reply) => {
      // Subscription enforcement: require personalizada-enabled plan
      try {
        await personalizadasService.checkSubscription(request.user.userId);
      } catch (err: unknown) {
        if (err instanceof SubscriptionRequiredError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }

      const { week, day, duration } = request.query;

      // Validate duration
      if (![20, 40, 60].includes(duration)) {
        return reply
          .status(400)
          .send({ error: "Duracion invalida. Opciones: 20, 40 o 60 minutos" });
      }

      try {
        const session = await personalizadasService.getPersonalizadaSession(
          request.user.userId,
          week,
          day,
          duration as PersonalizadaDuration,
        );

        if (!session) {
          // Check if the issue is no active personalizada vs no session found
          const activePersonalizada =
            await personalizadasService.getActivePersonalizada(
              request.user.userId,
            );
          if (!activePersonalizada) {
            return reply.status(400).send({
              error:
                "No tienes una personalizada activa. Selecciona una primero.",
            });
          }
          return reply.status(404).send({
            error: "Sesion personalizada no encontrada para esta semana y dia",
          });
        }

        return personalizadaSessionToResponse(session);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al obtener sesion personalizada";
        request.log.error(
          { err, week, day, duration },
          "Error getting personalizada session",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // POST /personalizadas/complete — Records personalizada session completion
  fastify.post<{ Body: CompletePersonalizadaInput }>(
    "/personalizadas/complete",
    {
      onRequest: [fastify.authenticate],
      schema: completePersonalizadaSchema,
    },
    async (request, reply) => {
      const { userId } = request.user;

      // Subscription enforcement: require personalizada-enabled plan
      try {
        await personalizadasService.checkSubscription(userId);
      } catch (err: unknown) {
        if (err instanceof SubscriptionRequiredError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }

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

      // Get active personalizada
      const activePersonalizada =
        await personalizadasService.getActivePersonalizada(userId);
      if (!activePersonalizada) {
        return reply.status(400).send({
          error: "No tienes una personalizada activa",
        });
      }

      try {
        // Record completion in completed_sessions with personalizada metadata
        const [existing] = await fastify.db
          .select({ id: schema.completedSessions.id })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              eq(schema.completedSessions.dayId, dayId),
            ),
          );

        let completionId: number;
        if (existing) {
          completionId = existing.id;
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
              personalizadaType: activePersonalizada.personalizadaType,
              duration,
            })
            .where(eq(schema.completedSessions.id, existing.id));
        } else {
          const result = await fastify.db
            .insert(schema.completedSessions)
            .values({
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
              personalizadaType: activePersonalizada.personalizadaType,
              duration,
            });
          completionId = Number(result[0].insertId);
        }

        // Advance semana for the specific duration
        await personalizadasService.advanceSemana(
          userId,
          duration as PersonalizadaDuration,
        );

        // Award AURA for personalizada completion
        try {
          await auraService.award({
            userId,
            sourceType: "personalizada_completion",
            referenceType: "personalizada_session",
            referenceId: completionId,
          });
        } catch (auraErr: unknown) {
          // Log but don't fail the completion if AURA award fails (e.g., duplicate)
          request.log.warn(
            { err: auraErr, userId, dayId },
            "AURA award failed for personalizada completion",
          );
        }

        // Return updated progress
        const progress =
          await personalizadasService.getActivePersonalizada(userId);
        return { success: true, progress };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al completar sesion personalizada";
        request.log.error(
          { err, dayId, duration },
          "Error completing personalizada session",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // Admin Endpoints (require admin/coach role)
  // =========================================================================

  // POST /admin/personalizadas/generate — Generate personalizada sessions
  fastify.post<{ Body: GeneratePersonalizadaSessionsInput }>(
    "/admin/personalizadas/generate",
    {
      onRequest: [fastify.authenticate],
      schema: generatePersonalizadaSessionsSchema,
    },
    async (request, reply) => {
      if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { week, personalizadaType, days, regenerate } = request.body;

      if (!ALL_PERSONALIZADA_TYPES.includes(personalizadaType)) {
        return reply.status(400).send({
          error: `Tipo de personalizada invalido: ${personalizadaType}`,
        });
      }

      try {
        const result =
          await personalizadasService.generatePersonalizadaSessions(
            week,
            personalizadaType,
            { days, regenerate },
          );
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al generar sesiones personalizadas";
        request.log.error(
          { err, week, personalizadaType },
          "Error generating personalizada sessions",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/personalizadas/members — List members with personalizada status
  fastify.get<{ Querystring: GetAdminPersonalizadaMembersInput }>(
    "/admin/personalizadas/members",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminPersonalizadaMembersSchema,
    },
    async (request, reply) => {
      if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { search, personalizadaType, page = 1, limit = 20 } = request.query;
      const offset = (page - 1) * limit;

      try {
        // Build base query: members with optional active personalizada via left join
        // We query members (role=member) with their active personalizada info
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

        // Get paginated members with left join to active personalizadas and branch
        const members = await fastify.db
          .select({
            userId: schema.users.id,
            email: schema.users.email,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            level: schema.users.level,
            branchName: schema.branches.name,
            personalizadaType: schema.memberPersonalizadas.personalizadaType,
            semana20: schema.memberPersonalizadas.semana20,
            semana40: schema.memberPersonalizadas.semana40,
            semana60: schema.memberPersonalizadas.semana60,
            startedAt: schema.memberPersonalizadas.startedAt,
          })
          .from(schema.users)
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .leftJoin(
            schema.memberPersonalizadas,
            and(
              eq(schema.memberPersonalizadas.userId, schema.users.id),
              eq(schema.memberPersonalizadas.isActive, true),
            ),
          )
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(schema.users.firstName);

        // Apply personalizada type filter after join (filtering on left-joined data)
        let filteredMembers = members;
        if (personalizadaType) {
          filteredMembers = members.filter(
            (m) => m.personalizadaType === personalizadaType,
          );
        }

        // Map to response with personalizada name
        const personalizadaNameMap = new Map(
          PERSONALIZADA_METADATA.map((p) => [p.type, p.name]),
        );

        const result = filteredMembers.map((m) => ({
          userId: m.userId,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          level: m.level,
          branchName: m.branchName,
          personalizadaType: m.personalizadaType,
          personalizadaName: m.personalizadaType
            ? (personalizadaNameMap.get(
                m.personalizadaType as PersonalizadaType,
              ) ?? null)
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
        request.log.error({ err }, "Error fetching personalizada members");
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/personalizadas/members/:userId — Detailed personalizada info for a member
  fastify.get<{ Params: { userId: number } }>(
    "/admin/personalizadas/members/:userId",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminPersonalizadaMemberDetailSchema,
    },
    async (request, reply) => {
      if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { userId } = request.params;

      // Get user with branch info
      const [user] = await fastify.db
        .select({
          id: schema.users.id,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          level: schema.users.level,
          branchName: schema.branches.name,
        })
        .from(schema.users)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.users.branchId),
        )
        .where(eq(schema.users.id, userId));

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      try {
        // Get active personalizada
        const active =
          await personalizadasService.getActivePersonalizada(userId);

        // Get archived personalizadas
        const archived =
          await personalizadasService.getArchivedPersonalizadas(userId);

        // Get all completions (both entrenamiento and personalizada)
        const completions = await fastify.db
          .select({
            dayId: schema.completedSessions.dayId,
            date: schema.completedSessions.date,
            personalizadaType: schema.completedSessions.personalizadaType,
            duration: schema.completedSessions.duration,
            rpe: schema.completedSessions.rpe,
            blocksCompleted: schema.completedSessions.blocksCompleted,
            completedAt: schema.completedSessions.completedAt,
          })
          .from(schema.completedSessions)
          .where(eq(schema.completedSessions.userId, userId))
          .orderBy(desc(schema.completedSessions.completedAt))
          .limit(50);

        // Compute entrenamiento stats (personalizadaType IS NULL)
        const entrenamientoCompletions = completions.filter(
          (c) => c.personalizadaType === null,
        );

        // Compute personalizada stats (personalizadaType IS NOT NULL)
        const personalizadaCompletions = completions.filter(
          (c) => c.personalizadaType !== null,
        );

        // Unique training days for entrenamiento
        const entrenamientoDays = new Set(
          entrenamientoCompletions.map((c) => c.date),
        );

        // Streak calculation: consecutive days from today backwards
        const today = new Date();
        const allDates = new Set(completions.map((c) => c.date));
        let streak = 0;
        const checkDate = new Date(today);
        // Check today first
        const todayStr = checkDate.toISOString().slice(0, 10);
        if (allDates.has(todayStr)) {
          streak = 1;
          checkDate.setDate(checkDate.getDate() - 1);
          while (allDates.has(checkDate.toISOString().slice(0, 10))) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
          }
        } else {
          // Check yesterday
          checkDate.setDate(checkDate.getDate() - 1);
          if (allDates.has(checkDate.toISOString().slice(0, 10))) {
            streak = 1;
            checkDate.setDate(checkDate.getDate() - 1);
            while (allDates.has(checkDate.toISOString().slice(0, 10))) {
              streak++;
              checkDate.setDate(checkDate.getDate() - 1);
            }
          }
        }

        return {
          user: {
            firstName: user.firstName,
            lastName: user.lastName,
            level: user.level,
            branchName: user.branchName,
          },
          active,
          archived,
          entrenamientoStats: {
            totalSessions: entrenamientoCompletions.length,
            totalDays: entrenamientoDays.size,
            currentStreak: streak,
          },
          personalizadaStats: {
            totalSessions: personalizadaCompletions.length,
            byDuration: {
              d20: personalizadaCompletions.filter((c) => c.duration === 20)
                .length,
              d40: personalizadaCompletions.filter((c) => c.duration === 40)
                .length,
              d60: personalizadaCompletions.filter((c) => c.duration === 60)
                .length,
            },
          },
          completions: completions.map((c) => ({
            dayId: c.dayId,
            date: c.date,
            personalizadaType: c.personalizadaType,
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
          "Error fetching member personalizada detail",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );
};
