/**
 * Fallback System Types
 *
 * Discriminated unions for fallback results. All fallback decisions
 * are traced for auditability in the pipeline.
 */

import type { Contraction, LevelGroup, ExerciseLevel } from '../types';

/** Re-export ExerciseLevel for backward compatibility */
export type { ExerciseLevel } from '../types';

/**
 * Fallback result discriminated union
 *
 * - exact: Found matches without any relaxation
 * - fallback: Found matches after relaxing requirements
 * - failed: No matches found even after max relaxation
 */
export type FallbackResult<T> =
  | { status: 'exact'; data: T[]; tier: 0; actions: [] }
  | { status: 'fallback'; data: T[]; tier: number; actions: FallbackAction[] }
  | { status: 'failed'; data: []; tier: number; actions: FallbackAction[] };

/**
 * Fallback action discriminated union
 *
 * Records what relaxation was applied at each tier.
 */
export type FallbackAction =
  | { type: 'DIFFICULTY_RELAXED'; tier: number; from: number; to: number }
  | { type: 'EFFORT_RELAXED'; tier: number; contraction: Contraction }
  | { type: 'LEVEL_WIDENED'; tier: number; from: readonly ExerciseLevel[]; to: readonly ExerciseLevel[] }
  | { type: 'SCOPE_WIDENED'; tier: number; from: string; to: string }
  | { type: 'CONTRACTION_SUBSTITUTED'; tier: number; needed: Contraction; used: Contraction };

/**
 * Fallback policy configuration
 *
 * Controls how many tiers to attempt and in what order to relax constraints.
 */
export interface FallbackPolicy {
  readonly maxTier: number;
  readonly relaxationOrder: readonly ('difficulty' | 'level' | 'scope' | 'contraction')[];
}

/**
 * Default exercise fallback policy
 *
 * Tier 0: Exact match
 * Tier 1: Relax difficulty
 * Tier 2: Widen level filter
 * Tier 3: Widen scope (search parent category)
 * Tier 4: Substitute contraction type
 */
export const DEFAULT_EXERCISE_POLICY: FallbackPolicy = {
  maxTier: 4,
  relaxationOrder: ['difficulty', 'level', 'scope', 'contraction'],
};

/**
 * Default format fallback policy
 *
 * Tier 0: Exact match
 * Tier 1: Relax intensity (+/- 5)
 * Tier 2: Use default format
 */
export const DEFAULT_FORMAT_POLICY: FallbackPolicy = {
  maxTier: 2,
  relaxationOrder: ['difficulty', 'level'], // intensity relaxation handled specially
};

/**
 * Exercise requirements for fallback selection
 */
export interface ExerciseRequirements {
  readonly route: string;
  readonly contraction: Contraction;
  readonly maxDifficulty: number;
  readonly allowedLevels: readonly ExerciseLevel[];
  readonly count: number;
  readonly levelGroup: LevelGroup;
  readonly memberLevel: ExerciseLevel;
  /** Exercise names to exclude (for deduplication across contractions) */
  readonly excludeNames?: Set<string>;
}

/**
 * Format requirements for fallback selection
 */
export interface FormatRequirements {
  readonly block: 'initium' | 'nucleus' | 'deuteros' | 'athlos' | 'epikos';
  readonly level: 'alfa' | 'delta' | 'sigma' | 'omega';
  readonly intensity: number;
}
