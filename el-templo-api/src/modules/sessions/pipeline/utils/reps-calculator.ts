/**
 * Reps Calculation Utilities
 *
 * Shared functions for calculating and distributing reps across exercises.
 * Used by stage-7-prescription.ts and format-prescribers.ts.
 */

import type { SelectedExercise } from "../../types";

/** Maximum weight ratio between easiest and hardest exercise */
export const MAX_WEIGHT_RATIO = 3;

/** Minimum reps per exercise */
export const MIN_REPS_PER_EXERCISE = 10;

/** Round reps to nearest 5 for cleaner prescription numbers */
export function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

/** Round reps to nearest even number (for unilateral exercises done per-side) */
export function roundToEven(value: number): number {
  return Math.round(value / 2) * 2;
}

/**
 * Calculate inverse difficulty weights for rep distribution.
 * Easier exercises (lower difficulty) get more reps.
 * ISO exercises are assigned weight 0 (they get 0 reps, seconds instead).
 *
 * Example with 3 exercises at difficulty 4, 5, 6:
 * - Inverse weights: 1/4, 1/5, 1/6 -> normalized to percentages
 * - Result: ~44%, ~33%, ~22% of budget
 *
 * Caps weight ratio to MAX_WEIGHT_RATIO to prevent extreme spreads (e.g., 9r vs 62r).
 */
export function calculateInverseDifficultyWeights(
  exercises: readonly SelectedExercise[],
): number[] {
  if (exercises.length === 0) return [];
  if (exercises.length === 1)
    return [exercises[0].contraction === "ISO" ? 0 : 1];

  // Use inverse of difficulty as weight; ISO exercises get 0 weight
  const inverseWeights = exercises.map((e) =>
    e.contraction === "ISO" ? 0 : 1 / Math.max(e.difficulty, 1),
  );

  // Filter to non-zero weights for ratio capping
  const nonZeroWeights = inverseWeights.filter((w) => w > 0);
  if (nonZeroWeights.length === 0) return inverseWeights; // all ISO

  // Cap the ratio to prevent extreme spreads
  const maxWeight = Math.max(...nonZeroWeights);
  const minWeight = Math.min(...nonZeroWeights);

  let cappedWeights = inverseWeights;
  if (nonZeroWeights.length > 1 && maxWeight / minWeight > MAX_WEIGHT_RATIO) {
    // Cap larger weights to maintain max ratio
    const cappedMax = minWeight * MAX_WEIGHT_RATIO;
    cappedWeights = inverseWeights.map((w) =>
      w === 0 ? 0 : Math.min(w, cappedMax),
    );
  }

  const totalWeight = cappedWeights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) return cappedWeights;

  // Normalize to get proportions (ISO stays at 0)
  return cappedWeights.map((w) => w / totalWeight);
}

/**
 * Allocate reps with rounding to nearest 5, respecting total budget.
 * All exercises except the last get rounded values; last gets remainder.
 */
export function allocateRepsRounded(
  exercises: readonly SelectedExercise[],
  repsBudget: number,
  weights: number[],
): number[] {
  const nonIsoIndices = exercises
    .map((ex, i) => (ex.contraction !== "ISO" ? i : -1))
    .filter((i) => i >= 0);

  // Allocate with rounding
  const allocation = weights.map((weight, i) => {
    if (exercises[i].contraction === "ISO") return 0;
    const raw = repsBudget * weight;
    return Math.max(roundToNearest5(raw), MIN_REPS_PER_EXERCISE);
  });

  // Adjust last non-ISO to match budget
  if (nonIsoIndices.length > 0) {
    const currentTotal = allocation.reduce((sum, r) => sum + r, 0);
    const lastIdx = nonIsoIndices[nonIsoIndices.length - 1];
    allocation[lastIdx] += repsBudget - currentTotal;
    if (allocation[lastIdx] < MIN_REPS_PER_EXERCISE) {
      allocation[lastIdx] = MIN_REPS_PER_EXERCISE;
    }
  }

  return allocation;
}
