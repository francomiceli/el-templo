/**
 * Goal Plan Pipeline Orchestrator
 *
 * Modified pipeline for goal plan sessions that replaces Stage 1 (rotator)
 * with deterministic route selection from the goal plan route map, disables
 * cross-route exercise mixing (100% zone bias), and uses zone-specific
 * Initium warmup.
 *
 * Reuses stages 2-7 from the main pipeline — only Stage 1 is replaced
 * and Stages 2/6 have guard logic for goal-plan-specific behavior.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, asc } from "drizzle-orm";
import * as schema from "../../../db/schema";
import { SpomService } from "../../spom/service";
import type { BlockContext, BlockContextWithRoute } from "./context";
import type { BlockPlan, TraceEvent } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import type { BlockPipelineOptions } from "./index";

// Import pipeline stages (reused from main pipeline)
import { resolveSpom } from "./stage-2-spom";
import { deriveBudget } from "./stage-3-budget";
import { deriveContraction } from "./stage-4-contraction";
import { selectFormat } from "./stage-5-format";
import { selectExercises } from "./stage-6-exercises";
import { generatePrescriptions } from "./stage-7-prescription";

// Import INITIUM special pipeline
import { runInitiumPipeline } from "./initium-pipeline";

// Import goal plan constants
import { GOAL_PLAN_ROUTE_MAP } from "../../goal-plans/constants";
import type { GoalPlanType } from "../../goal-plans/types";

// Import mobility routes for zone-specific Initium
import { ROUTE_TO_MOBILITY_ROUTES } from "./utils/mobility-routes";

/**
 * Simple deterministic hash of a string.
 * Sums character codes for reproducible routing.
 */
function simpleHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i) * (i + 1)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Goal Plan Route Resolution (replaces Stage 1: Rotator)
 *
 * Selects route deterministically from the goal plan's allowed routes using
 * a hash of (week, day, blockRole). This ensures route variety across days
 * and blocks while remaining reproducible.
 */
function resolveGoalPlanRoute(
  ctx: BlockContext,
  goalPlanType: GoalPlanType,
): BlockContextWithRoute {
  const allowedRoutes = GOAL_PLAN_ROUTE_MAP[goalPlanType];

  // Deterministic route selection: hash of (week, day, blockRole) modulo allowedRoutes.length
  const hashInput = `${ctx.week}-${ctx.day}-${ctx.role}`;
  const routeIndex = simpleHash(hashInput) % allowedRoutes.length;
  const selectedRoute = allowedRoutes[routeIndex];

  const traceEvent = createTraceEvent(
    ctx,
    "GOAL_PLAN_ROUTE_SELECTED",
    "INFO",
    {
      goalPlanType,
      allowedRoutes,
      hashInput,
      routeIndex,
      selectedRoute,
      source: "goal_plan_route_map",
    },
  );

  return {
    ...appendTrace(ctx, traceEvent),
    route: selectedRoute,
  };
}

/**
 * Get the mobility routes for Initium zone-specific warmup.
 * Returns all unique mobility routes that map to the goal plan's route pool.
 */
function getGoalPlanMobilityRoutes(goalPlanType: GoalPlanType): string[] {
  const goalPlanRoutes = GOAL_PLAN_ROUTE_MAP[goalPlanType];
  const mobilityRoutes = new Set<string>();

  for (const route of goalPlanRoutes) {
    const related = ROUTE_TO_MOBILITY_ROUTES[route];
    if (related) {
      for (const r of related) {
        mobilityRoutes.add(r);
      }
    }
  }

  return Array.from(mobilityRoutes);
}

/**
 * Attempt SPOM resolution with fallback for missing rules.
 *
 * For goal plan sessions, a route may not have a SPOM rule for the current week
 * (the rotator only uses certain routes per week). Fallback strategy:
 *   1. Try the requested week + route (normal).
 *   2. Try nearest available week for the same route.
 *   3. If no SPOM rule exists at all, use default intensity (50%) and pattern.
 */
async function resolveSpomWithFallback(
  ctx: BlockContextWithRoute,
  spomService: SpomService,
  db: MySql2Database<typeof schema>,
): Promise<{
  ctx: BlockContextWithRoute;
  intensity: number;
  pattern: string;
  pattern2: string | null;
  category: string;
  usedFallback: boolean;
}> {
  // First, try normal SPOM resolution
  const rule = await spomService.getSpomRule({
    week: ctx.week,
    route: ctx.route,
  });

  if (rule) {
    return {
      ctx,
      intensity: rule.intensity,
      pattern: rule.pattern,
      pattern2: rule.pattern2 ?? null,
      category: rule.category,
      usedFallback: false,
    };
  }

  // Fallback: find the nearest week with a SPOM rule for this route
  const [routeRow] = await db
    .select({ id: schema.routes.id })
    .from(schema.routes)
    .where(eq(schema.routes.code, ctx.route));

  if (routeRow) {
    // Get all available weeks for this route, ordered by week
    const availableRules = await db
      .select({
        week: schema.spomRules.week,
        intensity: schema.spomRules.intensity,
        pattern: schema.spomRules.pattern,
        pattern2: schema.spomRules.pattern2,
        category: schema.spomRules.category,
      })
      .from(schema.spomRules)
      .where(eq(schema.spomRules.routeId, routeRow.id))
      .orderBy(asc(schema.spomRules.week));

    if (availableRules.length > 0) {
      // Find the nearest week
      let nearest = availableRules[0];
      let nearestDist = Math.abs(nearest.week - ctx.week);

      for (const r of availableRules) {
        const dist = Math.abs(r.week - ctx.week);
        if (dist < nearestDist) {
          nearest = r;
          nearestDist = dist;
        }
      }

      const fallbackTrace = createTraceEvent(
        ctx,
        "GOAL_PLAN_SPOM_FALLBACK",
        "WARNING",
        {
          requestedWeek: ctx.week,
          fallbackWeek: nearest.week,
          route: ctx.route,
          reason: `No SPOM rule for week ${ctx.week}, using nearest week ${nearest.week}`,
        },
      );

      return {
        ctx: appendTrace(ctx, fallbackTrace),
        intensity: nearest.intensity,
        pattern: nearest.pattern,
        pattern2: nearest.pattern2 ?? null,
        category: nearest.category,
        usedFallback: true,
      };
    }
  }

  // Ultimate fallback: no SPOM rule exists for this route at any week
  const defaultTrace = createTraceEvent(
    ctx,
    "GOAL_PLAN_SPOM_FALLBACK",
    "WARNING",
    {
      route: ctx.route,
      reason:
        "No SPOM rule exists for this route at any week. Using default intensity 50%.",
    },
  );

  return {
    ctx: appendTrace(ctx, defaultTrace),
    intensity: 50,
    pattern: ctx.route, // Use the route code itself as pattern
    pattern2: null,
    category: "Fuerza",
    usedFallback: true,
  };
}

/**
 * Run the goal plan block pipeline.
 *
 * Executes a modified 7-stage pipeline for goal plan sessions:
 *   Stage 1: Goal plan route resolution (replaces rotator)
 *   Stage 2: SPOM resolution with fallback
 *   Stage 3-5: Budget, contraction, format (unchanged)
 *   Stage 6: Exercise selection with cross-route disabled
 *   Stage 7: Prescriptions (unchanged)
 *
 * @param initialContext - Starting context with week, day, levelGroup, role
 * @param spomService - SPOM service for data lookups
 * @param db - Database connection for direct queries
 * @param goalPlanType - The goal plan type for route resolution
 * @param options - Optional pipeline options (e.g., forced format)
 * @returns Complete BlockPlan with all fields populated
 */
export async function runGoalPlanBlockPipeline(
  initialContext: BlockContext,
  spomService: SpomService,
  db: MySql2Database<typeof schema>,
  goalPlanType: GoalPlanType,
  options?: BlockPipelineOptions,
): Promise<BlockPlan> {
  // INITIUM uses special pipeline with goal plan zone-specific mobility
  if (initialContext.role === "INITIUM") {
    const goalPlanMobilityRoutes = getGoalPlanMobilityRoutes(goalPlanType);
    return runInitiumPipeline(
      initialContext,
      db,
      options?.excludeFormatNames,
      goalPlanMobilityRoutes,
    );
  }

  let ctx: BlockContext | BlockContextWithRoute = initialContext;

  try {
    // Stage 1: Goal plan route resolution (replaces rotator)
    const ctx1 = resolveGoalPlanRoute(ctx, goalPlanType);

    // Stage 2: SPOM resolution with fallback for missing rules
    const spomResult = await resolveSpomWithFallback(ctx1, spomService, db);

    let ctx2;
    if (!spomResult.usedFallback) {
      // Normal path: use resolveSpom for proper context building
      ctx2 = await resolveSpom(ctx1, spomService);
    } else {
      // Fallback path: manually build the SPOM context
      // Set pattern2 to null to disable cross-route (100% zone bias)
      const spomTrace = createTraceEvent(
        spomResult.ctx,
        "SPOM_RESOLVED",
        "INFO",
        {
          intensity: spomResult.intensity,
          pattern: spomResult.pattern,
          pattern2: null, // Explicitly disable cross-route for goal plan sessions
          category: spomResult.category,
          source: "goal_plan_fallback",
        },
      );
      ctx2 = {
        ...appendTrace(spomResult.ctx, spomTrace),
        route: ctx1.route,
        intensity: spomResult.intensity,
        pattern: spomResult.pattern,
        pattern2: null, // 100% zone bias: no cross-route
        category: spomResult.category,
      };
    }

    // For goal plan sessions where SPOM resolves normally, override pattern2
    // to null to enforce 100% zone bias (no cross-route mixing)
    if (ctx2.pattern2 !== null) {
      const biasTrace = createTraceEvent(
        ctx2,
        "GOAL_PLAN_CROSS_ROUTE_DISABLED",
        "INFO",
        {
          originalPattern2: ctx2.pattern2,
          reason:
            "Goal plan sessions use 100% zone bias — cross-route disabled",
        },
      );
      ctx2 = {
        ...appendTrace(ctx2, biasTrace),
        pattern2: null,
      };
    }

    // Stage 3: Derive budget from intensity
    const ctx3 = await deriveBudget(ctx2, spomService);

    // Stage 4: Derive contraction mix
    const ctx4 = await deriveContraction(ctx3, spomService);

    // Stage 5: Select format (or use forced format for Deuteros consistency)
    let ctx5;
    if (options?.forcedFormat) {
      const formatTrace = createTraceEvent(ctx4, "FORMAT_FORCED", "INFO", {
        reason: "Deuteros blocks must share same format",
        formatId: options.forcedFormat.formatId,
        formatName: options.forcedFormat.name,
      });
      ctx5 = {
        ...appendTrace(ctx4, formatTrace),
        format: options.forcedFormat,
      };
    } else {
      ctx5 = await selectFormat(ctx4, db, options?.excludeFormatNames);
    }

    // Stage 6: Select exercises (cross-route already disabled via pattern2=null)
    const ctx6 = await selectExercises(ctx5, db);

    // Stage 7: Generate prescriptions
    const finalCtx = generatePrescriptions(ctx6);

    // Assemble final BlockPlan
    const blockPlan: BlockPlan = {
      blockId: finalCtx.blockId,
      role: finalCtx.role,
      route: finalCtx.route,
      pattern: finalCtx.pattern,
      intensity: finalCtx.intensity,
      repsBudget: finalCtx.repsBudget,
      format: finalCtx.format,
      formatParams: finalCtx.formatParams,
      exercises: finalCtx.prescriptions,
      trace: finalCtx.trace,
    };

    return blockPlan;
  } catch (error) {
    // Add ERROR trace and re-throw
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorTrace = createTraceEvent(ctx, "PIPELINE_ERROR", "ERROR", {
      stage: "goal_plan_pipeline",
      error: errorMessage,
      goalPlanType,
    });
    ctx = appendTrace(ctx, errorTrace);
    throw error;
  }
}
