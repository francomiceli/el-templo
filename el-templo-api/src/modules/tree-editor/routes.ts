import { FastifyPluginAsync } from "fastify";
import { TreeEditorService } from "./service";
import {
  editableTreeResponseSchema,
  reorderBodySchema,
  precedenceBodySchema,
  regroupBodySchema,
  mutationResultSchema,
  errorResponseSchema,
} from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { TRAINING_ROLES } from "../shared/permissions";

/**
 * tree-editor routes — Phase 128 Plan 02 (TREE-07).
 *
 * Admin/coach-scoped editor for the skill tree (D-06). Every route is gated by a
 * plugin-level onRequest hook that authenticates THEN rejects any role not in
 * TRAINING_ROLES (coach/owner) with 403 — a member must NEVER reach these routes
 * (T-128-03). Mounted under /api/admin/tree-editor by plugins/tree-editor.ts.
 *
 *   GET  /tree        → read the editable tree (auto/manual tagged)
 *   POST /reorder     → rewrite a (subfamily × effort) partition as manual chain
 *   POST /precedence  → add/remove a single manual cross-edge
 *   POST /regroup     → reassign exercises.subfamily_id with bounded edge prune
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
};
