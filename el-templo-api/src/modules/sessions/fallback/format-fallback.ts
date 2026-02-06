/**
 * Format Fallback Ladder
 *
 * Implements tiered fallback for format selection when exact matches
 * aren't available. All fallback decisions are recorded for traceability.
 *
 * Fallback Tiers:
 * 0: Exact match (block + level + intensity, compatibility > 0)
 * 1: Relax intensity (+/- 5 from target)
 * 2: Use default format (Straight Sets for strength, AMRAP for conditioning)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, gt, between, or } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type {
  FallbackResult,
  FallbackAction,
  FallbackPolicy,
  FormatRequirements,
} from './types';

/** Format data returned from queries */
export interface FormatCandidate {
  readonly formatId: number;
  readonly name: string;
  readonly compatibility: number;
}

/** Default formats for different block types when all else fails */
const DEFAULT_FORMATS: Record<FormatRequirements['block'], string> = {
  initium: 'EMOM', // Time-based warmup (changed from 'Movilidad' which doesn't exist)
  nucleus: 'Straight Sets', // Classic sets for main strength work
  deuteros: 'Straight Sets', // Accessory strength
  athlos: 'AMRAP', // Conditioning
  epikos: 'AMRAP', // Conditioning
};

/**
 * Query formats with given criteria
 */
async function queryFormats(
  db: MySql2Database<typeof schema>,
  block: FormatRequirements['block'],
  level: FormatRequirements['level'],
  intensity: number
): Promise<FormatCandidate[]> {
  const results = await db
    .select({
      formatId: schema.formatCompatibility.formatId,
      compatibility: schema.formatCompatibility.compatibility,
      name: schema.formats.name,
    })
    .from(schema.formatCompatibility)
    .innerJoin(schema.formats, eq(schema.formatCompatibility.formatId, schema.formats.id))
    .where(and(
      eq(schema.formatCompatibility.block, block),
      eq(schema.formatCompatibility.level, level),
      eq(schema.formatCompatibility.intensity, intensity),
      gt(schema.formatCompatibility.compatibility, 0)
    ));

  return results.map(r => ({
    formatId: r.formatId,
    name: r.name,
    compatibility: r.compatibility,
  }));
}

/**
 * Query formats with relaxed intensity (+/- range)
 */
async function queryFormatsWithRelaxedIntensity(
  db: MySql2Database<typeof schema>,
  block: FormatRequirements['block'],
  level: FormatRequirements['level'],
  intensity: number,
  range: number
): Promise<FormatCandidate[]> {
  const minIntensity = Math.max(0, intensity - range);
  const maxIntensity = Math.min(100, intensity + range);

  const results = await db
    .select({
      formatId: schema.formatCompatibility.formatId,
      compatibility: schema.formatCompatibility.compatibility,
      name: schema.formats.name,
    })
    .from(schema.formatCompatibility)
    .innerJoin(schema.formats, eq(schema.formatCompatibility.formatId, schema.formats.id))
    .where(and(
      eq(schema.formatCompatibility.block, block),
      eq(schema.formatCompatibility.level, level),
      between(schema.formatCompatibility.intensity, minIntensity, maxIntensity),
      gt(schema.formatCompatibility.compatibility, 0)
    ));

  return results.map(r => ({
    formatId: r.formatId,
    name: r.name,
    compatibility: r.compatibility,
  }));
}

/**
 * Get default format for a block type
 */
async function getDefaultFormat(
  db: MySql2Database<typeof schema>,
  block: FormatRequirements['block']
): Promise<FormatCandidate | null> {
  const defaultName = DEFAULT_FORMATS[block];
  if (!defaultName) return null;

  const results = await db
    .select({
      formatId: schema.formats.id,
      name: schema.formats.name,
    })
    .from(schema.formats)
    .where(eq(schema.formats.name, defaultName));

  if (results.length === 0) return null;

  return {
    formatId: results[0].formatId,
    name: results[0].name,
    compatibility: 1, // Default compatibility
  };
}

/**
 * Select best format from candidates using deterministic tie-breakers
 */
function selectBestFormat(candidates: FormatCandidate[]): FormatCandidate {
  // Sort: compatibility ASC (1=best), formatId ASC (deterministic tie-break)
  const sorted = [...candidates].sort((a, b) => {
    if (a.compatibility !== b.compatibility) {
      return a.compatibility - b.compatibility;
    }
    return a.formatId - b.formatId;
  });

  return sorted[0];
}

/**
 * Select format with fallback ladder
 *
 * Attempts to find format matching requirements, progressively
 * relaxing constraints until one is found or defaults are used.
 *
 * @param requirements - Format selection requirements
 * @param db - Database connection
 * @param policy - Fallback policy (default: DEFAULT_FORMAT_POLICY)
 * @returns FallbackResult with format and actions taken
 */
export async function selectFormatWithFallback(
  requirements: FormatRequirements,
  db: MySql2Database<typeof schema>,
  policy: FallbackPolicy = { maxTier: 2, relaxationOrder: ['difficulty', 'level'] }
): Promise<FallbackResult<FormatCandidate>> {
  const { block, level, intensity } = requirements;
  const actions: FallbackAction[] = [];

  // Tier 0: Exact match
  let pool = await queryFormats(db, block, level, intensity);

  if (pool.length > 0) {
    const selected = selectBestFormat(pool);
    return {
      status: 'exact',
      data: [selected],
      tier: 0,
      actions: [],
    };
  }

  // Tier 1: Relax intensity (+/- 5)
  if (policy.maxTier >= 1) {
    pool = await queryFormatsWithRelaxedIntensity(db, block, level, intensity, 5);

    actions.push({
      type: 'DIFFICULTY_RELAXED',
      tier: 1,
      from: intensity,
      to: intensity, // Indicates range was used, not exact
    });

    if (pool.length > 0) {
      const selected = selectBestFormat(pool);
      return {
        status: 'fallback',
        data: [selected],
        tier: 1,
        actions,
      };
    }
  }

  // Tier 2: Use default format
  if (policy.maxTier >= 2) {
    const defaultFormat = await getDefaultFormat(db, block);

    actions.push({
      type: 'SCOPE_WIDENED',
      tier: 2,
      from: `${block}/${level}/${intensity}`,
      to: `default(${DEFAULT_FORMATS[block]})`,
    });

    if (defaultFormat) {
      return {
        status: 'fallback',
        data: [defaultFormat],
        tier: 2,
        actions,
      };
    }
  }

  // Failed: No format found
  return {
    status: 'failed',
    data: [] as [],
    tier: policy.maxTier,
    actions,
  };
}
