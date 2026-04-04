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
import { GOAL_PLAN_METADATA } from "../goal-plans/constants";
import type { PlanCategory } from "./types";

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
        planCategory: schema.subscriptionPlans.planCategory,
        linkedProgramId: schema.subscriptionPlans.linkedProgramId,
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
      planCategory: (plan?.planCategory as PlanCategory) ?? "presencial",
      linkedProgramId: plan?.linkedProgramId ?? null,
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

    // Map to member-safe response (no prices) and enrich goal plan zones
    const mapped = plans.map((p) => {
      const meta =
        p.planCategory === "online_goal"
          ? GOAL_PLAN_METADATA.find((m) =>
              // Match by linked program's goalPlanType if available
              // For now, zones come from the metadata array
              p.linkedProgramId ? true : false,
            )
          : undefined;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        planTier: p.planTier,
        durationDays: p.durationDays,
        classesPerWeek: p.classesPerWeek,
        planCategory: p.planCategory,
        linkedProgramId: p.linkedProgramId,
        goalPlanZones: meta?.zones ?? null,
      };
    });

    // Sort: presencial plans first, then online plans
    // Within each group, sort by name alphabetically
    mapped.sort((a, b) => {
      const aIsOnline = a.planCategory !== "presencial";
      const bIsOnline = b.planCategory !== "presencial";
      if (aIsOnline !== bIsOnline) {
        return aIsOnline ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    return { plans: mapped };
  });
};
