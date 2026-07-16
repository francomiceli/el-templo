import { FastifyPluginAsync } from "fastify";
import { ExerciseAdjustmentCoachService } from "./coach-service";
import {
  memberAdjustmentsResponseSchema,
  errorResponseSchema,
} from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { ALL_STAFF_ROLES } from "../shared/permissions";

/**
 * exercise-adjustments COACH routes — Phase 131 Plan 02 (ADJUST-04, D-05).
 *
 * Staff-scoped read of a given member's dominado/bajado log. Mounted under
 * /api/admin/exercise-adjustments by plugins/exercise-adjustments-coach.ts.
 *
 * Every route here is gated by a plugin-level onRequest hook that authenticates
 * THEN rejects any role not in ALL_STAFF_ROLES with 403 — a member must NEVER
 * reach these routes (T-131-05). The module is kept in a SEPARATE plugin from
 * the member-scoped POST so the role gate cannot lock out the member's own
 * adjustment endpoint.
 *
 * The gate is ALL_STAFF_ROLES and not TRAINING_ROLES (coach/owner) because the
 * only consumer is AlumnoDetailPage.vue — the member profile that admin,
 * gestion and recepcion open too, which got a 403 on the adjustments section
 * (~12/day in prod). Same shape as the Horarios roster bug (hotfix 65efec0d):
 * a training-gated READ surfaced on an all-staff page. This plugin holds READS
 * only; if a write is ever added here it must carry its own narrower guard.
 *
 *   GET /:memberId → the member's adjustment records (newest first)
 */
export const exerciseAdjustmentCoachRoutes: FastifyPluginAsync = async (
  fastify,
) => {
  const service = new ExerciseAdjustmentCoachService(fastify.db);

  // Role guard for ALL routes in this plugin (reads only — see header).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.status(403).send({ error: "Acceso de staff requerido" });
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
