/**
 * Semana Nueva Block Pipeline Orchestrator
 *
 * Phase 159 (SEM-03/SEM-04, D-P6): shared trunk for the combos/tecnica
 * generators (plan 03). Modified pipeline that replaces Stage 1 (rotator)
 * with a route INJECTED by the caller (generator resolves it deterministically
 * via `resolveRoutePool` before invoking this pipeline) and reuses stages 2-7
 * from the main pipeline unchanged.
 *
 * Molde canónico: `goal-plan-pipeline.ts` (D-P6) — same structure, but goal
 * plans resolve their own route from `GOAL_PLAN_ROUTE_MAP` internally, while
 * semana-nueva sessions receive the route pre-resolved in `options.route`
 * (COMBOS_I/COMBOS_II split by body zone via GOAL_PLAN_ROUTE_MAP re-used
 * externally by the generator; TECNICA_I/TECNICA_II share one route, D-08).
 *
 * `goal-plan-pipeline.ts` and the legacy rotator stage are NOT modified by
 * this file — the new roles (COMBOS_I/II, TECNICA_I/II, STRETCHING) never go
 * through the main block pipeline's Stage 1 (Pitfall 2: it throws on unknown
 * block roles). This file is the alternative entry point for those roles.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../../db/schema";
import { SpomService } from "../../spom/service";
import type { BlockContext, BlockContextWithRoute } from "./context";
import type { BlockPlan } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import type { BlockPipelineOptions } from "./index";
import { simpleHash } from "./utils/deterministic-hash";

// Import pipeline stages (reused from main pipeline, stages 2-7 unchanged)
import { resolveSpom } from "./stage-2-spom";
import { deriveBudget } from "./stage-3-budget";
import { deriveContraction } from "./stage-4-contraction";
import { selectFormat } from "./stage-5-format";
import { selectExercises } from "./stage-6-exercises";
import { generatePrescriptions } from "./stage-7-prescription";

// Import INITIUM special pipeline
import { runInitiumPipeline } from "./initium-pipeline";

/**
 * Options for the semana-nueva block pipeline.
 *
 * Extends the shared `BlockPipelineOptions` (forcedFormat/excludeFormatNames,
 * already used by Deuteros consistency) with `route` — the pre-resolved route
 * that replaces Stage 1 (rotator). The generator (plan 03) resolves it via
 * `resolveRoutePool` before calling this pipeline.
 */
export interface SemanaNuevaPipelineOptions extends BlockPipelineOptions {
  readonly route: string;
}

/**
 * Deterministically pick one route from a curated pool.
 *
 * Pure function of `(pool, hashInput)` — deterministic hash only, no RNG,
 * no memberLevel.
 * Consumers (plan 03 generators) build `hashInput` per D-08:
 *   - COMBOS: `${week}-${day}-${role}` (COMBOS_I/COMBOS_II must land on
 *     different pools, but including the role also avoids index collision
 *     within the same pool across levels).
 *   - TECNICA: `${week}-${day}` (role EXCLUDED so TECNICA_I and TECNICA_II
 *     resolve to the SAME route, D-08).
 */
export function resolveRoutePool(pool: readonly string[], hashInput: string): string {
  const routeIndex = simpleHash(hashInput) % pool.length;
  return pool[routeIndex];
}

/**
 * Run the semana-nueva block pipeline.
 *
 * Executes a modified 7-stage pipeline for combos/tecnica sessions:
 *   Stage 1: route INJECTED via options.route (replaces rotator)
 *   Stage 2-7: unchanged, reused from the main pipeline
 *
 * @param initialContext - Starting context with week, day, levelGroup, role
 * @param spomService - SPOM service for data lookups
 * @param db - Database connection for direct queries
 * @param options - route (required) + forcedFormat/excludeFormatNames
 * @returns Complete BlockPlan with all fields populated
 */
export async function runSemanaNuevaBlockPipeline(
  initialContext: BlockContext,
  spomService: SpomService,
  db: MySql2Database<typeof schema>,
  options: SemanaNuevaPipelineOptions,
): Promise<BlockPlan> {
  // INITIUM uses the shared special pipeline (no SPOM lookup per spec,
  // identical for regular/ROM/goal-plan/semana-nueva sessions).
  if (initialContext.role === "INITIUM") {
    return runInitiumPipeline(
      initialContext,
      db,
      options.excludeFormatNames,
    );
  }

  let ctx: BlockContext | BlockContextWithRoute = initialContext;

  try {
    // Stage 1 (replaced): inject the pre-resolved route instead of the rotator.
    const routeTrace = createTraceEvent(ctx, "SEMANA_NUEVA_ROUTE_INJECTED", "INFO", {
      route: options.route,
      source: "semana_nueva_pipeline",
    });
    const ctx1: BlockContextWithRoute = {
      ...appendTrace(ctx, routeTrace),
      route: options.route,
    };
    ctx = ctx1;

    // Stage 2: Resolve SPOM rule
    const ctx2 = await resolveSpom(ctx1, spomService);

    // Stage 3: Derive budget from intensity
    const ctx3 = await deriveBudget(ctx2, spomService);

    // Stage 4: Derive contraction mix
    const ctx4 = await deriveContraction(ctx3, spomService);

    // Stage 5: Select format (or use forced format, e.g. real 'Combos' row)
    let ctx5;
    if (options.forcedFormat) {
      const formatTrace = createTraceEvent(ctx4, "FORMAT_FORCED", "INFO", {
        reason: "Semana nueva blocks use a fixed format resolved by the generator",
        formatId: options.forcedFormat.formatId,
        formatName: options.forcedFormat.name,
      });
      ctx5 = {
        ...appendTrace(ctx4, formatTrace),
        format: options.forcedFormat,
      };
    } else {
      ctx5 = await selectFormat(ctx4, db, options.excludeFormatNames);
    }

    // Stage 6: Select exercises
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
      stage: "semana_nueva_pipeline",
      error: errorMessage,
      route: options.route,
    });
    ctx = appendTrace(ctx, errorTrace);
    throw error;
  }
}
