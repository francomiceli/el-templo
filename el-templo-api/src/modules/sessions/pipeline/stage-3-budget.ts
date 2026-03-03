/**
 * Stage 3: Budget Derivation
 *
 * Derives training budget from intensity level using intensity rules table.
 * Returns reps budget, exercise count range, and difficulty bucket.
 *
 * Input: BlockContextWithSpom (has intensity)
 * Output: BlockContextWithBudget (adds repsBudget, exerciseCountMin/Max, difficultyBucket)
 */

import { SpomService } from "../../spom/service";
import type { BlockContextWithSpom, BlockContextWithBudget } from "./context";
import { createTraceEvent, appendTrace } from "./context";
import type { BlockRole } from "../types";

/** Non-Initium blocks are capped at 3 exercises per coach-built examples */
const NON_INITIUM_EXERCISE_CAP = 3;

/** Initium blocks always have exactly 4 exercises */
const INITIUM_EXERCISE_COUNT = 4;

/**
 * Get exercise count bounds for a given block role.
 * Initium is fixed at 4 exercises. All other blocks are capped at 3.
 *
 * @param role - Block role
 * @param ruleMin - Minimum from intensity rule
 * @param ruleMax - Maximum from intensity rule
 * @returns Adjusted { min, max } exercise counts
 */
function getExerciseCountBounds(
  role: BlockRole,
  ruleMin: number,
  ruleMax: number,
): { min: number; max: number } {
  if (role === "INITIUM") {
    return { min: INITIUM_EXERCISE_COUNT, max: INITIUM_EXERCISE_COUNT };
  }
  return {
    min: Math.min(ruleMin, NON_INITIUM_EXERCISE_CAP),
    max: Math.min(ruleMax, NON_INITIUM_EXERCISE_CAP),
  };
}

/**
 * Derive budget from intensity level
 *
 * @param ctx - Context with SPOM resolved
 * @param spomService - SPOM service for data access
 * @returns Context enriched with budget data
 * @throws Error if intensity rule not found
 */
export async function deriveBudget(
  ctx: BlockContextWithSpom,
  spomService: SpomService,
): Promise<BlockContextWithBudget> {
  const rule = await spomService.getIntensityRule(ctx.intensity);

  if (!rule) {
    throw new Error(`No intensity rule found for intensity=${ctx.intensity}`);
  }

  // Apply exercise count bounds: Initium fixed at 4, non-Initium capped at 3
  const bounds = getExerciseCountBounds(
    ctx.role,
    rule.exerciseCountMin,
    rule.exerciseCountMax,
  );
  const exerciseCountMin = bounds.min;
  const exerciseCountMax = bounds.max;

  let updatedCtx = ctx;

  // Log trace event when bounds differ from intensity rule
  if (
    exerciseCountMin !== rule.exerciseCountMin ||
    exerciseCountMax !== rule.exerciseCountMax
  ) {
    const capTrace = createTraceEvent(
      updatedCtx,
      "EXERCISE_COUNT_ADJUSTED",
      "INFO",
      {
        originalMin: rule.exerciseCountMin,
        originalMax: rule.exerciseCountMax,
        adjustedMin: exerciseCountMin,
        adjustedMax: exerciseCountMax,
        role: ctx.role,
        reason:
          ctx.role === "INITIUM"
            ? `Initium blocks fixed at ${INITIUM_EXERCISE_COUNT} exercises`
            : `Non-Initium blocks capped at ${NON_INITIUM_EXERCISE_CAP} exercises`,
      },
    );
    updatedCtx = appendTrace(updatedCtx, capTrace);
  }

  const traceEvent = createTraceEvent(updatedCtx, "BUDGET_DERIVED", "INFO", {
    repsBudget: rule.repsBudget,
    exerciseCountMin,
    exerciseCountMax,
    difficultyBucket: rule.difficulty,
    ruleId: rule.id,
  });

  return {
    ...appendTrace(updatedCtx, traceEvent),
    repsBudget: rule.repsBudget,
    exerciseCountMin,
    exerciseCountMax,
    difficultyBucket: rule.difficulty,
  };
}
