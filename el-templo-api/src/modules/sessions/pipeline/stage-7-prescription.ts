/**
 * Stage 7: Prescription Generation
 *
 * Generates exercise prescriptions by distributing reps budget
 * inversely proportional to difficulty (easier exercises get more reps).
 *
 * Input: BlockContextWithExercises (has exercises, repsBudget, intensity)
 * Output: BlockContextComplete (adds prescriptions array)
 */

import type { BlockContextWithExercises, BlockContextComplete } from './context';
import type { ExercisePrescription, SelectedExercise } from '../types';
import { createTraceEvent, appendTrace } from './context';

/** Calculate rest time based on intensity (lower intensity = shorter rest) */
function calculateRest(intensity: number): number {
  // Rest ranges from 30s (low intensity) to 90s (high intensity)
  if (intensity <= 30) return 30;
  if (intensity <= 50) return 45;
  if (intensity <= 70) return 60;
  if (intensity <= 85) return 75;
  return 90;
}

/**
 * Calculate inverse difficulty weights for rep distribution.
 * Easier exercises (lower difficulty) get more reps.
 *
 * Example with 3 exercises at difficulty 4, 5, 6:
 * - Inverse weights: 1/4, 1/5, 1/6 -> normalized to percentages
 * - Result: ~44%, ~33%, ~22% of budget
 */
function calculateInverseDifficultyWeights(exercises: readonly SelectedExercise[]): number[] {
  // Use inverse of difficulty as weight (lower difficulty = higher weight)
  const inverseWeights = exercises.map(e => 1 / Math.max(e.difficulty, 1));
  const totalWeight = inverseWeights.reduce((sum, w) => sum + w, 0);

  // Normalize to get proportions
  return inverseWeights.map(w => w / totalWeight);
}

/**
 * Generate prescriptions for all selected exercises
 *
 * Budget distribution: inversely proportional to relative difficulty within block.
 * Easier exercises get more reps, harder exercises get fewer.
 * ISO exercises use seconds instead of reps.
 *
 * @param ctx - Context with exercises selected
 * @returns Complete context with prescriptions
 */
export function generatePrescriptions(
  ctx: BlockContextWithExercises
): BlockContextComplete {
  const { exercises, repsBudget, intensity } = ctx;
  const exerciseCount = exercises.length;

  if (exerciseCount === 0) {
    // No exercises to prescribe (edge case)
    const traceEvent = createTraceEvent(
      ctx,
      'PRESCRIPTIONS_GENERATED',
      'WARNING',
      {
        exerciseCount: 0,
        repsBudget,
        message: 'No exercises to prescribe',
      }
    );
    return {
      ...appendTrace(ctx, traceEvent),
      prescriptions: [],
    };
  }

  const restTime = calculateRest(intensity);

  // Calculate inverse difficulty weights for rep distribution
  const weights = calculateInverseDifficultyWeights(exercises);

  // Distribute reps based on weights (easier exercises get more)
  let allocatedReps = 0;
  const repsAllocation = weights.map((weight, index) => {
    if (index === exerciseCount - 1) {
      // Last exercise gets remainder to ensure exact budget match
      return repsBudget - allocatedReps;
    }
    const reps = Math.round(repsBudget * weight);
    allocatedReps += reps;
    return reps;
  });

  const prescriptions: ExercisePrescription[] = exercises.map((exercise, index) => {
    // ISO exercises use seconds instead of reps
    const isIsometric = exercise.contraction === 'ISO';

    return {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      contraction: exercise.contraction,
      reps: isIsometric ? 0 : repsAllocation[index],
      seconds: isIsometric ? 30 : 0, // 30 seconds for isometric holds
      rest: restTime,
      dificultadLineal: exercise.difficulty, // Carry over for validation and display
    };
  });

  const traceEvent = createTraceEvent(
    ctx,
    'PRESCRIPTIONS_GENERATED',
    'INFO',
    {
      exerciseCount,
      repsBudget,
      distributionMethod: 'inverse_difficulty',
      weights: weights.map((w, i) => ({
        exerciseId: exercises[i].exerciseId,
        difficulty: exercises[i].difficulty,
        weight: Math.round(w * 100) + '%',
        reps: repsAllocation[i],
      })),
      restTime,
    }
  );

  return {
    ...appendTrace(ctx, traceEvent),
    prescriptions,
  };
}
