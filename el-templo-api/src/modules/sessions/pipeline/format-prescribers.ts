/**
 * Format-Specific Prescription Functions
 *
 * Different workout formats have different prescription structures:
 * - Buy-in/Cash-out: First exercise repeats at end (bookend)
 * - AMRAP: Reps per round, not total
 * - EMOM: Reps per minute with rotation
 * - Complex: Equal distribution, no inter-exercise rest
 * - Chipper: Sequential high-rep work
 *
 * Each prescriber distributes the reps budget according to format rules.
 */

import type { SelectedExercise, ExercisePrescription } from '../types';

export interface PrescriptionContext {
  readonly exercises: readonly SelectedExercise[];
  readonly repsBudget: number;
  readonly intensity: number;
  readonly restTime: number;
}

/**
 * Route to format-specific prescriber based on format name.
 * Returns null if no format-specific logic exists (use standard prescription).
 */
export function prescribeByFormat(
  format: string,
  ctx: PrescriptionContext
): ExercisePrescription[] | null {
  const normalizedFormat = format.toLowerCase().trim();

  switch (normalizedFormat) {
    case 'buy-in / cash-out':
      return prescribeBuyInCashOut(ctx);
    case 'complex':
      return prescribeComplex(ctx);
    case 'amrap':
    case 'amrap series':
      return prescribeAMRAP(ctx);
    case 'emom':
    case 'emom + for time':
      return prescribeEMOM(ctx);
    case 'chipper':
      return prescribeChipper(ctx);
    default:
      return null; // Signals to use standard prescription
  }
}

/**
 * Buy-in / Cash-out: First exercise repeats at end (bookend pattern)
 * Structure: A -> B -> C -> A
 * Budget split: A gets 40% (20% + 20%), others split remaining 60%
 */
function prescribeBuyInCashOut(ctx: PrescriptionContext): ExercisePrescription[] | null {
  const { exercises, repsBudget, restTime } = ctx;
  if (exercises.length < 2) return null;

  const bookendExercise = exercises[0];
  const middleExercises = exercises.slice(1);

  // Bookend gets 40% total (20% at start, 20% at end)
  const bookendTotal = Math.round(repsBudget * 0.4);
  const bookendReps = Math.round(bookendTotal / 2);

  // Remaining 60% split among middle exercises
  const middleBudget = repsBudget - bookendTotal;
  const middleRepsEach = Math.round(middleBudget / middleExercises.length);

  const prescriptions: ExercisePrescription[] = [];

  // Opening bookend
  prescriptions.push(createPrescription(bookendExercise, bookendReps, restTime, 'Buy-in'));

  // Middle exercises
  for (const ex of middleExercises) {
    prescriptions.push(createPrescription(ex, middleRepsEach, restTime));
  }

  // Closing bookend (same exercise as first)
  prescriptions.push(createPrescription(bookendExercise, bookendReps, restTime, 'Cash-out'));

  return prescriptions;
}

/**
 * Complex: All exercises done back-to-back, equal reps
 * Structure: A + B + C (no rest between, same load)
 * Budget split: Equal across all exercises
 */
function prescribeComplex(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Equal distribution for complex
  const repsPerExercise = Math.round(repsBudget / exercises.length);

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      repsPerExercise,
      i === exercises.length - 1 ? restTime : 0, // Only rest after last exercise
      i === 0 ? 'Complex - no rest between exercises' : undefined
    )
  );
}

/**
 * AMRAP: Reps per round, athletes do as many rounds as possible
 * Structure: Rounds of (A + B + C), total time-capped
 * Budget represents reps PER ROUND, not total
 */
function prescribeAMRAP(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget } = ctx;

  // For AMRAP, budget is per round - distribute using inverse difficulty
  // but with lower total since it's per round
  const repsPerRound = Math.min(repsBudget, 30); // Cap at 30 reps/round for AMRAPs
  const weights = calculateInverseDifficultyWeights(exercises);

  return exercises.map((ex, i) => {
    const reps = Math.round(repsPerRound * weights[i]);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : Math.max(reps, 5), // Min 5 reps for AMRAP
      0, // No rest in AMRAP rounds
      i === 0 ? 'AMRAP - complete max rounds' : undefined,
      ex.contraction === 'ISO' ? 20 : 0 // 20s for ISO in AMRAP
    );
  });
}

/**
 * EMOM: Every Minute On the Minute
 * Structure: Exercise rotation each minute
 * Reps should be completable in ~40 seconds
 */
function prescribeEMOM(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, intensity } = ctx;

  // EMOM reps based on intensity (higher intensity = fewer reps per minute)
  const baseReps = intensity >= 80 ? 8 : intensity >= 70 ? 10 : 12;

  return exercises.map((ex, i) =>
    createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : baseReps,
      0, // Rest is built into the minute
      i === 0 ? 'EMOM - rotate each minute' : undefined,
      ex.contraction === 'ISO' ? 30 : 0 // 30s hold for ISO
    )
  );
}

/**
 * Chipper: Sequential high-rep work, done once through
 * Structure: Complete A, then B, then C (no rounds)
 * Higher reps per exercise than other formats
 */
function prescribeChipper(ctx: PrescriptionContext): ExercisePrescription[] {
  const { exercises, repsBudget, restTime } = ctx;

  // Chipper uses full budget, distributed by inverse difficulty
  const weights = calculateInverseDifficultyWeights(exercises);

  return exercises.map((ex, i) => {
    const reps = Math.round(repsBudget * weights[i]);
    return createPrescription(
      ex,
      ex.contraction === 'ISO' ? 0 : reps,
      restTime,
      i === 0 ? 'Chipper - complete each exercise before moving on' : undefined,
      ex.contraction === 'ISO' ? 45 : 0 // Longer hold for chipper
    );
  });
}

// ============================================================================
// Helper functions
// ============================================================================

function createPrescription(
  exercise: SelectedExercise,
  reps: number,
  rest: number,
  notes?: string,
  seconds?: number
): ExercisePrescription {
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    contraction: exercise.contraction,
    reps: exercise.contraction === 'ISO' ? 0 : reps,
    seconds: seconds ?? (exercise.contraction === 'ISO' ? 30 : 0),
    rest,
    notes,
    dificultadLineal: exercise.difficulty,
  };
}

function calculateInverseDifficultyWeights(
  exercises: readonly SelectedExercise[]
): number[] {
  const inverseWeights = exercises.map((e) => 1 / Math.max(e.difficulty, 1));
  const totalWeight = inverseWeights.reduce((sum, w) => sum + w, 0);
  return inverseWeights.map((w) => w / totalWeight);
}
