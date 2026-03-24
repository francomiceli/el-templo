/**
 * Onboarding API Routes
 *
 * Member endpoints for completing the onboarding quiz, retrieving profile,
 * and recording analytics events.
 *
 * All routes require authentication.
 */

import { FastifyPluginAsync } from "fastify";
import { OnboardingService, DuplicateOnboardingError } from "./service";
import { AuraService } from "../aura/service";
import type {
  GoalType,
  ExperienceLevel,
  TrainingFocus,
  MotivationStyle,
} from "./types";

interface CompleteBody {
  goalType: GoalType;
  experienceLevel: ExperienceLevel;
  trainingFocus: TrainingFocus;
  motivationStyle: MotivationStyle;
}

interface AnalyticsBody {
  eventType:
    | "quiz_started"
    | "question_answered"
    | "quiz_completed"
    | "quiz_abandoned";
  questionIndex?: number;
  answerValue?: string;
  durationMs?: number;
}

const completeSchema = {
  body: {
    type: "object",
    required: ["goalType", "experienceLevel", "trainingFocus", "motivationStyle"],
    properties: {
      goalType: {
        type: "string",
        enum: ["muscle_up", "fitness", "weight_loss", "flexibility", "wellness"],
      },
      experienceLevel: {
        type: "string",
        enum: ["beginner", "intermediate", "advanced"],
      },
      trainingFocus: {
        type: "string",
        enum: ["upper_body", "lower_body", "core", "full_body"],
      },
      motivationStyle: {
        type: "string",
        enum: ["discipline", "community", "results", "challenges"],
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
        ],
      },
      questionIndex: { type: "integer", minimum: 0, maximum: 3 },
      answerValue: { type: "string", maxLength: 50 },
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
      const service = new OnboardingService(fastify.db, auraService);

      try {
        const result = await service.completeOnboarding({
          userId: request.user.userId,
          goalType: request.body.goalType,
          experienceLevel: request.body.experienceLevel,
          trainingFocus: request.body.trainingFocus,
          motivationStyle: request.body.motivationStyle,
        });

        return reply.code(201).send(result);
      } catch (err: unknown) {
        if (err instanceof DuplicateOnboardingError) {
          return reply.code(409).send({
            error: "Conflict",
            message: "Onboarding already completed",
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

    const profile = await service.getProfile(request.user.userId);

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
