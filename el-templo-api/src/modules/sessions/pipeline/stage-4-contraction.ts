/**
 * Stage 4: Contraction Derivation
 *
 * Determines exercise count and contraction type distribution
 * based on intensity level from contraction rules table.
 *
 * Input: BlockContextWithBudget (has exerciseCountMin/Max)
 * Output: BlockContextWithContraction (adds exerciseCount, contractionMix)
 */

import { SpomService } from '../../spom/service';
import type { BlockContextWithBudget, BlockContextWithContraction } from './context';
import type { ContractionMix } from '../types';
import { createTraceEvent, appendTrace } from './context';

/**
 * Derive contraction mix from intensity and exercise count
 *
 * Uses minimum exercise count for determinism (always consistent choice).
 *
 * @param ctx - Context with budget derived
 * @param spomService - SPOM service for data access
 * @returns Context enriched with contraction distribution
 * @throws Error if contraction rule not found
 */
export async function deriveContraction(
  ctx: BlockContextWithBudget,
  spomService: SpomService
): Promise<BlockContextWithContraction> {
  // Use minimum exercise count for determinism
  const exerciseCount = ctx.exerciseCountMin;

  const rule = await spomService.getContractionRule(ctx.intensity, exerciseCount);

  if (!rule) {
    throw new Error(
      `No contraction rule found for intensity=${ctx.intensity}, totalExercises=${exerciseCount}`
    );
  }

  // Map Spanish column names to English contraction types
  const contractionMix: ContractionMix = {
    CON: rule.concentrico,
    EXC: rule.excentrico,
    ISO: rule.isometrico,
  };

  const traceEvent = createTraceEvent(ctx, 'CONTRACTION_DERIVED', 'INFO', {
    exerciseCount,
    contractionMix,
    ruleId: rule.id,
  });

  return {
    ...appendTrace(ctx, traceEvent),
    exerciseCount,
    contractionMix,
  };
}
