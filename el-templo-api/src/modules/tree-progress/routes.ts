import { FastifyPluginAsync } from "fastify";
import { buildMemberTree } from "./service";
import { memberTreeResponseSchema, errorResponseSchema } from "./schemas";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";

/**
 * tree-progress routes — Phase 127 Plan 01 (TREE-06).
 *
 * GET /api/tree-progress/me — returns the AUTHENTICATED member's skill-tree
 * progress (category → subfamily → nodes with reached/percent). The handler is
 * strictly member-scoped (T-127-01): it reads ONLY request.user.userId and
 * NEVER a user id from the request route/search/payload inputs, so a member can
 * only ever see their own progress.
 */
export const treeProgressRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/me",
    {
      onRequest: [fastify.authenticate],
      schema: {
        response: {
          200: memberTreeResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { userId } = request.user;
      // T-173-09-01: `users` es tabla strict. El ctx sale de la propia fila
      // del socio autenticado (attachCountryScope + assertTenant) — D-09:
      // esta ruta member-facing NO recibe su caso de aislamiento en esta
      // fase (dueño: fase de tree-progress, ver SUMMARY).
      await attachCountryScope(request, fastify.db);
      const ctx = assertTenant(request.scope, "tree-progress.me");
      return buildMemberTree(fastify.db, ctx, userId, request.log);
    },
  );
};
