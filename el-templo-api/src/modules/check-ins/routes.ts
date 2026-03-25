import { FastifyPluginAsync } from "fastify";
import { CheckInService } from "./service";
import type { CheckInAnswer } from "./types";
import {
  submitCheckInBodySchema,
  checkInResponseSchema,
  todayCheckInResponseSchema,
  errorResponseSchema,
} from "./schemas";

export const checkInRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new CheckInService(fastify.db);

  /**
   * POST /api/check-ins
   *
   * Submit a daily check-in answer (energy, soreness, or sleep).
   * Returns 201 on success, 400 for validation errors, 403 if question
   * is not yet unlocked, 409 if already answered today.
   */
  fastify.post<{ Body: CheckInAnswer }>(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: submitCheckInBodySchema,
        response: {
          201: checkInResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const { questionType, value, bodyArea } = request.body;

      try {
        await service.submitAnswer(userId, { questionType, value, bodyArea });
        return reply.status(201).send({ success: true });
      } catch (err: unknown) {
        if (err instanceof Error) {
          if (err.message === "Ya respondiste esta pregunta hoy") {
            return reply.status(409).send({ error: err.message });
          }
          if (err.message === "Pregunta no disponible todavia") {
            return reply.status(403).send({ error: err.message });
          }
          return reply.status(400).send({ error: err.message });
        }
        return reply
          .status(400)
          .send({ error: "Error al registrar respuesta" });
      }
    },
  );

  /**
   * GET /api/check-ins/today
   *
   * Returns today's check-in state: which questions are unlocked
   * and any answers already submitted today.
   */
  fastify.get(
    "/today",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: todayCheckInResponseSchema,
        },
      },
    },
    async (request) => {
      const { userId } = request.user;
      return service.getTodayState(userId);
    },
  );
};
