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
  ownerRatingsQuerySchema,
} from "./schemas";
import { ALL_STAFF_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";
import { assertTenant } from "../shared/tenant";
import { requireBranchAccess } from "../shared/branch-access";
import type { ClassSlot, SubmitRatingInput } from "./types";

/**
 * "1,2,5" → [1,2,5]. El querystring schema ya validó el formato, así que acá no
 * hay que defenderse de basura: undefined/vacío devuelve undefined (= sin
 * filtro), no un array vacío, para que el service no distinga dos "nada".
 */
function parseStarsFilter(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined;
  const values = [...new Set(raw.split(",").map(Number))];
  return values.length > 0 ? values : undefined;
}

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
        const ctx = assertTenant(request.scope, "ratings.coachesForBranch");
        return await ratingsService.getCoachesForBranch(
          ctx,
          request.query.branchId,
        );
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
        const ctx = assertTenant(request.scope, "ratings.rosterWeek");
        return await ratingsService.getRosterWeek(
          ctx,
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
        const ctx = assertTenant(request.scope, "ratings.upsertRoster");
        await ratingsService.upsertRosterAssignment(ctx, request.body);
        return reply.code(204).send();
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "upsert roster assignment");
      }
    },
  );

  // GET / — owner-only ratings view (D-O1/D-M3): promedios per-coach (profe +
  // clase) filtrables por fecha/sucursal, y listado individual paginado.
  fastify.get<{
    Querystring: {
      dateFrom?: string;
      dateTo?: string;
      branchId?: number;
      withComments?: boolean;
      stars?: string;
      starsDimension?: "coach" | "class";
      page?: number;
      limit?: number;
    };
  }>("/", { schema: ownerRatingsQuerySchema }, async (request, reply) => {
    try {
      if (request.user.role !== "owner") {
        return reply.code(403).send({
          error: "Acceso denegado",
          message: "Solo el owner puede ver las puntuaciones",
        });
      }
      const ctx = assertTenant(request.scope, "ratings.ownerView");
      return await ratingsService.getOwnerRatings(
        ctx,
        {
          role: request.scope.role,
          isOwner: request.scope.isOwner,
          country: request.scope.country,
          branchIds: request.scope.branchIds,
        },
        {
          dateFrom: request.query.dateFrom,
          dateTo: request.query.dateTo,
          branchId: request.query.branchId,
          withComments: request.query.withComments,
          // El schema ya garantizó el formato "1,2,5" — acá solo se parsea y
          // se deduplica (5 valores posibles: el Set es más barato que un IN
          // con repetidos y deja el SQL estable para el query cache).
          stars: parseStarsFilter(request.query.stars),
          starsDimension: request.query.starsDimension,
          page: request.query.page,
          limit: request.query.limit,
        },
      );
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
