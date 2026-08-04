/**
 * Programs API Routes
 *
 * Admin endpoints for micro-program CRUD, enrollment lifecycle management.
 * Member endpoints for program catalog and enrollment progress.
 *
 * Admin CRUD write/detail/analytics: PROGRAMAS_ROLES (admin, owner) — dueño-only, D-15
 * Admin list (GET /admin/programs): PROGRAMAS_LIST_ROLES (staff administrativo,
 *   sin coach — D-10) para poblar la columna Programa de Planes y el diálogo de add-ons
 * Enrollment management: COACH_ROLES (coach, admin, owner) per D-35
 * Member: authenticated members
 */

import { FastifyPluginAsync } from "fastify";
import { and, eq, or } from "drizzle-orm";
import { ProgramsService } from "./service";
import { EnrollmentService } from "./enrollment-service";
import {
  TransactionService,
  BalanceService,
  CashRegisterService,
} from "../finance";
import type { PaymentMethod } from "../finance/types";
import { handleServiceError } from "../shared/error-handler";
import { auditLog } from "../shared/audit-log";
import {
  PROGRAMAS_ROLES,
  PROGRAMAS_LIST_ROLES,
  COACH_ROLES,
  FINANCE_WRITE_ROLES,
} from "../shared/permissions";
import * as schema from "../../db/schema";
import type {
  CreateProgramInput,
  UpdateProgramInput,
  ContentBlockInput,
} from "./types";
import { ALL_GOAL_PLAN_TYPES } from "../goal-plans/constants";

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
        enum: [...ALL_GOAL_PLAN_TYPES, null],
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
        enum: [...ALL_GOAL_PLAN_TYPES, null],
      },
      durationWeeks: { type: "integer", minimum: 1, maximum: 52 },
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

// Phase 112 D-10 — JSON schema for the admin add-on body. additionalProperties
// false rejects anything not whitelisted (T-112-04-02 Tampering mitigation).
const enrollAddonBodySchema = {
  type: "object",
  required: ["programId"],
  properties: {
    programId: { type: "integer", minimum: 1 },
    pricePaid: { type: ["integer", "null"], minimum: 0 },
    paymentMethod: {
      type: "string",
      enum: [
        "cash",
        "transfer",
        "card",
        "aura_credit",
        "internal",
        "direct_debit",
      ],
    },
    notes: { type: ["string", "null"], maxLength: 500 },
  },
  additionalProperties: false,
};

export const programRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new ProgramsService(fastify.db, fastify.log);
  // Phase 112 Plan 04 — finance + enrollment wiring for the admin add-on
  // endpoint and the cancel-with-audit handler. Other handlers in this file
  // pre-date Phase 112 and continue to use the original ProgramsService surface.
  const balanceService = new BalanceService(fastify.db, fastify.log);
  const cashRegisterService = new CashRegisterService(fastify.db, fastify.log);
  const transactionService = new TransactionService(
    fastify.db,
    fastify.log,
    balanceService,
    cashRegisterService,
  );
  const enrollmentService = new EnrollmentService(
    fastify.db,
    fastify.log,
    transactionService,
  );

  // =========================================================================
  // Admin Routes — Program CRUD
  //   list (GET /admin/programs) = PROGRAMAS_LIST_ROLES (staff administrativo,
  //     sin coach — D-10)
  //   resto (create/analytics/detail/put/content/deactivate) = PROGRAMAS_ROLES
  //     (dueño-only, D-15)
  // =========================================================================

  /**
   * POST /api/admin/programs — Create a new program with content blocks.
   */
  fastify.post<{ Body: CreateProgramInput }>(
    "/admin/programs",
    { onRequest: [fastify.authenticate], schema: createProgramSchema },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
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
  fastify.get(
    "/admin/programs",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_LIST_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const programs = await service.listPrograms();
        return { programs };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "listPrograms");
      }
    },
  );

  /**
   * GET /api/admin/programs/analytics — Program enrollment analytics.
   * NOTE: This route must be registered BEFORE /admin/programs/:programId
   * to avoid "analytics" being parsed as a programId parameter.
   */
  fastify.get(
    "/admin/programs/analytics",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        const analytics = await service.getAnalytics();
        return analytics;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getAnalytics");
      }
    },
  );

  /**
   * GET /api/admin/programs/enrollments/user/:userId — Get enrollments for a user.
   * COACH_ROLES per D-35.
   */
  fastify.get<{ Params: { userId: number } }>(
    "/admin/programs/enrollments/user/:userId",
    { onRequest: [fastify.authenticate], schema: userIdParamsSchema },
    async (request, reply) => {
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
    { onRequest: [fastify.authenticate], schema: programIdParamsSchema },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
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
    {
      onRequest: [fastify.authenticate],
      schema: { ...programIdParamsSchema, ...updateProgramSchema },
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
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
    {
      onRequest: [fastify.authenticate],
      schema: { ...programIdParamsSchema, ...addContentBlocksSchema },
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
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
    { onRequest: [fastify.authenticate], schema: programIdParamsSchema },
    async (request, reply) => {
      const { role } = request.user;
      if (!(PROGRAMAS_ROLES as readonly string[]).includes(role)) {
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
   * POST /api/admin/users/:userId/program-addons — Phase 112 D-10 admin add-on
   * assignment. Body: { programId, pricePaid?, paymentMethod?, notes? }.
   *
   * RBAC: FINANCE_WRITE_ROLES (owner|admin|gestion|recepcion) per D-22 —
   * mirrors the precedent that recepcion already creates kind='plan_charge'
   * transactions via assignPlan today.
   *
   * Behavior:
   *  - Resolves the user's active|paused subscription id and forwards it +
   *    the body to EnrollmentService.enrollAddon (D-11).
   *  - 200 OK with { enrollmentId } on success.
   *  - 400 ASSIGN_PLAN_FIRST when the user has no active|paused sub.
   *  - 404 when the program does not exist or is inactive.
   *  - 409 PROGRAM_ALREADY_ACTIVE for duplicate program (D-12, includes
   *    bundle edge case).
   *  - 403 for unauthorized roles.
   */
  fastify.post<{
    Params: { userId: number };
    Body: {
      programId: number;
      pricePaid?: number | null;
      paymentMethod?: PaymentMethod;
      notes?: string | null;
    };
  }>(
    "/admin/users/:userId/program-addons",
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: {
          type: "object",
          required: ["userId"],
          properties: { userId: { type: "integer", minimum: 1 } },
        },
        body: enrollAddonBodySchema,
      },
    },
    async (request, reply) => {
      const { role } = request.user;
      if (!(FINANCE_WRITE_ROLES as readonly string[]).includes(role)) {
        return reply
          .code(403)
          .send({ error: "Acceso denegado", message: "Acceso requerido" });
      }

      try {
        // Resolve the user's active|paused sub id BEFORE delegating to
        // EnrollmentService — duplicates the D-11 check on purpose so the
        // structured 4xx body is emitted consistently regardless of whether
        // the service or the route catches it first.
        const [activeSub] = await fastify.db
          .select({ id: schema.subscriptions.id })
          .from(schema.subscriptions)
          .where(
            and(
              eq(schema.subscriptions.userId, request.params.userId),
              or(
                eq(schema.subscriptions.status, "active"),
                eq(schema.subscriptions.status, "paused"),
              ),
            ),
          )
          .limit(1);
        if (!activeSub) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "El miembro no tiene suscripcion activa",
            code: "ASSIGN_PLAN_FIRST",
          });
        }

        const result = await enrollmentService.enrollAddon(
          request.params.userId,
          activeSub.id,
          {
            programId: request.body.programId,
            pricePaid: request.body.pricePaid ?? null,
            paymentMethod: request.body.paymentMethod,
            assignedBy: request.user.userId,
            notes: request.body.notes ?? null,
          },
        );

        return reply.code(200).send(result);
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        if (code === "ASSIGN_PLAN_FIRST") {
          return reply.code(400).send({
            error: "Bad Request",
            message: (err as Error).message,
            code,
          });
        }
        if (code === "PROGRAM_ALREADY_ACTIVE") {
          return reply.code(409).send({
            error: "Conflict",
            message: (err as Error).message,
            code,
          });
        }
        handleServiceError(err, reply, request.log, "enrollAddon");
      }
    },
  );

  /**
   * POST /api/admin/programs/enrollments/:enrollmentId/cancel — Cancel enrollment.
   * COACH_ROLES per D-35.
   *
   * Phase 112 D-24: when the enrollment was created via the admin add-on path
   * (source='admin_addon'), write an audit_log entry recording the manual
   * cancel. Teardown via parent-sub cancel/expire is NOT logged here — the
   * parent sub event already audits at the subscription layer.
   */
  fastify.post<{ Params: { enrollmentId: number } }>(
    "/admin/programs/enrollments/:enrollmentId/cancel",
    { onRequest: [fastify.authenticate], schema: enrollmentIdParamsSchema },
    async (request, reply) => {
      const { role } = request.user;
      if (!(COACH_ROLES as readonly string[]).includes(role)) {
        return reply.code(403).send({ error: "Acceso denegado" });
      }

      try {
        // Resolve enrollment metadata BEFORE cancel (cancelEnrollment opens
        // its own write, so we read first to know whether the audit branch
        // applies). Fetched outside the audit tx for read simplicity; the
        // audit row + cancel are wrapped in a single tx below for atomicity.
        const [enrollmentRow] = await fastify.db
          .select({
            id: schema.programEnrollments.id,
            userId: schema.programEnrollments.userId,
            programId: schema.programEnrollments.programId,
            source: schema.programEnrollments.source,
            pricePaid: schema.programEnrollments.pricePaid,
            subscriptionId: schema.programEnrollments.subscriptionId,
          })
          .from(schema.programEnrollments)
          .where(eq(schema.programEnrollments.id, request.params.enrollmentId))
          .limit(1);

        await fastify.db.transaction(async (tx) => {
          await service.cancelEnrollment(request.params.enrollmentId);
          if (enrollmentRow && enrollmentRow.source === "admin_addon") {
            await auditLog.write(tx, {
              actorId: request.user.userId,
              action: "plan_assigned",
              targetKind: "member",
              targetId: enrollmentRow.userId,
              payload: {
                enrollmentId: enrollmentRow.id,
                programId: enrollmentRow.programId,
                pricePaid: enrollmentRow.pricePaid,
                subscriptionId: enrollmentRow.subscriptionId,
                cancelledByAdmin: true,
              },
              reason: "Manual admin cancel of program add-on",
            });
          }
        });

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
    { onRequest: [fastify.authenticate], schema: enrollmentIdParamsSchema },
    async (request, reply) => {
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
  fastify.get(
    "/members/programs/catalog",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const programs = await service.getCatalog();
        return { programs };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getCatalog");
      }
    },
  );

  /**
   * GET /api/members/programs/my-progress — Active enrollment progress.
   * Returns 204 No Content if no active enrollment (follows onboarding/routes.ts pattern).
   */
  fastify.get(
    "/members/programs/my-progress",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const progress = await service.getMemberProgress(request.user.userId);

        if (!progress) {
          return reply.code(204).send();
        }

        return reply.code(200).send(progress);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getMemberProgress");
      }
    },
  );

  /**
   * GET /api/members/programs/has-goal-plan-access — Goal plan gate check.
   * Returns { hasAccess: boolean } — true if member has active program enrollment.
   * Per D-08: program enrollment IS the goal plan gate.
   */
  fastify.get(
    "/members/programs/has-goal-plan-access",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
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
  fastify.get(
    "/members/me/current-program",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const result = await service.getCurrentProgram(request.user.userId);
        return reply.code(200).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "getCurrentProgram");
      }
    },
  );

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
      onRequest: [fastify.authenticate],
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
  fastify.get(
    "/members/me/enrollments",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const result = await service.listMyActiveEnrollments(
          request.user.userId,
        );
        return reply.code(200).send(result);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "listMyActiveEnrollments");
      }
    },
  );
};
