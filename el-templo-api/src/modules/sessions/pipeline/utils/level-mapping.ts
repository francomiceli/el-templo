/**
 * Level Mapping Utilities
 *
 * Shared functions for mapping level groups to exercise levels
 * and calculating difficulty progressions.
 *
 * Used by initium-pipeline.ts, stage-5-format.ts, and stage-6-exercises.ts.
 */

import type { LevelGroup, ExerciseLevel } from '../../types';

/** Re-export ExerciseLevel for convenience */
export type { ExerciseLevel } from '../../types';

/**
 * Get allowed exercise levels for a level group.
 * Higher level groups include all lower levels.
 */
export function getAllowedLevels(levelGroup: LevelGroup): ExerciseLevel[] {
  switch (levelGroup) {
    case 'alfa_delta':
      return ['alfa', 'delta'];
    case 'sigma':
      return ['alfa', 'delta', 'sigma'];
    case 'omega':
      return ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  }
}

/**
 * Map LevelGroup to representative individual level.
 * Used for format lookup and other contexts requiring a single level.
 */
export function levelGroupToLevel(levelGroup: LevelGroup): 'alfa' | 'delta' | 'sigma' | 'omega' {
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
 * Linear difficulty base values per level.
 * Used to calculate maxDificultadLineal from level and bucket.
 *
 * Each level spans a difficulty range:
 * - Alfa: 1-3 (base 0 + bucket)
 * - Delta: 4-6 (base 3 + bucket)
 * - Sigma: 7-8 (base 6 + bucket)
 * - Omega: 9-10 (base 8 + bucket)
 * - Spartan: 11-12 (base 10 + bucket)
 */
export const LEVEL_LINEAR_BASE: Record<ExerciseLevel, number> = {
  alfa: 0,
  delta: 3,
  sigma: 6,
  omega: 8,
  spartan: 10,
};

/**
 * Level progression for Nivel Superior mapping.
 * Used to calculate next level when shifting up.
 */
export const LEVEL_PROGRESSION: readonly ExerciseLevel[] = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
