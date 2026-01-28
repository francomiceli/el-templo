/**
 * Stage 5: Format Selection
 *
 * Selects a training format for the block based on compatibility matrix.
 * Uses fallback ladder when exact matches not found.
 * Uses deterministic tie-breakers: compatibility DESC, then formatId ASC.
 *
 * Input: BlockContextWithContraction (has intensity, role, levelGroup)
 * Output: BlockContextWithFormat (adds format: { formatId, name })
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../../db/schema';
import type { BlockContextWithContraction, BlockContextWithFormat } from './context';
import type { BlockRole, LevelGroup } from '../types';
import { createTraceEvent, appendTrace } from './context';
import { selectFormatWithFallback } from '../fallback/format-fallback';
import type { FallbackAction } from '../fallback/types';

/** Map BlockRole to format_compatibility block enum */
function roleToBlock(role: BlockRole): 'initium' | 'nucleus' | 'deuteros' | 'athlos' | 'epikos' {
  switch (role) {
    case 'INITIUM':
      return 'initium';
    case 'NUCLEUS':
      return 'nucleus';
    case 'DEUTEROS_1':
    case 'DEUTEROS_2':
      return 'deuteros';
    case 'ATHLOS_EPIKOS':
      return 'athlos'; // Default to athlos for the combined block
  }
}

/** Map LevelGroup to individual level for format lookup */
// DEPRECATED: No longer used, replaced by ctx.memberLevel
function levelGroupToLevel(levelGroup: LevelGroup): 'alfa' | 'delta' | 'sigma' | 'omega' {
  // Use representative level from each group
  switch (levelGroup) {
    case 'alfa_delta':
      return 'delta'; // Use delta as representative (higher of the two)
    case 'sigma':
      return 'sigma';
    case 'omega':
      return 'omega';
  }
}

/**
 * Convert fallback action to trace event description
 */
function actionToTraceDescription(action: FallbackAction): string {
  switch (action.type) {
    case 'DIFFICULTY_RELAXED':
      return `Relaxed intensity from ${action.from} (+/- 5 range)`;
    case 'SCOPE_WIDENED':
      return `Widened scope from ${action.from} to ${action.to}`;
    case 'LEVEL_WIDENED':
      return `Widened levels from [${action.from.join(',')}] to [${action.to.join(',')}]`;
    case 'CONTRACTION_SUBSTITUTED':
      return `Substituted contraction from ${action.needed} to ${action.used}`;
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
  db: MySql2Database<typeof schema>
): Promise<BlockContextWithFormat> {
  const block = roleToBlock(ctx.role);
  // Use memberLevel directly; map spartan to omega for format lookup (no spartan in format_compatibility)
  const level = ctx.memberLevel === 'spartan' ? 'omega' : ctx.memberLevel;

  // Use fallback ladder for format selection
  const result = await selectFormatWithFallback(
    { block, level, intensity: ctx.intensity },
    db
  );

  let updatedCtx = ctx;

  // Handle fallback result
  if (result.status === 'failed') {
    // Add error trace and throw
    const errorTrace = createTraceEvent(
      ctx,
      'FORMAT_SELECTION_FAILED',
      'ERROR',
      {
        block,
        level,
        intensity: ctx.intensity,
        fallbackTier: result.tier,
        actions: result.actions.map(actionToTraceDescription),
      }
    );
    updatedCtx = appendTrace(updatedCtx, errorTrace);
    throw new Error(
      `No compatible format found for block=${block}, level=${level}, intensity=${ctx.intensity} after ${result.tier} fallback tiers`
    );
  }

  const winner = result.data[0];

  // Add fallback traces if any relaxation was applied
  if (result.status === 'fallback') {
    for (const action of result.actions) {
      const fallbackTrace = createTraceEvent(
        updatedCtx,
        'FORMAT_FALLBACK',
        'WARNING',
        {
          tier: action.tier,
          action: action.type,
          description: actionToTraceDescription(action),
        }
      );
      updatedCtx = appendTrace(updatedCtx, fallbackTrace);
    }
  }

  // Add success trace
  const traceEvent = createTraceEvent(
    updatedCtx,
    'FORMAT_SELECTED',
    'INFO',
    {
      formatId: winner.formatId,
      formatName: winner.name,
      compatibility: winner.compatibility,
      fallbackTier: result.tier,
      usedFallback: result.status === 'fallback',
    },
    {
      tieBreakers: ['compatibility DESC', 'formatId ASC'],
    }
  );

  return {
    ...appendTrace(updatedCtx, traceEvent),
    format: {
      formatId: winner.formatId,
      name: winner.name,
    },
  };
}
