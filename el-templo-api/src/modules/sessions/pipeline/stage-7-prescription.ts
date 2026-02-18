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

import type {
  BlockContextWithExercises,
  BlockContextComplete,
} from "./context";
import type { ExercisePrescription } from "../types";
import { createTraceEvent, appendTrace } from "./context";
import { prescribeByFormat } from "./format-prescribers";
import {
  calculateInverseDifficultyWeights,
  allocateRepsRounded,
} from "./utils/reps-calculator";
import { REST_TIMES, ISO_SECONDS } from "./utils/constants";
import { getDefaultFormatParams } from "../../admin/format-params";

/** Calculate rest time based on intensity (lower intensity = shorter rest) */
export function calculateRest(intensity: number): number {
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
  ctx: BlockContextWithExercises,
): BlockContextComplete {
  const { exercises, repsBudget, intensity, format } = ctx;
  const exerciseCount = exercises.length;

  if (exerciseCount === 0) {
    // No exercises to prescribe (edge case)
    const traceEvent = createTraceEvent(
      ctx,
      "PRESCRIPTIONS_GENERATED",
      "WARNING",
      {
        exerciseCount: 0,
        repsBudget,
        message: "No exercises to prescribe",
      },
    );

    // Even with no exercises, populate formatParams for consistency
    const formatParams = getDefaultFormatParams(format.name, {
      intensity,
      exerciseCount: 0,
    });

    return {
      ...appendTrace(ctx, traceEvent),
      prescriptions: [],
      formatParams,
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
      "PRESCRIPTIONS_GENERATED",
      "INFO",
      {
        exerciseCount: formatPrescriptions.length,
        repsBudget,
        format: format.name,
        distributionMethod: "format_specific",
        restTime,
      },
    );

    // Generate format parameters for this block
    const formatParams = getDefaultFormatParams(format.name, {
      intensity,
      exerciseCount,
    });

    return {
      ...appendTrace(ctx, traceEvent),
      prescriptions: formatPrescriptions,
      formatParams,
    };
  }

  // Fall back to standard inverse difficulty distribution
  const weights = calculateInverseDifficultyWeights(exercises);
  const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

  const prescriptions: ExercisePrescription[] = exercises.map(
    (exercise, index) => {
      // ISO exercises use seconds instead of reps
      const isIsometric = exercise.contraction === "ISO";

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        contraction: exercise.contraction,
        reps: isIsometric ? 0 : repsAllocation[index],
        seconds: isIsometric ? ISO_SECONDS.DEFAULT : 0,
        rest: restTime,
        dificultadLineal: exercise.difficulty, // Carry over for validation and display
      };
    },
  );

  const traceEvent = createTraceEvent(ctx, "PRESCRIPTIONS_GENERATED", "INFO", {
    exerciseCount,
    repsBudget,
    format: format.name,
    distributionMethod: "inverse_difficulty",
    weights: weights.map((w, i) => ({
      exerciseId: exercises[i].exerciseId,
      difficulty: exercises[i].difficulty,
      weight: Math.round(w * 100) + "%",
      reps: repsAllocation[i],
    })),
    restTime,
  });

  // Generate format parameters for this block
  const formatParams = getDefaultFormatParams(format.name, {
    intensity,
    exerciseCount,
  });

  return {
    ...appendTrace(ctx, traceEvent),
    prescriptions,
    formatParams,
  };
}
