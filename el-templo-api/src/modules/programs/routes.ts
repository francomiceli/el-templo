/**
 * Programs API Routes
 *
 * Admin endpoints for micro-program CRUD, enrollment lifecycle management.
 * Member endpoints for program catalog and enrollment progress.
 *
 * Admin CRUD: CAJA_ROLES (gestion, admin, owner)
 * Enrollment management: COACH_ROLES (coach, admin, owner) per D-35
 * Member: authenticated members
 */

import { FastifyPluginAsync } from "fastify";
import { ProgramsService } from "./service";
import { handleServiceError } from "../shared/error-handler";
import { CAJA_ROLES, COACH_ROLES } from "../shared/permissions";
import type {
  CreateProgramInput,
  UpdateProgramInput,
  ContentBlockInput,
} from "./types";

// ---- Fastify JSON Schemas for request validation ----

const contentBlockSchema = {
  type: "object",
  required: ["weekNumber", "sortOrder", "blockType", "title"],
  properties: {
    weekNumber: { type: "integer", minimum: 1 },
    sortOrder: { type: "integer", minimum: 0 },
    blockType: { type: "string", enum: ["video", "text", "pdf", "exercise"] },
    title: { type: "string", minLength: 1, maxLength: 200 },
    content: { type: ["string", "null"] },
    videoUrl: { type: ["string", "null"], maxLength: 500 },
    exerciseId: { type: ["integer", "null"] },
  },
  additionalProperties: false,
};

const createProgramSchema = {
  body: {
    type: "object",
    required: [
      "name",
      "description",
      "durationWeeks",
      "sessionsPerWeekToAdvance",
      "auraWeeklyBonus",
      "auraCompletionBonus",
      "contentBlocks",
    ],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 150 },
      description: { type: ["string", "null"] },
      durationWeeks: { type: "integer", minimum: 1, maximum: 52 },
      sessionsPerWeekToAdvance: { type: "integer", minimum: 1, maximum: 7 },
      auraWeeklyBonus: { type: "integer", minimum: 0 },
      auraCompletionBonus: { type: "integer", minimum: 0 },
      goalPlanType: {
        type: ["string", "null"],
        enum: [
          "tren_superior",
          "tren_inferior",
          "empuje",
          "traccion",
          "planche",
          "front_lever",
          null,
        ],
      },
      contentBlocks: {
        type: "array",
        items: contentBlockSchema,
      },
    },
    additionalProperties: false,
  },
};

const updateProgramSchema = {
  body: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 150 },
      description: { type: ["string", "null"] },
      goalPlanType: {
        type: ["string", "null"],
        enum: [
          "tren_superior",
          "tren_inferior",
          "empuje",
          "traccion",
          "planche",
          "front_lever",
          null,
        ],
      },
      auraWeeklyBonus: { type: "integer", minimum: 0 },
      auraCompletionBonus: { type: "integer", minimum: 0 },
    },
    additionalProperties: false,
  },
};

const addContentBlocksSchema = {
  body: {
    type: "object",
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: contentBlockSchema,
        minItems: 1,
      },
    },
    additionalProperties: false,
  },
};

const programIdParamsSchema = {
  params: {
    type: "object",
    required: ["programId"],
    properties: {
      programId: { type: "integer" },
    },
  },
};

const enrollmentIdParamsSchema = {
  params: {
    type: "object",
    required: ["enrollmentId"],
    properties: {
      enrollmentId: { type: "integer" },
    },
  },
};

const userIdParamsSchema = {
  params: {
    type: "object",
    required: ["userId"],
    properties: {
      userId: { type: "integer" },
    },
  },
};

export const programRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ProgramsService(fastify.db, fastify.log);

  // =========================================================================
  // Admin Routes — Program CRUD (CAJA_ROLES)
  // =========================================================================

  /**
   * POST /api/admin/programs — Create a new program with content blocks.
   */
  fastify.post<{ Body: CreateProgramInput }>(
    "/admin/programs",
    { schema: createProgramSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(CAJA_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const id = await service.createProgram(request.body);
        return reply.code(201).send({ id });
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "createProgram");
      }
    },
  );

  /**
   * GET /api/admin/programs — List all programs (active + inactive).
   */
  fastify.get("/admin/programs", async (request, reply) => {
    await fastify.authenticate(request, reply);
    const { role } = request.user;
    if (!(CAJA_ROLES as readonly string[]).includes(role)) {
      return reply.code(403).send({ error: "Acceso denegado" });
    }

    try {
      const programs = await service.listPrograms();
      return { programs };
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "listPrograms");
    }
  });

  /**
   * GET /api/admin/programs/analytics — Program enrollment analytics.
   * NOTE: This route must be registered BEFORE /admin/programs/:programId
   * to avoid "analytics" being parsed as a programId parameter.
   */
  fastify.get("/admin/programs/analytics", async (request, reply) => {
    await fastify.authenticate(request, reply);
    const { role } = request.user;
    if (!(CAJA_ROLES as readonly string[]).includes(role)) {
      return reply.code(403).send({ error: "Acceso denegado" });
    }

    try {
      const analytics = await service.getAnalytics();
      return analytics;
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "getAnalytics");
    }
  });

  /**
   * GET /api/admin/programs/enrollments/user/:userId — Get enrollments for a user.
   * COACH_ROLES per D-35.
   */
  fastify.get<{ Params: { userId: number } }>(
    "/admin/programs/enrollments/user/:userId",
    { schema: userIdParamsSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(COACH_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const enrollments = await service.getEnrollmentsByUser(
          request.params.userId,
        );
        return { enrollments };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getEnrollmentsByUser");
      }
    },
  );

  /**
   * GET /api/admin/programs/:programId — Program detail with content blocks.
   */
  fastify.get<{ Params: { programId: number } }>(
    "/admin/programs/:programId",
    { schema: programIdParamsSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(CAJA_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const detail = await service.getProgramDetail(request.params.programId);
        if (!detail) {
          return reply.code(404).send({
            error: "No encontrado",
            message: "Programa no encontrado",
          });
        }
        return detail;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getProgramDetail");
      }
    },
  );

  /**
   * PUT /api/admin/programs/:programId — Update program fields.
   */
  fastify.put<{ Params: { programId: number }; Body: UpdateProgramInput }>(
    "/admin/programs/:programId",
    { schema: { ...programIdParamsSchema, ...updateProgramSchema } },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(CAJA_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        await service.updateProgram(request.params.programId, request.body);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "updateProgram");
      }
    },
  );

  /**
   * POST /api/admin/programs/:programId/content — Add content blocks.
   */
  fastify.post<{
    Params: { programId: number };
    Body: { blocks: ContentBlockInput[] };
  }>(
    "/admin/programs/:programId/content",
    { schema: { ...programIdParamsSchema, ...addContentBlocksSchema } },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(CAJA_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        await service.addContentBlocks(
          request.params.programId,
          request.body.blocks,
        );
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "addContentBlocks");
      }
    },
  );

  /**
   * POST /api/admin/programs/:programId/deactivate — Deactivate a program.
   */
  fastify.post<{ Params: { programId: number } }>(
    "/admin/programs/:programId/deactivate",
    { schema: programIdParamsSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(CAJA_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        await service.deactivateProgram(request.params.programId);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "deactivateProgram");
      }
    },
  );

  /**
   * POST /api/admin/programs/swap — Swap a member's active program.
   * Cancels current enrollment and creates a new one for the target program.
   * COACH_ROLES per D-35.
   */
  fastify.post<{ Body: { userId: number; programId: number } }>(
    "/admin/programs/swap",
    {
      schema: {
        body: {
          type: "object",
          required: ["userId", "programId"],
          properties: {
            userId: { type: "integer" },
            programId: { type: "integer" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(COACH_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const enrollmentId = await service.swapProgram(
          request.body.userId,
          request.body.programId,
        );
        return { success: true, enrollmentId };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "swapProgram");
      }
    },
  );

  /**
   * POST /api/admin/programs/enrollments/:enrollmentId/cancel — Cancel enrollment.
   * COACH_ROLES per D-35.
   */
  fastify.post<{ Params: { enrollmentId: number } }>(
    "/admin/programs/enrollments/:enrollmentId/cancel",
    { schema: enrollmentIdParamsSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(COACH_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        await service.cancelEnrollment(request.params.enrollmentId);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "cancelEnrollment");
      }
    },
  );

  /**
   * POST /api/admin/programs/enrollments/:enrollmentId/advance — Advance week.
   * COACH_ROLES per D-35.
   */
  fastify.post<{ Params: { enrollmentId: number } }>(
    "/admin/programs/enrollments/:enrollmentId/advance",
    { schema: enrollmentIdParamsSchema },
    async (request, reply) => {
      await fastify.authenticate(request, reply);
      const { role } = request.user;
      if (!(COACH_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        await service.advanceWeek(request.params.enrollmentId);
        return { success: true };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "advanceWeek");
      }
    },
  );

  // =========================================================================
  // Member Routes
  // =========================================================================

  /**
   * GET /api/members/programs/catalog — Active program catalog for members.
   */
  fastify.get("/members/programs/catalog", async (request, reply) => {
    await fastify.authenticate(request, reply);

    try {
      const programs = await service.getCatalog();
      return { programs };
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "getCatalog");
    }
  });

  /**
   * GET /api/members/programs/my-progress — Active enrollment progress.
   * Returns 204 No Content if no active enrollment (follows onboarding/routes.ts pattern).
   */
  fastify.get("/members/programs/my-progress", async (request, reply) => {
    await fastify.authenticate(request, reply);

    try {
      const progress = await service.getMemberProgress(request.user.userId);

      if (!progress) {
        return reply.code(204).send();
      }

      return reply.code(200).send(progress);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "getMemberProgress");
    }
  });

  /**
   * GET /api/members/programs/has-goal-plan-access — Goal plan gate check.
   * Returns { hasAccess: boolean } — true if member has active program enrollment.
   * Per D-08: program enrollment IS the goal plan gate.
   */
  fastify.get(
    "/members/programs/has-goal-plan-access",
    async (request, reply) => {
      await fastify.authenticate(request, reply);

      try {
        const hasAccess = await service.hasActiveProgramEnrollment(
          request.user.userId,
        );
        return { hasAccess };
      } catch (err: unknown) {
        handleServiceError(
          err,
          reply,
          request.log,
          "hasActiveProgramEnrollment",
        );
      }
    },
  );

  // =========================================================================
  // Phase 104 R6 — Current Program pointer (read/write) + enrollments listing
  // =========================================================================

  /**
   * GET /api/members/me/current-program — Read the member's
   * currentProgramEnrollmentId pointer. Returns { enrollmentId, program } when
   * set + active, or { enrollmentId: null, program: null } when unset/stale.
   */
  fastify.get("/members/me/current-program", async (request, reply) => {
    await fastify.authenticate(request, reply);

    try {
      const result = await service.getCurrentProgram(request.user.userId);
      return reply.code(200).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "getCurrentProgram");
    }
  });

  /**
   * PUT /api/members/me/current-program — Set the pointer.
   * Body: { enrollmentId: number | null }.
   *  - non-null: must be the user's own active enrollment, else 403.
   *  - null: only allowed when the user has an active presencial subscription
   *    (per R6 — null means "Templo view"), else 403.
   */
  fastify.put<{ Body: { enrollmentId: number | null } }>(
    "/members/me/current-program",
    {
      schema: {
        body: {
          type: "object",
          required: ["enrollmentId"],
          additionalProperties: false,
          properties: {
            enrollmentId: { type: ["integer", "null"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              enrollmentId: { type: ["integer", "null"] },
              program: {
                type: ["object", "null"],
                properties: {
                  id: { type: "integer" },
                  name: { type: "string" },
                  goalPlanType: { type: ["string", "null"] },
                  durationWeeks: { type: ["integer", "null"] },
                  currentWeek: { type: "integer" },
                },
              },
            },
          },
          403: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      await fastify.authenticate(request, reply);

      try {
        const result = await service.setCurrentProgram(
          request.user.userId,
          request.body.enrollmentId,
        );
        return reply.code(200).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "setCurrentProgram");
      }
    },
  );

  /**
   * GET /api/members/me/enrollments — List the member's active program
   * enrollments ordered by id ASC. Used by the Plan 05 program selector to
   * populate the bottom-sheet options. Returns { enrollments: [...] } —
   * empty array if no active rows.
   */
  fastify.get("/members/me/enrollments", async (request, reply) => {
    await fastify.authenticate(request, reply);

    try {
      const result = await service.listMyActiveEnrollments(request.user.userId);
      return reply.code(200).send(result);
    } catch (err: unknown) {
      handleServiceError(err, reply, request.log, "listMyActiveEnrollments");
    }
  });
};
