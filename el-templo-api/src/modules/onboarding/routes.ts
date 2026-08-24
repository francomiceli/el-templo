/**
 * Onboarding API Routes
 *
 * Member endpoints for completing the onboarding quiz, retrieving profile,
 * and recording analytics events.
 *
 * All routes require authentication.
 */

import { and, eq } from "drizzle-orm";
import { FastifyPluginAsync } from "fastify";
import { OnboardingService, DuplicateOnboardingError } from "./service";
import { AuraService } from "../aura/service";
import { users } from "../../db/schema/users";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant, tenantWhere } from "../shared/tenant";
import type {
  AgeRange,
  TrainingBackground,
  GoalChoice,
  PainPoint,
  TrainingFrequency,
  Gender,
} from "./types";

interface CompleteBody {
  ageRange: AgeRange;
  trainingBackground: TrainingBackground;
  level?: "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan";
  goal: GoalChoice;
  painPoint: PainPoint;
  trainingFrequency: TrainingFrequency;
}

interface AnalyticsBody {
  eventType:
    | "quiz_started"
    | "question_answered"
    | "quiz_completed"
    | "quiz_abandoned"
    | "avatar_assigned";
  questionIndex?: number;
  answerValue?: string;
  durationMs?: number;
}

const completeSchema = {
  body: {
    type: "object",
    required: [
      "ageRange",
      "trainingBackground",
      "goal",
      "painPoint",
      "trainingFrequency",
    ],
    properties: {
      ageRange: {
        type: "string",
        enum: ["18_24", "25_34", "35_50", "50_plus"],
      },
      trainingBackground: {
        type: "string",
        enum: [
          "el_templo",
          "nunca",
          "gym",
          "cardio",
          "yoga_pilates",
          "calistenia",
          "deje",
        ],
      },
      level: {
        type: "string",
        enum: ["kairos", "alfa", "delta", "sigma", "omega", "spartan"],
      },
      goal: {
        type: "string",
        enum: [
          "habito",
          "fuerza_general",
          "comunidad",
          "piernas_gluteos",
          "cuerpo_firme",
          "cero_atleta",
          "skill",
          "longevidad",
        ],
      },
      painPoint: {
        type: "string",
        enum: [
          "tiempo",
          "constancia",
          "no_se_por_donde",
          "ambiente",
          "resultados",
          "nada",
        ],
      },
      trainingFrequency: {
        type: "string",
        enum: ["2", "3", "4", "5_plus"],
      },
    },
    additionalProperties: false,
  },
};

const analyticsSchema = {
  body: {
    type: "object",
    required: ["eventType"],
    properties: {
      eventType: {
        type: "string",
        enum: [
          "quiz_started",
          "question_answered",
          "quiz_completed",
          "quiz_abandoned",
          "avatar_assigned",
        ],
      },
      questionIndex: { type: "integer", minimum: 0, maximum: 4 },
      answerValue: { type: "string", maxLength: 100 },
      durationMs: { type: "integer", minimum: 0 },
    },
    additionalProperties: false,
  },
};

export const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  /**
   * POST /api/onboarding/complete
   *
   * Submit quiz answers. Creates member profile and awards 50 AURA.
   * Returns 201 on success, 409 if already completed.
   */
  fastify.post<{ Body: CompleteBody }>(
    "/complete",
    { schema: completeSchema },
    async (request, reply) => {
      const auraService = new AuraService(fastify.db);
      const service = new OnboardingService(
        fastify.db,
        auraService,
        request.log,
      );

      // T-173-08: `users` es tabla strict. El ctx sale de la propia fila del
      // socio autenticado (attachCountryScope + assertTenant), nunca del body.
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "onboarding.complete");

      // T-90-02: Read gender from DB server-side, NOT from client body
      const [userRow] = await fastify.db
        .select({ gender: users.gender })
        .from(users)
        .where(and(tenantWhere(users, ctx), eq(users.id, request.user.userId)))
        .limit(1);

      const gender: Gender = userRow?.gender ?? "unspecified";

      try {
        const result = await service.completeOnboardingV2(ctx, {
          userId: request.user.userId,
          gender,
          ageRange: request.body.ageRange,
          trainingBackground: request.body.trainingBackground,
          level: request.body.level,
          goal: request.body.goal,
          painPoint: request.body.painPoint,
          trainingFrequency: request.body.trainingFrequency,
        });

        return reply.code(201).send(result);
      } catch (err: unknown) {
        if (err instanceof DuplicateOnboardingError) {
          return reply.code(409).send({
            error: "Conflicto",
            message: "El onboarding ya fue completado",
          });
        }
        throw err;
      }
    },
  );

  /**
   * GET /api/onboarding/profile
   *
   * Returns the current user's onboarding profile.
   * 200 with profile if completed, 204 No Content if not yet completed.
   */
  fastify.get("/profile", async (request, reply) => {
    const auraService = new AuraService(fastify.db);
    const service = new OnboardingService(fastify.db, auraService);

    await attachCountryScope(request, fastify.db);
    const ctx = assertTenant(request.scope, "onboarding.profile");
    const profile = await service.getProfile(ctx, request.user.userId);

    if (!profile) {
      return reply.code(204).send();
    }

    return reply.code(200).send(profile);
  });

  /**
   * POST /api/onboarding/analytics
   *
   * Record a quiz funnel event (start, answer, complete, abandon).
   * Returns 204 No Content.
   */
  fastify.post<{ Body: AnalyticsBody }>(
    "/analytics",
    { schema: analyticsSchema },
    async (request, reply) => {
      const auraService = new AuraService(fastify.db);
      const service = new OnboardingService(fastify.db, auraService);

      await service.recordAnalyticsEvent({
        userId: request.user.userId,
        eventType: request.body.eventType,
        questionIndex: request.body.questionIndex,
        answerValue: request.body.answerValue,
        durationMs: request.body.durationMs,
      });

      return reply.code(204).send();
    },
  );
};
