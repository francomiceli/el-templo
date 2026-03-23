/**
 * Member-facing Subscription Routes
 *
 * Read-only endpoints for members to view their own subscription
 * and browse available plans.
 * Requires authentication but NOT admin role.
 */

import { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { SubscriptionService } from "./service";
import { AuraService } from "../aura/service";
import { PERSONALIZADA_METADATA } from "../personalizadas/constants";

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

    // Get plan info
    const [plan] = await fastify.db
      .select({
        isPersonalizada: schema.subscriptionPlans.isPersonalizada,
        personalizadaType: schema.subscriptionPlans.personalizadaType,
        multiBranch: schema.subscriptionPlans.multiBranch,
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
      multiBranch: plan?.multiBranch ?? false,
    };
  });

  // GET /plans — List available plans for member catalog
  // Includes active non-trial plans + the member's current plan if it's legacy (archived/inactive)
  fastify.get("/plans", async (request) => {
    const allPlans = await subscriptionService.listPlans(true, false);

    // Exclude trial plans
    const plans = allPlans.filter((p) => !p.isTrial);
    const planIds = new Set(plans.map((p) => p.id));

    // If member has an active subscription on a plan not in the list, include it
    const sub = await subscriptionService.getMemberSubscription(
      request.user.userId,
    );
    if (sub && !planIds.has(sub.planId)) {
      const legacyPlan = await subscriptionService.getPlanById(sub.planId);
      if (legacyPlan) {
        plans.push(legacyPlan);
      }
    }

    // Map to member-safe response (no prices) and enrich personalizada zones
    const mapped = plans.map((p) => {
      const meta = p.isPersonalizada
        ? PERSONALIZADA_METADATA.find((m) => m.type === p.personalizadaType)
        : undefined;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        planTier: p.planTier,
        durationDays: p.durationDays,
        classesPerWeek: p.classesPerWeek,
        isPersonalizada: p.isPersonalizada,
        isOnline: p.isOnline,
        personalizadaType: p.personalizadaType,
        personalizadaZones: meta?.zones ?? null,
      };
    });

    // Sort: gym plans first (isPersonalizada=false), then personalizada plans
    // Within each group, sort by name alphabetically
    mapped.sort((a, b) => {
      if (a.isPersonalizada !== b.isPersonalizada) {
        return a.isPersonalizada ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    return { plans: mapped };
  });
};
