/**
 * Ratings API Routes (Phase 143)
 *
 * Two route plugins:
 *  - ratingsAdminRoutes (/api/admin/ratings): roster READ (any staff, surfaced
 *    in Horarios) + roster WRITE (owner-only) + owner-only ratings view.
 *  - ratingsMemberRoutes (/api/members/ratings): pending + submit for members.
 *
 * Privacy boundary (D-M3, T-143-04): the ratings VIEW is owner-only. The coach
 * never sees ratings or their own average. Roster READ (coaches-for-branch +
 * weekly roster) is open to ALL_STAFF_ROLES so the roster is visible inside
 * Horarios; roster WRITE (assign a coach to a slot) is owner-only.
 */

import { FastifyPluginAsync } from "fastify";
import { RatingsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import {
  coachesForBranchQuerySchema,
  rosterWeekQuerySchema,
  assignCoachBodySchema,
  submitRatingBodySchema,
  pendingRatingSchema,
} from "./schemas";
import { ALL_STAFF_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { requireBranchAccess } from "../shared/branch-access";
import type { ClassSlot, SubmitRatingInput } from "./types";

// =============================================================================
// Admin Routes (registered at /api/admin/ratings)
// =============================================================================

export const ratingsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const ratingsService = new RatingsService(fastify.db);

  // Guard: any staff role (roster READ is surfaced in Horarios for all staff) +
  // country scope for branch-access. WRITE (POST /roster) and the ratings VIEW
  // (GET /) add their own owner-only per-handler checks below.
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!(ALL_STAFF_ROLES as readonly string[]).includes(request.user.role)) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de staff requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // GET /coaches?branchId — coaches assignable to a branch.
  fastify.get<{ Querystring: { branchId: number } }>(
    "/coaches",
    { schema: coachesForBranchQuerySchema },
    async (request, reply) => {
      try {
        return await ratingsService.getCoachesForBranch(request.query.branchId);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get coaches for branch");
      }
    },
  );

  // GET /roster?branchId&weekStart — roster cells for a branch+week.
  fastify.get<{ Querystring: { branchId: number; weekStart: string } }>(
    "/roster",
    { schema: rosterWeekQuerySchema },
    async (request, reply) => {
      try {
        return await ratingsService.getRosterWeek(
          request.query.branchId,
          request.query.weekStart,
        );
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get roster week");
      }
    },
  );

  // POST /roster — assign/replace a coach in a slot (immediate persistence).
  // Owner-only WRITE: only the owner assigns coaches; the rest of the staff see
  // the roster read-only in Horarios. requireBranchAccess still scopes the
  // branch (defence in depth — the owner has access to every branch).
  fastify.post<{
    Body: {
      branchId: number;
      weekStartDate: string;
      dayOfWeek: number;
      slot: ClassSlot;
      coachId: number;
    };
  }>(
    "/roster",
    {
      schema: assignCoachBodySchema,
      preHandler: [requireBranchAccess({ from: "body.branchId" })],
    },
    async (request, reply) => {
      try {
        if (request.user.role !== "owner") {
          return reply.code(403).send({
            error: "Acceso denegado",
            message: "Solo el owner puede asignar profes",
          });
        }
        await ratingsService.upsertRosterAssignment(request.body);
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "upsert roster assignment");
      }
    },
  );

  // GET / — owner-only ratings view (per-coach average + recent, D-O1/D-M3).
  fastify.get("/", async (request, reply) => {
    try {
      if (request.user.role !== "owner") {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo el owner puede ver las puntuaciones",
        });
      }
      return await ratingsService.getOwnerRatings({
        role: request.scope.role,
        isOwner: request.scope.isOwner,
        country: request.scope.country,
        branchIds: request.scope.branchIds,
      });
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "get owner ratings");
    }
  });
};

// =============================================================================
// Member Routes (registered at /api/members/ratings)
// =============================================================================

export const ratingsMemberRoutes: FastifyPluginAsync = async (fastify) => {
  const ratingsService = new RatingsService(fastify.db);

  // Guard: authentication only (any role; members rate their own classes).
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  // GET /pending — the single class to rate now (D-P3/D-P4), coach hidden (D-A3).
  fastify.get(
    "/pending",
    { schema: pendingRatingSchema },
    async (request, reply) => {
      try {
        const result = await ratingsService.getPendingRating(
          request.user.userId,
        );
        return reply.send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "get pending rating");
      }
    },
  );

  // POST / — submit a rating (attribution + guards server-side).
  fastify.post<{ Body: SubmitRatingInput }>(
    "/",
    { schema: submitRatingBodySchema },
    async (request, reply) => {
      try {
        await ratingsService.submitRating(request.user.userId, request.body);
        return reply.code(201).send({ ok: true });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "submit rating");
      }
    },
  );
};
