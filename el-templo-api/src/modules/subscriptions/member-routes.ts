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
import { EnrollmentService } from "../programs/enrollment-service";
import { GOAL_PLAN_METADATA } from "../goal-plans/constants";
import { isOnlinePlan, isGoalPlan, type PlanCategory } from "./types";
import { attachCountryScope } from "../shared/country-scope";
import { todayInTz } from "../shared/date-utils";

const AR_TIMEZONE = "America/Argentina/Buenos_Aires";

/**
 * Whole calendar days from today (AR wall-clock date) to a "YYYY-MM-DD" target.
 * Both endpoints are anchored at UTC midnight so DST transitions never shift the
 * integer day count. Returns a negative number when the target is in the past.
 */
function wholeDaysUntil(target: string): number {
  const today = todayInTz(AR_TIMEZONE);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diffMs =
    Date.parse(`${target}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(diffMs / MS_PER_DAY);
}

export const memberSubscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const auraService = new AuraService(fastify.db);
  const enrollmentService = new EnrollmentService(fastify.db, fastify.log);
  const subscriptionService = new SubscriptionService(
    fastify.db,
    fastify.log,
    auraService,
    undefined,
    enrollmentService,
  );

  /**
   * Guard: require authentication on all routes in this plugin.
   * No role restriction — any authenticated user can access.
   */
  fastify.addHook("onRequest", async (request, reply) => {
    await fastify.authenticate(request, reply);
    await attachCountryScope(request, fastify.db);
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

    // Get plan info + linked program's goalPlanType
    const [plan] = await fastify.db
      .select({
        planCategory: schema.subscriptionPlans.planCategory,
        linkedProgramId: schema.subscriptionPlans.linkedProgramId,
        multiBranch: schema.subscriptionPlans.multiBranch,
      })
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.id, sub.planId))
      .limit(1);

    // Resolve goalPlanType from linked program if present
    let goalPlanType: string | null = null;
    if (plan?.linkedProgramId) {
      const [program] = await fastify.db
        .select({ goalPlanType: schema.programs.goalPlanType })
        .from(schema.programs)
        .where(eq(schema.programs.id, plan.linkedProgramId))
        .limit(1);
      goalPlanType = program?.goalPlanType ?? null;
    }

    return {
      id: sub.id,
      planName: sub.planName,
      planTier: sub.planTier,
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysRemaining,
      pricePaid: sub.pricePaid,
      planCategory: plan?.planCategory ?? "presencial",
      goalPlanType,
      multiBranch: plan?.multiBranch ?? false,
      currency: sub.currency,
    };
  });

  // GET /coverage — Phase 144-03 (D-06/D-10): the authenticated member's
  // "covered-until" date (the furthest end_date across their active+scheduled
  // subscription chain) plus the whole days remaining, for the in-app expiry
  // reminder dialog.
  //
  // IDOR mitigation (T-144-08): the member id is server-derived from
  // request.user — this route NEVER accepts a userId param, so a member can
  // only ever read their own coverage.
  //
  // NOTE (D-08): unlike autoExpireSubscriptions, this read does NOT sweep
  // lapsed subscriptions, so a lapsed-but-unswept member can return a past
  // coveredUntil → negative daysRemaining. The dialog gates that out with a
  // >= 0 lower bound; already-expired members are handled by the day-of push
  // and the booking block, not this endpoint.
  fastify.get("/coverage", async (request) => {
    const coveredUntil = await subscriptionService.getCoveredUntil(
      request.user.userId,
    );

    const daysRemaining =
      coveredUntil === null ? null : wholeDaysUntil(coveredUntil);

    return { coveredUntil, daysRemaining };
  });

  // GET /plans — List available plans for member catalog
  // Includes active non-trial plans + the member's current plan if it's legacy (archived/inactive).
  //
  // Country scoping (Phase 98 D-04): the catalog is filtered to the
  // authenticated member's branch country — derived server-side via
  // request.scope.country (populated by attachCountryScope). No query
  // parameter is accepted from members.
  fastify.get("/plans", async (request) => {
    const allPlans = await subscriptionService.listPlans({
      isActive: true,
      includeArchived: false,
      country: request.scope.country ?? undefined,
    });

    // Exclude trial plans
    const plans = allPlans.filter((p) => !p.isTrial);
    const planIds = new Set(plans.map((p) => p.id));

    // If member has an active subscription on a plan not in the list, include it.
    // Legacy cross-country plans (e.g. a grandfathered member) are intentionally
    // surfaced so the member can keep seeing their own plan — this is narrower
    // than exposing the full other-country catalog.
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
      const meta = isGoalPlan(p.planCategory)
        ? GOAL_PLAN_METADATA.find((m) => m.type === p.goalPlanType)
        : undefined;

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        planTier: p.planTier,
        durationDays: p.durationDays,
        classesPerWeek: p.classesPerWeek,
        planCategory: p.planCategory,
        linkedProgramId: p.linkedProgramId ?? null,
        goalPlanType: p.goalPlanType,
        goalPlanZones: meta?.zones ?? null,
        currency: p.currency,
        country: p.country,
      };
    });

    // Sort: presencial plans first, then online plans
    // Within each group, sort by name alphabetically
    mapped.sort((a, b) => {
      const aOnline = isOnlinePlan(a.planCategory as PlanCategory);
      const bOnline = isOnlinePlan(b.planCategory as PlanCategory);
      if (aOnline !== bOnline) {
        return aOnline ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    return { plans: mapped };
  });
};
