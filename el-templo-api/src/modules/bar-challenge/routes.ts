/**
 * Bar Challenge API Routes (Phase 115 — D-11, D-12, D-13)
 *
 * Endpoint: POST /result — register the authenticated user's single bar
 * challenge attempt. Mounted under `/api/bar-challenge`, so the full path is
 * `POST /api/bar-challenge/result` (D-12 — overrides the SPEC R2 path).
 *
 * Validation: Fastify JSON Schema with `additionalProperties: false` enforces
 * the integer bound `[0, 600]` on `secondsHeld` and rejects extra fields
 * (defense-in-depth against T-115-08 tampering).
 */
import type { FastifyPluginAsync } from "fastify";
import { BarChallengeService } from "./service";

interface SubmitResultBody {
  secondsHeld: number;
}

const submitResultSchema = {
  body: {
    type: "object",
    required: ["secondsHeld"],
    additionalProperties: false,
    properties: {
      secondsHeld: { type: "integer", minimum: 0, maximum: 600 },
    },
  },
};

export const barChallengeRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require an authenticated member token (T-115-11).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  /**
   * POST /api/bar-challenge/result
   *
   * Body: `{ secondsHeld: integer in [0, 600] }`.
   * Success: 200 with `{ completed, seconds }`. `completed = secondsHeld >= 90`.
   *   - Cada submit sobrescribe el intento previo; sin límite de intentos.
   * Bad request: 400 (JSON-schema violation).
   * Unauthorized: 401 (missing/invalid bearer token).
   */
  fastify.post<{ Body: SubmitResultBody }>(
    "/result",
    { schema: submitResultSchema },
    async (request, reply) => {
      const { userId } = request.user;
      const { secondsHeld } = request.body;

      const service = new BarChallengeService(fastify.db, request.log);
      const result = await service.submitResult(userId, secondsHeld);

      return reply.code(200).send({
        completed: result.completed,
        seconds: result.seconds,
      });
    },
  );
};

export default barChallengeRoutes;
