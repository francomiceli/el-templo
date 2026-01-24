/**
 * Stage 6: Exercise Selection
 *
 * Selects exercises for the block based on route, contraction type,
 * difficulty, and level. Uses deterministic ordering by id ASC.
 *
 * Input: BlockContextWithFormat (has route, contractionMix, difficultyBucket, levelGroup)
 * Output: BlockContextWithExercises (adds exercises array)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, lte, inArray } from 'drizzle-orm';
import * as schema from '../../../db/schema';
import type { BlockContextWithFormat, BlockContextWithExercises } from './context';
import type { LevelGroup, Contraction, SelectedExercise } from '../types';
import { createTraceEvent, appendTrace } from './context';

/** Map effort column value to contraction type */
const EFFORT_TO_CONTRACTION: Record<string, Contraction> = {
  CON: 'CON',
  EXC: 'EXC',
  ISO: 'ISO',
};

/** Map contraction type to effort column value */
function contractionToEffort(contraction: Contraction): string {
  return contraction; // Same values in this system
}

/** Get allowed levels for a level group */
function getAllowedLevels(
  levelGroup: LevelGroup
): ('alfa' | 'delta' | 'sigma' | 'omega' | 'spartan')[] {
  switch (levelGroup) {
    case 'alfa_delta':
      return ['alfa', 'delta'];
    case 'sigma':
      return ['alfa', 'delta', 'sigma'];
    case 'omega':
      return ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  }
}

/** Parse difficulty bucket string to numeric max */
function parseDifficultyBucket(bucket: string): number {
  // Difficulty bucket values: "1", "2", "3", "Nivel Superior"
  if (bucket === 'Nivel Superior') {
    return 999; // Allow any difficulty
  }
  const num = parseInt(bucket, 10);
  return isNaN(num) ? 3 : num;
}

/**
 * Select exercises for each contraction type in the mix
 *
 * @param ctx - Context with format selected
 * @param db - Database connection for exercise lookup
 * @returns Context enriched with selected exercises
 * @throws Error if not enough exercises found for any contraction type
 */
export async function selectExercises(
  ctx: BlockContextWithFormat,
  db: MySql2Database<typeof schema>
): Promise<BlockContextWithExercises> {
  const allowedLevels = getAllowedLevels(ctx.levelGroup);
  const maxDifficulty = parseDifficultyBucket(ctx.difficultyBucket);
  const selectedExercises: SelectedExercise[] = [];
  let updatedCtx = ctx;

  // Process each contraction type
  for (const contraction of ['CON', 'EXC', 'ISO'] as const) {
    const requiredCount = ctx.contractionMix[contraction];

    if (requiredCount === 0) {
      continue; // Skip if no exercises needed for this type
    }

    const effort = contractionToEffort(contraction);

    // Query exercises matching criteria
    const candidates = await db
      .select({
        id: schema.exercises.id,
        name: schema.exercises.exercise,
        difficulty: schema.exercises.difficulty,
      })
      .from(schema.exercises)
      .where(and(
        eq(schema.exercises.route, ctx.route),
        eq(schema.exercises.effort, effort),
        lte(schema.exercises.difficulty, maxDifficulty),
        inArray(schema.exercises.level, allowedLevels)
      ));

    if (candidates.length < requiredCount) {
      throw new Error(
        `Not enough exercises: need ${requiredCount} ${contraction}, found ${candidates.length} for route=${ctx.route}, effort=${effort}`
      );
    }

    // Sort deterministically by id ASC
    const sorted = [...candidates].sort((a, b) => a.id - b.id);

    // Select required count
    const selected = sorted.slice(0, requiredCount);

    // Add to results
    for (const ex of selected) {
      selectedExercises.push({
        exerciseId: ex.id,
        name: ex.name,
        contraction,
        difficulty: ex.difficulty,
      });
    }

    // Emit trace for this contraction type
    const traceEvent = createTraceEvent(
      updatedCtx,
      'EXERCISES_SELECTED',
      'INFO',
      {
        contraction,
        required: requiredCount,
        candidatesCount: candidates.length,
        selected: selected.map(e => ({ id: e.id, name: e.name })),
      }
    );
    updatedCtx = appendTrace(updatedCtx, traceEvent);
  }

  return {
    ...updatedCtx,
    exercises: selectedExercises,
  };
}
