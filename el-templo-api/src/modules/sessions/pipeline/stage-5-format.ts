/**
 * Stage 5: Format Selection
 *
 * Selects a training format for the block based on compatibility matrix.
 * Uses deterministic tie-breakers: compatibility DESC, then formatId ASC.
 *
 * Input: BlockContextWithContraction (has intensity, role, levelGroup)
 * Output: BlockContextWithFormat (adds format: { formatId, name })
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, gt } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { BlockContextWithContraction, BlockContextWithFormat } from './context';
import type { BlockRole, LevelGroup } from '../types';
import { createTraceEvent, appendTrace } from './context';

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
 * Select format for the block using compatibility matrix
 *
 * @param ctx - Context with contraction derived
 * @param db - Database connection for format lookup
 * @returns Context enriched with selected format
 * @throws Error if no compatible format found
 */
export async function selectFormat(
  ctx: BlockContextWithContraction,
  db: MySql2Database<typeof schema>
): Promise<BlockContextWithFormat> {
  const block = roleToBlock(ctx.role);
  const level = levelGroupToLevel(ctx.levelGroup);

  // Query compatible formats with compatibility > 0
  const compatibleFormats = await db
    .select({
      formatId: schema.formatCompatibility.formatId,
      compatibility: schema.formatCompatibility.compatibility,
      formatName: schema.formats.name,
    })
    .from(schema.formatCompatibility)
    .innerJoin(schema.formats, eq(schema.formatCompatibility.formatId, schema.formats.id))
    .where(and(
      eq(schema.formatCompatibility.block, block),
      eq(schema.formatCompatibility.level, level),
      eq(schema.formatCompatibility.intensity, ctx.intensity),
      gt(schema.formatCompatibility.compatibility, 0)
    ));

  if (compatibleFormats.length === 0) {
    throw new Error(
      `No compatible format found for block=${block}, level=${level}, intensity=${ctx.intensity}`
    );
  }

  // Deterministic tie-breakers: compatibility DESC, then formatId ASC
  const sorted = [...compatibleFormats].sort((a, b) => {
    // First: highest compatibility wins
    if (a.compatibility !== b.compatibility) {
      return b.compatibility - a.compatibility;
    }
    // Second: lowest formatId wins (stable ordering)
    return a.formatId - b.formatId;
  });

  const winner = sorted[0];

  const traceEvent = createTraceEvent(
    ctx,
    'FORMAT_SELECTED',
    'INFO',
    {
      formatId: winner.formatId,
      formatName: winner.formatName,
      compatibility: winner.compatibility,
      candidatesCount: compatibleFormats.length,
    },
    {
      tieBreakers: ['compatibility DESC', 'formatId ASC'],
    }
  );

  return {
    ...appendTrace(ctx, traceEvent),
    format: {
      formatId: winner.formatId,
      name: winner.formatName,
    },
  };
}
