import { FastifyPluginAsync } from "fastify";
import { TreeEditorService, type MilestoneRole } from "./service";
import {
  editableTreeResponseSchema,
  reorderBodySchema,
  precedenceBodySchema,
  regroupBodySchema,
  milestoneReviewQuerySchema,
  milestoneReviewResponseSchema,
  milestoneVariantsParamsSchema,
  milestoneVariantsResponseSchema,
  milestoneAcceptBodySchema,
  milestoneRejectBodySchema,
  milestonePromoteBodySchema,
  mutationResultSchema,
  errorResponseSchema,
} from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { TRAINING_ROLES } from "../shared/permissions";

/**
 * tree-editor routes — Phase 128 Plan 02 (TREE-07) + Phase 133 Plan 05 (R1-REV).
 *
 * Admin/coach-scoped editor for the skill tree (D-06). Every route is gated by a
 * plugin-level onRequest hook that authenticates THEN rejects any role not in
 * TRAINING_ROLES (coach/owner) with 403 — a member must NEVER reach these routes
 * (T-128-03 / T-133-40). Mounted under /api/admin/tree-editor by
 * plugins/tree-editor.ts.
 *
 *   GET  /tree                            → read the editable tree (auto/manual tagged)
 *   POST /reorder                         → rewrite a (route × effort) partition as manual chain
 *   POST /precedence                      → add/remove a single manual cross-edge
 *   POST /regroup                         → reassign exercises.route with bounded edge prune
 *   GET  /milestone-review?route=CODE     → pending hito/variante proposals of a route
 *   GET  /milestone/:exerciseId/variants  → variantes hanging off a hito (truth)
 *   POST /milestone-review/accept         → ONE-tx accept (dimension + hito/variante + prune)
 *   POST /milestone-review/reject         → status-only flip, never touches exercises
 *   POST /milestone/promote               → transactional variante↔hito swap
 */
export const treeEditorRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new TreeEditorService(fastify.db);

  // Role guard for ALL routes in this plugin (mirrors admin/routes.ts).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(TRAINING_ROLES as readonly string[]).includes(request.user.role)) {
      return reply
        .status(403)
        .send({ error: "Acceso de administrador requerido" });
    }
  });

  fastify.get(
    "/tree",
    {
      schema: {
        response: {
          200: editableTreeResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.buildEditableTree();
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.buildEditableTree",
        );
      }
    },
  );

  fastify.post<{
    Body: { route: string; effort: string; orderedExerciseIds: number[] };
  }>(
    "/reorder",
    {
      schema: {
        body: reorderBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { route, effort, orderedExerciseIds } = request.body;
        return await service.reorderPartition(
          route,
          effort,
          orderedExerciseIds,
        );
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.reorderPartition",
        );
      }
    },
  );

  fastify.post<{
    Body: {
      fromExerciseId: number;
      toExerciseId: number;
      op: "add" | "remove";
    };
  }>(
    "/precedence",
    {
      schema: {
        body: precedenceBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { fromExerciseId, toExerciseId, op } = request.body;
        return await service.setPrecedenceEdge(
          fromExerciseId,
          toExerciseId,
          op,
        );
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.setPrecedenceEdge",
        );
      }
    },
  );

  fastify.post<{
    Body: { exerciseIds: number[]; targetRoute: string };
  }>(
    "/regroup",
    {
      schema: {
        body: regroupBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { exerciseIds, targetRoute } = request.body;
        return await service.reassignRoute(exerciseIds, targetRoute);
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.reassignRoute",
        );
      }
    },
  );

  // ── Milestone review (phase 133 Plan 05 — R1-REV) ───────────────────────────

  fastify.get<{
    Querystring: { route: string };
  }>(
    "/milestone-review",
    {
      schema: {
        querystring: milestoneReviewQuerySchema,
        response: {
          200: milestoneReviewResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const rows = await service.listMilestoneReview(request.query.route);
        return { rows };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.listMilestoneReview",
        );
      }
    },
  );

  fastify.get<{
    Params: { exerciseId: number };
  }>(
    "/milestone/:exerciseId/variants",
    {
      schema: {
        params: milestoneVariantsParamsSchema,
        response: {
          200: milestoneVariantsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const variants = await service.getVariants(request.params.exerciseId);
        return { variants };
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.getVariants",
        );
      }
    },
  );

  fastify.post<{
    Body: {
      exerciseId: number;
      role: MilestoneRole;
      milestoneExerciseId?: number;
      dimensionOverrides?: { step?: number | null; habilidad?: string | null };
    };
  }>(
    "/milestone-review/accept",
    {
      schema: {
        body: milestoneAcceptBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const { exerciseId, role, milestoneExerciseId, dimensionOverrides } =
          request.body;
        // Conditional requirement JSON schema can't express cleanly: a
        // variante MUST say which hito it hangs off.
        if (role === "variante" && milestoneExerciseId === undefined) {
          return reply.status(400).send({
            error: "Solicitud invalida",
            message: "milestoneExerciseId es requerido cuando role='variante'",
          });
        }
        return await service.acceptMilestoneReview({
          exerciseId,
          role,
          milestoneExerciseId,
          dimensionOverrides,
        });
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.acceptMilestoneReview",
        );
      }
    },
  );

  fastify.post<{
    Body: { exerciseId: number };
  }>(
    "/milestone-review/reject",
    {
      schema: {
        body: milestoneRejectBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.rejectMilestoneReview(request.body.exerciseId);
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.rejectMilestoneReview",
        );
      }
    },
  );

  fastify.post<{
    Body: { exerciseId: number };
  }>(
    "/milestone/promote",
    {
      schema: {
        body: milestonePromoteBodySchema,
        response: {
          200: mutationResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.promoteToMilestone(request.body.exerciseId);
      } catch (err: unknown) {
        return handleServiceError(
          err,
          reply,
          request.log,
          "tree-editor.promoteToMilestone",
        );
      }
    },
  );
};
