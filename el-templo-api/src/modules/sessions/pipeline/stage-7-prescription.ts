/**
 * Stage 7: Prescription Generation
 *
 * Generates exercise prescriptions by distributing reps budget
 * evenly across selected exercises.
 *
 * Input: BlockContextWithExercises (has exercises, repsBudget, intensity)
 * Output: BlockContextComplete (adds prescriptions array)
 */

import type { BlockContextWithExercises, BlockContextComplete } from './context';
import type { ExercisePrescription } from '../types';
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
 * Generate prescriptions for all selected exercises
 *
 * Budget distribution: divide evenly with remainder to first exercises.
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

  // Integer division with remainder
  const baseReps = Math.floor(repsBudget / exerciseCount);
  const remainder = repsBudget % exerciseCount;
  const restTime = calculateRest(intensity);

  const prescriptions: ExercisePrescription[] = exercises.map((exercise, index) => {
    // First N exercises get +1 rep (where N = remainder)
    const reps = baseReps + (index < remainder ? 1 : 0);

    return {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      contraction: exercise.contraction,
      reps,
      seconds: 0, // Time-based exercises not implemented in this phase
      rest: restTime,
      dificultadLineal: exercise.difficulty, // Carry over for validation
    };
  });

  const traceEvent = createTraceEvent(
    ctx,
    'PRESCRIPTIONS_GENERATED',
    'INFO',
    {
      exerciseCount,
      repsBudget,
      baseReps,
      remainder,
      restTime,
      allocation: prescriptions.map(p => ({ exerciseId: p.exerciseId, reps: p.reps })),
    }
  );

  return {
    ...appendTrace(ctx, traceEvent),
    prescriptions,
  };
}
