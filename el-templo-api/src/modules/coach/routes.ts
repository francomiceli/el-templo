/**
 * Coach API Routes
 *
 * Endpoints for the coach-facing "Deudas" tab in the admin web.
 * All routes require role in COACH_DEBTS_ROLES (coach + gestion + admin + owner).
 *
 * Coaches are deliberately excluded from FINANCE_READ_ROLES (Phase 106 D-04)
 * to protect privacy. This module exposes ONLY the minimum required to
 * answer "how much do I collect from this member?" — aggregated totals per
 * (member, currency), no transactions, no concept labels, no buckets.
 */

import { FastifyPluginAsync } from "fastify";
import { CoachService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { coachOutstandingBalancesSchema } from "./schemas";
import { COACH_DEBTS_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import type { CoachOutstandingBalancesFilters } from "./types";

export const coachRoutes: FastifyPluginAsync = async (fastify) => {
  const coachService = new CoachService(fastify.db);

  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(COACH_DEBTS_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  fastify.get<{ Querystring: { search?: string } }>(
    "/outstanding-balances",
    { schema: coachOutstandingBalancesSchema },
    async (request, reply) => {
      try {
        const filters: CoachOutstandingBalancesFilters = {
          search: request.query.search,
        };
        return await coachService.getOutstandingBalances(filters, {
          role: request.scope.role,
          isOwner: request.scope.isOwner,
          country: request.scope.country,
          branchIds: request.scope.branchIds,
        });
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "get coach outstanding balances",
        );
      }
    },
  );
};
