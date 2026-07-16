import { FastifyPluginAsync } from "fastify";
import { ExerciseAdjustmentService } from "./service";
import {
  adjustmentRequestSchema,
  adjustmentResponseSchema,
  errorResponseSchema,
} from "./schemas";

/**
 * exercise-adjustments routes — Phase 131 Plan 01 (ADJUST-01/02/03).
 *
 * POST /api/exercise-adjustments — records the AUTHENTICATED member's in-session
 * difficulty adjustment on a tree node and returns the neighbor exercise to swap
 * in (or `{ neighbor: null, message }` at chain end).
 *
 * Strictly member-scoped (T-131-01, D-04): the handler derives `memberId` from
 * `request.user.userId` ONLY and NEVER from the route/search/payload. The body
 * carries no member/user id, so a member can only ever record their own
 * adjustment. The body schema sets `additionalProperties: false`, so a spoofed
 * `memberId`/`userId` field is rejected by validation, but even if it weren't,
 * the handler ignores it.
 *
 * The STAFF read of a member's log lives in a SEPARATE plugin/routes module
 * (coach-routes.ts, mounted under /api/admin/exercise-adjustments) so its
 * ALL_STAFF_ROLES gate never touches this member-scoped POST (Plan 02, D-05).
 */
interface AdjustmentBody {
  exerciseId: number;
  direction: "up" | "down";
  dayId: string;
  date: string;
}

export const exerciseAdjustmentRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ExerciseAdjustmentService(fastify.db);

  fastify.post<{ Body: AdjustmentBody }>(
    "/",
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: adjustmentRequestSchema,
        response: {
          200: adjustmentResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      // Member-scope: the origin member is the authenticated user, NEVER input.
      const { userId } = request.user;
      const { exerciseId, direction, dayId, date } = request.body;

      return service.adjust(userId, exerciseId, direction, { dayId, date });
    },
  );
};
