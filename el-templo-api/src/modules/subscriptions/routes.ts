/**
 * Subscriptions API Routes
 *
 * Admin endpoints for subscription plans CRUD and subscription lifecycle
 * management (assign, pause, resume, cancel, pricing preview).
 *
 * All routes require authentication and coach/admin/superadmin role.
 */

import { FastifyPluginAsync } from "fastify";
import { SubscriptionService } from "./service";
import { AuraService } from "../aura/service";
import { BookingService } from "../scheduling/booking-service";
import { PaymentService } from "../payments/service";
import { handleServiceError } from "../shared/error-handler";
import { InsufficientBalanceError } from "../aura";
import type {
  AssignPlanInput,
  BulkMigrateInput,
  CreatePlanInput,
  UpdatePlanInput,
  PriceType,
} from "./types";
import {
  listPlansSchema,
  getPlanSchema,
  createPlanSchema,
  updatePlanSchema,
  deactivatePlanSchema,
  bulkMigratePlanSchema,
  getMemberSubscriptionSchema,
  getMemberSubscriptionHistorySchema,
  assignPlanSchema,
  changePlanSchema,
  pauseSubscriptionSchema,
  resumeSubscriptionSchema,
  cancelSubscriptionSchema,
  classUsageSchema,
  pricingPreviewSchema,
} from "./schemas";

const ADMIN_ROLES = ["coach", "admin", "superadmin"];

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    paymentService,
    subscriptionService,
  );
  subscriptionService.setBookingService(bookingService);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (!ADMIN_ROLES.includes(request.user.role)) {
      return reply.code(403).send({
        error: "Forbidden",
        message: "Acceso de administrador requerido",
      });
    }
  });

  // =========================================================================
  // Plans CRUD (prefix /plans)
  // =========================================================================

  // GET /plans — List subscription plans
  fastify.get<{
    Querystring: { isActive?: boolean; includeArchived?: boolean };
  }>("/plans", { schema: listPlansSchema }, async (request) => {
    const plans = await subscriptionService.listPlans(
      request.query.isActive,
      request.query.includeArchived,
    );
    return { plans };
  });

  // GET /plans/:planId — Get plan detail
  fastify.get<{ Params: { planId: number } }>(
    "/plans/:planId",
    { schema: getPlanSchema },
    async (request, reply) => {
      const plan = await subscriptionService.getPlanById(request.params.planId);
      if (!plan) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Plan no encontrado" });
      }
      return plan;
    },
  );

  // POST /plans — Create plan
  fastify.post<{ Body: CreatePlanInput }>(
    "/plans",
    { schema: createPlanSchema },
    async (request, reply) => {
      const plan = await subscriptionService.createPlan(request.body);
      return reply.code(201).send(plan);
    },
  );

  // PUT /plans/:planId — Update plan
  fastify.put<{ Params: { planId: number }; Body: UpdatePlanInput }>(
    "/plans/:planId",
    { schema: updatePlanSchema },
    async (request, reply) => {
      const plan = await subscriptionService.updatePlan(
        request.params.planId,
        request.body,
      );
      if (!plan) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Plan no encontrado" });
      }
      return plan;
    },
  );

  // PATCH /plans/:planId/deactivate — Deactivate plan
  fastify.patch<{ Params: { planId: number } }>(
    "/plans/:planId/deactivate",
    { schema: deactivatePlanSchema },
    async (request, reply) => {
      const plan = await subscriptionService.deactivatePlan(
        request.params.planId,
      );
      if (!plan) {
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Plan no encontrado" });
      }
      return plan;
    },
  );

  // POST /bulk-migrate — Bulk migrate members to a new plan
  fastify.post<{ Body: BulkMigrateInput }>(
    "/bulk-migrate",
    { schema: bulkMigratePlanSchema },
    async (request, reply) => {
      try {
        const result = await subscriptionService.bulkMigratePlan(
          request.body,
          request.user.userId,
        );
        return result;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "bulk migrate plans");
      }
    },
  );

  // =========================================================================
  // Subscription Lifecycle
  // =========================================================================

  // GET /members/:userId/subscription — Get current subscription
  fastify.get<{ Params: { userId: number } }>(
    "/members/:userId/subscription",
    { schema: getMemberSubscriptionSchema },
    async (request, reply) => {
      const sub = await subscriptionService.getMemberSubscription(
        request.params.userId,
      );
      if (!sub) {
        return reply.code(404).send({
          error: "Not Found",
          message: "No se encontro suscripcion activa",
        });
      }
      return sub;
    },
  );

  // GET /members/:userId/subscription/history — Get subscription history
  fastify.get<{ Params: { userId: number } }>(
    "/members/:userId/subscription/history",
    { schema: getMemberSubscriptionHistorySchema },
    async (request) => {
      const subscriptions =
        await subscriptionService.getMemberSubscriptionHistory(
          request.params.userId,
        );
      return { subscriptions };
    },
  );

  // POST /members/:userId/subscription/assign — Assign plan to member
  fastify.post<{ Params: { userId: number }; Body: AssignPlanInput }>(
    "/members/:userId/subscription/assign",
    { schema: assignPlanSchema },
    async (request, reply) => {
      try {
        const subscription = await subscriptionService.assignPlan(
          request.params.userId,
          request.body,
          request.user.userId,
        );
        return reply.code(201).send(subscription);
      } catch (err: unknown) {
        if (err instanceof InsufficientBalanceError) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: err.message });
        }
        handleServiceError(err, reply, request.log, "assign subscription");
      }
    },
  );

  // POST /members/:userId/subscription/change-plan — Change to a different plan
  fastify.post<{ Params: { userId: number }; Body: AssignPlanInput }>(
    "/members/:userId/subscription/change-plan",
    { schema: changePlanSchema },
    async (request, reply) => {
      try {
        const subscription = await subscriptionService.changePlan(
          request.params.userId,
          request.body,
          request.user.userId,
        );
        return reply.code(201).send(subscription);
      } catch (err: unknown) {
        if (err instanceof InsufficientBalanceError) {
          return reply
            .code(400)
            .send({ error: "Bad Request", message: err.message });
        }
        handleServiceError(err, reply, request.log, "change plan");
      }
    },
  );

  // POST /members/:userId/subscription/pause — Pause subscription
  fastify.post<{ Params: { userId: number } }>(
    "/members/:userId/subscription/pause",
    { schema: pauseSubscriptionSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.pauseSubscription(
          request.params.userId,
        );
        return sub;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "pause subscription");
      }
    },
  );

  // POST /members/:userId/subscription/resume — Resume subscription
  fastify.post<{ Params: { userId: number } }>(
    "/members/:userId/subscription/resume",
    { schema: resumeSubscriptionSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.resumeSubscription(
          request.params.userId,
        );
        return sub;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "resume subscription");
      }
    },
  );

  // POST /members/:userId/subscription/cancel — Cancel subscription
  fastify.post<{ Params: { userId: number }; Body: { notes?: string } }>(
    "/members/:userId/subscription/cancel",
    { schema: cancelSubscriptionSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.cancelSubscription(
          request.params.userId,
          request.body.notes,
        );
        return sub;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "cancel subscription");
      }
    },
  );

  // GET /members/:userId/class-usage — Get class usage info for a member
  fastify.get<{ Params: { userId: number } }>(
    "/members/:userId/class-usage",
    { schema: classUsageSchema },
    async (request, reply) => {
      try {
        const usage = await subscriptionService.getClassUsageThisWeek(
          request.params.userId,
        );
        return usage;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "class usage");
      }
    },
  );

  // GET /members/:userId/subscription/pricing-preview — Pricing preview
  fastify.get<{
    Params: { userId: number };
    Querystring: { planId: number; priceType: PriceType; auraSpend?: number };
  }>(
    "/members/:userId/subscription/pricing-preview",
    { schema: pricingPreviewSchema },
    async (request, reply) => {
      try {
        const preview = await subscriptionService.getPricingPreview(
          request.params.userId,
          request.query.planId,
          request.query.priceType,
          request.query.auraSpend,
        );
        return preview;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "pricing preview");
      }
    },
  );
};
