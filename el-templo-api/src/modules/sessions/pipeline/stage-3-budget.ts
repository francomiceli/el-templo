/**
 * Stage 3: Budget Derivation
 *
 * Derives training budget from intensity level using intensity rules table.
 * Returns reps budget, exercise count range, and difficulty bucket.
 *
 * Input: BlockContextWithSpom (has intensity)
 * Output: BlockContextWithBudget (adds repsBudget, exerciseCountMin/Max, difficultyBucket)
 */

import { SpomService } from '../../spom/service';
import type { BlockContextWithSpom, BlockContextWithBudget } from './context';
import { createTraceEvent, appendTrace } from './context';
import type { BlockRole } from '../types';

/** Non-Initium blocks are capped at 3 exercises per coach-built examples */
const NON_INITIUM_EXERCISE_CAP = 3;

/**
 * Get exercise count cap for a given block role.
 * Initium has no cap (warmup flexibility), all other blocks capped at 3.
 *
 * @param role - Block role
 * @returns Cap value or null for no cap
 */
function getExerciseCountCap(role: BlockRole): number | null {
  if (role === 'INITIUM') {
    return null; // Initium has no cap - uses full intensity-based count
  }
  return NON_INITIUM_EXERCISE_CAP;
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
  spomService: SpomService
): Promise<BlockContextWithBudget> {
  const rule = await spomService.getIntensityRule(ctx.intensity);

  if (!rule) {
    throw new Error(
      `No intensity rule found for intensity=${ctx.intensity}`
    );
  }

  // Apply exercise count cap for non-Initium blocks
  const cap = getExerciseCountCap(ctx.role);
  const exerciseCountMin = cap !== null
    ? Math.min(rule.exerciseCountMin, cap)
    : rule.exerciseCountMin;
  const exerciseCountMax = cap !== null
    ? Math.min(rule.exerciseCountMax, cap)
    : rule.exerciseCountMax;

  let updatedCtx = ctx;

  // Log trace event when cap is applied
  if (cap !== null && (rule.exerciseCountMin > cap || rule.exerciseCountMax > cap)) {
    const capTrace = createTraceEvent(
      updatedCtx,
      'EXERCISE_COUNT_CAPPED',
      'INFO',
      {
        originalMin: rule.exerciseCountMin,
        originalMax: rule.exerciseCountMax,
        cappedMin: exerciseCountMin,
        cappedMax: exerciseCountMax,
        cap,
        role: ctx.role,
        reason: `Non-Initium blocks capped at ${cap} exercises per block specifications`,
      }
    );
    updatedCtx = appendTrace(updatedCtx, capTrace);
  }

  const traceEvent = createTraceEvent(updatedCtx, 'BUDGET_DERIVED', 'INFO', {
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
