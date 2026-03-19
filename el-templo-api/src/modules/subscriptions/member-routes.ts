/**
 * Member-facing Subscription Routes
 *
 * Read-only endpoint for members to view their own subscription.
 * Requires authentication but NOT admin role.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SubscriptionService } from "./service";
import { AuraService } from "../aura/service";

export const memberSubscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
  );

  /**
   * Guard: require authentication on all routes in this plugin.
   * No role restriction — any authenticated user can access.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
  });

  // GET /me/subscription — Get the authenticated member's current subscription
  fastify.get("/me/subscription", async (request, reply) => {
    const sub = await subscriptionService.getMemberSubscription(
      request.user.userId,
    );

    if (!sub) {
      return reply.code(204).send();
    }

    // Calculate days remaining
    let daysRemaining = 0;
    if (sub.endDate) {
      const end = new Date(sub.endDate);
      const now = new Date();
      const diffMs = end.getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    // Get plan personalizada info
    const [plan] = await fastify.db
      .select({
        isPersonalizada: schema.subscriptionPlans.isPersonalizada,
        personalizadaType: schema.subscriptionPlans.personalizadaType,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, sub.planId))
      .limit(1);

    return {
      id: sub.id,
      planName: sub.planName,
      planTier: sub.planTier,
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysRemaining,
      pricePaid: sub.pricePaid,
      isPersonalizada: plan?.isPersonalizada ?? false,
      personalizadaType: plan?.personalizadaType ?? null,
    };
  });
};
