/**
 * Stage 5: Format Selection
 *
 * Selects a training format for the block based on compatibility matrix.
 * Uses fallback ladder when exact matches not found.
 * Picks randomly among formats with the best (lowest) compatibility score for variety.
 *
 * Input: BlockContextWithContraction (has intensity, role, levelGroup)
 * Output: BlockContextWithFormat (adds format: { formatId, name })
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../../db/schema";
import type {
  BlockContextWithContraction,
  BlockContextWithFormat,
} from "./context";
import type { BlockRole } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import { selectFormatWithFallback } from "../fallback/format-fallback";
import type { FallbackAction } from "../fallback/types";
import { levelGroupToLevel } from "./utils/level-mapping";

/** Map BlockRole to format_compatibility block enum */
function roleToBlock(
  role: BlockRole,
): "initium" | "nucleus" | "deuteros" | "athlos" | "epikos" {
  switch (role) {
    case "INITIUM":
      return "initium";
    case "NUCLEUS":
      return "nucleus";
    case "DEUTEROS_1":
    case "DEUTEROS_2":
      return "deuteros";
    case "ATHLOS":
      return "athlos";
    case "EPIKOS":
      return "epikos";
    // ROM roles bypass the pipeline entirely — this should never be called for ROM blocks
    case "ROM_LOWER":
    case "ROM_CORE":
    case "ROM_UPPER":
      return "initium"; // Fallback; ROM blocks never reach stage-5
  }
}

/**
 * Convert fallback action to trace event description
 */
function actionToTraceDescription(action: FallbackAction): string {
  switch (action.type) {
    case "DIFFICULTY_RELAXED":
      return `Relaxed intensity from ${action.from} (+/- 5 range)`;
    case "EFFORT_RELAXED":
      return `Included exercises with empty effort for ${action.contraction}`;
    case "SCOPE_WIDENED":
      return `Widened scope from ${action.from} to ${action.to}`;
    case "LEVEL_WIDENED":
      return `Widened levels from [${action.from.join(",")}] to [${action.to.join(",")}]`;
    case "CONTRACTION_SUBSTITUTED":
      return `Substituted contraction from ${action.needed} to ${action.used}`;
    case "CATEGORY_MATCHED":
      return `Matched category "${action.category}" across routes (original: ${action.originalRoute})`;
    case "ROUTE_DROPPED":
      return `Dropped route constraint (original: ${action.originalRoute})`;
  }
}

/**
 * Select format for the block using compatibility matrix with fallback
 *
 * @param ctx - Context with contraction derived
 * @param db - Database connection for format lookup
 * @returns Context enriched with selected format
 * @throws Error if no compatible format found even after fallback
 */
export async function selectFormat(
  ctx: BlockContextWithContraction,
  db: MySql2Database<typeof schema>,
  excludeFormatNames?: string[],
): Promise<BlockContextWithFormat> {
  const block = roleToBlock(ctx.role);
  // Use levelGroup representative for format lookup (ensures alfa and delta get same format)
  const level = levelGroupToLevel(ctx.levelGroup);

  // Use fallback ladder for format selection
  const result = await selectFormatWithFallback(
    { block, level, intensity: ctx.intensity },
    db,
    undefined,
    excludeFormatNames,
  );

  let updatedCtx = ctx;

  // Handle fallback result
  if (result.status === "failed") {
    // Add error trace and throw
    const errorTrace = createTraceEvent(
      ctx,
      "FORMAT_SELECTION_FAILED",
      "ERROR",
      {
        block,
        level,
        intensity: ctx.intensity,
        fallbackTier: result.tier,
        actions: result.actions.map(actionToTraceDescription),
      },
    );
    updatedCtx = appendTrace(updatedCtx, errorTrace);
    throw new Error(
      `No compatible format found for block=${block}, level=${level}, intensity=${ctx.intensity} after ${result.tier} fallback tiers`,
    );
  }

  const winner = result.data[0];

  // Add fallback traces if any relaxation was applied
  if (result.status === "fallback") {
    for (const action of result.actions) {
      const fallbackTrace = createTraceEvent(
        updatedCtx,
        "FORMAT_FALLBACK",
        "WARNING",
        {
          tier: action.tier,
          action: action.type,
          description: actionToTraceDescription(action),
        },
      );
      updatedCtx = appendTrace(updatedCtx, fallbackTrace);
    }
  }

  // Add success trace
  const traceEvent = createTraceEvent(
    updatedCtx,
    "FORMAT_SELECTED",
    "INFO",
    {
      formatId: winner.formatId,
      formatName: winner.name,
      compatibility: winner.compatibility,
      fallbackTier: result.tier,
      usedFallback: result.status === "fallback",
    },
    {
      tieBreakers: ["compatibility ASC (1=best)", "random among ties"],
    },
  );

  return {
    ...appendTrace(updatedCtx, traceEvent),
    format: {
      formatId: winner.formatId,
      name: winner.name,
    },
  };
}
