import { FastifyPluginAsync } from "fastify";
import { ExerciseAdjustmentCoachService } from "./coach-service";
import {
  memberAdjustmentsResponseSchema,
  errorResponseSchema,
} from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { TRAINING_ROLES } from "../shared/permissions";

/**
 * exercise-adjustments COACH routes — Phase 131 Plan 02 (ADJUST-04, D-05).
 *
 * Coach/owner-scoped read of a given member's dominado/bajado log. Mounted under
 * /api/admin/exercise-adjustments by plugins/exercise-adjustments-coach.ts.
 *
 * Every route here is gated by a plugin-level onRequest hook that authenticates
 * THEN rejects any role not in TRAINING_ROLES (coach/owner) with 403 — a member
 * must NEVER reach these routes (T-131-05). This mirrors the tree-editor module
 * (Phase 128) and is kept in a SEPARATE plugin from the member-scoped POST so
 * the role gate cannot lock out the member's own adjustment endpoint.
 *
 *   GET /:memberId → the member's adjustment records (newest first)
 */
export const exerciseAdjustmentCoachRoutes: FastifyPluginAsync = async (
  fastify,
) => {
  const service = new ExerciseAdjustmentCoachService(fastify.db);

  // Role guard for ALL routes in this plugin (mirrors tree-editor/routes.ts).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.status(403).send({ error: "Acceso de profe requerido" });
    }
  });

  fastify.get<{ Params: { memberId: number } }>(
    "/:memberId",
    {
      schema: {
        params: {
          type: "object",
          required: ["memberId"],
          properties: { memberId: { type: "number" } },
        },
        response: {
          200: memberAdjustmentsResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.listMemberAdjustments(request.params.memberId);
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "exercise-adjustments.listMemberAdjustments",
        );
      }
    },
  );
};
