/**
 * Stage 6: Exercise Selection
 *
 * Selects exercises for the block based on route, contraction type,
 * linear difficulty (1-12), and level. Uses fallback ladder when exact matches not found.
 * Uses deterministic ordering by id ASC.
 *
 * Input: BlockContextWithFormat (has route, contractionMix, difficultyBucket, levelGroup)
 * Output: BlockContextWithExercises (adds exercises array)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../../db/schema';
import type { BlockContextWithFormat, BlockContextWithExercises } from './context';
import type { LevelGroup, Contraction, SelectedExercise } from '../types';
import { createTraceEvent, appendTrace } from './context';
import { selectExercisesWithFallback } from '../fallback/exercise-fallback';
import type { FallbackAction, ExerciseLevel } from '../fallback/types';

/** Get allowed levels for a level group */
function getAllowedLevels(levelGroup: LevelGroup): ExerciseLevel[] {
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
 * Linear difficulty base values per level
 * Used to calculate maxDificultadLineal from level and bucket
 */
const LEVEL_LINEAR_BASE: Record<ExerciseLevel, number> = {
  alfa: 0,     // Alfa: 1-3 (base 0 + bucket)
  delta: 3,    // Delta: 4-6 (base 3 + bucket)
  sigma: 6,    // Sigma: 7-8 (base 6 + bucket)
  omega: 8,    // Omega: 9-10 (base 8 + bucket)
  spartan: 10, // Spartan: 11-12 (base 10 + bucket)
};

/**
 * Level progression for Nivel Superior mapping
 */
const LEVEL_PROGRESSION: readonly ExerciseLevel[] = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];

/**
 * Calculate linear difficulty target based on member level, intensity, and difficulty bucket
 *
 * Maps the old bucket system (1-3, "Nivel Superior") to the linear scale (1-12):
 * - Bucket 1/2/3 at member level -> level's linear difficulty range
 * - "Nivel Superior" or intensity >= 85% -> next level's first difficulty
 *
 * @returns { maxDificultadLineal, targetLevel } for exercise selection
 */
function getLinearDifficultyTarget(
  memberLevel: ExerciseLevel,
  intensity: number,
  difficultyBucket: string
): { maxDificultadLineal: number; targetLevel: ExerciseLevel } {
  const isNivelSuperior = difficultyBucket === 'Nivel Superior' || difficultyBucket === 'Nivel Superior 1';
  const currentIndex = LEVEL_PROGRESSION.indexOf(memberLevel);

  // Nivel Superior (at intensity >= 85%): shift to next level's first difficulty
  if (isNivelSuperior && intensity >= 85) {
    if (currentIndex < LEVEL_PROGRESSION.length - 1) {
      const nextLevel = LEVEL_PROGRESSION[currentIndex + 1];
      // Next level's first linear difficulty = base + 1
      return {
        maxDificultadLineal: LEVEL_LINEAR_BASE[nextLevel] + 1,
        targetLevel: nextLevel,
      };
    }
    // Spartan stays at spartan, max difficulty
    return {
      maxDificultadLineal: LEVEL_LINEAR_BASE.spartan + 2, // 12
      targetLevel: 'spartan',
    };
  }

  // High intensity (>= 90%) without explicit Nivel Superior bucket: also shift up
  if (intensity >= 90) {
    if (currentIndex < LEVEL_PROGRESSION.length - 1) {
      const nextLevel = LEVEL_PROGRESSION[currentIndex + 1];
      return {
        maxDificultadLineal: LEVEL_LINEAR_BASE[nextLevel] + 1,
        targetLevel: nextLevel,
      };
    }
  }

  // Normal case: use bucket within current level's range
  const bucket = parseInt(difficultyBucket, 10);
  const effectiveBucket = isNaN(bucket) ? 3 : bucket;

  return {
    maxDificultadLineal: LEVEL_LINEAR_BASE[memberLevel] + effectiveBucket,
    targetLevel: memberLevel,
  };
}

/**
 * Convert fallback action to trace event description
 */
function actionToTraceDescription(action: FallbackAction): string {
  switch (action.type) {
    case 'DIFFICULTY_RELAXED':
      return `Relaxed difficulty from ${action.from} to ${action.to}`;
    case 'EFFORT_RELAXED':
      return `Included exercises with empty effort for ${action.contraction}`;
    case 'SCOPE_WIDENED':
      return `Widened scope from ${action.from} to ${action.to}`;
    case 'LEVEL_WIDENED':
      return `Widened levels from [${action.from.join(',')}] to [${action.to.join(',')}]`;
    case 'CONTRACTION_SUBSTITUTED':
      return `Substituted contraction from ${action.needed} to ${action.used}`;
  }
}

/**
 * Select exercises for each contraction type in the mix
 *
 * Uses fallback ladder for graceful degradation when exact matches unavailable.
 * If a contraction type completely fails, emit WARNING but continue with what's available.
 * Deduplicates exercises by name across contraction types to prevent repeats.
 *
 * @param ctx - Context with format selected
 * @param db - Database connection for exercise lookup
 * @returns Context enriched with selected exercises
 */
export async function selectExercises(
  ctx: BlockContextWithFormat,
  db: MySql2Database<typeof schema>
): Promise<BlockContextWithExercises> {
  const allowedLevels = getAllowedLevels(ctx.levelGroup);
  const selectedExercises: SelectedExercise[] = [];
  let updatedCtx = ctx;
  let anyFailed = false;

  // Track already-selected exercise names to prevent duplicates across contractions
  const excludedNames: Set<string> = new Set();

  // Calculate linear difficulty target (handles Nivel Superior and high-intensity shifts)
  const { maxDificultadLineal, targetLevel } = getLinearDifficultyTarget(
    ctx.memberLevel,
    ctx.intensity,
    ctx.difficultyBucket
  );

  // Add trace if level was shifted
  if (targetLevel !== ctx.memberLevel) {
    const shiftTrace = createTraceEvent(
      updatedCtx,
      'HIGH_INTENSITY_LEVEL_SHIFT',
      'INFO',
      {
        fromLevel: ctx.memberLevel,
        toLevel: targetLevel,
        intensity: ctx.intensity,
        maxDificultadLineal,
        difficultyBucket: ctx.difficultyBucket,
        reason: ctx.difficultyBucket.includes('Nivel Superior')
          ? `Nivel Superior at ${ctx.intensity}% maps to ${targetLevel} level`
          : `Intensity ${ctx.intensity}% >= 90% triggers level shift`,
      }
    );
    updatedCtx = appendTrace(updatedCtx, shiftTrace);
  }

  // Process each contraction type
  for (const contraction of ['CON', 'EXC', 'ISO'] as const) {
    const requiredCount = ctx.contractionMix[contraction];

    if (requiredCount === 0) {
      continue; // Skip if no exercises needed for this type
    }

    // Use fallback ladder for exercise selection, excluding already-selected names
    const result = await selectExercisesWithFallback(
      {
        route: ctx.route,
        contraction,
        maxDificultadLineal, // Linear difficulty scale (1-12)
        allowedLevels, // For Tier 2+ fallback
        count: requiredCount,
        levelGroup: ctx.levelGroup,
        memberLevel: targetLevel, // For Tier 0 exact match (may be shifted up)
        excludeNames: excludedNames, // Prevent duplicate exercise names
      },
      db
    );

    // Handle fallback result
    if (result.status === 'failed') {
      anyFailed = true;

      // Emit warning trace for failed contraction type
      const warningTrace = createTraceEvent(
        updatedCtx,
        'EXERCISE_SELECTION_FAILED',
        'WARNING',
        {
          contraction,
          required: requiredCount,
          found: 0,
          route: ctx.route,
          fallbackTier: result.tier,
          actions: result.actions.map(actionToTraceDescription),
        }
      );
      updatedCtx = appendTrace(updatedCtx, warningTrace);
      continue; // Continue with other contraction types
    }

    // Add fallback traces if any relaxation was applied
    if (result.status === 'fallback') {
      for (const action of result.actions) {
        const fallbackTrace = createTraceEvent(
          updatedCtx,
          'EXERCISE_FALLBACK',
          'WARNING',
          {
            contraction,
            tier: action.tier,
            action: action.type,
            description: actionToTraceDescription(action),
          }
        );
        updatedCtx = appendTrace(updatedCtx, fallbackTrace);
      }
    }

    // Add selected exercises to results and track names for deduplication
    for (const ex of result.data) {
      selectedExercises.push({
        exerciseId: ex.id,
        name: ex.name,
        contraction: ex.contraction,
        difficulty: ex.dificultadLineal, // Use linear difficulty
      });
      // Add to excluded names for subsequent contraction queries
      excludedNames.add(ex.name);
    }

    // Emit success trace for this contraction type
    const traceEvent = createTraceEvent(
      updatedCtx,
      'EXERCISES_SELECTED',
      'INFO',
      {
        contraction,
        required: requiredCount,
        selected: result.data.length,
        fallbackTier: result.tier,
        usedFallback: result.status === 'fallback',
        exercises: result.data.map(e => ({ id: e.id, name: e.name })),
      }
    );
    updatedCtx = appendTrace(updatedCtx, traceEvent);
  }

  // If no exercises at all, throw error
  if (selectedExercises.length === 0) {
    const errorTrace = createTraceEvent(
      updatedCtx,
      'EXERCISE_SELECTION_TOTAL_FAILURE',
      'ERROR',
      {
        route: ctx.route,
        contractionMix: ctx.contractionMix,
      }
    );
    updatedCtx = appendTrace(updatedCtx, errorTrace);
    throw new Error(
      `No exercises found for any contraction type: route=${ctx.route}, mix=${JSON.stringify(ctx.contractionMix)}`
    );
  }

  // Emit summary trace if partial failure
  if (anyFailed) {
    const summaryTrace = createTraceEvent(
      updatedCtx,
      'EXERCISE_SELECTION_PARTIAL',
      'WARNING',
      {
        totalRequired: ctx.contractionMix.CON + ctx.contractionMix.EXC + ctx.contractionMix.ISO,
        totalSelected: selectedExercises.length,
      }
    );
    updatedCtx = appendTrace(updatedCtx, summaryTrace);
  }

  return {
    ...updatedCtx,
    exercises: selectedExercises,
  };
}
