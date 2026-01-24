/**
 * Exercise Fallback Ladder
 *
 * Implements tiered fallback for exercise selection when exact matches
 * aren't available. All fallback decisions are recorded for traceability.
 *
 * Fallback Tiers:
 * 0: Exact match (route + contraction + difficulty + level)
 * 1: Relax difficulty (difficulty >= 1 instead of exact bucket)
 * 2: Widen level filter (include lower levels)
 * 3: Widen scope (search parent category if route yields nothing)
 * 4: Substitute contraction (if no ISO, try EXC, then CON)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, lte, inArray, like } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type {
  FallbackResult,
  FallbackAction,
  FallbackPolicy,
  ExerciseRequirements,
  ExerciseLevel,
} from './types';
import type { Contraction, LevelGroup } from '../types';

/** Exercise data returned from queries */
export interface ExerciseCandidate {
  readonly id: number;
  readonly name: string;
  readonly difficulty: number;
  readonly contraction: Contraction;
}

/** Contraction substitution order for fallback */
const CONTRACTION_SUBSTITUTION: Record<Contraction, Contraction[]> = {
  ISO: ['EXC', 'CON'],
  EXC: ['CON', 'ISO'],
  CON: ['EXC', 'ISO'],
};

/** Level widening for each level group */
const LEVEL_WIDENING: Record<LevelGroup, readonly ExerciseLevel[][]> = {
  alfa_delta: [
    ['alfa', 'delta'],
    ['alfa', 'delta', 'sigma'],
    ['alfa', 'delta', 'sigma', 'omega'],
  ],
  sigma: [
    ['alfa', 'delta', 'sigma'],
    ['alfa', 'delta', 'sigma', 'omega'],
    ['alfa', 'delta', 'sigma', 'omega', 'spartan'],
  ],
  omega: [
    ['alfa', 'delta', 'sigma', 'omega', 'spartan'],
  ],
};

/**
 * Get expanded levels for fallback
 */
function getExpandedLevels(
  levelGroup: LevelGroup,
  tier: number
): readonly ExerciseLevel[] {
  const expansions = LEVEL_WIDENING[levelGroup];
  const index = Math.min(tier - 1, expansions.length - 1);
  return expansions[index] ?? expansions[expansions.length - 1];
}

/**
 * Query exercises with given criteria
 */
async function queryExercises(
  db: MySql2Database<typeof schema>,
  route: string,
  contraction: Contraction,
  maxDifficulty: number,
  allowedLevels: readonly ExerciseLevel[]
): Promise<ExerciseCandidate[]> {
  const results = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      difficulty: schema.exercises.difficulty,
    })
    .from(schema.exercises)
    .where(and(
      eq(schema.exercises.route, route),
      eq(schema.exercises.effort, contraction),
      lte(schema.exercises.difficulty, maxDifficulty),
      inArray(schema.exercises.level, [...allowedLevels])
    ));

  return results.map(r => ({
    id: r.id,
    name: r.name,
    difficulty: r.difficulty,
    contraction,
  }));
}

/**
 * Query exercises with scope widening (category prefix matching)
 */
async function queryExercisesWithScopeWidening(
  db: MySql2Database<typeof schema>,
  route: string,
  contraction: Contraction,
  maxDifficulty: number,
  allowedLevels: readonly ExerciseLevel[]
): Promise<ExerciseCandidate[]> {
  // Extract parent category from route (e.g., "PRESS-H" -> "PRESS")
  const parentRoute = route.split('-')[0];

  if (parentRoute === route) {
    // No parent to widen to
    return [];
  }

  const results = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      difficulty: schema.exercises.difficulty,
    })
    .from(schema.exercises)
    .where(and(
      like(schema.exercises.route, `${parentRoute}%`),
      eq(schema.exercises.effort, contraction),
      lte(schema.exercises.difficulty, maxDifficulty),
      inArray(schema.exercises.level, [...allowedLevels])
    ));

  return results.map(r => ({
    id: r.id,
    name: r.name,
    difficulty: r.difficulty,
    contraction,
  }));
}

/**
 * Select exercises with fallback ladder
 *
 * Attempts to find exercises matching requirements, progressively
 * relaxing constraints until enough are found or max tier reached.
 *
 * @param requirements - Exercise selection requirements
 * @param db - Database connection
 * @param policy - Fallback policy (default: DEFAULT_EXERCISE_POLICY)
 * @returns FallbackResult with exercises and actions taken
 */
export async function selectExercisesWithFallback(
  requirements: ExerciseRequirements,
  db: MySql2Database<typeof schema>,
  policy: FallbackPolicy = { maxTier: 4, relaxationOrder: ['difficulty', 'level', 'scope', 'contraction'] }
): Promise<FallbackResult<ExerciseCandidate>> {
  const {
    route,
    contraction,
    maxDifficulty,
    allowedLevels,
    count,
    levelGroup,
  } = requirements;

  const actions: FallbackAction[] = [];
  let currentDifficulty = maxDifficulty;
  let currentLevels = allowedLevels;
  let currentContraction = contraction;
  let currentRoute = route;

  // Tier 0: Exact match
  let pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, currentLevels);

  if (pool.length >= count) {
    // Sort deterministically by id ASC and take first N
    const sorted = [...pool].sort((a, b) => a.id - b.id);
    const selected = sorted.slice(0, count);
    return {
      status: 'exact',
      data: selected,
      tier: 0,
      actions: [],
    };
  }

  // Tier 1: Relax difficulty
  if (policy.maxTier >= 1 && policy.relaxationOrder.includes('difficulty')) {
    const originalDifficulty = currentDifficulty;
    currentDifficulty = 999; // Allow any difficulty

    pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, currentLevels);

    actions.push({
      type: 'DIFFICULTY_RELAXED',
      tier: 1,
      from: originalDifficulty,
      to: currentDifficulty,
    });

    if (pool.length >= count) {
      const sorted = [...pool].sort((a, b) => a.id - b.id);
      const selected = sorted.slice(0, count);
      return {
        status: 'fallback',
        data: selected,
        tier: 1,
        actions,
      };
    }
  }

  // Tier 2: Widen level filter
  if (policy.maxTier >= 2 && policy.relaxationOrder.includes('level')) {
    const originalLevels = currentLevels;
    currentLevels = getExpandedLevels(levelGroup, 2);

    pool = await queryExercises(db, currentRoute, currentContraction, currentDifficulty, currentLevels);

    actions.push({
      type: 'LEVEL_WIDENED',
      tier: 2,
      from: originalLevels,
      to: currentLevels,
    });

    if (pool.length >= count) {
      const sorted = [...pool].sort((a, b) => a.id - b.id);
      const selected = sorted.slice(0, count);
      return {
        status: 'fallback',
        data: selected,
        tier: 2,
        actions,
      };
    }
  }

  // Tier 3: Widen scope
  if (policy.maxTier >= 3 && policy.relaxationOrder.includes('scope')) {
    const originalRoute = currentRoute;

    pool = await queryExercisesWithScopeWidening(
      db, currentRoute, currentContraction, currentDifficulty, currentLevels
    );

    if (pool.length > 0) {
      const parentRoute = currentRoute.split('-')[0];
      actions.push({
        type: 'SCOPE_WIDENED',
        tier: 3,
        from: originalRoute,
        to: `${parentRoute}*`,
      });
      currentRoute = parentRoute;

      if (pool.length >= count) {
        const sorted = [...pool].sort((a, b) => a.id - b.id);
        const selected = sorted.slice(0, count);
        return {
          status: 'fallback',
          data: selected,
          tier: 3,
          actions,
        };
      }
    }
  }

  // Tier 4: Substitute contraction
  if (policy.maxTier >= 4 && policy.relaxationOrder.includes('contraction')) {
    const substitutes = CONTRACTION_SUBSTITUTION[contraction];

    for (const substitute of substitutes) {
      pool = await queryExercises(db, route, substitute, currentDifficulty, currentLevels);

      if (pool.length >= count) {
        actions.push({
          type: 'CONTRACTION_SUBSTITUTED',
          tier: 4,
          needed: contraction,
          used: substitute,
        });

        const sorted = [...pool].sort((a, b) => a.id - b.id);
        const selected = sorted.slice(0, count).map(ex => ({
          ...ex,
          contraction: substitute,
        }));
        return {
          status: 'fallback',
          data: selected,
          tier: 4,
          actions,
        };
      }
    }

    // Record attempted substitutions even if failed
    actions.push({
      type: 'CONTRACTION_SUBSTITUTED',
      tier: 4,
      needed: contraction,
      used: contraction, // Failed to substitute
    });
  }

  // Failed: Return partial results if any
  const sorted = [...pool].sort((a, b) => a.id - b.id);
  const selected = sorted.slice(0, count);

  return {
    status: 'failed',
    data: [] as [],
    tier: policy.maxTier,
    actions,
  };
}
