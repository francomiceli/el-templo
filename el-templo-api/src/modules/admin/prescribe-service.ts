/**
 * PrescribeService - On-Demand Prescription Logic
 *
 * Thin wrapper around the pipeline's format-prescribers for use outside
 * the full 9-stage generation pipeline. Used when:
 * - Exercise is swapped (re-prescribe single exercise within block budget)
 * - Block format changes (re-prescribe all exercises)
 * - Admin needs algorithm prescription for comparison
 *
 * IMPORTANT: Imports directly from pipeline modules. No prescription logic
 * is duplicated here. The prescribe service adapts pipeline functions
 * for on-demand use with database exercise data.
 */

import { prescribeByFormat } from "../sessions/pipeline/format-prescribers";
import type { PrescriptionContext } from "../sessions/pipeline/format-prescribers";
import {
  roundToNearest5,
  calculateInverseDifficultyWeights,
  MIN_REPS_PER_EXERCISE,
} from "../sessions/pipeline/utils/reps-calculator";
import { REST_TIMES, ISO_SECONDS } from "../sessions/pipeline/utils/constants";
import { calculateRest } from "../sessions/pipeline/stage-7-prescription";
import { allocateRepsRounded } from "../sessions/pipeline/utils/reps-calculator";
import type {
  SelectedExercise,
  ExercisePrescription,
  Contraction,
} from "../sessions/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrescribeExerciseParams {
  /** The exercise to prescribe */
  exercise: {
    id: number;
    name: string;
    contraction: string;
    difficulty: number;
  };
  /** Block's format name (e.g., "AMRAP", "Complex") */
  blockFormatName: string;
  /** Block's total reps budget */
  blockRepsBudget: number;
  /** Block's intensity percentage (0-100) */
  blockIntensity: number;
  /** All exercises currently in the block (including the new one) */
  existingExercises: Array<{
    id: number;
    name: string;
    contraction: string;
    difficulty: number;
  }>;
}

export interface PrescribeBlockParams {
  /** All exercises in the block */
  exercises: Array<{
    id: number;
    name: string;
    contraction: string;
    difficulty: number;
  }>;
  /** Format name for the block */
  formatName: string;
  /** Block's total reps budget */
  repsBudget: number;
  /** Block's intensity percentage (0-100) */
  intensity: number;
}

export interface PrescriptionResult {
  reps: number;
  seconds: number;
  rest: number;
  notes: string | null;
}

export interface BlockPrescriptionResult {
  exerciseId: number;
  reps: number;
  seconds: number;
  rest: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert database exercise data to pipeline's SelectedExercise type */
function toSelectedExercise(ex: {
  id: number;
  name: string;
  contraction: string;
  difficulty: number;
}): SelectedExercise {
  return {
    exerciseId: ex.id,
    name: ex.name,
    contraction: ex.contraction.toUpperCase() as Contraction,
    difficulty: ex.difficulty,
  };
}

// ---------------------------------------------------------------------------
// PrescribeService
// ---------------------------------------------------------------------------

export class PrescribeService {
  /**
   * Re-prescribe a single exercise within a block context.
   *
   * Runs the full block prescription (format-specific or standard fallback),
   * then extracts the prescription for the target exercise by position.
   *
   * @returns Prescription for the target exercise
   */
  prescribeExerciseInBlock(
    params: PrescribeExerciseParams,
  ): PrescriptionResult {
    const {
      exercise,
      blockFormatName,
      blockRepsBudget,
      blockIntensity,
      existingExercises,
    } = params;

    // Convert all exercises to pipeline type
    const selectedExercises = existingExercises.map(toSelectedExercise);

    // Find the index of the target exercise in the block
    const targetIndex = existingExercises.findIndex(
      (ex) => ex.id === exercise.id,
    );
    if (targetIndex === -1) {
      // Exercise not found in existing list -- prescribe as standalone
      return this.prescribeStandalone(
        exercise,
        blockRepsBudget,
        blockIntensity,
        existingExercises.length,
      );
    }

    // Run full block prescription to get context-aware result
    const restTime = calculateRest(blockIntensity);
    const ctx: PrescriptionContext = {
      exercises: selectedExercises,
      repsBudget: blockRepsBudget,
      intensity: blockIntensity,
      restTime,
    };

    // Try format-specific prescription first
    const formatResult = prescribeByFormat(blockFormatName, ctx);

    if (formatResult) {
      // Format prescribers may produce more prescriptions than exercises
      // (e.g., Buy-in/Cash-out adds bookend). Find by exercise ID.
      const targetPrescription = formatResult.find(
        (p) => p.exerciseId === exercise.id,
      );
      if (targetPrescription) {
        return {
          reps: targetPrescription.reps,
          seconds: targetPrescription.seconds,
          rest: targetPrescription.rest,
          notes: targetPrescription.notes ?? null,
        };
      }
      // Fallback: use position-based match if ID not found
      if (targetIndex < formatResult.length) {
        const p = formatResult[targetIndex];
        return {
          reps: p.reps,
          seconds: p.seconds,
          rest: p.rest,
          notes: p.notes ?? null,
        };
      }
    }

    // Standard inverse difficulty distribution fallback
    return this.prescribeStandard(
      selectedExercises,
      targetIndex,
      blockRepsBudget,
      restTime,
    );
  }

  /**
   * Re-prescribe all exercises in a block.
   * Used after format change to recalculate all prescriptions.
   *
   * @returns Array of prescriptions, one per exercise
   */
  prescribeBlock(params: PrescribeBlockParams): BlockPrescriptionResult[] {
    const { exercises, formatName, repsBudget, intensity } = params;

    if (exercises.length === 0) return [];

    const selectedExercises = exercises.map(toSelectedExercise);
    const restTime = calculateRest(intensity);

    const ctx: PrescriptionContext = {
      exercises: selectedExercises,
      repsBudget,
      intensity,
      restTime,
    };

    // Try format-specific prescription first
    const formatResult = prescribeByFormat(formatName, ctx);

    if (formatResult) {
      return formatResult.map((p) => ({
        exerciseId: p.exerciseId,
        reps: p.reps,
        seconds: p.seconds,
        rest: p.rest,
        notes: p.notes ?? null,
      }));
    }

    // Standard inverse difficulty distribution fallback
    return this.prescribeBlockStandard(selectedExercises, repsBudget, restTime);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Standard inverse difficulty prescription for a single exercise.
   * Delegates to prescribeBlockStandard and extracts the target exercise.
   */
  private prescribeStandard(
    exercises: readonly SelectedExercise[],
    targetIndex: number,
    repsBudget: number,
    restTime: number,
  ): PrescriptionResult {
    const block = this.prescribeBlockStandard(exercises, repsBudget, restTime);
    const result = block[targetIndex];
    return {
      reps: result.reps,
      seconds: result.seconds,
      rest: result.rest,
      notes: result.notes,
    };
  }

  /**
   * Standard inverse difficulty prescription for an entire block.
   * Used as fallback when format is not recognized.
   */
  private prescribeBlockStandard(
    exercises: readonly SelectedExercise[],
    repsBudget: number,
    restTime: number,
  ): BlockPrescriptionResult[] {
    const weights = calculateInverseDifficultyWeights(exercises);
    const repsAllocation = allocateRepsRounded(exercises, repsBudget, weights);

    return exercises.map((ex, i) => {
      const isISO = ex.contraction === "ISO";
      return {
        exerciseId: ex.exerciseId,
        reps: isISO ? 0 : repsAllocation[i],
        seconds: isISO ? ISO_SECONDS.DEFAULT : 0,
        rest: restTime,
        notes: null,
      };
    });
  }

  /**
   * Prescribe a standalone exercise (not yet in the block list).
   * Uses equal share of budget as rough estimate.
   */
  private prescribeStandalone(
    exercise: {
      id: number;
      name: string;
      contraction: string;
      difficulty: number;
    },
    blockRepsBudget: number,
    blockIntensity: number,
    totalExercises: number,
  ): PrescriptionResult {
    const restTime = calculateRest(blockIntensity);
    const isISO = exercise.contraction.toUpperCase() === "ISO";

    if (isISO) {
      return {
        reps: 0,
        seconds: ISO_SECONDS.DEFAULT,
        rest: restTime,
        notes: null,
      };
    }

    const count = Math.max(totalExercises, 1);
    const reps = roundToNearest5(blockRepsBudget / count);

    return {
      reps: Math.max(reps, MIN_REPS_PER_EXERCISE),
      seconds: 0,
      rest: restTime,
      notes: null,
    };
  }
}
