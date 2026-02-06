/**
 * Exercise Fallback Ladder
 *
 * Implements tiered fallback for exercise selection when exact matches
 * aren't available. All fallback decisions are recorded for traceability.
 *
 * Uses linear difficulty scale (1-12) for filtering:
 * - Alfa: 1-3, Delta: 4-6, Sigma: 7-8, Omega: 9-10, Spartan: 11-12
 *
 * Fallback Tiers:
 * 0: Exact match (route + contraction + linear difficulty + level)
 * 1: Relax difficulty (allow any dificultad_lineal)
 * 2: Widen level filter (include lower levels)
 * 3: Widen scope (search parent category if route yields nothing)
 * 4: Substitute contraction (if no ISO, try EXC, then CON)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, lte, inArray, like, or, ne } from 'drizzle-orm';
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
  /** Linear difficulty on 1-12 scale */
  readonly dificultadLineal: number;
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
 * Tier 0-1 use exact member level, Tier 2+ widens to level group
 */
function getExpandedLevels(
  levelGroup: LevelGroup,
  tier: number
): readonly ExerciseLevel[] {
  const expansions = LEVEL_WIDENING[levelGroup];
  const index = Math.min(tier - 2, expansions.length - 1);
  return expansions[Math.max(0, index)] ?? expansions[expansions.length - 1];
}

/**
 * Query exercises with given criteria (exact contraction match)
 * Uses dificultad_lineal column for difficulty filtering (1-12 scale)
 */
async function queryExercises(
  db: MySql2Database<typeof schema>,
  route: string,
  contraction: Contraction,
  maxDificultadLineal: number,
  allowedLevels: readonly ExerciseLevel[],
  excludeNames?: Set<string>
): Promise<ExerciseCandidate[]> {
  const results = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      dificultadLineal: schema.exercises.dificultadLineal,
    })
    .from(schema.exercises)
    .where(and(
      eq(schema.exercises.route, route),
      eq(schema.exercises.effort, contraction),
      lte(schema.exercises.dificultadLineal, maxDificultadLineal),
      inArray(schema.exercises.level, [...allowedLevels])
    ));

  // Filter out excluded names (for deduplication across contractions)
  const filtered = excludeNames && excludeNames.size > 0
    ? results.filter(r => !excludeNames.has(r.name))
    : results;

  return filtered.map(r => ({
    id: r.id,
    name: r.name,
    dificultadLineal: r.dificultadLineal,
    contraction,
  }));
}

/**
 * Query exercises including those with empty effort field
 * Prefers exact contraction match, but includes empty effort as fallback
 * This allows using exercises from the same level before widening to other levels
 */
async function queryExercisesIncludingEmptyEffort(
  db: MySql2Database<typeof schema>,
  route: string,
  contraction: Contraction,
  maxDificultadLineal: number,
  allowedLevels: readonly ExerciseLevel[],
  excludeNames?: Set<string>
): Promise<ExerciseCandidate[]> {
  const results = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      dificultadLineal: schema.exercises.dificultadLineal,
      effort: schema.exercises.effort,
    })
    .from(schema.exercises)
    .where(and(
      eq(schema.exercises.route, route),
      or(
        eq(schema.exercises.effort, contraction),
        eq(schema.exercises.effort, '')
      ),
      lte(schema.exercises.dificultadLineal, maxDificultadLineal),
      inArray(schema.exercises.level, [...allowedLevels])
    ));

  // Filter out excluded names (for deduplication across contractions)
  const filtered = excludeNames && excludeNames.size > 0
    ? results.filter(r => !excludeNames.has(r.name))
    : results;

  // Sort: exact contraction matches first (by id for determinism), then empty effort (by id)
  const sorted = [...filtered].sort((a, b) => {
    const aExact = a.effort === contraction ? 0 : 1;
    const bExact = b.effort === contraction ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.id - b.id;
  });

  return sorted.map(r => ({
    id: r.id,
    name: r.name,
    dificultadLineal: r.dificultadLineal,
    contraction, // Assign the requested contraction type
  }));
}

/**
 * Query exercises with scope widening (category prefix matching)
 */
async function queryExercisesWithScopeWidening(
  db: MySql2Database<typeof schema>,
  route: string,
  contraction: Contraction,
  maxDificultadLineal: number,
  allowedLevels: readonly ExerciseLevel[],
  excludeNames?: Set<string>
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
      dificultadLineal: schema.exercises.dificultadLineal,
    })
    .from(schema.exercises)
    .where(and(
      like(schema.exercises.route, `${parentRoute}%`),
      eq(schema.exercises.effort, contraction),
      lte(schema.exercises.dificultadLineal, maxDificultadLineal),
      inArray(schema.exercises.level, [...allowedLevels])
    ));

  // Filter out excluded names (for deduplication across contractions)
  const filtered = excludeNames && excludeNames.size > 0
    ? results.filter(r => !excludeNames.has(r.name))
    : results;

  return filtered.map(r => ({
    id: r.id,
    name: r.name,
    dificultadLineal: r.dificultadLineal,
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
    maxDificultadLineal,
    allowedLevels,
    count,
    levelGroup,
    memberLevel,
    excludeNames,
  } = requirements;

  const actions: FallbackAction[] = [];
  let currentDificultadLineal = maxDificultadLineal;
  let currentLevels: readonly ExerciseLevel[] = [memberLevel];
  let currentContraction = contraction;
  let currentRoute = route;

  // Tier 0: Exact match — use member's specific level only
  let pool = await queryExercises(db, currentRoute, currentContraction, currentDificultadLineal, currentLevels, excludeNames);

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
    const originalDificultadLineal = currentDificultadLineal;
    currentDificultadLineal = 999; // Allow any difficulty

    pool = await queryExercises(db, currentRoute, currentContraction, currentDificultadLineal, currentLevels, excludeNames);

    actions.push({
      type: 'DIFFICULTY_RELAXED',
      tier: 1,
      from: originalDificultadLineal,
      to: currentDificultadLineal,
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

  // Tier 1.5: Include exercises with empty effort (same level, before widening to other levels)
  // This helps when exercises exist but lack contraction tags
  {
    pool = await queryExercisesIncludingEmptyEffort(
      db, currentRoute, contraction, currentDificultadLineal, currentLevels, excludeNames
    );

    if (pool.length >= count) {
      actions.push({
        type: 'EFFORT_RELAXED',
        tier: 1.5,
        contraction,
      });

      // Already sorted by exact match first, then by id
      const selected = pool.slice(0, count);
      return {
        status: 'fallback',
        data: selected,
        tier: 1.5,
        actions,
      };
    }
  }

  // Tier 2: Widen level filter
  if (policy.maxTier >= 2 && policy.relaxationOrder.includes('level')) {
    const originalLevels = currentLevels;
    currentLevels = getExpandedLevels(levelGroup, 2);

    pool = await queryExercises(db, currentRoute, currentContraction, currentDificultadLineal, currentLevels, excludeNames);

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
      db, currentRoute, currentContraction, currentDificultadLineal, currentLevels, excludeNames
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
      pool = await queryExercises(db, route, substitute, currentDificultadLineal, currentLevels, excludeNames);

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

/**
 * Query cross-route exercises using SPOM pattern_2.
 *
 * Lookup strategy:
 * 1. Try exercises.pattern = pattern2 AND route != excludeRoute
 * 2. If empty, try exercises.category = pattern2 AND route != excludeRoute
 * 3. If still empty, return []
 *
 * For each attempt, first tries exact contraction match, then includes empty effort.
 */
export async function queryCrossRouteExercises(
  db: MySql2Database<typeof schema>,
  pattern2: string,
  excludeRoute: string,
  contraction: Contraction,
  maxDificultadLineal: number,
  allowedLevels: readonly ExerciseLevel[],
  excludeNames?: Set<string>
): Promise<ExerciseCandidate[]> {
  // Helper: run query with given field condition, first exact contraction then including empty effort
  async function queryWithField(
    fieldCondition: ReturnType<typeof eq>
  ): Promise<ExerciseCandidate[]> {
    // Try exact contraction match first
    const exactResults = await db
      .select({
        id: schema.exercises.id,
        name: schema.exercises.exercise,
        dificultadLineal: schema.exercises.dificultadLineal,
      })
      .from(schema.exercises)
      .where(and(
        fieldCondition,
        ne(schema.exercises.route, excludeRoute),
        eq(schema.exercises.effort, contraction),
        lte(schema.exercises.dificultadLineal, maxDificultadLineal),
        inArray(schema.exercises.level, [...allowedLevels])
      ));

    let results = exactResults;

    // If no exact contraction matches, include empty effort
    if (results.length === 0) {
      results = await db
        .select({
          id: schema.exercises.id,
          name: schema.exercises.exercise,
          dificultadLineal: schema.exercises.dificultadLineal,
        })
        .from(schema.exercises)
        .where(and(
          fieldCondition,
          ne(schema.exercises.route, excludeRoute),
          or(
            eq(schema.exercises.effort, contraction),
            eq(schema.exercises.effort, '')
          ),
          lte(schema.exercises.dificultadLineal, maxDificultadLineal),
          inArray(schema.exercises.level, [...allowedLevels])
        ));
    }

    // Filter out excluded names
    const filtered = excludeNames && excludeNames.size > 0
      ? results.filter(r => !excludeNames.has(r.name))
      : results;

    return filtered.map(r => ({
      id: r.id,
      name: r.name,
      dificultadLineal: r.dificultadLineal,
      contraction,
    }));
  }

  // 1. Try exercises.pattern = pattern2
  const byPattern = await queryWithField(eq(schema.exercises.pattern, pattern2));
  if (byPattern.length > 0) return byPattern;

  // 2. Try exercises.category = pattern2
  const byCategory = await queryWithField(eq(schema.exercises.category, pattern2));
  if (byCategory.length > 0) return byCategory;

  // 3. No cross-route candidates
  return [];
}
