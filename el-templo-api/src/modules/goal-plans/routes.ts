/**
 * Goal Plans API Routes
 *
 * Member endpoints for goal plan lifecycle (select, session, complete)
 * and admin endpoints for generation and member overview.
 */

import { FastifyPluginAsync } from "fastify";
import { eq, and, like, sql, desc } from "drizzle-orm";
import * as schema from "../../db/schema";
import { GoalPlanService, SubscriptionRequiredError } from "./service";
import { AuraService } from "../aura/service";
import { GOAL_PLAN_METADATA, ALL_GOAL_PLAN_TYPES } from "./constants";
import { assembleVideoUrl } from "../shared/video-url";
import type { GoalPlanType } from "./types";
import type { DaySession } from "../sessions/types";
import {
  getGoalPlanMetadataSchema,
  getActiveGoalPlanSchema,
  getArchivedGoalPlansSchema,
  getGoalPlanStatsSchema,
  getGoalPlanSessionSchema,
  completeGoalPlanSchema,
  generateGoalPlanSessionsSchema,
  getAdminGoalPlanMembersSchema,
  getAdminGoalPlanMemberDetailSchema,
  type GetGoalPlanSessionInput,
  type CompleteGoalPlanInput,
  type GenerateGoalPlanSessionsInput,
  type GetAdminGoalPlanMembersInput,
} from "./schemas";

import { TRAINING_ROLES, MEMBER_ROLES } from "../shared/permissions";
import { parseDayId, isTrainingLevel } from "../shared/training-constants";
import type { ExerciseLevel } from "../sessions/types";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";

/**
 * Convert a goal plan DaySession to API response format.
 * Similar to sessionToResponse in sessions/routes.ts but goal-plan-specific.
 */
function goalPlanSessionToResponse(session: DaySession) {
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

export const goalPlanRoutes: FastifyPluginAsync = async (fastify) => {
  const goalPlanService = new GoalPlanService(fastify.db);
  const auraService = new AuraService(fastify.db);

  // =========================================================================
  // Member Endpoints (require authentication)
  // =========================================================================

  // GET /goal-plans/metadata — Returns all goal plan types with metadata
  fastify.get(
    "/goal-plans/metadata",
    {
      onRequest: [fastify.authenticate],
      schema: getGoalPlanMetadataSchema,
    },
    async () => {
      return { goalPlans: GOAL_PLAN_METADATA };
    },
  );

  // GET /goal-plans/active — Returns member's active goal plan or null
  fastify.get(
    "/goal-plans/active",
    {
      onRequest: [fastify.authenticate],
      schema: getActiveGoalPlanSchema,
    },
    async (request) => {
      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia
      // fila del socio autenticado — D-09: esta ruta member-facing NO
      // recibe su caso de aislamiento en esta fase (dueño: fase de
      // goal-plans, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.active");
      const goalPlan = await goalPlanService.getActiveGoalPlan(
        ctx,
        request.user.userId,
      );
      return { goalPlan };
    },
  );

  // GET /goal-plans/archived — Returns member's archived goal plan history
  fastify.get(
    "/goal-plans/archived",
    {
      onRequest: [fastify.authenticate],
      schema: getArchivedGoalPlansSchema,
    },
    async (request) => {
      const goalPlans = await goalPlanService.getArchivedGoalPlans(
        request.user.userId,
      );
      return { goalPlans };
    },
  );

  // GET /goal-plans/stats — Returns cycle progress stats for member's active goal plan
  fastify.get(
    "/goal-plans/stats",
    {
      onRequest: [fastify.authenticate],
      schema: getGoalPlanStatsSchema,
    },
    async (request) => {
      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia
      // fila del socio autenticado — D-09: esta ruta member-facing NO
      // recibe su caso de aislamiento en esta fase (dueño: fase de
      // goal-plans, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.stats");
      const stats = await goalPlanService.getCycleStats(
        ctx,
        request.user.userId,
      );
      return { stats };
    },
  );

  // GET /goal-plans/session — Returns goal plan session for member's active goal plan
  fastify.get<{ Querystring: GetGoalPlanSessionInput }>(
    "/goal-plans/session",
    {
      onRequest: [fastify.authenticate],
      schema: getGoalPlanSessionSchema,
    },
    async (request, reply) => {
      // Subscription enforcement: require goal-plan-enabled plan
      try {
        await goalPlanService.checkSubscription(request.user.userId);
      } catch (err: unknown) {
        if (err instanceof SubscriptionRequiredError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }

      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia
      // fila del socio autenticado — D-09: esta ruta member-facing NO
      // recibe su caso de aislamiento en esta fase (dueño: fase de
      // goal-plans, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.session");

      const { week, day, level: levelOverride } = request.query;

      try {
        const session = await goalPlanService.getGoalPlanSession(
          ctx,
          request.user.userId,
          week,
          day,
          levelOverride as ExerciseLevel | undefined,
        );

        if (!session) {
          // Check if the issue is no active goal plan vs no session found
          const activeGoalPlan = await goalPlanService.getActiveGoalPlan(
            ctx,
            request.user.userId,
          );
          if (!activeGoalPlan) {
            return reply.status(400).send({
              error:
                "No tienes un plan por objetivos activo. Selecciona uno primero.",
            });
          }
          return reply.status(404).send({
            error:
              "Sesion de plan por objetivos no encontrada para esta semana y dia",
          });
        }

        return goalPlanSessionToResponse(session);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al obtener sesion de plan por objetivos";
        request.log.error(
          { err, week, day },
          "Error getting goal plan session",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // POST /goal-plans/complete — Records goal plan session completion
  fastify.post<{ Body: CompleteGoalPlanInput }>(
    "/goal-plans/complete",
    {
      onRequest: [fastify.authenticate],
      schema: completeGoalPlanSchema,
    },
    async (request, reply) => {
      const { userId } = request.user;

      // Subscription enforcement: require goal-plan-enabled plan
      try {
        await goalPlanService.checkSubscription(userId);
      } catch (err: unknown) {
        if (err instanceof SubscriptionRequiredError) {
          return reply.status(403).send({ error: err.message });
        }
        throw err;
      }

      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia
      // fila del socio autenticado — D-09: esta ruta member-facing NO
      // recibe su caso de aislamiento en esta fase (dueño: fase de
      // goal-plans, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.complete");

      const {
        dayId,
        date,
        startedAt,
        blocksCompleted,
        exercisesCompleted,
        rpe,
        notes,
      } = request.body;

      // Parse and validate the level the session was played at.
      const sessionLevel = parseDayId(dayId).level;
      if (!isTrainingLevel(sessionLevel)) {
        return reply
          .status(400)
          .send({ error: "dayId invalido: nivel no reconocido" });
      }

      // Get user info
      const [user] = await fastify.db
        .select({ branchId: schema.users.branchId })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(400).send({ error: "Usuario no encontrado" });
      }

      // Get active goal plan
      const activeGoalPlan = await goalPlanService.getActiveGoalPlan(
        ctx,
        userId,
      );
      if (!activeGoalPlan) {
        return reply.status(400).send({
          error: "No tienes un plan por objetivos activo",
        });
      }

      try {
        // Record completion in completed_sessions with goal plan metadata
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
              goalPlanType: activeGoalPlan.goalPlanType,
              sessionLevel,
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
              goalPlanType: activeGoalPlan.goalPlanType,
              sessionLevel,
            });
          completionId = Number(result[0].insertId);
        }

        // Award AURA for goal plan completion
        try {
          await auraService.award({
            userId,
            sourceType: "goal_plan_completion",
            referenceType: "goal_plan_session",
            referenceId: completionId,
          });
        } catch (auraErr: unknown) {
          // Log but don't fail the completion if AURA award fails (e.g., duplicate)
          request.log.warn(
            { err: auraErr, userId, dayId },
            "AURA award failed for goal plan completion",
          );
        }

        // Return updated progress
        const progress = await goalPlanService.getActiveGoalPlan(ctx, userId);
        return { success: true, progress };
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al completar sesion de plan por objetivos";
        request.log.error({ err, dayId }, "Error completing goal plan session");
        return reply.status(400).send({ error: message });
      }
    },
  );

  // =========================================================================
  // Admin Endpoints (require admin/coach role)
  // =========================================================================

  // POST /admin/goal-plans/generate — Generate goal plan sessions
  fastify.post<{ Body: GenerateGoalPlanSessionsInput }>(
    "/admin/goal-plans/generate",
    {
      onRequest: [fastify.authenticate],
      schema: generateGoalPlanSessionsSchema,
    },
    async (request, reply) => {
      if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      const { week, goalPlanType, days, regenerate } = request.body;

      if (!ALL_GOAL_PLAN_TYPES.includes(goalPlanType)) {
        return reply.status(400).send({
          error: `Tipo de plan por objetivos invalido: ${goalPlanType}`,
        });
      }

      try {
        const result = await goalPlanService.generateGoalPlanSessions(
          week,
          goalPlanType,
          { days, regenerate },
        );
        return result;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error al generar sesiones de plan por objetivos";
        request.log.error(
          { err, week, goalPlanType },
          "Error generating goal plan sessions",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/goal-plans/members — List members with goal plan status
  fastify.get<{ Querystring: GetAdminGoalPlanMembersInput }>(
    "/admin/goal-plans/members",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminGoalPlanMembersSchema,
    },
    async (request, reply) => {
      if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      // T-173-09-01: `users` es tabla strict. `goal-plans` no monta
      // `attachCountryScope` en un hook (cada ruta lo resuelve per-ruta, como
      // `programs/routes.ts`) — se resuelve acá antes de armar `conditions`.
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.adminMembers");

      const { search, goalPlanType, page = 1, limit = 20 } = request.query;
      const offset = (page - 1) * limit;

      try {
        // Build base query: members with optional active goal plan via left join.
        // `tenantWhere` va INLINE en cada `.where()` de abajo (el lint juzga por
        // statement, PATTERNS §2.6) — este array NO alcanza por sí solo. La
        // búsqueda por nombre/email hereda igual el scope de gimnasio porque
        // ambos `.where(and(tenantWhere(...), ...conditions))` la incluyen en el
        // mismo AND (173-05 dejó la búsqueda sin gimnasio a propósito porque el
        // módulo todavía no migraba; ahora sí).
        const conditions = [eq(schema.users.role, "member")];

        if (search) {
          const searchTokens = search
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          const tokenConds = searchTokens.map((token) => {
            const pattern = `%${token}%`;
            /* tenant-safe: fragmento de condicion por nombre/email, NO ejecuta
               query propia — siempre se agrega a `conditions` y viaja ANDed
               con el `tenantWhere(schema.users, ctx)` inline de las dos queries
               reales de abajo (countResult y members). El lint juzga por
               statement y este `return` no ve ese AND en su propio texto. */
            return sql`(${schema.users.firstName} LIKE ${pattern}
              OR ${schema.users.lastName} LIKE ${pattern}
              OR ${schema.users.email} LIKE ${pattern}
              OR CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName}) LIKE ${pattern})`;
          });
          const condition =
            tokenConds.length === 0
              ? null
              : tokenConds.length === 1
                ? tokenConds[0]
                : sql.join(tokenConds, sql` AND `);
          if (condition) conditions.push(condition);
        }

        // Get total count. tenantWhere INLINE también acá (no alcanza con el
        // array de arriba: el lint juzga por statement, PATTERNS §2.6).
        const [countResult] = await fastify.db
          .select({ count: sql<number>`COUNT(*)` })
          .from(schema.users)
          .where(and(tenantWhere(schema.users, ctx), ...conditions));

        const total = countResult?.count ?? 0;

        // Get paginated members with left join to active goal plan enrollments
        const members = await fastify.db
          .select({
            userId: schema.users.id,
            email: schema.users.email,
            firstName: schema.users.firstName,
            lastName: schema.users.lastName,
            level: schema.users.level,
            branchName: schema.branches.name,
            goalPlanType: schema.programs.goalPlanType,
            startedAt: schema.programEnrollments.enrolledAt,
          })
          .from(schema.users)
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .leftJoin(
            schema.programEnrollments,
            and(
              eq(schema.programEnrollments.userId, schema.users.id),
              eq(schema.programEnrollments.status, "active"),
            ),
          )
          .leftJoin(
            schema.programs,
            and(
              eq(schema.programs.id, schema.programEnrollments.programId),
              sql`${schema.programs.goalPlanType} IS NOT NULL`,
            ),
          )
          .where(and(tenantWhere(schema.users, ctx), ...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(schema.users.firstName);

        // Apply goal plan type filter after join (filtering on left-joined data)
        let filteredMembers = members;
        if (goalPlanType) {
          filteredMembers = members.filter(
            (m) => m.goalPlanType === goalPlanType,
          );
        }

        // Map to response with goal plan name
        const goalPlanNameMap = new Map(
          GOAL_PLAN_METADATA.map((p) => [p.type, p.name]),
        );

        const result = filteredMembers.map((m) => ({
          userId: m.userId,
          email: m.email,
          firstName: m.firstName,
          lastName: m.lastName,
          level: m.level,
          branchName: m.branchName,
          goalPlanType: m.goalPlanType,
          goalPlanName: m.goalPlanType
            ? (goalPlanNameMap.get(m.goalPlanType as GoalPlanType) ?? null)
            : null,
          startedAt: m.startedAt ? m.startedAt.toISOString() : null,
        }));

        return { members: result, total };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error al obtener miembros";
        request.log.error({ err }, "Error fetching goal plan members");
        return reply.status(400).send({ error: message });
      }
    },
  );

  // GET /admin/goal-plans/members/:userId — Detailed goal plan info for a member
  fastify.get<{ Params: { userId: number } }>(
    "/admin/goal-plans/members/:userId",
    {
      onRequest: [fastify.authenticate],
      schema: getAdminGoalPlanMemberDetailSchema,
    },
    async (request, reply) => {
      if (!(MEMBER_ROLES as readonly string[]).includes(request.user.role)) {
        return reply
          .status(403)
          .send({ error: "Acceso de administrador requerido" });
      }

      // T-173-09-01: `users` es tabla strict. El `userId` llega por params:
      // sin filtro un staff de OTRO gimnasio podía leer el detalle de un
      // socio ajeno (contrato D-06: 404, nunca 403).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "goal-plans.adminMemberDetail");

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
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      try {
        // Get active goal plan
        const active = await goalPlanService.getActiveGoalPlan(ctx, userId);

        // Get archived goal plans
        const archived = await goalPlanService.getArchivedGoalPlans(userId);

        // Get all completions (both entrenamiento and goal plan)
        const completions = await fastify.db
          .select({
            dayId: schema.completedSessions.dayId,
            date: schema.completedSessions.date,
            goalPlanType: schema.completedSessions.goalPlanType,
            duration: schema.completedSessions.duration,
            rpe: schema.completedSessions.rpe,
            blocksCompleted: schema.completedSessions.blocksCompleted,
            completedAt: schema.completedSessions.completedAt,
          })
          .from(schema.completedSessions)
          .where(eq(schema.completedSessions.userId, userId))
          .orderBy(desc(schema.completedSessions.completedAt))
          .limit(50);

        // Compute entrenamiento stats (goalPlanType IS NULL)
        const entrenamientoCompletions = completions.filter(
          (c) => c.goalPlanType === null,
        );

        // Compute goal plan stats (goalPlanType IS NOT NULL)
        const goalPlanCompletions = completions.filter(
          (c) => c.goalPlanType !== null,
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
          goalPlanStats: {
            totalSessions: goalPlanCompletions.length,
          },
          completions: completions.map((c) => ({
            dayId: c.dayId,
            date: c.date,
            goalPlanType: c.goalPlanType,
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
          "Error fetching member goal plan detail",
        );
        return reply.status(400).send({ error: message });
      }
    },
  );
};
