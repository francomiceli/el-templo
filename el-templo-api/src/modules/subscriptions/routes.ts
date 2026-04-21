/**
 * Subscriptions API Routes
 *
 * Admin endpoints for subscription plans CRUD and subscription lifecycle
 * management (assign, pause, resume, cancel, pricing preview).
 *
 * All routes require authentication and coach/admin/owner role.
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
  RenewSubscriptionInput,
  BulkMigrateInput,
  CreatePlanInput,
  UpdatePlanInput,
  PriceType,
  CreatePromoInput,
  UpdatePromoInput,
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
  changePlanPreviewSchema,
  renewSubscriptionSchema,
  pauseSubscriptionSchema,
  resumeSubscriptionSchema,
  cancelSubscriptionSchema,
  classUsageSchema,
  pricingPreviewSchema,
  changeFixedSchedulesSchema,
  listScheduleChangesSchema,
  listPromosSchema,
  createPromoSchema,
  updatePromoSchema,
  deactivatePromoSchema,
} from "./schemas";

import { SUBSCRIPTION_ROLES } from "../shared/permissions";
import { attachCountryScope } from "../shared/country-scope";

export const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  const paymentService = new PaymentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    paymentService,
  );
  const bookingService = new BookingService(
    fastify.db,
    fastify.log,
    subscriptionService,
  );
  subscriptionService.setBookingService(bookingService);

  /**
   * Guard: require admin role on all routes in this plugin.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    if (
      !(SUBSCRIPTION_ROLES as readonly string[]).includes(request.user.role)
    ) {
      return reply.code(403).send({
        error: "Acceso denegado",
        message: "Acceso de administrador requerido",
      });
    }
    await attachCountryScope(request, fastify.db);
  });

  // =========================================================================
  // Plans CRUD (prefix /plans)
  // =========================================================================

  // GET /plans — List subscription plans
  //
  // Country scoping (Phase 98):
  //   - Non-owners: request.scope.country comes from their branch; any query
  //     `country` / `branchId` is effectively ignored because the preHandler
  //     never lets a non-owner's `?country=` through.
  //   - Owners: preHandler already reflected `?country=` into
  //     request.scope.country; `?branchId=` is resolved server-side in the
  //     service layer and, when present, wins over the scope country.
  fastify.get<{
    Querystring: {
      isActive?: boolean;
      includeArchived?: boolean;
      branchId?: number;
      country?: "AR" | "ES";
    };
  }>("/plans", { schema: listPlansSchema }, async (request) => {
    const plans = await subscriptionService.listPlans({
      isActive: request.query.isActive,
      includeArchived: request.query.includeArchived,
      country: request.scope.country,
      branchId: request.query.branchId,
    });
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
          .send({ error: "No encontrado", message: "Plan no encontrado" });
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
          .send({ error: "No encontrado", message: "Plan no encontrado" });
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
          .send({ error: "No encontrado", message: "Plan no encontrado" });
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
          error: "No encontrado",
          message: "No se encontro suscripcion activa",
        });
      }
      return sub;
    },
  );

  // GET /members/:userId/subscriptions — Get ALL active/paused subscriptions (plural)
  fastify.get<{ Params: { userId: number } }>(
    "/members/:userId/subscriptions",
    { schema: getMemberSubscriptionHistorySchema },
    async (request) => {
      const subscriptions = await subscriptionService.getMemberSubscriptions(
        request.params.userId,
      );
      return { subscriptions };
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
            .send({ error: "Solicitud invalida", message: err.message });
        }
        handleServiceError(err, reply, request.log, "assign subscription");
      }
    },
  );

  // GET /members/:userId/subscription/change-plan-preview — Preview plan change with proration
  fastify.get<{
    Params: { userId: number };
    Querystring: { targetPlanId: number };
  }>(
    "/members/:userId/subscription/change-plan-preview",
    { schema: changePlanPreviewSchema },
    async (request, reply) => {
      try {
        const preview = await subscriptionService.getChangePlanPreview(
          request.params.userId,
          request.query.targetPlanId,
        );
        return preview;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "change plan preview");
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
            .send({ error: "Solicitud invalida", message: err.message });
        }
        handleServiceError(err, reply, request.log, "change plan");
      }
    },
  );

  // PATCH /subscriptions/:subscriptionId/schedules — Change fixed turnos
  fastify.patch<{
    Params: { subscriptionId: number };
    Body: { scheduleIds: number[]; reason?: string };
  }>(
    "/subscriptions/:subscriptionId/schedules",
    { schema: changeFixedSchedulesSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.changeFixedSchedules(
          request.params.subscriptionId,
          request.user.userId,
          request.body,
        );
        return sub;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "change fixed schedules");
      }
    },
  );

  // GET /subscriptions/:subscriptionId/schedule-changes — List audit entries
  fastify.get<{ Params: { subscriptionId: number } }>(
    "/subscriptions/:subscriptionId/schedule-changes",
    { schema: listScheduleChangesSchema },
    async (request, reply) => {
      try {
        const changes = await subscriptionService.listScheduleChanges(
          request.params.subscriptionId,
        );
        return { changes };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "list schedule changes");
      }
    },
  );

  // POST /members/:userId/subscription/pause — Pause subscription
  fastify.post<{
    Params: { userId: number };
    Body: { pauseEndDate?: string };
  }>(
    "/members/:userId/subscription/pause",
    { schema: pauseSubscriptionSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.pauseSubscription(
          request.params.userId,
          request.body?.pauseEndDate,
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

  // POST /members/:userId/subscription/renew — Renew subscription
  fastify.post<{
    Params: { userId: number };
    Body: RenewSubscriptionInput;
  }>(
    "/members/:userId/subscription/renew",
    { schema: renewSubscriptionSchema },
    async (request, reply) => {
      try {
        const sub = await subscriptionService.renewSubscription(
          request.params.userId,
          request.body,
          request.user.userId,
        );
        return reply.code(201).send(sub);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "renew subscription");
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
        const bonusUsage = await bookingService.getBonusUsage(
          request.params.userId,
        );
        return { ...usage, bonusUsage };
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

  // =========================================================================
  // Promo Plans CRUD
  // =========================================================================

  // GET /promo-plans — List all promo plans (scoped to request.scope.country)
  fastify.get("/promo-plans", { schema: listPromosSchema }, async (request) => {
    return subscriptionService.listPromoPlans({
      country: request.scope.country,
    });
  });

  // POST /promo-plans — Create a promo plan
  fastify.post<{ Body: CreatePromoInput }>(
    "/promo-plans",
    { schema: createPromoSchema },
    async (request, reply) => {
      try {
        const promo = await subscriptionService.createPromo(request.body);
        return reply.code(201).send(promo);
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "create promo");
      }
    },
  );

  // PATCH /promo-plans/:promoId — Update a promo plan
  fastify.patch<{ Params: { promoId: number }; Body: UpdatePromoInput }>(
    "/promo-plans/:promoId",
    { schema: updatePromoSchema },
    async (request, reply) => {
      try {
        const promo = await subscriptionService.updatePromo(
          request.params.promoId,
          request.body,
        );
        return promo;
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "update promo");
      }
    },
  );

  // PATCH /promo-plans/:promoId/deactivate — Deactivate a promo plan
  fastify.patch<{ Params: { promoId: number } }>(
    "/promo-plans/:promoId/deactivate",
    { schema: deactivatePromoSchema },
    async (request, reply) => {
      try {
        await subscriptionService.deactivatePromo(request.params.promoId);
        return { message: "Promo desactivada" };
      } catch (err: unknown) {
        handleServiceError(err, reply, request.log, "deactivate promo");
      }
    },
  );
};
