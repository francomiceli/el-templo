/**
 * Stage 7: Prescription Generation
 *
 * Generates exercise prescriptions by distributing reps budget
 * inversely proportional to difficulty (easier exercises get more reps).
 *
 * For specific formats (AMRAP, EMOM, Buy-in/Cash-out, Complex, Chipper),
 * format-specific prescribers are used to generate appropriate structures.
 *
 * Input: BlockContextWithExercises (has exercises, repsBudget, intensity)
 * Output: BlockContextComplete (adds prescriptions array)
 */

import type { BlockContextWithExercises, BlockContextComplete } from './context';
import type { ExercisePrescription } from '../types';
import { createTraceEvent, appendTrace } from './context';
import { prescribeByFormat } from './format-prescribers';
import {
  roundToNearest5,
  calculateInverseDifficultyWeights,
  MIN_REPS_PER_EXERCISE,
} from './utils/reps-calculator';
import { REST_TIMES, ISO_SECONDS } from './utils/constants';

/** Calculate rest time based on intensity (lower intensity = shorter rest) */
function calculateRest(intensity: number): number {
  // Rest ranges from 30s (low intensity) to 90s (high intensity)
  if (intensity <= 30) return REST_TIMES.WARMUP;
  if (intensity <= 50) return REST_TIMES.SHORT;
  if (intensity <= 70) return REST_TIMES.MEDIUM;
  if (intensity <= 85) return REST_TIMES.LONG;
  return REST_TIMES.MAX;
}

/**
 * Generate prescriptions for all selected exercises
 *
 * Budget distribution: inversely proportional to relative difficulty within block.
 * Easier exercises get more reps, harder exercises get fewer.
 * ISO exercises use seconds instead of reps.
 *
 * For specific formats (AMRAP, EMOM, Buy-in/Cash-out, Complex, Chipper),
 * format-specific prescribers are used to generate appropriate structures.
 *
 * @param ctx - Context with exercises selected
 * @returns Complete context with prescriptions
 */
export function generatePrescriptions(
  ctx: BlockContextWithExercises
): BlockContextComplete {
  const { exercises, repsBudget, intensity, format } = ctx;
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

  // Try format-specific prescription first
  const formatPrescriptions = prescribeByFormat(format.name, {
    exercises,
    repsBudget,
    intensity,
    restTime,
  });

  if (formatPrescriptions) {
    // Format-specific logic was applied
    const traceEvent = createTraceEvent(
      ctx,
      'PRESCRIPTIONS_GENERATED',
      'INFO',
      {
        exerciseCount: formatPrescriptions.length,
        repsBudget,
        format: format.name,
        distributionMethod: 'format_specific',
        restTime,
      }
    );

    return {
      ...appendTrace(ctx, traceEvent),
      prescriptions: formatPrescriptions,
    };
  }

  // Fall back to standard inverse difficulty distribution
  const weights = calculateInverseDifficultyWeights(exercises);

  // Get non-ISO exercise indices
  const nonIsoIndices = exercises
    .map((ex, i) => ex.contraction !== 'ISO' ? i : -1)
    .filter(i => i >= 0);

  // Allocate reps: round to nearest 5, apply minimum, then adjust last to match budget
  let repsAllocation = weights.map((weight, i) => {
    if (exercises[i].contraction === 'ISO') return 0; // ISO uses seconds, not reps
    const raw = repsBudget * weight;
    const rounded = roundToNearest5(raw);
    return Math.max(rounded, MIN_REPS_PER_EXERCISE);
  });

  // Adjust last non-ISO exercise to match budget exactly
  if (nonIsoIndices.length > 0) {
    const currentTotal = repsAllocation.reduce((sum, r) => sum + r, 0);
    const lastNonIso = nonIsoIndices[nonIsoIndices.length - 1];
    repsAllocation[lastNonIso] += repsBudget - currentTotal;
    // Ensure minimum
    if (repsAllocation[lastNonIso] < MIN_REPS_PER_EXERCISE) {
      repsAllocation[lastNonIso] = MIN_REPS_PER_EXERCISE;
    }
  }

  const prescriptions: ExercisePrescription[] = exercises.map((exercise, index) => {
    // ISO exercises use seconds instead of reps
    const isIsometric = exercise.contraction === 'ISO';

    return {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      contraction: exercise.contraction,
      reps: isIsometric ? 0 : repsAllocation[index],
      seconds: isIsometric ? ISO_SECONDS.DEFAULT : 0,
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
      format: format.name,
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
