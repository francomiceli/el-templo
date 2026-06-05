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
import type { BlockRole, ExerciseLevel } from "../types";
import { isKairos, KAIROS_BLOCK_SIZE } from "./utils/kairos";

/** Non-Initium blocks are capped at 3 exercises per coach-built examples */
const NON_INITIUM_EXERCISE_CAP = 3;

/** Initium blocks always have exactly 4 exercises */
const INITIUM_EXERCISE_COUNT = 4;

/**
 * Get exercise count bounds for a given block role.
 * Initium is fixed at 4 exercises. All other blocks are capped at 3.
 *
 * Phase 129 (D-05): when the member level is kairos, every non-INITIUM block is
 * forced to exactly KAIROS_BLOCK_SIZE (2). The INITIUM block has its own
 * pipeline (initium-pipeline.ts) and never reaches this function — it is gated
 * separately. The gate is a pure additive branch: every non-kairos path is
 * unchanged (D-07).
 *
 * @param role - Block role
 * @param ruleMin - Minimum from intensity rule
 * @param ruleMax - Maximum from intensity rule
 * @param memberLevel - Member's individual level (kairos triggers the 2/block gate)
 * @returns Adjusted { min, max } exercise counts
 */
function getExerciseCountBounds(
  role: BlockRole,
  ruleMin: number,
  ruleMax: number,
  memberLevel: ExerciseLevel,
): { min: number; max: number } {
  if (role === "INITIUM") {
    return { min: INITIUM_EXERCISE_COUNT, max: INITIUM_EXERCISE_COUNT };
  }
  // Kairos (D-05): exactly 2 exercises per non-INITIUM block.
  if (isKairos(memberLevel)) {
    return { min: KAIROS_BLOCK_SIZE, max: KAIROS_BLOCK_SIZE };
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

  // Apply exercise count bounds: Initium fixed at 4, non-Initium capped at 3.
  // Kairos forces 2 per non-INITIUM block (D-05).
  const bounds = getExerciseCountBounds(
    ctx.role,
    rule.exerciseCountMin,
    rule.exerciseCountMax,
    ctx.memberLevel,
  );
  const exerciseCountMin = bounds.min;
  const exerciseCountMax = bounds.max;

  let updatedCtx = ctx;

  // Kairos audit trace (D-05): block size forced to 2 for non-INITIUM blocks.
  if (isKairos(ctx.memberLevel) && ctx.role !== "INITIUM") {
    const kairosTrace = createTraceEvent(
      updatedCtx,
      "KAIROS_BLOCK_SIZE_FORCED",
      "INFO",
      {
        role: ctx.role,
        forcedMin: exerciseCountMin,
        forcedMax: exerciseCountMax,
        reason: "Kairos forces exactly 2 exercises per block (D-05)",
      },
    );
    updatedCtx = appendTrace(updatedCtx, kairosTrace);
  }

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
