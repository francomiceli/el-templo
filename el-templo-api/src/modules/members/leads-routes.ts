/**
 * Phase 114 (D-27..D-29, D-34): admin leads sub-router.
 *
 * Mounted at /api/admin/leads (separate plugin from /api/admin/members so the
 * URL surface mirrors the data model: a "lead" is a user with status='prueba',
 * but the verb space here — PATCH lead_status / lead_notes — is distinct from
 * member editing).
 *
 * Routes:
 *   PATCH /:userId — admin edits lead_status / lead_notes on a trial user.
 *     Auth: gestion/admin/owner (CAJA_ROLES, mirrors the reports module's
 *     role gate).
 *     Scope: lead's branchId must satisfy canAccessBranch against the
 *     admin's request.scope (D-29). Owner bypasses, admin/gestion match by
 *     country, coach/recepción by user_branches.
 *     Errors: 400 (schema), 403 (out of scope), 404 (no user), 409 (not a
 *     lead — status !== 'prueba').
 */

import { FastifyPluginAsync } from "fastify";
import { MemberService } from "./service";
import { updateLeadSchema } from "./schemas";
import { handleServiceError } from "../shared/error-handler";
import { ConflictError, NotFoundError } from "../shared/errors";
import { CAJA_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { canAccessBranch, BRANCH_OUT_OF_SCOPE } from "../shared/branch-access";
import type { UpdateLeadInput } from "./types";

export const leadsRoutes: FastifyPluginAsync = async (fastify) => {
  const memberService = new MemberService(fastify.db, fastify.log);

  /**
   * Guard: require gestion/admin/owner role on all routes + attach country
   * scope. Mirrors reports/routes.ts:47-56 (the precedent the plan cites for
   * D-25; D-29 reuses the same pattern for scope plumbing).
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(CAJA_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.patch<{
    Params: { userId: number };
    Body: UpdateLeadInput;
  }>("/:userId", { schema: updateLeadSchema }, async (request, reply) => {
    try {
      // D-29: lead's branchId must be in the admin's scope. We can't reuse
      // requireBranchAccess({ from: ... }) directly because the branchId
      // lives on the lead row (users.branchId), not in the request payload.
      // The check uses canAccessBranch — the same pure predicate
      // requireBranchAccess delegates to — so the eval order (virtual /
      // owner / admin-gestion country / coach-recepción branchIds / member)
      // and BRANCH_OUT_OF_SCOPE error shape stay identical.
      const branchId = await memberService.getLeadBranchId(
        request.params.userId,
      );
      if (branchId === null) {
        return reply.code(404).send({
          error: "No encontrado",
          message: "Lead no encontrado",
        });
      }

      const allowed = await canAccessBranch(
        request.scope,
        branchId,
        fastify.db,
      );
      if (!allowed) {
        request.log.warn(
          {
            userId: request.user?.userId,
            role: request.user?.role,
            targetUserId: request.params.userId,
            branchId,
            scope: request.scope,
          },
          BRANCH_OUT_OF_SCOPE,
        );
        return reply.code(403).send({
          error: "Forbidden",
          message: "No tenés acceso a esta sede",
          code: BRANCH_OUT_OF_SCOPE,
        });
      }

      const snapshot = await memberService.updateLead(
        request.params.userId,
        request.body,
      );
      return reply.code(200).send(snapshot);
    } catch (err: unknown) {
      if (err instanceof NotFoundError) {
        return reply.code(404).send({
          error: "No encontrado",
          message: err.message,
        });
      }
      if (err instanceof ConflictError) {
        return reply.code(409).send({
          error: "Conflicto",
          message: err.message,
        });
      }
      return handleServiceError(err, reply, request.log, "update lead");
    }
  });
};
