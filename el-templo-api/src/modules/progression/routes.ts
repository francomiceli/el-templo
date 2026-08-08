import { FastifyPluginAsync } from "fastify";
import { eq, gte, lte, and, sql, count, isNull } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  checkEligibility,
  formatDateLabel,
  getLevelDisplayName,
  getGreekLetter,
} from "./service";
import {
  progressionStatsResponseSchema,
  evaluationRequestResponseSchema,
  weeklySummaryResponseSchema,
  errorResponseSchema,
} from "./schemas";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";

export const progressionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /progression/stats - Get member's progression data
  fastify.get(
    "/stats",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: progressionStatsResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;

      // T-173-09-01: `users` y `member_profiles` son tablas strict. El ctx
      // sale de la propia fila del socio autenticado (attachCountryScope +
      // assertTenant), nunca del body/params — D-09: esta ruta member-facing
      // NO recibe su caso de aislamiento en esta fase (dueño: fase de
      // progression, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "progression.stats");

      // Get user level
      const [user] = await fastify.db
        .select({ level: schema.users.level })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)),
        );

      if (!user) {
        return reply.status(404).send({ error: "Usuario no encontrado" });
      }

      // Calculate date boundaries
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);
      const twoWeeksAgo = new Date(today);
      twoWeeksAgo.setDate(today.getDate() - 14);
      const fourWeeksAgo = new Date(today);
      fourWeeksAgo.setDate(today.getDate() - 28);

      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];
      const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];
      const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0];

      const todayStr = today.toISOString().split("T")[0];

      // Parallel queries for performance
      const [
        totalResult,
        weekResult,
        avgRpeResult,
        rpeDataResult,
        streakResult,
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
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              gte(schema.completedSessions.date, sevenDaysAgoStr),
            ),
          ),

        // Average RPE for last 2 weeks (excluding null)
        fastify.db
          .select({
            avgRpe: sql<
              number | null
            >`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
          })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              gte(schema.completedSessions.date, twoWeeksAgoStr),
              sql`${schema.completedSessions.rpe} IS NOT NULL`,
            ),
          ),

        // RPE data for chart (last 4 weeks)
        fastify.db
          .select({
            date: schema.completedSessions.date,
            rpe: schema.completedSessions.rpe,
          })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              gte(schema.completedSessions.date, fourWeeksAgoStr),
            ),
          )
          .orderBy(schema.completedSessions.date),

        // Persisted streak from member_profiles (replaces on-the-fly calculation)
        fastify.db
          .select({
            currentStreak: schema.memberProfiles.currentStreak,
            longestStreak: schema.memberProfiles.longestStreak,
          })
          .from(schema.memberProfiles)
          .where(
            and(
              tenantWhere(schema.memberProfiles, ctx),
              eq(schema.memberProfiles.userId, userId),
            ),
          ),

        // Check for pending evaluation request
        fastify.db
          .select({
            id: schema.evaluationRequests.id,
            requestedAt: schema.evaluationRequests.requestedAt,
          })
          .from(schema.evaluationRequests)
          .where(
            and(
              eq(schema.evaluationRequests.userId, userId),
              eq(schema.evaluationRequests.status, "pending"),
            ),
          ),

        // Today's completed regular training session (exclude goal plans)
        fastify.db
          .select({
            rpe: schema.completedSessions.rpe,
            notes: schema.completedSessions.notes,
            startedAt: schema.completedSessions.startedAt,
            completedAt: schema.completedSessions.completedAt,
            blocksCompleted: schema.completedSessions.blocksCompleted,
          })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              eq(schema.completedSessions.date, todayStr),
              isNull(schema.completedSessions.goalPlanType),
            ),
          ),
      ]);

      // Extract results
      const avgRpe = avgRpeResult[0]?.avgRpe ?? null;
      const eligible = checkEligibility(avgRpe);
      const currentStreak = streakResult[0]?.currentStreak ?? 0;
      const longestStreak = streakResult[0]?.longestStreak ?? 0;
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
          longestStreak,
        },
        rpeTrend: {
          labels: rpeDataResult.map((r) => formatDateLabel(r.date)),
          data: rpeDataResult.map((r) => r.rpe),
          averageRpe: avgRpe !== null ? Number(avgRpe) : 0,
        },
        evaluation: {
          eligible,
          averageRpeLast2Weeks: avgRpe !== null ? Number(avgRpe) : null,
          pendingRequest: !!pendingRequest,
          requestedAt: pendingRequest?.requestedAt?.toISOString() ?? null,
        },
        todaySession: todaySession
          ? {
              completed: true,
              rpe: todaySession.rpe,
              notes: todaySession.notes,
              durationMinutes:
                todaySession.startedAt && todaySession.completedAt
                  ? Math.round(
                      (new Date(todaySession.completedAt).getTime() -
                        new Date(todaySession.startedAt).getTime()) /
                        60000,
                    )
                  : null,
              blocksCompleted: todaySession.blocksCompleted ?? [],
            }
          : null,
      };
    },
  );

  // GET /progression/weekly-summary - Weekly session aggregates for Tu Dia
  fastify.get(
    "/weekly-summary",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: weeklySummaryResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { userId } = request.user;

      // Calculate current Mon-Sun week boundaries
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const weekStartStr = monday.toISOString().split("T")[0];

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const weekEndStr = sunday.toISOString().split("T")[0];

      // Parallel queries: session aggregates + subscription budget
      const [aggregateResult, subscriptionResult] = await Promise.all([
        // Sessions completed this week with aggregates
        fastify.db
          .select({
            sessionsCompleted: count(),
            totalMinutes: sql<number>`COALESCE(SUM(
              TIMESTAMPDIFF(MINUTE, ${schema.completedSessions.startedAt}, ${schema.completedSessions.completedAt})
            ), 0)`,
            averageRpe: sql<
              number | null
            >`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
          })
          .from(schema.completedSessions)
          .where(
            and(
              eq(schema.completedSessions.userId, userId),
              gte(schema.completedSessions.date, weekStartStr),
              lte(schema.completedSessions.date, weekEndStr),
            ),
          ),

        // Active subscription for session budget
        fastify.db
          .select({
            classesPerWeek: schema.subscriptionPlans.classesPerWeek,
          })
          .from(schema.subscriptions)
          .innerJoin(
            schema.subscriptionPlans,
            eq(schema.subscriptions.planId, schema.subscriptionPlans.id),
          )
          .where(
            and(
              eq(schema.subscriptions.userId, userId),
              eq(schema.subscriptions.status, "active"),
            ),
          )
          .limit(1),
      ]);

      const aggregate = aggregateResult[0];
      const subscription = subscriptionResult[0];

      return {
        sessionsCompleted: Number(aggregate?.sessionsCompleted ?? 0),
        totalMinutes: Number(aggregate?.totalMinutes ?? 0),
        averageRpe:
          aggregate?.averageRpe !== null && aggregate?.averageRpe !== undefined
            ? Number(aggregate.averageRpe)
            : null,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        sessionBudget: subscription?.classesPerWeek ?? null,
      };
    },
  );

  // POST /progression/request-evaluation - Submit evaluation request
  fastify.post(
    "/request-evaluation",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: evaluationRequestResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;

      // Check for existing pending request
      const [existingRequest] = await fastify.db
        .select({ id: schema.evaluationRequests.id })
        .from(schema.evaluationRequests)
        .where(
          and(
            eq(schema.evaluationRequests.userId, userId),
            eq(schema.evaluationRequests.status, "pending"),
          ),
        );

      if (existingRequest) {
        return reply
          .status(400)
          .send({ error: "Ya tienes una solicitud de evaluacion pendiente" });
      }

      // Calculate average RPE for last 2 weeks to verify eligibility
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0];

      const [avgResult] = await fastify.db
        .select({
          avgRpe: sql<
            number | null
          >`CAST(AVG(${schema.completedSessions.rpe}) AS DECIMAL(3,1))`,
        })
        .from(schema.completedSessions)
        .where(
          and(
            eq(schema.completedSessions.userId, userId),
            gte(schema.completedSessions.date, twoWeeksAgoStr),
            sql`${schema.completedSessions.rpe} IS NOT NULL`,
          ),
        );

      const avgRpe = avgResult?.avgRpe;
      if (!checkEligibility(avgRpe ?? null)) {
        return reply.status(400).send({
          error:
            "No cumples los requisitos para solicitar evaluacion (RPE promedio debe ser <= 6)",
        });
      }

      // Create evaluation request
      const [result] = await fastify.db
        .insert(schema.evaluationRequests)
        .values({
          userId,
          averageRpeAtRequest:
            avgRpe !== null ? Math.round(Number(avgRpe)) : null,
        });

      return {
        success: true,
        requestId: result.insertId,
      };
    },
  );
};
