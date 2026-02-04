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
 * Default contraction mix when no rule found
 * Used as fallback when intensity/count combination not in rules table
 */
const DEFAULT_CONTRACTION_MIX: Record<number, ContractionMix> = {
  2: { CON: 1, EXC: 0, ISO: 1 },
  3: { CON: 1, EXC: 1, ISO: 1 },
  4: { CON: 2, EXC: 1, ISO: 1 },
  5: { CON: 2, EXC: 2, ISO: 1 },
};

/**
 * Derive contraction mix from intensity and exercise count
 *
 * Uses minimum exercise count for determinism (always consistent choice).
 * Falls back to nearby exercise count rules or defaults if exact match not found.
 *
 * @param ctx - Context with budget derived
 * @param spomService - SPOM service for data access
 * @returns Context enriched with contraction distribution
 */
export async function deriveContraction(
  ctx: BlockContextWithBudget,
  spomService: SpomService
): Promise<BlockContextWithContraction> {
  // Use minimum exercise count for determinism
  const exerciseCount = ctx.exerciseCountMin;

  // Try exact match first
  let rule = await spomService.getContractionRule(ctx.intensity, exerciseCount);
  let usedFallback = false;
  let fallbackReason = '';

  // If no exact match, try nearby exercise counts (prefer higher, then lower)
  if (!rule) {
    // Try higher exercise counts (4, 5)
    for (const altCount of [exerciseCount + 1, exerciseCount + 2]) {
      rule = await spomService.getContractionRule(ctx.intensity, altCount);
      if (rule) {
        usedFallback = true;
        fallbackReason = `No rule for exerciseCount=${exerciseCount}, using exerciseCount=${altCount}`;
        break;
      }
    }
  }

  // If still no rule, try lower exercise counts
  if (!rule) {
    for (const altCount of [exerciseCount - 1, exerciseCount - 2]) {
      if (altCount < 2) continue;
      rule = await spomService.getContractionRule(ctx.intensity, altCount);
      if (rule) {
        usedFallback = true;
        fallbackReason = `No rule for exerciseCount=${exerciseCount}, using exerciseCount=${altCount}`;
        break;
      }
    }
  }

  // Build contraction mix from rule or use default
  let contractionMix: ContractionMix;

  if (rule) {
    // Map Spanish column names to English contraction types
    contractionMix = {
      CON: rule.concentrico,
      EXC: rule.excentrico,
      ISO: rule.isometrico,
    };
  } else {
    // Use default fallback when no rules found at all
    usedFallback = true;
    fallbackReason = `No contraction rule found for intensity=${ctx.intensity}, using default mix`;
    contractionMix = DEFAULT_CONTRACTION_MIX[exerciseCount] || DEFAULT_CONTRACTION_MIX[3];
  }

  // Scale contraction mix to match actual exercise count if rule was from different count
  const ruleTotal = contractionMix.CON + contractionMix.EXC + contractionMix.ISO;
  if (ruleTotal !== exerciseCount && ruleTotal > 0) {
    // Adjust to match exercise count - scale proportionally, rounding to nearest
    const scale = exerciseCount / ruleTotal;
    let scaledCON = Math.round(contractionMix.CON * scale);
    let scaledEXC = Math.round(contractionMix.EXC * scale);
    let scaledISO = Math.round(contractionMix.ISO * scale);

    // Ensure total matches exerciseCount (adjust CON as needed)
    const scaledTotal = scaledCON + scaledEXC + scaledISO;
    if (scaledTotal !== exerciseCount) {
      scaledCON += exerciseCount - scaledTotal;
    }

    contractionMix = { CON: Math.max(0, scaledCON), EXC: Math.max(0, scaledEXC), ISO: Math.max(0, scaledISO) };
    usedFallback = true;
    fallbackReason += `, scaled from ${ruleTotal} to ${exerciseCount} exercises`;
  }

  const traceEvent = createTraceEvent(
    ctx,
    usedFallback ? 'CONTRACTION_FALLBACK' : 'CONTRACTION_DERIVED',
    usedFallback ? 'WARNING' : 'INFO',
    {
      exerciseCount,
      contractionMix,
      ruleId: rule?.id ?? null,
      fallback: usedFallback,
      reason: fallbackReason || undefined,
    }
  );

  return {
    ...appendTrace(ctx, traceEvent),
    exerciseCount,
    contractionMix,
  };
}
