/**
 * Stage 2: SPOM Resolution
 *
 * Resolves SPOM rule for the block's route and week combination.
 * Returns intensity, pattern, and category from the SPOM rules table.
 *
 * Input: BlockContextWithRoute (has route)
 * Output: BlockContextWithSpom (adds intensity, pattern, category)
 */

import { SpomService } from '../../spom/service';
import type { BlockContextWithRoute, BlockContextWithSpom } from './context';
import { createTraceEvent, appendTrace } from './context';

/**
 * Resolve SPOM rule for the current block
 *
 * @param ctx - Context with route resolved
 * @param spomService - SPOM service for data access
 * @returns Context enriched with SPOM data
 * @throws Error if SPOM rule not found
 */
export async function resolveSpom(
  ctx: BlockContextWithRoute,
  spomService: SpomService
): Promise<BlockContextWithSpom> {
  const rule = await spomService.getSpomRule({
    week: ctx.week,
    route: ctx.route,
  });

  if (!rule) {
    throw new Error(
      `No SPOM rule found for week=${ctx.week}, route=${ctx.route}`
    );
  }

  const traceEvent = createTraceEvent(ctx, 'SPOM_RESOLVED', 'INFO', {
    intensity: rule.intensity,
    pattern: rule.pattern,
    category: rule.category,
    wave: rule.wave,
    ruleId: rule.id,
  });

  return {
    ...appendTrace(ctx, traceEvent),
    intensity: rule.intensity,
    pattern: rule.pattern,
    category: rule.category,
  };
}
