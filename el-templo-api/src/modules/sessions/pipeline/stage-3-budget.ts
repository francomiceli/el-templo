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

  const traceEvent = createTraceEvent(ctx, 'BUDGET_DERIVED', 'INFO', {
    repsBudget: rule.repsBudget,
    exerciseCountMin: rule.exerciseCountMin,
    exerciseCountMax: rule.exerciseCountMax,
    difficultyBucket: rule.difficulty,
    ruleId: rule.id,
  });

  return {
    ...appendTrace(ctx, traceEvent),
    repsBudget: rule.repsBudget,
    exerciseCountMin: rule.exerciseCountMin,
    exerciseCountMax: rule.exerciseCountMax,
    difficultyBucket: rule.difficulty,
  };
}
